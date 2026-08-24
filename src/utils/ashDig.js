/**
 * 
 * @param {import("mineflayer").Bot} bot 
 */
module.exports = (bot) => {
  const { Vec3 } = require("vec3");

  /**
   * @param {Block} block - The block to dig
   * @param {object} [opts]
   * @param {'raycast'|'auto'|'center'} [opts.faceMode] - How to determine the face
   * @param {boolean} [opts.look=true] - Whether to look at the block first
   * @param {boolean} [opts.autoTool=true] - Whethere to auto tool or not
   */
  async function digBlock(block, opts = {}) {
    const { faceMode = "raycast", look = true, autoTool = true } = opts;

    if (!block || block.name === "air") throw new Error("Invalid block to dig");

    // Stop any current dig
    if (bot._digging && typeof bot._digging.stop === "function") {
      bot._digging.stop();
    }

    const face = await getDigFace(block, faceMode, look);
    const digTime = getDigTime(block);

    return new Promise(async (resolve, reject) => {
      const blockKey = block.position.toString();
      let swingInterval;

      const cleanup = (success = true) => {
        if (swingInterval) clearInterval(swingInterval);
        bot.removeListener(`blockUpdate:${blockKey}`, blockUpdateListener);
        bot._digging = null;
        if (success) resolve();
        else reject(new Error("Dig failed"));
      };

      const blockUpdateListener = (oldBlock, newBlock) => {
        if (newBlock && newBlock.type === 0) {
          cleanup(true);
        }
      };

      bot._digging = {
        stop: () => {
          bot._client.write("block_dig", {
            status: 1, // ABORT_DESTROY_BLOCK
            location: block.position,
            face,
          });
          cleanup(false);
        },
      };

      bot.on(`blockUpdate:${blockKey}`, blockUpdateListener);

      if (autoTool) {
        await bot.ashTool.equipBest(block);
      }

      // Start dig
      bot._client.write("block_dig", {
        status: 0, // START_DESTROY_BLOCK
        location: block.position,
        face: face,
      });

      bot.swingArm();
      swingInterval = setInterval(() => bot.swingArm(), 350);

      // Wait the calculated dig time, THEN send finish packet
      setTimeout(() => {
        bot._client.write("block_dig", {
          status: 2, // FINISH_DESTROY_BLOCK
          location: block.position,
          face,
        });

        // Give server a moment to respond
        setTimeout(() => cleanup(true), 100);
      }, digTime);
    });
  }

  async function getDigFace(block, mode = "raycast", forceLook = true) {
    if (mode === "raycast") {
      const faceData = raycastBlockFace(block);

      if (!faceData) {
        throw new Error("No visible face found - block may be obstructed");
      }

      if (forceLook) {
        await bot.lookAt(faceData.center, true);
      }

      return faceData.id;
    }

    // fallback: look at center
    if (forceLook) await bot.lookAt(block.position.offset(0.5, 0.5, 0.5), true);
    return 1; // top face
  }

  function getDigTime(block) {
    const item = bot.heldItem;
    const type = item?.type;
    const mcData = require("minecraft-data")(bot.version);

    // --- Special copper case ---
    if (block.name.includes("copper")) {
      const baseSpeed = 9; // roughly netherite pick multiplier
      const enchants =
        item?.nbt?.value?.Enchantments?.value?.value?.map((e) => ({
          name: e.id.value.replace("minecraft:", ""),
          lvl: e.lvl.value,
        })) ?? [];
      const efficiencyLevel =
        enchants.find((e) => e.name === "efficiency")?.lvl ?? 0;

      let speed =
        baseSpeed + (efficiencyLevel > 0 ? efficiencyLevel ** 2 + 1 : 0);

      const hasteLevel = bot.entity.effects["haste"]?.amplifier ?? -1;
      if (hasteLevel >= 0) speed *= 1 + 0.2 * (hasteLevel + 1);

      const fatigueLevel =
        bot.entity.effects["mining_fatigue"]?.amplifier ?? -1;
      if (fatigueLevel >= 0) {
        const fatigueMultipliers = [0.3, 0.09, 0.0027, 8.1e-4];
        speed *= fatigueMultipliers[Math.min(fatigueLevel, 3)];
      }

      if (!bot.entity.onGround) speed /= 5;
      if (
        bot.entity.isInWater &&
        !bot.entity.armor.some((a) => a.name === "turtle_helmet")
      )
        speed /= 5;

      const hardness = block.hardness;
      const divisor = block.canHarvest(type) ? 30 : 100;
      const delta = speed / hardness / divisor;
      if (delta >= 1) return 0;

      const ms = Math.ceil(1 / delta) * 50;
      // console.log(`Dig time for ${block.name}: ${ms}ms (special copper)`);
      return ms;
    }
    // --- End copper special case ---

    const materialToolMultipliers = mcData.materials[block.material] || {};
    const netheriteTools = { 745: 9, 746: 9, 747: 9, 748: 9 };
    const allMultipliers = { ...materialToolMultipliers, ...netheriteTools };
    let blockBreakingSpeed = allMultipliers[type] ?? 1;

    const enchants =
      item?.nbt?.value?.Enchantments?.value?.value?.map((e) => ({
        name: e.id.value.replace("minecraft:", ""),
        lvl: e.lvl.value,
      })) ?? [];
    const efficiencyLevel =
      enchants.find((e) => e.name === "efficiency")?.lvl ?? 0;
    if (efficiencyLevel > 0 && block.canHarvest(type)) {
      blockBreakingSpeed += efficiencyLevel ** 2 + 1;
    }

    const hasteLevel = bot.entity.effects["haste"]?.amplifier ?? -1;
    if (hasteLevel >= 0) blockBreakingSpeed *= 1 + 0.2 * (hasteLevel + 1);

    const fatigueLevel = bot.entity.effects["mining_fatigue"]?.amplifier ?? -1;
    if (fatigueLevel >= 0) {
      const fatigueMultipliers = [0.3, 0.09, 0.0027, 8.1e-4];
      blockBreakingSpeed *= fatigueMultipliers[Math.min(fatigueLevel, 3)];
    }

    if (!bot.entity.onGround) blockBreakingSpeed /= 5;
    if (
      bot.entity.isInWater &&
      !bot.entity.armor.some((a) => a.name === "turtle_helmet")
    )
      blockBreakingSpeed /= 5;

    const hardness = block.hardness;
    if (hardness < 0) return Infinity;

    const divisor = block.canHarvest(type) ? 30 : 100;
    const delta = blockBreakingSpeed / hardness / divisor;

    if (delta >= 1) return 0;
    const ticks = Math.ceil(1 / delta);
    const ms = ticks * 50;

    // console.log(
    //   `Dig time for ${block.name}: ${ms}ms (speed=${blockBreakingSpeed})`
    // );
    return ms;
  }

  function raycastBlockFace(block) {
    const eye = bot.entity.position.offset(0, bot.entity.eyeHeight, 0);
    const blockCenter = block.position.offset(0.5, 0.5, 0.5);

    // Face definitions: [faceId, normal, point on face]
    const faces = [
      [0, new Vec3(0, -1, 0), block.position.offset(0.5, 0, 0.5)], // bottom
      [1, new Vec3(0, 1, 0), block.position.offset(0.5, 1, 0.5)], // top
      [2, new Vec3(0, 0, -1), block.position.offset(0.5, 0.5, 0)], // north
      [3, new Vec3(0, 0, 1), block.position.offset(0.5, 0.5, 1)], // south
      [4, new Vec3(-1, 0, 0), block.position.offset(0, 0.5, 0.5)], // west
      [5, new Vec3(1, 0, 0), block.position.offset(1, 0.5, 0.5)], // east
    ];

    let bestFace = null;
    let bestScore = -Infinity;

    for (const [faceId, normal, faceCenter] of faces) {
      // Vector from eye to face center
      const toFace = faceCenter.minus(eye);
      const distance = toFace.norm();

      if (distance > 5) continue; // out of reach

      // Check if we're looking at the front of the face (not the back)
      const dotProduct = toFace.normalize().dot(normal);
      if (dotProduct > -0.1) continue; // facing away from us or nearly parallel

      // Check line of sight - is path clear?
      const hasLineOfSight = checkLineOfSight(eye, faceCenter);
      if (!hasLineOfSight) continue;

      // Score: prefer faces we're looking more directly at, and closer ones
      const score = -dotProduct / distance;

      if (score > bestScore) {
        bestScore = score;
        bestFace = { id: faceId, center: faceCenter, normal };
      }
    }

    return bestFace;
  }

  function checkLineOfSight(from, to) {
    const direction = to.minus(from);
    const distance = direction.norm();
    const step = 0.2; // check every 0.2 blocks
    const steps = Math.ceil(distance / step);

    for (let i = 1; i < steps; i++) {
      const t = (i * step) / distance;
      const checkPoint = from.offset(
        direction.x * t,
        direction.y * t,
        direction.z * t,
      );

      const checkBlock = bot.blockAt(checkPoint);

      // If we hit a solid block that's not our target, line of sight is blocked
      if (
        checkBlock &&
        checkBlock.boundingBox !== "empty" &&
        !checkBlock.position.equals(to)
      ) {
        return false;
      }
    }

    return true;
  }

  bot.ashDig = digBlock;
};
