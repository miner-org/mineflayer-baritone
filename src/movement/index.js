const requireDir = require("require-dir");
const { Vec3 } = require("vec3");
const nbt = require("prismarine-nbt");

const cardinalDirections = [
  { x: -1, z: 0 }, // north
  { x: 1, z: 0 }, // south
  { x: 0, z: -1 }, // east
  { x: 0, z: 1 }, // west
];

function hash(node) {
  return `${node.x}-${node.y}-${node.z}`;
}

class DirectionalVec3 extends Vec3 {
  constructor(x, y, z, direction, attributes) {
    super();
    this.x = x;
    this.y = y;
    this.z = z;
    this.dir = direction;
    this.attributes = attributes;
    this.blocks = [];
  }

  forward(amount = 1, attributes = {}) {
    return new DirectionalVec3(
      this.x + this.dir.x * amount,
      this.y,
      this.z + this.dir.z * amount,
      this.dir,
      attributes
    );
  }

  right(amount = 1, attributes = {}) {
    return new DirectionalVec3(
      this.x - this.dir.z * amount,
      this.y,
      this.z + this.dir.x * amount,
      this.dir,
      attributes
    );
  }

  left(amount = 1, attributes = {}) {
    return new DirectionalVec3(
      this.x + this.dir.z * amount,
      this.y,
      this.z - this.dir.x * amount,
      this.dir,
      attributes
    );
  }

  up(amount = 1, attributes = {}) {
    return new DirectionalVec3(
      this.x,
      this.y + amount,
      this.z,
      this.dir,
      attributes
    );
  }

  down(amount = 1, attributes = {}) {
    return new DirectionalVec3(
      this.x,
      this.y - amount,
      this.z,
      this.dir,
      attributes
    );
  }

  offset(dx, dy, dz, attributes = {}) {
    return new DirectionalVec3(
      this.x + dx,
      this.y + dy,
      this.z + dz,
      this.dir,
      attributes
    );
  }
}

const climbableBlocks = ["ladder", "vines"];
const interactableBlocks = [
  "oak_door",
  "spruce_door",
  "birch_door",
  "jungle_door",
  "acaica_door",
  "dark_oak_door",
  "mangrove_door",
  "warped_door",
  "crimson_door",
];
const unbreakableBlocks = [
  "bedrock",
  "barrier",
  "command_block",
  "end_portal_frame",
];

class Move {
  setValues(world, origin, dir, bot) {
    this.world = world;
    this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, dir);
    this.dir = dir;
    this.bot = bot;
    this.COST_BREAK = 5;
    this.COST_NORMAL = 1;
    this.COST_DIAGONAL = 1.4;
    this.COST_UP = 1.5;
    this.COST_PLACE = 5;
  }

  makeMovement(position, cost) {
    position.cost = cost;
    return position;
  }

  makeBreakable(position, costToBreak) {
    position.break = true;
    position.cost = costToBreak;
    // console.log(position);
    return position;
  }

  makeHorizontalPlace(position, costToPlace) {
    position.placeHorizontal = true;
    position.cost = costToPlace;
    return position;
  }

  makeVerticalPlace(position, costToPlace) {
    position.placeVertical = true;
    position.cost = costToPlace;
    return position;
  }

  isNearBaddie(node, config, range) {
    const baddies = config.blocksToStayAway;

    const block = this.world.getBlock(node);

    if (!block) return false;

    const nearestBaddie = this.bot.findBlock({
      matching: (block) => baddies.includes(block.name),
      maxDistance: range,
      point: node,
    });

    // we arent near a baddie so we good
    if (!nearestBaddie) return false;

    return true;
  }

  isAir(node) {
    const block = this.world.getBlock(node);
    if (!block) return false;
    return block.boundingBox === "empty" && block.name !== "water";
  }

  isWater(node) {
    const block = this.world.getBlock(node);
    if (!block) return false;
    return block.name === "water";
  }

  isWalkable(node) {
    const block = this.world.getBlock(node);
    if (!block) return false;
    const blockAbove = this.world.getBlock(node.offset(0, 1, 0));
    return (
      block.boundingBox === "empty" &&
      blockAbove.boundingBox === "empty" &&
      block.name !== "water"
    );
  }

  isBreakble(node, config) {
    const block = this.world.getBlock(node);
    if (!block) return false;
    return (
      this.isSolid(node) &&
      !unbreakableBlocks.includes(block.name) &&
      !climbableBlocks.includes(block.name) &&
      !this.isInteractable(node, config)
    );
  }

  getNodeDigTime(node) {
    const block = this.world.getBlock(node);

    if (!block) return -1;

    const tool = bestHarvestTool(this.bot, block);
    const enchants =
      tool && tool.nbt ? nbt.simplify(tool.nbt).Enchantments : [];
    const effects = this.bot.entity.effects;
    const digTime = block.digTime(
      tool ? tool.type : null,
      false,
      false,
      false,
      enchants,
      effects
    );

    return 1 + digTime / 1000;
  }

  isJumpable(node) {
    return (
      this.isAir(node) &&
      this.isAir(node.offset(0, 1, 0)) &&
      this.isAir(node.offset(0, 2, 0))
    );
  }

  isWaterLogged(node) {
    const block = this.world.getBlock(node);
    if (!block) return false;
    return block.getProperties()?.waterlogged;
  }

  getBlock(node) {
    const block = this.world.getBlock(node);
    return block;
  }

  isSolid(node) {
    const block = this.getBlock(node);
    if (!block) return false;
    return block.boundingBox === "block";
  }

  isStandable(node) {
    return this.isSolid(node.offset(0, -1, 0)) && this.isWalkable(node);
  }

  isClimbable(node) {
    const block = this.getBlock(node);
    if (!block) return false;
    return climbableBlocks.includes(block.name);
  }

  isInteractable(node, config) {
    const block = this.getBlock(node);
    if (!block) return false;
    return config.interactableBlocks.includes(block.name);
  }

  forward(amount = 1, node = null, attributes) {
    if (!node) node = this.origin;
    return node.offset(this.dir.x * amount, 0, this.dir.z * amount, attributes);
  }

  right(amount = 1, node = null, attributes) {
    if (!node) node = this.origin;
    let offset = node.offset(
      this.dir.z * -amount,
      0,
      this.dir.x * amount,
      attributes
    );
    return offset;
  }

  left(amount = 1, node = null, attributes) {
    if (!node) node = this.origin;
    return node.offset(
      this.dir.z * amount,
      0,
      this.dir.x * -amount,
      attributes
    );
  }

  up(amount = 1, node = null, attributes) {
    if (!node) node = this.origin;
    return node.offset(0, amount, 0, attributes);
  }

  down(amount = 1, node = null, attributes) {
    if (!node) node = this.origin;
    return node.offset(0, -amount, 0, attributes);
  }
}

const moveClasses = [];

function registerMoves(moves) {
  for (const moveClass of moves) {
    moveClasses.push(new moveClass());
  }
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

function getNeighbors2(world, node, config, manager, bot) {
  let neighbors = [];
  let breakNeighbors = [];
  let verticalPlacaNeighbors = [];
  let horizontalPlaceNeighbors = [];

  for (const move of moveClasses) {
    for (const dir of cardinalDirections) {
      move.setValues(world, node.worldPos, dir, bot);
      move.addNeighbors(neighbors, config, manager);

      if (move.break) {
        move.addBreakNeighbors(breakNeighbors);
      }

      if (move.placeVertical) {
        move.addPlaceNeighbors(verticalPlacaNeighbors);
      }

      if (move.placeHorizontal) {
        move.addPlaceNeighbors(horizontalPlaceNeighbors);
      }
    }
  }

  return {
    neighbors,
    breakNeighbors,
    verticalPlacaNeighbors,
    horizontalPlaceNeighbors,
  };
}

function getXZDist(nodeA, nodeB) {
  const xDist = Math.abs(nodeB.x - nodeA.x);
  const zDist = Math.abs(nodeB.z - nodeA.z);

  return Math.sqrt(xDist * xDist + zDist * zDist);
}

module.exports = { getNeighbors2, Move, registerMoves };

requireDir("./");
