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
    this.cost = 0;
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

  equals(other) {
    return (
      this.x === other.x &&
      this.y === other.y &&
      this.z === other.z &&
      this.dir.x === other.dir.x &&
      this.dir.z === other.dir.z
    );
  }

  toString() {
    return `(${this.x}, ${this.y}, ${this.z}) dir: (${this.dir.x}, ${this.dir.z})`;
  }

  detailsString() {
    return `(${this.x}, ${this.y}, ${this.z}) dir: (${this.dir.x}, ${this.dir.z}) cost: ${this.cost}`;
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
  constructor(priority = 50) {
    this.name = this.constructor.name;
    this.priority = priority; // Lower number = higher priority

    // Movement costs
    this.COST_NORMAL = 1;
    this.COST_UP = 1;
    this.COST_FALL = 1;
    this.COST_BREAK = 2.5;
    this.COST_PLACE = 2.5;
    this.COST_SWIM = 2.2;
    this.COST_SWIM_START = 2;
    this.COST_SWIM_EXIT = 2;
    this.COST_CLIMB = 1;
    this.COST_LADDER = 2;
    this.COST_PARKOUR = 3.5; // ian
    this.COST_DIAGONAL = 1.41;
  }

  generate(cardinalDirections, origin, neighbors) {
    // To be implemented in subclasses
  }

  setValues(bot, config, manager, node = null) {
    this.bot = bot;
    this.manager = manager;
    this.config = config;
    this.node = node; // keep the Cell (or null).
    this.mcData = require("minecraft-data")(bot.version);
    // do NOT set this.origin = node; that causes confusion
  }

  // === Inventory / Block Checks ===

  hasScaffoldingBlocks() {
    const blocks = this.config.disposableBlocks;
    return this.bot.inventory
      .items()
      .some((item) => blocks.includes(item.name));
  }

  scaffoldingLeft() {
    const blocks = this.config.disposableBlocks;
    return this.bot.inventory
      .items()
      .reduce(
        (sum, item) => sum + (blocks.includes(item.name) ? item.count : 0),
        0
      );
  }

  getBlock(pos) {
    const key = pos.toString();

    // Virtual overlay
    if (this.node?.virtualBlocks?.has(key)) {
      const state = this.node.virtualBlocks.get(key);
      if (state === "air") return this.mcData.blocksByName["air"];
      if (state === "placed") return this.mcData.blocksByName["stone"]; // disposable
    }

    return this.bot.blockAt(pos);
  }

  // === Core Node Checks ===

  isAir(node) {
    const block = this.getBlock(node);
    if (!block) return false;
    return block.boundingBox === "empty" && block.name !== "water";
  }

  isSolid(node) {
    const block = this.getBlock(node);
    if (!block) return false;
    return block.boundingBox === "block" && !block.name.includes("torch");
  }

  isWalkable(node) {
    const block = this.getBlock(node);
    if (!block) return false;
    const above = this.getBlock(node.offset(0, 1, 0));
    return (
      block.boundingBox === "empty" &&
      above.boundingBox === "empty" &&
      block.name !== "water" &&
      !this.config.blocksToStayAway.includes(block.name) &&
      !this.isStair(node)
    );
  }

  isStandable(node) {
    const below = node.down(1);

    // Overlay wins over world
    if (this.node?.virtualBlocks?.get(below.toString()) === "air") return false;

    const blockBelow = this.getBlock(below);
    if (!blockBelow || blockBelow.name === "air") return false;

    if (this.config.blocksToAvoid.includes(blockBelow.name)) return false;
    return (
      this.isSolid(below) &&
      this.isFullBlock(below) &&
      this.isWalkable(node) &&
      !this.isLava(node)
    );
  }

  isJumpable(node) {
    const block = this.getBlock(node);
    if (!block) return false;
    const above = this.getBlock(node.offset(0, 1, 0));
    const above2 = this.getBlock(node.offset(0, 2, 0));
    return (
      block.boundingBox === "empty" &&
      above.boundingBox === "empty" &&
      above2.boundingBox === "empty" &&
      block.name !== "water" &&
      !this.config.blocksToStayAway.includes(block.name) &&
      !this.isStair(node) &&
      !this.isSlab(node) &&
      !this.isFence(node)
    );
  }

  isBreakable(node) {
    const block = this.getBlock(node);
    if (!block) return false;

    // areaMarked check should still use NodeManager
    if (this.manager.isAreaMarkedNode(node)) return false;

    // virtual overlay check: air blocks cannot be broken again
    if (this.node?.virtualBlocks?.get(node.toString()) === "air") return false;

    // Check if block is absolutely unbreakable (bedrock, barriers, etc.)
    if (this.config.unbreakableBlocks?.includes(block.name)) return false;

    // Check if block should be avoided breaking (chests, valuable blocks, etc.)
    if (this.config.blocksToAvoid?.includes(block.name)) return false;

    // breakable if block is solid and passed all other checks
    return this.isSolid(node);
  }

  // === Block Types ===

  isStair(node) {
    const block = this.getBlock(node);
    return block?.name.includes("stairs");
  }

  isSlab(node) {
    const block = this.getBlock(node);
    return block?.name.includes("slab");
  }

  isFence(node) {
    const block = this.getBlock(node);
    if (!block) return false;
    return ["fence", "wall", "cobblestone_wall"].some((n) =>
      block.name.includes(n)
    );
  }

  isFullBlock(node) {
    const block = this.getBlock(node);
    if (!block) return false;
    if (block.name.includes("farmland")) return true;
    const maxY = block.shapes[0]?.[4];
    return maxY === 1;
  }

  // === Liquids & Misc ===

  isWater(node) {
    return this.getBlock(node)?.name === "water";
  }

  isLava(node) {
    return this.getBlock(node)?.name === "lava";
  }

  isClimbable(node) {
    return this.config.climbableBlocks.includes(this.getBlock(node)?.name);
  }

  isInteractable(node) {
    return this.config.interactableBlocks.includes(this.getBlock(node)?.name);
  }

  // === Helpers ===

  makeMovement(position, cost) {
    position.cost = cost;
    return position;
  }

  forward(amount = 1, node = null, attributes) {
    return (node ?? this.origin).forward(amount, attributes);
  }

  right(amount = 1, node = null, attributes) {
    return (node ?? this.origin).right(amount, attributes);
  }

  left(amount = 1, node = null, attributes) {
    return (node ?? this.origin).left(amount, attributes);
  }

  up(amount = 1, node = null, attributes) {
    return (node ?? this.origin).up(amount, attributes);
  }

  down(amount = 1, node = null, attributes) {
    return (node ?? this.origin).down(amount, attributes);
  }

  offset(dx, dy, dz, node = null) {
    return (node ?? this.origin).offset(dx, dy, dz);
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
  moveClasses.push(...moves);
}

function getNeighbors2(node, config, manager, bot) {
  const neighborMap = new Map();

  // Sort moves by priority first (lower = preferred)
  const sortedMoves = [...moveClasses].sort((a, b) => a.priority - b.priority);

  for (const move of sortedMoves) {
    move.setValues(bot, config, manager, node);
    const origin = node.worldPos;

    /** @type {DirectionalVec3[]} */
    const generatedNeighbors = [];
    move.generate(cardinalDirections, origin, generatedNeighbors);

    for (const neighbor of generatedNeighbors) {
      const key = `${neighbor.x},${neighbor.y},${neighbor.z}`;
      const existing = neighborMap.get(key);

      if (!existing) {
        neighborMap.set(key, neighbor);
        continue;
      }

      // Grab move data
      const existingMoveName = existing.attributes?.name ?? "Unknown";
      const existingMove = moveClasses.find((m) => m.name === existingMoveName);
      const existingPriority = existingMove?.priority ?? 999;

      const newPriority = move.priority;

      // Extra: simple moves list
      const simpleMoves = ["MoveForward", "MoveForwardUp", "MoveForwardDown"];
      const isExistingSimple = simpleMoves.includes(existingMoveName);
      const isNewSimple = simpleMoves.includes(move.name);

      // --- Conflict resolution ---
      let replace = false;

      // 1️⃣ Simple beats Parkour if same node
      if (isNewSimple && !isExistingSimple) {
        replace = true;
      } else if (!isNewSimple && isExistingSimple) {
        replace = false;
      } else {
        // 2️⃣ Otherwise, prefer lower priority first
        if (
          newPriority < existingPriority ||
          (newPriority === existingPriority && neighbor.cost < existing.cost)
        ) {
          replace = true;
        }
      }

      if (replace) neighborMap.set(key, neighbor);
    }
  }

  return Array.from(neighborMap.values());
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

module.exports = { getNeighbors2, Move, registerMoves, DirectionalVec3, clamp };

requireDir("./");
