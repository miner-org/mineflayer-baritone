const EventEmitter = require("events");
const PathExecutor = require("./executor");
const { Goal } = require("./goal");
const { createEndFunc } = require("./utils");

const Vec3 = require("vec3");
const { Cell } = require("./pathfinder");

const astar = require("./pathfinder").Astar;

class AshFinderPlugin extends EventEmitter {
  /**
   * @type {PathExecutor}
   */
  #pathExecutor;

  /**
   * @param {import('mineflayer').Bot} bot
   */
  constructor(bot) {
    super();
    this.bot = bot;
    this.path = [];
    this.stopped = true;
    this.config = new AshFinderConfig();
    this.debug = false;

    this.#pathExecutor = null;
    this.bot.on("spawn", () => {
      this.#pathExecutor = new PathExecutor(this.bot, this);
    });
  }

  /**
   * Generate a path to the specified goal.
   * @param {Goal} goal Goal to reach
   * @param {Vec3[]} excludedPositions Positions to exclude from the pathfinding
   */
  async generatePath(goal, excludedPositions = []) {
    const endFunc = createEndFunc(goal);
    const bot = this.bot;
    const position = goal.getPosition().clone();

    // ensure controller exists for this run
    this._searchController = this._searchController || {};
    this._searchController.debug = this.debug;

    const result = await astar(
      bot.entity.position.clone(),
      position,
      goal,
      bot,
      endFunc,
      this.config,
      excludedPositions,
      this.debug,
      this._searchController // <-- pass controller
    );

    // once astar resolves, controller.active will be set to false by astar
    this._searchController = this._searchController || {};
    this._searchController.active = false;

    return result;
  }

  disableBreaking() {
    this.config.breakBlocks = false;
  }
  disablePlacing() {
    this.config.placeBlocks = false;
  }

  enableBreaking() {
    this.config.breakBlocks = true;
  }
  enablePlacing() {
    this.config.placeBlocks = true;
  }

  /**
   *
   * @param {Vec3[]} positions
   * Creates a cell[] from given positions
   */
  createPathFromPositions(positions) {
    let result = {};

    result.path = [];
    for (const pos of positions) {
      const cell = new Cell(pos, 0);

      result.path.push(cell);
    }

    result.status = "found";

    return result;
  }

  stop() {
    this.path = [];
    this.stopped = true;
    this.bot.clearControlStates();
    this.emit("stopped");
  }

  /**
   *
   * @param {Goal} goal
   * @param {Vec3[]} excludedPositions
   */
  async goto(goal, excludedPositions = []) {
    if (this.stopped) {
      this.stopped = false;

      const result = await this.generatePath(goal, excludedPositions);
      const { path, status } = result;

      if (this.debug) {
        console.log(path.map((node) => node.attributes.name));
        console.log(status);
      }

      // Set the path and get the execution promise
      const executionPromise = this.#pathExecutor.setPath(path, {
        partial: status === "partial",
        targetGoal: goal,
        bestNode: result.bestNode,
      });

      this.emit("pathStarted", {
        path,
        status,
        goal,
      });

      // Wait for the path to complete
      try {
        await executionPromise;
        return { status: "success" };
      } catch (err) {
        if (this.debug) console.error("Path execution failed:", err);
        return { status: "failed", error: err };
      }
    } else {
      const error =
        "Already going to a goal, please wait until the current path is completed.";
      console.log(error);
      throw new Error(error);
    }
  }

  /**
   *
   * @param {{
   * path: Cell[],
   * status: "found" | "partial"
   * }} object
   *
   * @param {Goal} goal
   */
  async gotoWithPath(object, goal) {
    // console.log(object);

    const { path, status } = object;

    const executionPromise = this.#pathExecutor.setPath(path, {
      partial: status === "partial",
      targetGoal: goal,
    });

    this.emit("pathStarted", {
      path,
      status,
      goal,
    });

    // Wait for the path to complete
    try {
      await executionPromise;
      return { status: "success" };
    } catch (err) {
      if (this.debug) console.error("Path execution failed:", err);
      return { status: "failed", error: err };
    }
  }

  // helper to produce the same key format used by DirectionalVec3.toString
  posKey(pos) {
    // pos might be Vec3 or BlockPosition; ensure consistent formatting
    const p = pos.floored ? pos.floored() : pos;
    return `${p.x},${p.y},${p.z}`;
  }

  // apply a virtual state and prune if search running
  applyVirtualToSearch(pos, state) {
    const key = this.posKey(pos);
    // store globally so future searches start with it
    this._globalVirtual = this._globalVirtual || new Map();
    this._globalVirtual.set(key, state);

    // apply to running search (if active)
    if (this._searchController && this._searchController.active) {
      // apply to all cells
      this._searchController.applyVirtual(key, state);
      // prune invalid nodes
      this._searchController.prune();
    }
  }

  // notify external break
  notifyBlockBroken(pos) {
    const p = pos.floored ? pos.floored() : pos;
    if (this.debug)
      console.log(`[AshFinder] notifyBlockBroken ${p.toString()}`);
    // mark node manager as well (keeps areaMarked semantics if used)
    // NOTE: we still prefer overlay for branch-local state, nodemanager used only for areaMarked
    if (this._searchController?.nodemanager) {
      this._searchController.nodemanager.markNode(p, "broken");
    }

    // apply overlay + prune
    this.applyVirtualToSearch(p, "air");
  }

  // notify external place
  notifyBlockPlaced(pos) {
    const p = pos.floored ? pos.floored() : pos;
    if (this.debug)
      console.log(`[AshFinder] notifyBlockPlaced ${p.toString()}`);
    if (this._searchController?.nodemanager) {
      this._searchController.nodemanager.markNode(p, "placed");
    }
    this.applyVirtualToSearch(p, "placed");
  }
}

class AshFinderConfig {
  constructor() {
    // blocks to avoid breaking
    this.blocksToAvoid = ["crafting_table", "chest", "furnace"];
    this.blocksToStayAway = ["cactus", "cobweb", "lava", "gravel"];
    this.avoidDistance = 8;
    this.swimming = true;
    this.placeBlocks = false;
    this.breakBlocks = false;
    this.parkour = true;
    this.checkBreakUpNodes = true;
    this.proParkour = false;
    this.fly = false;
    this.maxFallDist = 3;
    this.maxWaterDist = 256;
    this.disposableBlocks = [
      "dirt",
      "cobblestone",
      "stone",
      "andesite",
      "coarse_dirt",
      "blackstone",
      "end_stone",
      "basalt",
    ];
    this.interactableBlocks = [
      "oak_door",
      "spruce_door",
      "birch_door",
      "jungle_door",
      "acacia_door",
      "dark_oak_door",
      "mangrove_door",
      "warped_door",
      "crimson_door",
      // gates
      "oak_fence_gate",
      "spruce_fence_gate",
      "birch_fence_gate",
      "jungle_fence_gate",
      "acacia_fence_gate",
      "dark_oak_fence_gate",
      "mangrove_fence_gate",
      "warped_fence_gate",
      "crimson_fence_gate",
    ];
    this.climbableBlocks = ["vine", "ladder", "scaffolding"];
    this.closeInteractables = true;
    
    // Blocks that cannot be broken under any circumstances
    this.unbreakableBlocks = [
      "bedrock",
      "barrier",
      "command_block",
      "chain_command_block",
      "repeating_command_block", 
      "structure_block",
      "jigsaw",
      "end_portal_frame",
      "end_portal",
      "nether_portal",
      "spawner",
      "end_gateway",
      "structure_void",
      "moving_piston",
      "piston_head"
    ];

    this.thinkTimeout = 15000;
    this.debugMoves = false;
  }

  /**
   * Resets the configuration to default values.
   */
  reset() {
    this.blocksToAvoid = ["crafting_table", "chest", "furnace", "gravel"];
    this.blocksToStayAway = ["cactus", "cobweb", "lava", "gravel"];
    this.avoidDistance = 8;
    this.swimming = true;
    this.placeBlocks = false;
    this.breakBlocks = false;
    this.parkour = true;
    this.checkBreakUpNodes = true;
    this.proParkour = false;
    this.fly = false;
    this.maxFallDist = 3;
    this.maxWaterDist = 256;
    this.disposableBlocks = [
      "dirt",
      "cobblestone",
      "stone",
      "andesite",
      "coarse_dirt",
      "blackstone",
      "end_stone",
      "basalt",
      "sandstone",
      "diorite",
      "granite",
      "tuff",
      "cobbled_deepslate",
      "deepslate",
      "calcite",
    ];
    this.interactableBlocks = [
      "oak_door",
      "spruce_door",
      "birch_door",
      "jungle_door",
      "acacia_door",
      "dark_oak_door",
      "mangrove_door",
      "warped_door",
      "crimson_door",
      // gates
      "oak_fence_gate",
      "spruce_fence_gate",
      "birch_fence_gate",
      "jungle_fence_gate",
      "acacia_fence_gate",
      "dark_oak_fence_gate",
      "mangrove_fence_gate",
      "warped_fence_gate",
      "crimson_fence_gate",
    ];
    this.climbableBlocks = ["vine", "ladder", "scaffolding"];
    this.closeInteractables = true;
    
    // Blocks that cannot be broken under any circumstances
    this.unbreakableBlocks = [
      "bedrock",
      "barrier",
      "command_block",
      "chain_command_block",
      "repeating_command_block", 
      "structure_block",
      "jigsaw",
      "end_portal_frame",
      "end_portal",
      "nether_portal",
      "spawner",
      "end_gateway",
      "structure_void",
      "moving_piston",
      "piston_head"
    ];

    this.thinkTimeout = 5000;
    this.debugMoves = false;
  }

  set(key, value) {
    if (this.hasOwnProperty(key)) {
      this[key] = value;
    } else {
      throw new Error(`Invalid configuration key: ${key}`);
    }
  }

  get(key) {
    if (this.hasOwnProperty(key)) {
      return this[key];
    } else {
      throw new Error(`Invalid configuration key: ${key}`);
    }
  }
}

module.exports = { AshFinderConfig, AshFinderPlugin };
