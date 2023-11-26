const requireDir = require("require-dir");
const { Vec3 } = require("vec3");

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

class NodeManager {
  static markedNodes = new Map();

  static markNode(node, attribute) {
    this.markedNodes.set(hash(node), attribute);
  }

  static unmarkNode(node) {
    this.markedNodes.delete(hash(node));
  }

  static isNodeMarked(node) {
    return this.markedNodes.has(hash(node));
  }

  static getNodeAttribute(node) {
    return this.markedNodes.get(hash(node));
  }

  static dispose() {
    this.markedNodes.clear()
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
  constructor() {}

  markNode(node, attribute) {
    NodeManager.markNode(node, attribute);
  }

  unmarkNode(node) {
    NodeManager.unmarkNode(node);
  }

  isNodeMarked(node) {
    return NodeManager.isNodeMarked(node);
  }

  getNodeAttribute(node) {
    return NodeManager.getNodeAttribute(node);
  }

  setValues(world, origin, dir) {
    this.world = world;
    this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, dir);
    this.dir = dir;
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
    return block.getProperties()?.waterlogged
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

function getNeighbors2(world, node, config) {
  let neighbors = [];
  let breakNeighbors = [];
  let verticalPlacaNeighbors = [];
  let horizontalPlaceNeighbors = [];

  for (const move of moveClasses) {
    for (const dir of cardinalDirections) {
      move.setValues(world, node.worldPos, dir);
      move.addNeighbors(neighbors, config);

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

module.exports = { getNeighbors2, Move, registerMoves, NodeManager };

requireDir("./");
