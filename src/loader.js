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

const { Physics } = require("prismarine-physics");

const createFlightPath = require("./flight.js");

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
    blocksToAvoid: ["crafting_table", "chest", "furnace", "gravel", "sand"],
    blocksToStayAway: ["cactus"],
    placeBlocks: false,
    breakBlocks: true,
    parkour: true,
    checkBreakUpNodes: true,
    proParkour: true,
    maxFallDist: 3,
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
    thinkTimeout: 1000,
  };
  bot.ashfinder.debug = true;
  // bot.loadPlugin(loader);

  let headLocked = false;
  let walkingUntillGround = false;
  let climbing = false;
  let placing = false;
  let breakBlocks = [];
  let vertical = [];
  let horizontal = [];
  let flying = false;

  let currentPathNumber = 0;
  let currentCalculatedPathNumber = 0;
  let complexPathPoints = [];
  let straightPathOptions = null;
  let digging = false;
  let interacting = false;
  let lastNodeTime = 0;
  let targetEntity = null;
  let goal = null;
  let lastFollowed = performance.now();
  let calculating = false;

  let elytraPathPoints = [];
  let elytraPathIndex = 0;
  let elytraPathOptions = null;

  /**
   * Checks if the player is on a given block position.
   * @param {Vec3} playerPosition - The position of the player.
   * @param {Vec3} blockPosition - The position of the block to check.
   * @param {boolean} [onGround=false] - Whether the player is on the ground or not.
   * @returns {boolean} - Whether the player is on the block or not.
   */
  function isPlayerOnBlock(playerPosition, blockPosition, onGround = false) {
    if (!blockPosition) return false; // There's no target position

    const delta = blockPosition.minus(playerPosition);

    const isOnBlock =
      (Math.abs(delta.x) <= 0.5 &&
        Math.abs(delta.z) < 0.5 &&
        Math.abs(delta.y) <= 2) ||
      (onGround &&
        Math.abs(delta.x) <= 0.5 &&
        Math.abs(delta.z) <= 0.5 &&
        Math.abs(delta.y) === 0);

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

  function willBeOnGround(ticks = 1) {
    return simulateUntil(bot, (state) => state.onGround, null, ticks);
  }

  function moveToEdge(referenceBlock, edge) {
    const allowInstantTurn = false;

    // Function to calculate the view vector based on pitch and yaw angles
    function getViewVector(pitch, yaw) {
      const cosPitch = Math.cos(pitch);
      const sinPitch = Math.sin(pitch);
      const cosYaw = Math.cos(yaw);
      const sinYaw = Math.sin(yaw);
      return new Vec3(-sinYaw * cosPitch, sinPitch, -cosYaw * cosPitch);
    }

    // Target viewing direction while approaching the edge
    const targetBlockPos = referenceBlock.offset(
      edge.x + 0.5,
      edge.y,
      edge.z + 0.5
    );
    const targetPosDelta = bot.entity.position.clone().subtract(targetBlockPos);
    const targetYaw = Math.atan2(-targetPosDelta.x, -targetPosDelta.z);
    const targetPitch = -1.421;
    const viewVector = getViewVector(targetPitch, targetYaw);

    // Calculate distance to the targeted position
    const distanceThreshold = 0.3;
    const targetPosition = referenceBlock.clone().offset(0.5, 1, 0.5);
    const distance = bot.entity.position.distanceTo(targetPosition);

    if (
      bot.entity.position.distanceTo(
        referenceBlock.clone().offset(edge.x + 0.5, 1, edge.z + 0.5)
      ) > 0.4
    ) {
      bot.lookAt(
        bot.entity.position.offset(viewVector.x, viewVector.y, viewVector.z),
        allowInstantTurn
      );
      bot.setControlState("forward", false);
      bot.setControlState("sneak", true);
      bot.setControlState("back", true);
      return false;
    }
    bot.setControlState("back", false);
    return true;
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

    const isOnPath = isPointOnPath(returnState.pos, { onGround: true });

    if (!isOnPath) return false;

    return true;
  }

  function between(x, min, max) {
    return x >= min && x <= max;
  }

  function canWalkJump(targetPoint) {
    const reached = (state) => {
      if (!state) return false;
      const isonBlock = isPlayerOnBlock(state.pos, targetPoint, true);

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

    if (jumpDist <= 2.5 && targetDist <= 1) return true;

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
    const botPos = bot.entity.position;
    const blockPlace = bot.inventory
      .items()
      .find((item) =>
        bot.ashfinder.config.disposableBlocks.includes(item.name)
      );

    if (cell.horizontalPlacable.length > 0) {
      for (const target of cell.horizontalPlacable) {
        const blockBelow = bot.blockAt(
          bot.entity.position.floored().offset(0, -1, 0)
        );

        let isAir = blockBelow.name === "air";
        if (!isAir) {
          function getViewVector(pitch, yaw) {
            const cosPitch = Math.cos(pitch);
            const sinPitch = Math.sin(pitch);
            const cosYaw = Math.cos(yaw);
            const sinYaw = Math.sin(yaw);
            return new Vec3(-sinYaw * cosPitch, sinPitch, -cosYaw * cosPitch);
          }

          // Target viewing direction while approaching the edge
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

          bot.lookAt(
            bot.entity.position.offset(viewVector.x, viewVector.y, viewVector.z)
          );
          bot.setControlState("forward", false);
          bot.setControlState("sneak", true);
          bot.setControlState("back", true);
          return;
        }

        if (!placing) {
          placing = true;
          if (bot.heldItem && bot.heldItem !== blockPlace) {
            await bot.equip(blockPlace);
          }

          const refBlock = bot.blockAt(target, false);

          try {
            await bot.placeBlock(
              refBlock,
              new Vec3(target.dir.x, 0, target.dir.z)
            );
            placing = false;
          } catch (err) {
            placing = false;
            console.log("man i hate place block");
          }

          bot.setControlState("sneak", false);
        }
      }
    }
    let dx = point.x - botPos.x;
    const dy = point.y - botPos.y;
    let dz = point.z - botPos.z;

    //debug bot
    // console.log("VELOCITY", bot.entity.velocity);
    // console.log("ONGROUND", bot.entity.onGround);
    // const bb = bot.entity.boundingBox;
    // console.log("BB", bb);

    if (bot.entity.isCollidedVertically) {
      // Apply a small correction to ensure the entity is not stuck
      bot.entity.velocity.y = 0;
      bot.entity.position.y = Math.floor(bot.entity.position.y) + 0.01;
    }

    if (
      (isPlayerOnBlock(bot.entity.position, point) && !placing && !digging) ||
      isPointOnPath(bot.entity.position)
    ) {
      // bot.setControlState("forward", false);
      // bot.setControlState("sprint", false);
      bot.setControlState("jump", false);

      if (straightPathOptions) straightPathOptions.resolve();

      straightPathOptions = null;
      headLocked = false;
      walkingUntillGround = false;
      climbing = false;
      placing = false;
      lastNodeTime = performance.now();
      return true;
    }

    // for debuging ingame
    // if (bot.ashfinder.debug)
    //   bot.chat(
    //     `/particle dust 0 1 0.93 1 ${point.x} ${point.y} ${point.z} 0.1 0.1 0.1 1 5 force`
    //   );

    // Activate door if standing in front of it
    const block = point !== null ? bot.blockAt(point, false) : null;

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

    // ladders
    let ladderBlock = bot.world.getBlock(point);

    let shouldWalkJump = canWalkJump(point);
    let shouldSprintJump = canSprintJump(point);

    if (!headLocked && !placing && !digging && !climbing) {
      const yaw = Math.atan2(-dx, -dz);
      const pitch = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz));

      // bot.look(yaw, 0);
      bot.lookAt(point.offset(0, 1.1, 0), true);
    }

    if (cell.breakableNeighbors.length > 0) {
      // console.log("Break targets:", targets)
      bot.clearControlStates();
      for (const target of cell.breakableNeighbors) {
        // if (bot.ashfinder.debug)
        //   bot.chat(
        //     `/particle dust 1 0 0.93 1 ${target.x} ${target.y} ${target.z} 0.1 0.1 0.1 1 5 force`
        //   );
        const block = bot.blockAt(target, false);

        if (block.boundingBox === "block" && !digging) {
          digging = true;

          await autoTool(bot, block);

          await bot.dig(block, true).then(() => {
            digging = false;
          });
        }
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    if (!placing && !digging && !climbing) {
    }

    if (!walkingUntillGround) {
    }

    if (!placing && !digging) {
      if (
        (ladderBlock && ladderBlock.name === "ladder") ||
        bot.entity.isOnLadder
      ) {
        const yDist = Math.abs(bot.entity.position.y - ladderBlock.position.y);

        // up
        if (yDist > 0) {
          headLocked = true;
          climbing = true;
          bot.clearControlStates();
          bot.lookAt(ladderBlock.position.offset(0.5, 1, 0.5), true);
          bot.setControlState("forward", false);
          bot.setControlState("jump", true);
        } else if (yDist < 0) {
          // down
          headLocked = true;
          climbing = true;
          bot.setControlState("forward", false);
          bot.setControlState("jump", false);
        }
      } else if (bot.entity.isInWater) {
        const yDist = dy;
        if (yDist > 0) {
          bot.setControlState("jump", true);
          bot.setControlState("sprint", false);
        }
      } else if (bot.entity.onGround && shouldWalkJump) {
        if (bot.ashfinder.debug) console.log("walk jumped");
        walkingUntillGround = true;
        bot.setControlState("sprint", false);
        bot.setControlState("jump", true);
      } else if (bot.entity.onGround && shouldSprintJump) {
        if (bot.ashfinder.debug) console.log("sprint jumped!");
        bot.setControlState("sprint", true);
        bot.setControlState("jump", true);
      } else {
        if (bot.entity.onGround) {
          walkingUntillGround = false;
          climbing = false;
          headLocked = false;
        }
        bot.setControlState("jump", false);
      }
    }

    if (!bot.getControlState("forward") && !digging) {
      bot.setControlState("forward", true);
    }

    bot.setControlState("sprint", true);

    return false;
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

  async function path(endPos, options = {}) {
    if (bot.ashfinder.debug) console.log("called");
    let position = endPos.clone();
    let pathNumber = ++currentPathNumber;
    let currentStatus = "";
    goal = position.clone();
    calculating = true;
    continuousPath = true;
    const start = bot.entity.position.clone();

    const result = await astar(
      start,
      position,
      bot,
      isPlayerOnBlock,
      bot.ashfinder.config
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
      bot.clearControlStates();
      bot.setControlState("forward", false);
      bot.setControlState("sprint", false);
      // Recalculate path from current position
      if (bot.ashfinder.debug)
        console.log("Recalculating path from current position...");

      return await path(endPos, options); // Recursively call path with the new starting position
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
    bot.ashfinder.pathOptions = options;
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
   * Generate the function comment for the given function body.
   *
   * @param {Vec3} position - The position to go to.
   * @return {Promise} A promise that resolves when the function is complete.
   */
  bot.ashfinder.goto = async (position) => {
    await path(position, {});
  };

  bot.ashfinder.stop = async () => {
    bot.ashfinder.path = [];
    bot.ashfinder.stopped = true;
    bot.ashfinder.pathOptions = null;

    complexPathPoints = null;
    straightPathOptions = null;
    targetEntity = null;
    bot.clearControlStates();
  };

  bot.ashfinder.follow = async (entity, options = {}) => {
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
    if (elytraPathOptions !== null) await elytraPathTick();
  }

  bot.on("physicsTick", moveTick);
}

module.exports = inject;
