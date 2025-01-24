const requireDir = require("require-dir");
const { Vec3 } = require("vec3");
const nbt = require("prismarine-nbt");

const cardinalDirections = [
  { x: 0, z: -1 }, // north
  { x: 0, z: 1 }, // south
  { x: -1, z: 0 }, // west
  { x: 1, z: 0 }, // east
  // { x: 1, z: -1 },
  // { x: 1, z: 1 },
  // { x: -1, z: -1 },
  // { x: -1, z: 1 },
];

class DirectionalVec3 extends Vec3 {
  constructor(x, y, z, direction, attributes = {}) {
    super(x, y, z);
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

  clone() {
    return new DirectionalVec3(
      this.x,
      this.y,
      this.z,
      this.dir,
      this.attributes
    );
  }
}

const climbableBlocks = ["ladder", "vines"];
const unbreakableBlocks = [
  "bedrock",
  "barrier",
  "command_block",
  "end_portal_frame",
];

class Move {
  setValues(world, origin, dir, bot, config) {
    this.world = world;
    this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, dir);
    this.dir = dir;
    this.bot = bot;
    this.config = config;
    this.COST_BREAK = 5;
    this.COST_NORMAL = 1;
    this.COST_DIAGONAL = Math.SQRT2;
    this.COST_UP = 1;
    this.COST_PLACE = 5;
    this.COST_PARKOUR = 3;
    this.COST_FALL = 1.2;
    this.COST_SWIM = 2.02;
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

  isStair(node) {
    const block = this.world.getBlock(node);
    if (!block) return false;
    return block.name.includes("stairs");
  }

  isSlab(node) {
    const block = this.world.getBlock(node);
    if (!block) return false;
    return block.name.includes("slab");
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
      !this.isStair(node) &&
      block.boundingBox === "empty" &&
      blockAbove.boundingBox === "empty" &&
      block.name !== "water" &&
      !this.config.blocksToStayAway.includes(block.name)
    );
  }

  isBreakble(node, config) {
    const block = this.world.getBlock(node);
    if (!block) return false;
    return (
      this.isSolid(node) &&
      !unbreakableBlocks.includes(block.name) &&
      !climbableBlocks.includes(block.name) &&
      !config.blocksToAvoid.includes(block.name) &&
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

  getStandingBlock() {
    const position = this.bot.entity.position.offset(0, -1, 0);
    const block = this.world.getBlock(position);

    if (!block) return null;

    return block;
  }

  getStandingNode() {
    const block = this.getStandingBlock();

    if (!block) return null;

    const { x, y, z } = block.position;

    let node = new DirectionalVec3(x, y, z, cardinalDirections[2]);

    return node;
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
    return (
      this.isSolid(node.offset(0, -1, 0)) &&
      this.isWalkable(node) &&
      !this.isFence(node.offset(0, -1, 0)) &&
      !this.config.blocksToAvoid.includes(this.getBlock(node).name) &&
      this.isFullBlock(node.offset(0, -1, 0))
    );
  }

  isFullBlock(node) {
    const block = this.getBlock(node);

    if (!block) return false;

    const shapes = block.shapes;
    const firstShapeArray = shapes[0];

    if (!firstShapeArray) return false;

    const maxY = firstShapeArray[4];

    if (maxY === 1) return true;
  }

  isHalfBlock(node) {
    const block = this.getBlock(node);

    if (!block) return false;

    const shapes = block.shapes;
    const firstShapeArray = shapes[0];

    if (!firstShapeArray) return false;

    const maxY = firstShapeArray[4];

    if (maxY === 0.5) return true;
  }

  isFence(node) {
    const block = this.getBlock(node);

    if (!block) return false;

    if (block.name.includes("fence") && block.name.includes("wall"))
      return true;
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

  /**
   *
   * @param {number} amount
   * @param {DirectionalVec3} node
   * @param {object} attributes
   * @returns {DirectionalVec3}
   */
  forward(amount = 1, node = null, attributes) {
    if (!node) node = this.origin;
    return node.forward(amount, attributes);
  }
  /**
   *
   * @param {number} amount
   * @param {DirectionalVec3} node
   * @param {object} attributes
   * @returns {DirectionalVec3}
   */
  right(amount = 1, node = null, attributes) {
    if (!node) node = this.origin;
    let offset = node.right(amount, attributes);
    return offset;
  }
  /**
   *
   * @param {number} amount
   * @param {DirectionalVec3} node
   * @param {object} attributes
   * @returns {DirectionalVec3}
   */
  left(amount = 1, node = null, attributes) {
    if (!node) node = this.origin;
    return node.left(amount, attributes);
  }
  /**
   *
   * @param {number} amount
   * @param {DirectionalVec3} node
   * @param {object} attributes
   * @returns {DirectionalVec3}
   */
  up(amount = 1, node = null, attributes) {
    if (!node) node = this.origin;
    return node.up(amount, attributes);
  }
  /**
   *
   * @param {number} amount
   * @param {DirectionalVec3} node
   * @param {object} attributes
   * @returns {DirectionalVec3}
   */
  down(amount = 1, node = null, attributes) {
    if (!node) node = this.origin;
    return node.down(amount, attributes);
  }

  /**
   *
   * @param {number} dx
   * @param {number} dy
   * @param {number} dz
   * @param {DirectionalVec3} [node=null]
   * @returns {DirectionalVec3}
   */
  offset(dx, dy, dz, node = null) {
    if (!node) node = this.origin;
    return node.offset(dx, dy, dz);
  }
}

/**
 * @type {Array<Move>}
 */
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

  for (const move of moveClasses) {
    for (const dir of cardinalDirections) {
      move.setValues(world, node.worldPos, dir, bot, config);
      move.addNeighbors(neighbors, config, manager);
    }
  }

  neighbors = neighbors.filter(
    (neighbor, index, self) =>
      index === self.findIndex((n) => n.equals(neighbor))
  );

  return {
    neighbors,
  };
}

function getXZDist(nodeA, nodeB) {
  const xDist = Math.abs(nodeB.x - nodeA.x);
  const zDist = Math.abs(nodeB.z - nodeA.z);

  return Math.sqrt(xDist * xDist + zDist * zDist);
}

module.exports = { getNeighbors2, Move, registerMoves, DirectionalVec3 };

requireDir("./");
