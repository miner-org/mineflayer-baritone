const { Vec3 } = require("vec3");
const { PlayerState } = require("prismarine-physics");
const nbt = require("prismarine-nbt");
const mcData = require("minecraft-data")("1.18.2");
const {
  EntityState,
  // BaseSimulator,
  EPhysicsCtx,
  // BotcraftPhysics,
} = require("@nxg-org/mineflayer-physics-util");

/**
 * @param {Vec3} pos
 * @param {Vec3} a
 * @param {Vec3} b
 */
function vectorProjection(pos, a, b) {
  let v1 = a.subtract(pos);
  let v2 = b.subtract(pos);
  v2.normalize();

  if (!v1 || !v2) {
    return null; // Check for null or invalid vectors
  }

  let sp = v1.dot(v2);
  if (sp < 0) {
    return null;
  }

  return pos.add(v2.multiply(sp));
}

function shouldAutoJump(bot) {
  // checks if there's a block in front of the bot
  const scaledVelocity = bot.entity.velocity.scaled(10).floored();
  let velocity = scaledVelocity.min(new Vec3(1, 0, 1)).max(new Vec3(-1, 0, -1));
  let blockInFrontPos = bot.entity.position.offset(0, 1, 0).plus(velocity);
  let blockInFront = bot.blockAt(blockInFrontPos, false);
  if (blockInFront === null) return;

  if (blockInFront.boundingBox !== "block") {
    // x
    velocity = scaledVelocity.min(new Vec3(1, 0, 0)).max(new Vec3(-1, 0, 0));
    blockInFrontPos = bot.entity.position.offset(0, 1, 0).plus(velocity);
    blockInFront = bot.blockAt(blockInFrontPos, false);
  }
  if (blockInFront.boundingBox !== "block") {
    // z
    velocity = scaledVelocity.min(new Vec3(0, 0, 1)).max(new Vec3(0, 0, -1));
    blockInFrontPos = bot.entity.position.offset(0, 1, 0).plus(velocity);
    blockInFront = bot.blockAt(blockInFrontPos, false);
  }
  let blockInFront1 = bot.blockAt(blockInFrontPos.offset(0, 1, 0), false);
  let blockInFront2 = bot.blockAt(blockInFrontPos.offset(0, 2, 0), false);

  // if it's moving slowly and its touching a block, it should probably jump
  const { x: velX, y: velY, z: velZ } = bot.entity.velocity;
  // console.log(Math.abs(velX) + Math.abs(velZ));
  if (
    bot.entity.isCollidedHorizontally &&
    Math.abs(velX) + Math.abs(velZ) < 0.01 &&
    Math.abs(velY) < 0.1
  ) {
    return true;
  }
  return (
    blockInFront.boundingBox === "block" &&
    blockInFront1.boundingBox === "empty" &&
    blockInFront2.boundingBox === "empty"
  );
}

function getControlState(bot) {
  return {
    forward: bot.controlState.forward,
    back: bot.controlState.back,
    left: bot.controlState.left,
    right: bot.controlState.right,
    jump: bot.controlState.jump,
    sprint: bot.controlState.sprint,
    sneak: bot.controlState.sneak,
  };
}

/**
 *
 * @param {import("mineflayer").Bot} bot
 * @param {Function} satisfyFunction
 * @param {Function} controller
 * @param {number} ticks
 * @param {PlayerState} state
 */
function simulateUntil(
  bot,
  satisfyFunction,
  controller = null,
  ticks = 1,
  state = null
) {
  // const physics = new BotcraftPhysics(bot.registry);
  // let ctx = EPhysicsCtx.FROM_BOT(bot.physicsEngine, bot, bot.physicsSettings);

  if (!state) {
    const controls = getControlState(bot);

    state = new PlayerState(bot, controls);
  }

  // console.log("problem is here");
  // console.log(bot);

  // console.log(state)

  for (let i = 0; i < ticks; i++) {
    if (controller !== null) controller(state, i);

    // console.log("before", state.pos);
    // state = bot.physicsEngine.simulate(ctx, bot.world);
    // console.log("after", state.pos);
    // console.log(state.control);

    bot.physics.simulatePlayer(state, bot.world);

    if (state.isInLava) return state;

    if (satisfyFunction(state)) return state;
  }

  return state;
}
// function simulateUntil(bot, satisfyFunction, controller = null, ticks = 1) {
//   // const physics = new BotcraftPhysics(bot.registry);
//   let ctx = EPhysicsCtx.FROM_BOT(bot.physicsEngine, bot, bot.physicsSettings);
//   let state = ctx.state;

//   // console.log("problem is here");
//   // console.log(bot);

//   // console.log(state)

//   if (controller !== null) controller(state, 1);

//   for (let i = 0; i < ticks; i++) {
//     if (controller !== null) controller(state, i);

//     // console.log("before", state.pos);
//     bot.physicsEngine.simulate(ctx, bot.world);
//     state = ctx.state;
//     // console.log("after", state.pos);
//     // console.log(state.control);

//     if (state.isInLava) return state;

//     if (satisfyFunction(state)) return state;
//   }

//   return state;
// }

function getController(nextPoint, jump, sprint, jumpAfter = 0) {
  /**
   * @param {EntityState} state
   */
  return (state, tick) => {
    // console.log(state)
    const dx = nextPoint.x - state.pos.x;
    const dz = nextPoint.z - state.pos.z;
    state.yaw = Math.atan2(-dx, -dz);

    state.control.forward = true;
    state.control.jump = jump && tick >= jumpAfter;
    state.control.sprint = sprint;
  };
}

function smoothPath(path, numInterpolations) {
  const smoothedPath = [];

  for (let i = 0; i < path.length - 1; i++) {
    smoothedPath.push(path[i]); // Add the original point to the smoothed path
    for (let j = 1; j < numInterpolations; j++) {
      const t = j / numInterpolations;
      const x = lerp(path[i].x, path[i + 1].x, t);
      const y = lerp(path[i].y, path[i + 1].y, t);
      const z = lerp(path[i].z, path[i + 1].z, t);
      smoothedPath.push(new Vec3(x, y, z)); // Add interpolated points
    }
  }

  smoothedPath.push(path[path.length - 1]); // Add the last point

  return smoothedPath;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function linearInterpolation(p0, p1, t) {
  return p0.clone().add(p1.clone().subtract(p0).scale(t));
}

function completePath(path, numPoints) {
  if (path.length < 2) {
    return path;
  }

  const completedPath = [path[0]];

  for (let i = 0; i < path.length - 1; i++) {
    const p0 = path[i];
    const p1 = path[i + 1];

    for (let j = 1; j < numPoints; j++) {
      const t = j / numPoints;
      const interpolatedPoint = linearInterpolation(p0, p1, t);
      completedPath.push(interpolatedPoint);
    }

    completedPath.push(p1);
  }

  return completedPath;
}

function calculateTurnAngle(bot, nextPoint) {
  const currentDirection = bot.entity.yaw;

  // Calculate the angle to the next point
  const deltaX = nextPoint.x - bot.entity.position.x;
  const deltaZ = nextPoint.z - bot.entity.position.z;
  const angleToNextPoint = Math.atan2(deltaZ, deltaX);

  // Calculate the turn angle to align with the next point
  let turnAngle = angleToNextPoint - currentDirection;

  // Ensure the turn angle is within a reasonable range (-pi to pi)
  if (turnAngle < -Math.PI) {
    turnAngle += 2 * Math.PI;
  } else if (turnAngle > Math.PI) {
    turnAngle -= 2 * Math.PI;
  }

  return turnAngle;
}

/**
 *
 * @param {import("mineflayer").Bot} bot
 * @param {string} blockName
 * @param {Vec3} targetPosition
 * @param {{half?: "top" | "bottom", axis?: "x" | "y" | "z"}} properties
 * @returns
 */
async function placeBlock(bot, blockName, targetPosition, properties) {
  return new Promise(async (resolve, reject) => {
    const item = bot.inventory.items().find((i) => i.name === blockName);
    if (!item) {
      return reject(`Bot does not have ${blockName}!`);
    }

    const blockBelow = bot.blockAt(targetPosition.offset(0, -1, 0));
    if (!blockBelow || !blockBelow.boundingBox === "block") {
      return reject("Cannot place block: No solid surface below!");
    }

    await bot.equip(item, "hand");

    // Find a valid placement face
    const faces = [
      { face: 1, offset: new Vec3(0, 1, 0) }, // Top
      { face: 0, offset: new Vec3(0, -1, 0) }, // Bottom
      { face: 3, offset: new Vec3(0, 0, 1) }, // North
      { face: 2, offset: new Vec3(0, 0, -1) }, // South
      { face: 5, offset: new Vec3(1, 0, 0) }, // East
      { face: 4, offset: new Vec3(-1, 0, 0) }, // West
    ];

    let placeFace = faces.find((face) =>
      bot.blockAt(targetPosition.plus(face.offset))
    );
    if (!placeFace) {
      return reject("❌ No valid placement face found!");
    }

    // Look at the block before placing
    await bot.lookAt(targetPosition.offset(0.5, 0.5, 0.5), true);

    bot.swingArm("right");

    // Send the block place packet
    bot._client.write("block_place", {
      location: targetPosition,
      direction: 0,
      hand: 0, // Main hand
      cursorX: 0.5,
      cursorY: 0.5,
      cursorZ: 0.5,
    });

    resolve(`Placed ${blockName} at ${targetPosition}`);
  });
}

function bestHarvestTool(bot, block) {
  const availableTools = bot.inventory.items();
  const effects = bot.entity.effects;

  let fastest = Number.MAX_VALUE;
  let bestTool = null;
  for (const tool of availableTools) {
    const enchants =
      tool && tool.nbt ? nbt.simplify(tool.nbt).Enchantments : [];
    const digTime = block.digTime(
      tool ? tool.type : null,
      false,
      false,
      false,
      enchants,
      effects
    );
    if (digTime < fastest) {
      fastest = digTime;
      bestTool = tool;
    }
  }

  return bestTool;
}

/**
 * @description Automatically equips the best tool for that bot
 * @param {import("mineflayer").Bot} bot
 * @param {import("prismarine-block").Block} block
 */
async function autoTool(bot, block) {
  if (!block) return;

  const bestTool = bestHarvestTool(bot, block);

  if (!bestTool) return;

  const toolInInventory = await getItem(bot, bestTool.name);

  if (!toolInInventory) return;

  await bot.equip(bestTool);
}

/**
 *
 * @param {import("mineflayer").Bot} bot
 * @param {string} item
 */
async function getItem(bot, item) {
  const itemInRegistry = mcData.itemsByName[item];

  if (!itemInRegistry) return;

  const ItemInInventory = bot.inventory
    .items()
    .find((iteme) => iteme.name === itemInRegistry.name);

  if (!ItemInInventory) return null;

  return ItemInInventory;
}

function calculateManhattanDistance(point1, point2) {
  return (
    Math.abs(point1.x - point2.x) +
    Math.abs(point1.y - point2.y) +
    Math.abs(point1.z - point2.z)
  );
}

function calculateEuclideanDistance(point1, point2) {
  return Math.sqrt(
    Math.pow(point1.x - point2.x, 2) +
      Math.pow(point1.y - point2.y, 2) +
      Math.pow(point1.z - point2.z, 2)
  );
}

// Generate weights for combined heuristic function
function generateWeights() {
  const weights = [];

  // Generate weights from 0 to 1 in increments of 0.1
  for (let weight = 0; weight <= 1; weight += 0.1) {
    weights.push({
      weight: weight.toFixed(1),
      euclideanWeight: weight.toFixed(1),
      manhattanWeight: (1 - weight).toFixed(1),
    });
  }

  return weights;
}

function distanceFromLine(lineStart, lineEnd, point) {
  let A = lineStart.distanceTo(point);
  let B = lineEnd.distanceTo(point);
  let C = lineStart.distanceTo(lineEnd);

  if (B * B > A * A + C * C) return A;
  else if (A * A > B * B + C * C) return B;
  else {
    s = (A + B + C) / 2;
    return (2 / C) * Math.sqrt(s * (s - A) * (s - B) * (s - C));
  }
}

module.exports = {
  vectorProjection,
  shouldAutoJump,
  smoothPath,
  completePath,
  calculateTurnAngle,
  placeBlock,
  bestHarvestTool,
  getItem,
  autoTool,
  simulateUntil,
  getController,
  distanceFromLine,
};
