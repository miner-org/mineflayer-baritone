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
} = require("./utils.js");
const { Cell } = require("./pathfinder");
const AABB = require("./aabb.js");

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
    proParkour: false,
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
    thinkTimeout: 5000,
  };
  bot.ashfinder.debug = true;

  let headLocked = false;
  let walkingUntillGround = false;
  let climbing = false;
  let placing = false;
  let breakBlocks = [];
  let vertical = [];
  let horizontal = [];

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
      (Math.abs(delta.x) <= 0.35 &&
        Math.abs(delta.z) < 0.35 &&
        Math.abs(delta.y) <= 1) ||
      (onGround &&
        Math.abs(delta.x) <= 0.35 &&
        Math.abs(delta.z) <= 0.35 &&
        Math.abs(delta.y) === 0);

    return isOnBlock;
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

    const returnStateOffset = returnState.pos.offset(0.5, 0, 0.5);

    const xDist = Math.abs(bot.entity.position.x - returnStateOffset.x);
    const zDist = Math.abs(bot.entity.position.z - returnStateOffset.z);

    const yDist = Math.abs(bot.entity.position.y - returnStateOffset.y);

    const targetDistX = Math.abs(targetPoint.x - returnStateOffset.x);
    const targetDistZ = Math.abs(targetPoint.z - returnStateOffset.z);
    const targetDistY = Math.abs(targetPoint.y - returnStateOffset.y);
    const jumpDist = Math.floor(Math.sqrt(xDist * xDist + zDist * zDist));

    const fallDist = Math.floor(Math.sqrt(yDist * yDist));
    const targetDist = Math.sqrt(
      targetDistX * targetDistX +
        targetDistZ * targetDistZ +
        targetDistY * targetDistY
    );

    return reached(returnState);
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

    if (cell.breakableNeighbors.length > 0) {
      // console.log("Break targets:", targets)
      for (const target of cell.breakableNeighbors) {
        if (bot.ashfinder.debug)
          bot.chat(
            `/particle dust 1 0 0.93 1 ${target.x} ${target.y} ${target.z} 0.1 0.1 0.1 1 5 force`
          );
        const block = bot.blockAt(target, false);

        if (block.boundingBox === "block" && !digging) {
          stopVel();
          digging = true;

          await autoTool(bot, block);

          await bot.dig(block, true).then(() => {
            digging = false;
          });
        }
      }
    }

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
            placing = false
          } catch (err) {
            placing = false
            console.log("man i hate place block");
          }

          bot.setControlState("sneak", false);
        }
      }
    }
    let dx = point.x - botPos.x;
    const dy = point.y - botPos.y;
    let dz = point.z - botPos.z;

    if (isPlayerOnBlock(bot.entity.position, point) && !placing && !digging) {
      // bot.setControlState("forward", false);
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
    if (bot.ashfinder.debug)
      bot.chat(
        `/particle dust 0 1 0.93 1 ${point.x} ${point.y} ${point.z} 0.1 0.1 0.1 1 5 force`
      );

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
    let ladderBlock = await bot.world.getBlock(point);

    let shouldWalkJump = canWalkJump(point);
    let shouldSprintJump = canSprintJump(point);

    if (!headLocked && !placing && !digging && !climbing) {
      const yaw = Math.atan2(-dx, -dz);
      const pitch = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz));

      bot.look(yaw, 0, true);
      // bot.lookAt(point.offset(0, 1.1, 0), true);
    }

    if (!placing && !digging && !climbing) {
      bot.setControlState("forward", true);
    }

    if (!walkingUntillGround) {
      bot.setControlState("sprint", true);
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
        bot.setControlState("jump", true);
        bot.setControlState("sprint", false);
      } else if (bot.entity.onGround && shouldWalkJump) {
        if (bot.ashfinder.debug) console.log("walk jumped");
        walkingUntillGround = true;
        bot.setControlState("jump", true);
        bot.setControlState("sprint", false);
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

    // if (isBotStuck()) {
    //   console.log("bot is stuck");
    //   straightPathOptions = null;
    //   complexPathPoints = null;
    //   lastNodeTime = 0;
    //   bot.clearControlStates();

    //   return await path(goal);
    // }

    return false;
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
    console.log(bot.ashfinder.debug);
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

    vertical = complexPathPoints
      .filter((cell) => cell.placeHere)
      .map((cell) => cell.verticalPlacable);

    horizontal = complexPathPoints
      .filter((cell) => cell.placeHere)
      .map((cell) => cell.horizontalPlacable);

    breakBlocks = complexPathPoints
      .filter((cell) => cell.breakThis)
      .map((cell) => cell.breakableNeighbors);

    if (bot.ashfinder.debug) console.log("Break: ", breakBlocks);

    if (result.status === "partial") {
      const { path, status } = await pathStich(complexPathPoints, bot, endPos);

      complexPathPoints = path;

      if (!complexPathPoints) {
        if (bot.ashfinder.debug)
          console.log("Failed to stitch path. Terminating.");
        return;
      }

      currentStatus = status;

      bot.ashfinder.path = complexPathPoints;
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

    while (complexPathPoints.length > 0) {
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

    if (bot.ashfinder.debug) console.log("Done!!");
    complexPathPoints = null;
    bot.clearControlStates();
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

    // Check if the new path was successfully calculated
    if (newPath.status === "partial" || newPath.status === "found") {
      if (bot.ashfinder.debug) console.log("New path stitched successfully!");
      // Combine the original path and the new path
      const combinedPath = originalPath.concat(newPath.path.slice(1));

      if (newPath.status === "partial") {
        if (bot.ashfinder.debug)
          console.log("New path was partial stiching again.");
        return await pathStich(combinedPath, bot, endPos);
      } else
        return {
          path: combinedPath,
          status: newPath.status,
        };
    } else {
      if (bot.ashfinder.debug) console.log("Failed to stitch a new path.");
      return originalPath;
    }
  }

  async function calculatePathSegment(startPos, endPos) {
    // Perform A* pathfinding from startPos to endPos
    console.log("Calculating path segment from", startPos, "to", endPos);

    console.time("astarSegment");
    const result = await astar(
      startPos,
      endPos,
      bot,
      isPlayerOnBlock,
      bot.ashfinder.config
    );
    console.timeEnd("astarSegment");

    console.log("Cost:", result.cost);
    console.log("Status:", result.status);

    // Return the calculated path segment
    return result.path;
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
  }

  bot.on("physicsTick", moveTick);
  // bot.on("move", getSpeed);
}

module.exports = inject;
