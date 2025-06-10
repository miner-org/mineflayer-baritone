const requireDir = require("require-dir");
const { Vec3 } = require("vec3");
const nbt = require("prismarine-nbt");

const cardinalDirections = [
  { x: 1, z: 0 },
  { x: -1, z: 0 },
  { x: 0, z: 1 },
  { x: 0, z: -1 },
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

  plus(vec) {
    return new DirectionalVec3(
      this.x + vec.x,
      this.y + vec.y,
      this.z + vec.z,
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

/**
 * @type {Array<Move>}
 */
const moveClasses = [];

class Move {
  constructor() {
    this.name = this.constructor.name;
    this.COST_BREAK = 5;
    this.COST_NORMAL = 1;
    this.COST_DIAGONAL = 1.41;
    this.COST_UP = 1;
    this.COST_PLACE = 3;
    this.COST_PARKOUR = 6;
    this.COST_FALL = 1;
    this.COST_SWIM = 2.2;
    this.COST_SWIM_EXIT = 2;
    this.COST_SWIM_START = 2.4;
    this.COST_CLIMB = 2;
  }

  setValues(world, dir, bot, config, manager) {
    this.world = world;
    this.dir = dir;
    /**
     * @type {import("mineflayer").Bot}
     */
    this.bot = bot;
    this.manager = manager;
    this.config = config;
  }

  hasScaffoldingBlocks() {
    const bot = this.bot;
    const scaffoldingBlocks = this.config.disposableBlocks;

    // check if the bot has atleast one scaffolding block in its inventory
    for (const item of bot.inventory.items()) {
      if (scaffoldingBlocks.includes(item.name)) {
        return true;
      }
    }

    return false;
  }

  // Function to determine an avoidance penalty if near a certain block
  getAvoidancePenalty(node, distance) {
    let penalty = 0;
    for (let dx = -distance; dx <= distance; dx++) {
      for (let dz = -distance; dz <= distance; dz++) {
        for (let dy = -1; dy <= 1; dy++) {
          // Slight vertical check
          let checkNode = node.offset(dx, dy, dz);
          if (this.isBlockToAvoid(checkNode)) {
            penalty += 10; // Increase penalty for closer avoidable blocks
          }
        }
      }
    }
    return penalty;
  }

  // Define which blocks to avoid
  isBlockToAvoid(node) {
    let block = this.getBlock(node);
    return block && this.config.blocksToStayAway.includes(block.name);
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

  makePlace(pos, costToPlace) {
    pos.place = true;
    pos.cost = costToPlace;
    return pos;
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

  makeFlyMovement(position, cost) {
    position.fly = true;
    position.cost = cost;
    return position;
  }

  isStair(node) {
    const block = this.getBlock(node);
    if (!block) return false;
    return block.name.includes("stairs");
  }

  isStairBB(node) {
    const block = this.getBlock(node);

    if (!block) return false;

    const shapes = block.shapes;
    const firstShapeArray = shapes[0];
    const secondShapeArray = shapes[1] ? shapes[1] : null;

    if (!firstShapeArray) return false;

    if (!secondShapeArray) return false;

    const maxY = firstShapeArray[4];
    const maxY2 = secondShapeArray ? secondShapeArray[4] : null;

    if (maxY2 && maxY === 0.5 && maxY2 === 1) return true;
  }

  isSlab(node) {
    const block = this.getBlock(node);
    if (!block) return false;
    return block.name.includes("slab");
  }

  isNearBaddie(node, config, range) {
    const baddies = config.blocksToStayAway;

    const block = this.getBlock(node);

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
    const block = this.getBlock(node);
    if (!block) return false;
    return block.boundingBox === "empty" && block.name !== "water";
  }

  isWater(node) {
    const block = this.getBlock(node);
    if (!block) return false;
    return block.name === "water";
  }

  isLava(node) {
    const block = this.getBlock(node);
    if (!block) return false;
    return block.name === "lava";
  }

  isWalkable(node) {
    const block = this.getBlock(node);
    if (!block) return false;

    const blockAbove = this.getBlock(node.offset(0, 1, 0));

    const walk =
      block.boundingBox === "empty" && blockAbove.boundingBox === "empty";

    return (
      !this.isStair(node) &&
      walk &&
      block.name !== "water" &&
      !this.config.blocksToStayAway.includes(block.name)
    );
  }

  isBreakble(node, config) {
    const block = this.getBlock(node);
    if (!block) return false;

    if (this.manager.isAreaMarkedNode(node)) return false;

    return (
      this.isSolid(node) && !this.config.blocksToAvoid.includes(block.name)
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
    const block = this.bot.blockAt(node);
    return block;
  }

  isSolid(node) {
    const block = this.getBlock(node);
    if (!block) {
      return false;
    }

    return block.boundingBox === "block" || this.manager.isNodePlaced(node);
  }

  isStandable(node) {
    const blockBelow = this.getBlock(node.offset(0, -1, 0));

    if (!blockBelow) return false;

    if (this.config.blocksToAvoid.includes(blockBelow.name)) return false;

    return (
      this.isSolid(node.offset(0, -1, 0)) &&
      this.isWalkable(node) &&
      !this.isFence(node.offset(0, -1, 0)) &&
      this.isFullBlock(node.offset(0, -1, 0)) &&
      !this.isLava(node)
    );
  }

  almostFullBlock(node) {
    const block = this.getBlock(node);

    if (!block) return false;

    const shapes = block.shapes;
    const firstShapeArray = shapes[0];

    if (!firstShapeArray) return false;

    const maxY = firstShapeArray[4];

    if (maxY === 0.9375) return true;
  }

  isFullBlock(node) {
    const block = this.getBlock(node);

    if (!block) return false;

    // if (block.name === "farmland") return true;

    const shapes = block.shapes;
    const firstShapeArray = shapes[0];

    if (!firstShapeArray) return false;

    const maxY = firstShapeArray[4];

    if (maxY === 1) return true;
  }

  isHalfBlock(node) {
    const block = this.getBlock(node);

    if (!block) return false;

    if (this.isStair(node)) return;

    const shapes = block.shapes;
    const firstShapeArray = shapes[0];
    const secondShapeArray = shapes[1] ? shapes[1] : null;

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

function registerMoves(moves) {
  for (const moveClass of moves) {
    moveClasses.push(moveClass);
  }
  // console.log(moveClasses);
}

function getNeighbors2(world, node, config, manager, bot) {
  /**
   * @type {DirectionalVec3[]}
   */
  let neighbors = [];
  for (const move of moveClasses) {
    move.setValues(world, node.worldPos, bot, config, manager);

    const origin = new DirectionalVec3(
      node.worldPos.x,
      node.worldPos.y,
      node.worldPos.z,
      { x: 0, z: 0 }
    );
    move.generate(cardinalDirections, origin, neighbors);
  }

  neighbors = neighbors.filter(
    (neighbor, index, self) =>
      index === self.findIndex((n) => n.equals(neighbor))
  );

  return neighbors;
}

module.exports = { getNeighbors2, Move, registerMoves, DirectionalVec3 };

requireDir("./");
