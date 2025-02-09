const astar = require("./pathfinder").Astar;
const { Vec3 } = require("vec3");
const {
  vectorProjection,
  shouldAutoJump,
  canWalkJump,
  smoothPath,
  placeBlock,
  autoTool,
  simulateUntil,
  isPointOnPath,
  getController,
  distanceFromLine,
} = require("./utils.js");
const { Cell } = require("./pathfinder");
const AABB = require("./aabb.js");
const { Goal } = require("./goal.js");

const sleep = (ms = 2000) => {
  return new Promise((r) => {
    setTimeout(r, ms);
  });
};

const {
  default: loader,
  EPhysicsCtx,
  EntityPhysics,
  EntityState,
} = require("@nxg-org/mineflayer-physics-util");

/**
 *
 * @param {import("mineflayer").Bot} bot
 */
function inject(bot) {
  bot.ashfinder = {};

  bot.ashfinder.path = [];
  bot.ashfinder.stopped = false;
  bot.ashfinder.config = {
    //blocks to avoid breaking
    blocksToAvoid: [
      "crafting_table",
      "chest",
      "furnace",
      "gravel",
      "sand",
      "farmland",
    ],
    blocksToStayAway: ["cactus", "cobweb"],
    placeBlocks: false,
    breakBlocks: true,
    parkour: true,
    checkBreakUpNodes: true,
    proParkour: true,
    fly: false,
    maxFallDist: 4,
    maxWaterDist: 256,
    disposableBlocks: [
      "dirt",
      "cobblestone",
      "stone",
      "andesite",
      "coarse_dirt",
      "blackstone",
      "end_stone",
      "basalt",
    ],
    interactableBlocks: [
      "oak_door",
      "spruce_door",
      "birch_door",
      "jungle_door",
      "acaica_door",
      "dark_oak_door",
      "mangrove_door",
      "warped_door",
      "crimson_door",
      // gates
      "oak_gate",
      "spruce_gate",
      "birch_gate",
      "jungle_gate",
      "acacia_gate",
      "dark_oak_gate",
      "mangrove_gate",
      "warped_gate",
      "crimson_gate",
    ],
    thinkTimeout: 10000,
  };
  bot.ashfinder.debug = false;
  // bot.loadPlugin(loader);

  let headLocked = false;
  let walkingUntillGround = false;
  let climbing = false;
  let placing = false;
  let breakBlocks = [];
  let vertical = [];
  let horizontal = [];
  let flying = false;
  let lastNodeTime = 0;

  let currentPathNumber = 0;
  let currentCalculatedPathNumber = 0;
  let complexPathPoints = [];
  let straightPathOptions = null;
  let followOptions = null;
  let digging = false;
  let interacting = false;
  let targetEntity = null;
  let following = false;
  let breakingState = false;
  /**
   * @type {Goal}
   */
  let currentGoal = null;

  /**
   * Checks if the player is on a given block position.
   * @param {Vec3} playerPosition - The position of the player.
   * @param {Vec3} blockPosition - The position of the block to check.
   * @param {boolean} [onGround=false] - Whether the player is on the ground or not.
   * @returns {boolean} - Whether the player is on the block or not.
   */
  function isPlayerOnBlock(playerPosition, blockPosition, onGround = false) {
    if (!blockPosition) return false;

    const delta = blockPosition.minus(playerPosition);

    const horizontalTolerance = 0.35; // Loosen horizontal bounds
    const verticalTolerance = 0.05; // Small epsilon for vertical checks

    const isOnBlock =
      (Math.abs(delta.x) <= horizontalTolerance &&
        Math.abs(delta.z) <= horizontalTolerance &&
        Math.abs(delta.y) <= 1) || // Allow standing above block by up to 1 block
      (onGround &&
        Math.abs(delta.x) <= horizontalTolerance &&
        Math.abs(delta.z) <= horizontalTolerance &&
        Math.abs(delta.y) < verticalTolerance); // Use epsilon instead of strict equality

    return isOnBlock;
  }

  function isPointOnPath(point, { max = null, onGround = false } = {}) {
    // console.log(point)
    // returns true if a point is on the current path
    if (!complexPathPoints) return false;

    if (complexPathPoints.length == 1)
      return isPlayerOnBlock(point, complexPathPoints[0].worldPos, onGround);
    let pathIndex;
    for (
      pathIndex = 1;
      pathIndex < Math.min(complexPathPoints.length, max ?? 100);
      ++pathIndex
    ) {
      let segmentStart = complexPathPoints[pathIndex - 1];
      let segmentEnd = complexPathPoints[pathIndex];

      if (
        isPlayerOnBlock(point, segmentStart.worldPos, onGround) ||
        isPlayerOnBlock(point, segmentEnd.worldPos, onGround)
      ) {
        return true;
      }

      let calculatedDistance = distanceFromLine(
        segmentStart.worldPos,
        segmentEnd.worldPos,
        point.offset(-0.5, 0, -0.5)
      );
      if (
        calculatedDistance < 0.7 &&
        (bot.entity.onGround || willBeOnGround())
      ) {
        return true;
      }
    }
    return false;
  }

  function msToTicks(ms) {
    //if 1 second(1000ms) = 20 minecraft ticks

    return Math.floor(ms / (1000 / 20));
  }

  function willBeOnGround(ticks = 1) {
    return simulateUntil(bot, (state) => state.onGround, null, ticks);
  }

  /**
   * @param {Vec3} targetPoint
   */
  function canSprintJump(targetPoint) {
    const reached = (state) => {
      if (!state) return false;
      const isonBlock = isPlayerOnBlock(state.pos, targetPoint, true);

      return isonBlock;
    };

    const returnState = simulateUntil(
      bot,
      reached,
      getController(targetPoint, true, true, 0),
      20
    );

    const returnStateWithoutJump = simulateUntil(
      bot,
      reached,
      getController(targetPoint, false, true, 0),
      20
    );

    if (!returnState) return false;

    if (returnState.isInLava) return false;

    if (reached(returnStateWithoutJump)) return false;

    // if (canWalkJump(targetPoint)) return false;

    const xDist = Math.abs(returnState.pos.x - bot.entity.position.x);
    const zDist = Math.abs(returnState.pos.z - bot.entity.position.z);

    const targetDistX = Math.abs(returnState.pos.x - targetPoint.x);
    const targetDistZ = Math.abs(returnState.pos.z - targetPoint.z);

    const jumpDist = Math.sqrt(xDist * xDist + zDist * zDist);
    const targetDist = Math.sqrt(
      targetDistX * targetDistX + targetDistZ * targetDistZ
    );

    //check y distance fo xtra precision
    const yDist = Math.abs(returnState.pos.y - bot.entity.position.y);

    const targetDistY = Math.abs(returnState.pos.y - targetPoint.y);

    if (yDist > 0.5) return false;

    if (jumpDist >= 2.5 && jumpDist <= 4 && targetDist <= 0.5) return true;

    return false;
  }

  function canWalkJump(targetPoint) {
    const reached = (state) => {
      if (!state) return false;
      const isonBlock = isPlayerOnBlock(state.pos, targetPoint, true);
      // console.log(isonBlock)
      // console.log(state.pos, "stte");
      // console.log(targetPoint,"tar")
      return isonBlock && state.onGround;
    };

    const returnState = simulateUntil(
      bot,
      reached,
      getController(targetPoint, true, false),
      20
    );

    const returnStateWithoutJump = simulateUntil(
      bot,
      reached,
      getController(targetPoint, false, true),
      20
    );

    // console.log(returnState.pos, "turn state")
    // console.log(targetPoint, "target")

    if (!returnState) return false; // never landed on ground

    if (returnState.isInLava) return false;

    if (!reached(returnState)) return false;

    // if it can do just as good just from sprinting, then theres no point in jumping
    if (reached(returnStateWithoutJump)) return false;

    const xDist = Math.abs(returnState.pos.x - bot.entity.position.x);
    const zDist = Math.abs(returnState.pos.z - bot.entity.position.z);

    const targetDistX = Math.abs(returnState.pos.x - targetPoint.x);
    const targetDistZ = Math.abs(returnState.pos.z - targetPoint.z);

    const jumpDist = Math.sqrt(xDist * xDist + zDist * zDist);
    const targetDist = Math.sqrt(
      targetDistX * targetDistX + targetDistZ * targetDistZ
    );

    if (jumpDist <= 2 && targetDist <= 0.5) return true;

    return false;
  }

  function canStraightLine(sprint = false, targetPoint) {
    const reached = (state) => {
      if (!state) return false;
      const isonBlock = isPlayerOnBlock(state.pos, targetPoint);

      return isonBlock;
    };

    const state = simulateUntil(
      bot,
      reached,
      200,
      {
        jump: false,
        forward: true,
        sprint,
      },
      true,
      false
    );

    if (!state) return;

    if (reached(state)) return true;

    if (sprint) {
      if (canSprintJump(targetPoint)) return false;
    } else {
      if (canWalkJump(targetPoint)) return false;
    }

    for (let i = 1; i < 7; i++) {
      if (sprint) {
        if (canSprintJump(targetPoint)) return true;
      } else {
        if (canWalkJump(targetPoint)) return true;
      }
    }

    return false;
  }

  function stopVel() {
    bot.clearControlStates();

    bot.entity.velocity.x = 0;
    bot.entity.velocity.z = 0;
  }

  async function straightPathTick() {
    if (!straightPathOptions) return false;

    /**
     * @type {Cell}
     */
    let cell = straightPathOptions.target;
    let point = cell.worldPos;
    let botPos = bot.entity.position;

    const blockPlace = getBlockToPlace();
    const blockBelow = bot.blockAt(
      bot.entity.position.floored().offset(0, -1, 0)
    );

    // if we have taken more than 5 seconds to reach a node, we should recalculate
    // if (performance.now() - lastNodeTime > 5000) {
    //   const goal = currentGoal;
    //   resetPathingState();
    //   straightPathOptions.resolve();
    //   await path(goal, {});
    //   return;
    // }

    if (cell.fly) {
      if (bot.ashfinder.debug) showPathParticleEffect(point);
      //we gotta creative fly

      if (!bot.physics.gravity !== 0) {
        bot.creative.startFlying();
      }

      //if the point is directly above us, we can just fly up
      if (point.y > botPos.y) {
        if (!bot.getControlState("jump")) bot.setControlState("jump", true);
        bot.setControlState("forward", false);
      } else {
        bot.setControlState("jump", false);
        // we do this cuz mineflayers fly is weird
        bot.creative.stopFlying();
      }

      await updateBotLookDirection(botPos, point);

      if (isAtTarget(botPos, point)) {
        resetMovementState();
        straightPathOptions = null;
        return true;
      }

      bot.setControlState("forward", true);
      bot.setControlState("sprint", true);

      return false;
    } else {
      // if (bot.physics.gravity === 0) {
      //   bot.creative.stopFlying();
      // }
    }

    if (isAtTarget(botPos, point)) {
      await updateBotLookDirection(botPos, point);
      resetMovementState();
      straightPathOptions = null;
      return true;
    }

    if (cell.horizontalPlacable.length > 0) {
      await handleHorizontalPlacables(cell, blockPlace, blockBelow);
    }

    if (cell.breakableNeighbors.length > 0) {
      await handleBreakingBlocks(cell.breakableNeighbors);
    }

    await updateBotLookDirection(botPos, point);

    if (
      !breakingState &&
      !bot.getControlState("forward") &&
      straightPathOptions !== null &&
      !digging
    ) {
      bot.setControlState("forward", true);
      bot.setControlState("sprint", true);
    }

    botPos = bot.entity.position;
    // Debugging: show particle effect for path
    if (bot.ashfinder.debug) showPathParticleEffect(point);

    // Door handling
    await handleDoorInteraction(point);

    // Handle climbing and jumping logic
    await handleClimbingAndJumping(point, botPos);

    if (bot.entity.onGround) {
      headLocked = false;
    }

    botPos = bot.entity.position;

    if (isAtTarget(botPos, point, true)) {
      await updateBotLookDirection(botPos, point);
      resetMovementState();
      straightPathOptions = null;
      return true;
    }

    await new Promise((r) => setTimeout(r, 0));

    return false;
  }

  // Get the block for placing
  function getBlockToPlace() {
    return bot.inventory
      .items()
      .find((item) =>
        bot.ashfinder.config.disposableBlocks.includes(item.name)
      );
  }

  /**
   *
   * @param {Cell} cell
   * @param {import("prismarine-item").Item} blockPlace
   * @param {import("prismarine-block").Block} blockBelow
   * @returns
   */
  async function handleHorizontalPlacables(cell, blockPlace, blockBelow) {
    if (blockBelow.name !== "air") return;

    bot.clearControlStates();

    for (const target of cell.horizontalPlacable) {
      // try {
      //   await moveToEdge(target);
      // } catch (error) {
      //   console.log(error);
      // }

      if (!placing) {
        placing = true;
        await equipBlockIfNeeded(blockPlace);
        await placeBlockAtTarget(target, target.dir);
        placing = false;
      }
    }
  }

  async function moveToEdge(target) {
    return new Promise(async (resolve, reject) => {
      const targetBlockPos = target.offset(
        target.dir.x + 0.5,
        0,
        target.dir.z + 0.5
      );
      const targetPosDelta = bot.entity.position
        .clone()
        .subtract(targetBlockPos);
      const targetYaw = Math.atan2(-targetPosDelta.x, -targetPosDelta.z);
      const targetPitch = -1.421;
      const viewVector = getViewVector(targetPitch, targetYaw);

      await bot.lookAt(viewVector, true);
      bot.setControlState("back", true);
      bot.setControlState("sneak", true);
      const interval = setInterval(async () => {
        const distance = bot.entity.position.distanceTo(targetBlockPos);
        if (distance < 0.5) {
          clearInterval(interval);
          resolve();
        } else {
          await bot.lookAt(viewVector, true);
          bot.setControlState("back", true);
          bot.setControlState("sneak", true);
        }
      }, 100);

      setTimeout(() => {
        clearInterval(interval);
        bot.setControlState("forward", false);
        bot.clearControlStates();
        reject(new Error("Failed to move to edge within time limit"));
      }, 5000); // Timeout after 5 seconds
    });
  }

  /**
   * Performs a raycast from a given point in a specified direction.
   * @param {Vec3} point - The starting point of the raycast.
   * @param {Vec3} direction - The direction of the raycast.
   * @returns {Block|null} The block hit by the raycast, or null if no block is hit.
   */
  async function raycast(point, direction) {
    const maxDistance = 5; // Maximum distance to raycast
    const stepSize = 0.1; // Step size for each iteration
    let currentPos = point.clone();

    for (let i = 0; i < maxDistance / stepSize; i++) {
      currentPos.add(direction.scaled(stepSize));
      const block = bot.blockAt(currentPos);
      if (block && block.name !== "air") {
        return block;
      }
    }

    return null;
  }

  /**
   * Calculates the view vector based on pitch and yaw angles.
   * @param {number} pitch - The pitch angle in radians.
   * @param {number} yaw - The yaw angle in radians.
   * @returns {Vec3} The view vector with x, y, and z components.
   */
  function getViewVector(pitch, yaw) {
    return new Vec3(
      -Math.cos(pitch) * Math.sin(yaw),
      Math.sin(pitch),
      -Math.cos(pitch) * Math.cos(yaw)
    );
  }

  /**
   * @param {DirectionalVec3} cell
   */
  async function placeBlockAtTarget(cell, dir) {
    const pos = cell;
    const block = bot.blockAt(pos);

    const dirVec = new Vec3(dir.x, 0, dir.z);

    try {
      await bot.placeBlock(block, dirVec);
    } catch (error) {
      console.error(`Error placing block at ${block.position}:`, error);
    }
  }

  async function equipBlockIfNeeded(item) {
    if (!item) {
      console.log("guh");
      return;
    }

    await bot.equip(item, "hand");
  }

  async function handleBreakingBlocks(positions) {
    let promises = [];
    bot.clearControlStates();

    breakingState = true;
    for (const pos of positions) {
      const block = bot.blockAt(pos);
      if (block.boundingBox === "block") {
        promises.push(
          (async () => {
            try {
              if (!digging) {
                digging = true;
                await autoTool(bot, block);
                await bot.lookAt(block.position.offset(0.5, 0, 0.5), true);
                await bot.dig(block, true);
                digging = false;
              }
            } catch (error) {
              console.error(`Error digging block at ${block.position}:`, error);
              digging = false;
            }
          })()
        );
      }
    }

    await Promise.all(promises);
    breakingState = false;
  }

  // Check if the bot has reached the target position
  function isAtTarget(botPos, point, checkGround = false) {
    return (
      (isPlayerOnBlock(bot.entity.position, point, checkGround) &&
        !placing &&
        !digging) ||
      isPointOnPath(bot.entity.position, { max: 1, onGround: checkGround })
    );
  }

  function smartAutoJump() {
    const botPos = bot.entity.position;
    const yaw = bot.entity.yaw;

    // Calculate the forward direction based on the bot's yaw
    const forwardX = Math.round(Math.sin(yaw));
    const forwardZ = Math.round(Math.cos(yaw));

    const forwardBlock = bot.blockAt(botPos.offset(forwardX, 0, forwardZ));
    const aboveForwardBlock = bot.blockAt(botPos.offset(forwardX, 1, forwardZ));

    return (
      forwardBlock &&
      forwardBlock.boundingBox === "block" &&
      (!aboveForwardBlock || aboveForwardBlock.boundingBox !== "block")
    );
  }

  // Reset movement state when the bot reaches the target
  function resetMovementState() {
    bot.setControlState("sprint", false);
    bot.setControlState("jump", false);
    bot.setControlState("forward", false);
    if (straightPathOptions) straightPathOptions.resolve();
    headLocked = false;
    walkingUntillGround = false;
    climbing = false;
    placing = false;
    lastNodeTime = performance.now();
  }

  // Show path particle effect for debugging
  function showPathParticleEffect(point) {
    // bot.chat(
    //   `/particle dust{color:[0.2,0.82,0.48],scale:1} ${point.x} ${point.y} ${point.z} 0.1 0.1 0.1 1 4 force`
    // );
    bot.chat(
      `/particle dust 0.2 0.82 0.48 1 ${point.x} ${point.y} ${point.z} 0.1 0.1 0.1 2 10 force`
    );
  }

  // Handle door interaction when standing in front of a door
  async function handleDoorInteraction(point) {
    const block = bot.blockAt(point, false);
    if (
      block &&
      block.name.includes("door") &&
      block.getProperties().open === false &&
      !interacting
    ) {
      interacting = true;
      bot.clearControlStates();
      await bot.activateBlock(block, new Vec3(0, 1, 0)).then(() => {
        interacting = false;
      });
    }
  }

  /**
   *
   * @param {Vec3} point
   * @param {Vec3} botPos
   * @returns
   */
  async function handleClimbingAndJumping(point, botPos) {
    if (digging) return;
    let ladderBlock = bot.world.getBlock(point);
    let shouldWalkJump = canWalkJump(point);
    let shouldSprintJump = canSprintJump(point);
    let shouldAutoJump = smartAutoJump();

    if (
      (ladderBlock && ladderBlock.name === "ladder") ||
      bot.entity.isOnLadder
    ) {
      handleLadderMovement(ladderBlock);
    } else if (bot.entity.isInWater) {
      handleWaterMovement(botPos);
    } else if (bot.entity.onGround && shouldWalkJump) {
      await handleWalkJump(point, botPos);
      if (bot.ashfinder.debug) console.log("walk jumped");
    } else if (bot.entity.onGround && shouldSprintJump) {
      await handleSprintJump();
      if (bot.ashfinder.debug) console.log("sprint jumped");
    } else {
      if (bot.entity.onGround) {
        headLocked = false;
        walkingUntillGround = false;
      }

      if (!bot.entity.isInWater) bot.setControlState("jump", false);
    }
  }

  // Handle movement when on ladder
  function handleLadderMovement(ladderBlock) {
    const yDist = Math.abs(bot.entity.position.y - ladderBlock.position.y);
    if (yDist > 0) {
      headLocked = true;
      climbing = true;
      bot.clearControlStates();
      bot.lookAt(ladderBlock.position.offset(0.5, 1, 0.5), true);
      bot.setControlState("forward", false);
      bot.setControlState("jump", true);
    } else if (yDist < 0) {
      headLocked = true;
      climbing = true;
      bot.setControlState("forward", false);
      bot.setControlState("jump", false);
    }
  }

  // Handle movement when in water
  function handleWaterMovement(botPos) {
    const yDist = Math.abs(botPos.y);
    if (yDist > 0) {
      bot.setControlState("jump", true);
      bot.setControlState("sprint", false);
    }
  }

  // Handle normal walking jump
  async function handleWalkJump(point) {
    walkingUntillGround = true;
    headLocked = true;
    bot.setControlState("sprint", false);
    bot.setControlState("jump", true);

    // make everything wait abit
    await sleep(40);
    // bot.setControlState("forward", false);
  }

  // Handle sprint jumping
  async function handleSprintJump() {
    headLocked = true;
    bot.setControlState("sprint", true);
    bot.setControlState("jump", true);

    // await sleep(100);

    // bot.setControlState("forward", false);
  }

  // Update the bot's direction to look at the target
  async function updateBotLookDirection(botPos, point) {
    if (digging) return;

    if (headLocked) return;
    const dx = Math.abs(point.x - botPos.x);
    const dy = Math.abs(point.y - botPos.y);
    const dz = Math.abs(point.z - botPos.z);

    const yaw = Math.atan2(-dx, -dz);
    const pitch = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz));

    await bot.lookAt(point.offset(0, 1.6, 0), true);
  }

  function isNearTarget(currentPos, targetPos, tolerance = 1.5) {
    const deltaX = targetPos.x - currentPos.x;
    const deltaY = targetPos.y - currentPos.y;
    const deltaZ = targetPos.z - currentPos.z;

    // Calculate the distance between the current position and the target
    const distance = Math.sqrt(deltaX ** 2 + deltaY ** 2 + deltaZ ** 2);

    // Return true if the distance is less than or equal to the tolerance
    return distance <= tolerance;
  }

  async function elytraPathTick() {
    if (!elytraPathOptions) return;

    const { target } = elytraPathOptions;

    if (isNearTarget(bot.entity.position, target, 1.5)) {
      elytraPathOptions.resolve?.(); // Resolve the promise when the target is reached
      elytraPathOptions = null;
      flying = false; // Reset flying state
      console.log("Reached target");
      return;
    }

    // Recalculate yaw and pitch for current waypoint
    const lookVector = calculateLookVector(bot.entity.position, target);

    // Rotate the bot towards the target
    await bot.look(lookVector.yaw, lookVector.pitch, true);

    if (!flying) {
      flying = true;

      // Equip Elytra if not already equipped
      const elytraSlot = bot.inventory.slots[bot.getEquipmentDestSlot("torso")];
      if (!elytraSlot || elytraSlot.name !== "elytra") {
        const elytra = bot.inventory
          .items()
          .find((item) => item.name.includes("elytra"));
        if (elytra) {
          await bot.equip(elytra, "torso");
        }
      }

      await bot.elytraFly();
    }

    // Activate firework for boost if needed
    if (!bot.entity.elytraFlying) {
      const fireworkItem = bot.inventory
        .items()
        .find((item) => item.name === "firework_rocket");
      if (fireworkItem) {
        await bot.equip(fireworkItem, "hand");
        await sleep(100); // Small delay to ensure the item is equipped
        bot.activateItem(); // Fire the rocket
      }
    }
  }

  function setElytraPath({ target }) {
    elytraPathOptions = {
      target,
    };

    return new Promise((resolve) => {
      elytraPathOptions.resolve = resolve;
    });
  }

  async function elytraPath(endPos) {
    const start = bot.entity.position.clone();

    // Generate the flight path
    const result = createFlightPath(start, endPos);
    elytraPathPoints = result.positions;

    // Start the Elytra flight
    bot.setControlState("jump", true); // Jump to initiate flight
    await sleep(50);
    bot.setControlState("jump", false);

    await sleep(50); // Small delay to ensure bot jumps

    while (elytraPathPoints.length > 0) {
      const nextPoint = elytraPathPoints[0];

      // Set the next waypoint
      await setElytraPath({
        target: nextPoint,
      });

      // Wait for the bot to reach the current waypoint before moving to the next one
      await new Promise((resolve) => setTimeout(resolve, 200)); // Adjust delay based on flight speed

      elytraPathPoints.shift(); // Remove the reached waypoint
    }

    console.log("Flight path completed");
  }

  function calculateLookVector(fromPos, toPos) {
    const deltaX = toPos.x - fromPos.x;
    const deltaY = toPos.y - fromPos.y;
    const deltaZ = toPos.z - fromPos.z;

    const yaw = (Math.atan2(deltaX, deltaZ) * 180) / Math.PI;
    const pitch =
      (Math.atan2(deltaY, Math.sqrt(deltaX ** 2 + deltaZ ** 2)) * 180) /
      Math.PI;

    return { yaw, pitch };
  }

  let initialPos = null;
  let finalPos = null;
  let startTime = null;
  let endTime = null;

  function getSpeed() {
    // Record initial position and time when the bot starts moving
    if (!initialPos) {
      initialPos = bot.entity.position.clone();
      startTime = new Date();
    } else {
      // Record final position and time when the bot stops moving
      finalPos = bot.entity.position.clone();
      endTime = new Date();

      // Calculate distance traveled
      const distance = initialPos.distanceTo(finalPos);

      // Calculate time taken in seconds
      const timeTaken = (endTime - startTime) / 1000; // Convert to seconds

      // Calculate speed
      const speed = distance / timeTaken;

      console.log(`Bot's speed: ${speed} blocks per second`);

      // Reset positions and times for next movement
      initialPos = null;
      finalPos = null;
      startTime = null;
      endTime = null;
    }
  }

  function straightPath({ target, skip }) {
    straightPathOptions = {
      target,

      skip: skip ?? true,
    };
    return new Promise((resolve, reject) => {
      if (straightPathOptions) straightPathOptions.resolve = resolve;
      else resolve();
    });
  }

  /**
   *@param {Goal} goal - The goal to reach.
   *@return {function} A function that returns whether the goal has been reached.
   */
  function createEndFunc(goal) {
    return (currentPosition) => {
      return goal.isReached(currentPosition);
    };
  }

  function refinePath(path, bot) {
    const refined = [];
    for (let i = 0; i < path.length - 1; i++) {
      const current = path[i].worldPos;
      const next = path[i + 1].worldPos;

      const dx = Math.abs(current.x - next.x);
      const dy = next.y - current.y; // Vertical difference
      const dz = Math.abs(current.z - next.z);

      // Add nodes where vertical changes occur or where large distances are present
      if (dx > 1 || dz > 1 || Math.abs(dy) > 0) {
        refined.push(path[i]);

        // Add intermediate points for jumps or falls
        if (dy > 1) {
          refined.push(new Cell(current.offset(0, 1, 0))); // Add jump step
        } else if (dy < 0) {
          refined.push(new Cell(next.offset(0, -1, 0))); // Add fall step
        }
      }
    }
    refined.push(path[path.length - 1]); // Ensure the last node is included
    return refined;
  }

  async function path(goal, options = {}) {
    if (bot.ashfinder.debug) console.log("called");
    let position = goal.position.clone().floored();
    let pathNumber = ++currentPathNumber;
    let currentStatus = "";
    calculating = true;
    continuousPath = true;
    currentGoal = goal;
    const start = bot.entity.position.clone().floored();
    // console.log("Start:", start.toString());

    const result = await astar(
      start,
      position,
      bot,
      createEndFunc(goal),
      bot.ashfinder.config,
      options.excludedPositions
    );

    if (bot.ashfinder.debug) console.log("Cost:", result.cost);
    if (bot.ashfinder.debug) console.log("Status:", result.status);

    current = result.status;

    if (currentCalculatedPathNumber > pathNumber) return;
    else currentCalculatedPathNumber = pathNumber;
    goingToPathTarget = position.clone();

    calculating = false;

    complexPathPoints = result.path;
    bot.ashfinder.path = complexPathPoints;

    extractPathPoints();

    if (bot.ashfinder.debug) console.log("Break: ", breakBlocks);
    if (bot.ashfinder.debug) console.log("Place: ", horizontal);

    while (complexPathPoints.length > 0) {
      // for (const cell of complexPathPoints) {
      //   const point = cell.worldPos;
      //   bot.chat(
      //     `/particle dust 0 1 0.93 1 ${point.x} ${point.y} ${point.z} 0.1 0.1 0.1 1 5 force`
      //   );

      //   await sleep(10);
      // }
      const movement = complexPathPoints[0];

      await straightPath({
        target: movement,
      });

      if (
        currentCalculatedPathNumber > pathNumber ||
        complexPathPoints === null
      )
        return;
      complexPathPoints.shift();
    }

    if (result.status === "partial") {
      if (bot.ashfinder.debug)
        console.log(`Remaining nodes: ${result.remainingNodes}`);
      resetPathingState();
      if (bot.ashfinder.debug)
        console.log("Recalculating path from current position...");

      return await path(goal, options);
    }

    if (bot.ashfinder.debug) console.log("Done!!");
    resetPathingState();
  }

  function resetPathingState() {
    complexPathPoints = null;
    elytraPathPoints = null;
    flying = false;
    bot.clearControlStates();
    bot.setControlState("forward", false);
    bot.setControlState("sprint", false);

    if (bot.getControlState("forward")) {
      bot.clearControlStates();
    }
  }

  function extractPathPoints() {
    vertical = complexPathPoints
      .filter((cell) => cell.placeHere)
      .map((cell) => cell.verticalPlacable);

    horizontal = complexPathPoints
      .filter((cell) => cell.placeHere)
      .map((cell) => cell.horizontalPlacable);

    breakBlocks = complexPathPoints
      .filter((cell) => cell.breakThis)
      .map((cell) => cell.breakableNeighbors);
  }

  async function pathStich(originalPath, bot, endPos) {
    if (bot.ashfinder.debug) console.log("Stitching paths...");

    // Calculate a new path from the end of the partial path to the final destination
    const partialEnd = originalPath[originalPath.length - 1].worldPos;
    const newPath = await astar(
      partialEnd,
      endPos,
      bot,
      isPlayerOnBlock,
      bot.ashfinder.config
    );

    if (newPath.status === "no path") {
      const combinedPath = originalPath.concat(newPath.path.slice(1));

      return {
        status: newPath.status,
        path: combinedPath,
      };
    }

    const combinedPath = originalPath.concat(newPath.path.slice(1));

    return {
      path: combinedPath,
      status: newPath.status,
    };
  }

  async function follow(entity, options) {
    targetEntity = entity;
    followOptions = options;
  }

  async function followTick() {
    if (!targetEntity) return;

    //First we check distance to targetEntity
    const distance = bot.entity.position.distanceTo(targetEntity.position);

    if (distance <= followOptions.minDistance) {
      bot.clearControlStates();
      resetPathingState();
      return;
    }

    if (distance >= followOptions.maxDistance) {
      bot.clearControlStates();
      resetPathingState();
      return;
    }

    if (following) {
      return;
    }

    following = true;

    const goal = targetEntity.position.clone().floored();

    await path(goal, {});

    following = false;
  }

  function arraysMatch(arr1, arr2) {
    if (arr1.length !== arr2.length) {
      return false;
    }
    for (let i = 0; i < arr1.length; i++) {
      if (
        arr1[i].x !== arr2[i].x ||
        arr1[i].y !== arr2[i].y ||
        arr1[i].z !== arr2[i].z
      ) {
        return false;
      }
    }
    return true;
  }

  bot.ashfinder.elytraPath = async (endPos, options = {}) => {
    await elytraPath(endPos, options);
  };

  /**
   *
   * @param {Goal} goal - The goal to go to.
   * @return {Promise} A promise that resolves when the function is complete.
   */
  bot.ashfinder.goto = async (goal, excludedPositions = []) => {
    await path(goal, { excludedPositions });

    resetPathingState();
  };

  bot.ashfinder.stop = async () => {
    bot.ashfinder.path = [];
    bot.ashfinder.stopped = true;
    bot.ashfinder.pathOptions = null;

    complexPathPoints = null;
    straightPathOptions = null;
    targetEntity = null;
    followOptions = null;
    bot.clearControlStates();
  };

  bot.ashfinder.follow = async (
    entity,
    options = { minDistance: 3, maxDistance: 50 }
  ) => {
    /*
		Options:
		- maxDistance
		- minDistance
		*/
    await follow(entity, options);
  };

  /**
   * Generates a path from the current position of the bot to the given position using the Ashfinder algorithm.
   *
   * @param {Vec3} position - The position to generate the path to.
   * @return {object} An object containing the generated path and its cost.
   */
  bot.ashfinder.generatePath = async (position) => {
    const { path, cost } = await astar(
      bot.entity.position.clone(),
      position,
      bot,
      isPlayerOnBlock
    );

    return { path, cost };
  };

  async function moveTick() {
    if (straightPathOptions !== null) await straightPathTick();
  }

  // async function lookTick() {
  //   if (!straightPathOptions) return;

  //   const { target } = straightPathOptions;
  //   const botPos = bot.entity.position;

  //   await updateBotLookDirection(botPos, target.worldPos);
  // }

  // bot.on("physicsTick", lookTick);
  bot.on("physicsTick", moveTick);
  bot.on("physicsTick", followTick);
  bot.on("death", resetPathingState);
  // bot.on("move", getSpeed);
}

module.exports = inject;
