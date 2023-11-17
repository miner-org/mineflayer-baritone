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
    placeBlocks: false,
    breakBlocks: true,
    parkour: true,
    checkBreakUpNodes: true,
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
  };

  let headLocked = false;
  let walkingUntillGround = false;
  let climbing = false;
  let placing = false;
  let breakBlocks = [];
  let vertical = [];
  let horizontal = [];

  let complexPathTarget = null;
  let calculating = false;
  let currentPathNumber = 0;
  let currentCalculatedPathNumber = 0;
  let complexPathPoints = [];
  let straightPathOptions = null;
  let digging = false;
  let interacting = false;

  /**
   * Checks if the player is on a given block position.
   * @param {Object} playerPosition - The position of the player.
   * @param {Object} blockPosition - The position of the block to check.
   * @param {boolean} [onGround=false] - Whether the player is on the ground or not.
   * @returns {boolean} - Whether the player is on the block or not.
   */
  function isPlayerOnBlock(playerPosition, blockPosition, onGround = false) {
    if (!blockPosition) return false; // There's no target position

    const xDistance = Math.abs(playerPosition.x - blockPosition.x);
    const zDistance = Math.abs(playerPosition.z - blockPosition.z);
    const yDistance = Math.abs(playerPosition.y - blockPosition.y);

    const isOnBlock =
      (xDistance < 0.5 && zDistance < 0.5 && yDistance <= 1) ||
      (onGround && xDistance < 0.5 && zDistance < 0.5 && yDistance === 0);

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

    const referenceBlockBB = new AABB(
      referenceBlock.x,
      referenceBlock.y,
      referenceBlock.z,

      "full"
    );

    const isAtEdge =
      bot.entity.position.x === referenceBlockBB.minX ||
      bot.entity.position.x === referenceBlockBB.maxX ||
      bot.entity.position.y === referenceBlockBB.minY ||
      bot.entity.position.y === referenceBlockBB.maxY ||
      bot.entity.position.z === referenceBlockBB.minZ ||
      bot.entity.position.z === referenceBlockBB.maxZ;

    // Move towards the edge while adjusting view and control states
    if (distance > distanceThreshold) {
      bot.lookAt(
        bot.entity.position.offset(viewVector.x, viewVector.y, viewVector.z),
        allowInstantTurn
      );
      bot.setControlState("sneak", true);
      bot.setControlState("back", true);
      return false;
    }

    if (isAtEdge || distance <= distanceThreshold) {
      bot.setControlState("back", false);
      return true;
    }

    return false;
  }

  /**
   * Determines if the bot can sprint and jump to a specific point.
   *
   * @param {Function} simulateUntil - A function that simulates the bot's movement until a specified condition is met.
   * @param {Function} isPointOnPath - A function that determines if a point is on a specified path.
   * @param {Object} bot - The bot object.
   * @return {boolean} Returns true if the bot can sprint and jump to the point, otherwise false.
   */
  function canSprintJump(simulateUntil, isPointOnPath, bot, targetPoint) {
    const reached = (state) => {
      if (!state) return false;
      const distance = targetPoint.distanceTo(state.pos);

      return distance <= 1 && state.onGround;
    };

    const returnState = simulateUntil(
      bot,
      reached,
      20,
      { jump: true, sprint: true, forward: true },
      true,
      false
    );

    if (!returnState) return false; // Never landed on the ground

    if (returnState.isInLava) return false;

    return targetPoint.distanceTo(returnState.pos) < 1;
  }

  function canWalkJump(simulateUntil, isPointOnPath, bot, targetPoint) {
    const reached = (state) => {
      if (!state) return false;
      const distance = targetPoint.distanceTo(state.pos);

      return distance <= 2 && state.onGround;
    };

    const isStateGood = (state) => {
      if (!state) return false;
      const jumpDistance = bot.entity.position.distanceTo(state.pos);

      const fallDistance = Math.abs(bot.entity.position.y - state.pos.y);

      if (jumpDistance < 0.8 || fallDistance > 2) return false;

      const isOnPath = isPointOnPath(state.pos, bot.ashfinder.path, {
        max: 1,
        onGround: true,
      });

      if (!isOnPath) return false;

      return true;
    };

    const returnState = simulateUntil(
      bot,
      reached,
      20,
      { jump: true, sprint: false, forward: true },
      true,
      false
    );

    const returnStateWithoutJump = simulateUntil(
      bot,
      reached,
      20,
      { jump: false, sprint: true, forward: true },
      true,
      false
    );

    if (!returnState) return false; // never landed on ground

    if (returnState.isInLava) return false;

    if (!reached(returnState)) return false;

    // if it can do just as good just from sprinting, then theres no point in jumping
    if (reached(returnStateWithoutJump)) return false;

    return true;
  }

  async function straightPathTick() {
    if (!straightPathOptions) return false;
    // console.clear()
    // console.log(straightPathOptions)
    // console.log(
    //   straightPathOptions.verticalPlaceTarget !== null
    //     ? `taget: ${straightPathOptions.verticalPlaceTarget}`
    //     : null
    // );
    /**
     * @type {Cell}
     */
    let cell = straightPathOptions.target;
    let point = cell.worldPos;
    const p = bot.entity.position;

    let dx = point.x - p.x;
    const dy = point.y - p.y;
    let dz = point.z - p.z;

    if (!headLocked && !placing) {
      bot.look(Math.atan2(-dx, -dz), 0);
    }

    if (!placing && !digging && !climbing) {
      bot.setControlState("forward", true);
    } else bot.setControlState("forward", false);

    if (!walkingUntillGround) {
      bot.setControlState("sprint", true);
    } else bot.setControlState("sprint", false);

    bot.setControlState("jump", false);

    if (!isPlayerOnBlock(bot.entity.position, point, true)) {
      // Emit particle effect at the current point
      bot.chat(
        `/particle dust 0 1 0.93 1 ${point.x} ${point.y} ${point.z} 0.1 0.1 0.1 1 5 force`
      );

      if (straightPathOptions.breakTargets.length > 0) {
        const targets = straightPathOptions.breakTargets;
        // console.log("Break targets:", targets)
        for (const target of targets) {
          bot.chat(
            `/particle dust 1 0 0.93 1 ${target.x} ${target.y} ${target.z} 0.1 0.1 0.1 1 5 force`
          );
          const block = bot.blockAt(target, false);

          if (block && block.boundingBox === "block" && !digging) {
            digging = true;
            bot.clearControlStates();
            await autoTool(bot, block);

            await bot.dig(block, true).then(() => {
              digging = false;
            });
          }
        }
      }
      const blockPlace = bot.inventory
        .items()
        .find((item) =>
          bot.ashfinder.config.disposableBlocks.includes(item.name)
        );


      if (straightPathOptions.horizontalPlaceTarget && !placing) {
        const horizontalPlaceTarget = straightPathOptions.horizontalPlaceTarget;
        const placeTarget = bot.blockAt(horizontalPlaceTarget, false);

        if (!blockPlace) return false;

        if (bot.heldItem && !bot.heldItem.name.includes(blockPlace.name))
          bot.equip(blockPlace, "hand");
        // sneak to edge of block
        placing = true;
        if (
          moveToEdge(
            new Vec3(
              horizontalPlaceTarget.x,
              horizontalPlaceTarget.y,
              horizontalPlaceTarget.z
            ),
            new Vec3(
              horizontalPlaceTarget.dir.x,
              0,
              horizontalPlaceTarget.dir.z
            )
          )
        ) {
          await placeBlock(
            bot,
            placeTarget,
            new Vec3(
              horizontalPlaceTarget.dir.x,
              0,
              horizontalPlaceTarget.dir.z
            ),
            {
              forceLook: "ignore",
              showHand: true,
              swingArm: "right",
            }
          );
          placing = false;
          bot.setControlState("sneak", false);
        } else return;

        // return true;
      }

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

      const shouldSprintJump = canSprintJump(
        simulateUntil,
        isPointOnPath,
        bot,
        point
      );
      const shouldWalkJump = canWalkJump(
        simulateUntil,
        isPointOnPath,
        bot,
        point
      );

      // ladders
      let ladderBlock = await bot.world.getBlock(point);

      if (!placing && !digging) {
        if (
          (ladderBlock && ladderBlock.name === "ladder") ||
          bot.entity.isOnLadder
        ) {
          const yDist = Math.abs(
            bot.entity.position.y - ladderBlock.position.y
          );

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
          // in water
          bot.setControlState("jump", true);
        } else if (bot.entity.onGround && shouldAutoJump(bot)) {
          walkingUntillGround = true;
          bot.setControlState("sprint", false);
          bot.setControlState("jump", true);
        } else if (bot.entity.onGround && shouldWalkJump) {
          console.log("walk jumped");
          walkingUntillGround = true;
          headLocked = true;
          bot.setControlState("sprint", false);
          bot.setControlState("jump", true);
        } else if (bot.entity.onGround && shouldSprintJump) {
          console.log("sprint jumped!");
          headLocked = true;
          bot.setControlState("sprint", true);
          bot.setControlState("jump", true);
        } else {
          if (bot.entity.onGround) {
            walkingUntillGround = false;
            climbing = false;
          }
          headLocked = false;

          if (ladderBlock && ladderBlock.name !== "ladder") climbing = false;
          bot.setControlState("jump", false);
        }
      }
    } else {
      if (placing) {
        const blockPlace = bot.inventory
          .items()
          .find((item) =>
            bot.ashfinder.config.disposableBlocks.includes(item.name)
          );

        if (bot.heldItem && !bot.heldItem.name.includes(blockPlace.name)) {
          bot.equip(blockPlace, "hand");
        } else if (!bot.heldItem) {
          bot.equip(blockPlace, "hand");
        }
        const horizontalPlaceTarget = straightPathOptions.horizontalPlaceTarget;
        const placeTarget = bot.blockAt(horizontalPlaceTarget, false);

        try {
          await placeBlock(
            bot,
            placeTarget,
            new Vec3(
              horizontalPlaceTarget.dir.x,
              0,
              horizontalPlaceTarget.dir.z
            ),
            {
              forceLook: "ignore",
              showHand: true,
              swingArm: "right",
            }
          );
        } catch (error) {
          console.log(error);
        }
        placing = false;
        bot.setControlState("sneak", false);
        return true;
      }

      bot.setControlState("jump", false);
      bot.setControlState("forward", false);
      bot.setControlState("back", false);
      if (straightPathOptions) straightPathOptions.resolve();

      straightPathOptions = null;
      headLocked = false;
      walkingUntillGround = false;
      climbing = false;
      placing = false;
      return true;
    }

    return false;
  }

  function straightPath({
    target,
    horizontalPlaceTarget,
    skip,
    breakTargets,
    verticalPlaceTarget,
  }) {
    straightPathOptions = {
      target,
      horizontalPlaceTarget: horizontalPlaceTarget ?? null,
      verticalPlaceTarget: verticalPlaceTarget ?? null,
      skip: skip ?? true,
      breakTargets: breakTargets ?? [],
    };
    return new Promise((resolve, reject) => {
      if (straightPathOptions) straightPathOptions.resolve = resolve;
      else resolve();
    });
  }

  async function path(pathPosition, options = {}) {
    console.log("called");
    let position = pathPosition.clone();
    let pathNumber = ++currentPathNumber;
    complexPathTarget = position.clone();
    calculating = true;
    continuousPath = true;
    const start = bot.entity.position.clone();

    console.time("astar");
    const result = await astar(
      start,
      position,
      bot,
      isPlayerOnBlock,
      bot.ashfinder.config
    );
    console.timeEnd("astar");

    console.log("Cost:", result.cost);

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

    while (complexPathPoints.length > 0) {
      const movement = complexPathPoints[0];
      // Array of blocks to place horizontally to reach this movement/node
      const cellPlacableHori = movement.horizontalPlacable;
      const cellBreak = movement.breakableNeighbors;
      const cellPlacableVerti = movement.verticalPlacable;
      let horizontalPlaceTarget = null;
      let verticalPlaceTarget = null;
      let breakTargets = [];

      if (cellBreak.length > 0) {
        for (const array of breakBlocks) {
          if (arraysMatch(array, cellBreak)) {
            breakTargets = breakBlocks.shift();
            break;
          }
        }
      }

      if (cellPlacableHori.length > 0) {
        for (const array of horizontal) {
          // Check if the array in horizontal matches movement.horizontalPlacable
          if (arraysMatch(array, cellPlacableHori)) {
            horizontalPlaceTarget = array.shift();
            break;
          }
        }
      }

      if (cellPlacableVerti.length > 0) {
        for (const array of vertical) {
          // Check if the array in horizontal matches movement.horizontalPlacable
          if (arraysMatch(array, cellPlacableVerti)) {
            verticalPlaceTarget = array.shift();
            console.log("adding vertical placements", verticalPlaceTarget);
            break;
          }
        }
      }

      await straightPath({
        target: movement,
        horizontalPlaceTarget: horizontalPlaceTarget,
        verticalPlaceTarget: verticalPlaceTarget,
        breakTargets: breakTargets,
      });
      if (
        currentCalculatedPathNumber > pathNumber ||
        complexPathPoints === null
      )
        return;
      complexPathPoints.shift();
    }

    if (result.status == "timeout") {
      // if it times out, recalculate once we reach the end
      complexPathPoints = null;
      bot.baritone.path = [];
      bot.clearControlStates();
      return await path(pathPosition, (options = {}));
    }

    complexPathPoints = null;
    bot.clearControlStates();
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

    complexPathPoints = null;
    straightPathOptions = null;
    bot.clearControlStates();
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
}

module.exports = inject;
