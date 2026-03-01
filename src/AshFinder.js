const EventEmitter = require("events");
const PathExecutor = require("./executor");
const { Goal, GoalNear, GoalFollowEntity } = require("./goal");
const { createEndFunc } = require("./utils");

const { Vec3 } = require("vec3");
const { Cell } = require("./pathfinder");
const { SmartWaypointPlanner, WaypointPlanner } = require("./waypoints");

const astar = require("./pathfinder").Astar;

class AshFinderPlugin extends EventEmitter {
  /** @type {PathExecutor} */
  #pathExecutor;

  /**
   * @param {import("mineflayer").Bot} bot
   */
  constructor(bot) {
    super();
    this.bot = bot;
    this.path = [];
    this.stopped = true;
    this.isPathing = false;
    this.following = null;
    this.config = new AshFinderConfig();
    this.debug = false;
    this.currentGoal = null;

    this.#pathExecutor = null;
    this.waypointPlanner = null;

    this._visitedChunks = new Set();
    this._pathCache = new PathCache();
    this._searchController = {};
    this._globalVirtual = new Map();

    bot.on("spawn", () => {
      this.#pathExecutor = new PathExecutor(bot, this);
      this.waypointPlanner = new SmartWaypointPlanner(bot, this);
      this._visitedChunks = new Set();
    });

    bot.on("death", () => {
      // Only stop if we're actually moving
      if (!this.stopped) this.stop();
    });

    bot.on("blockUpdate", (oldBlock, newBlock) => {
      if (oldBlock?.name !== newBlock?.name) {
        this._pathCache.invalidateBlock(newBlock.position);
      }
    });
  }

  /**
   * @param {Goal} goal
   * @param {{ excludedPositions?: Vec3[] }} [options={}]
   * @returns {Promise<{ path: Cell[], status: string, visitedChunks: Set<string> }>}
   */
  async generatePath(goal, options = {}) {
    const endFunc = createEndFunc(goal);
    const position = goal.getPosition().clone();

    this._searchController.debug = this.debug;

    const warmNodes = this._pathCache.getWarmNodes(
      this.bot.entity.position.clone(),
    );

    const result = await astar(
      this.bot.entity.position.clone(),
      position,
      goal,
      this.bot,
      endFunc,
      this.config,
      { excludedPositions: [], warmNodes, ...options },
      this.debug,
      this._searchController,
    );

    if (result.status === "found" && result.closedNodes) {
      this._pathCache.store(result.visitedChunks, result.closedNodes);
    }

    this._searchController.active = false;
    this._visitedChunks = result.visitedChunks || new Set();

    return result;
  }

  // -------------------------------------------------------------------------
  // Config helpers
  // -------------------------------------------------------------------------

  /** Disable block breaking during pathfinding. */
  disableBreaking() {
    this.config.breakBlocks = false;
  }
  /** Enable block breaking during pathfinding. */
  enableBreaking() {
    this.config.breakBlocks = true;
  }

  /** Disable block placing during pathfinding. */
  disablePlacing() {
    this.config.placeBlocks = false;
  }
  /** Enable block placing during pathfinding. */
  enablePlacing() {
    this.config.placeBlocks = true;
  }

  /** Disable elytra flight mode. */
  disableFlight() {
    this.config.fly = false;
  }
  /** Enable elytra flight mode. */
  enableFlight() {
    this.config.fly = true;
  }

  /** Disable parkour moves. */
  disableParkour() {
    this.config.parkour = false;
  }
  /** Enable parkour moves. */
  enableParkour() {
    this.config.parkour = true;
  }

  /**
   * Build a path-result object directly from an array of positions (no A*).
   *
   * @param {Vec3[]} positions
   * @returns {{ path: Cell[], status: "found" }}
   */
  createPathFromPositions(positions) {
    return {
      path: positions.map((pos) => new Cell(pos, 0)),
      status: "found",
    };
  }

  stop() {
    this.path = [];
    this.stopped = true;
    this.currentGoal = null;
    this.isPathing = false;
    this.following = null;
    this.bot.clearControlStates();
    this.#pathExecutor?.stop("pathfinder stopping");
    this.emit("stopped");
  }

  /**
   * Navigate to `goal`, replanning if the path is partial.
   *
   * @param {Goal} goal
   * @param {{ excludedPositions?: Vec3[] }} [options={}]
   * @returns {Promise<{ status: "success" | "failed", error?: Error }>}
   */
  async goto(goal, options = {}) {
    if (!this.stopped) {
      throw new Error(
        "Already navigating. Call stop() or await the current goto().",
      );
    }

    this.stopped = false;
    this.isPathing = true;
    this.currentGoal = goal;

    // If the goal chunk isn't loaded yet, shorten the search timeout so we
    // don't wait 30 s for a path that can't exist yet.
    const defaultTimeout = this.config.thinkTimeout;
    const isLoaded = this.bot.blockAt(goal.getPosition()) !== null;
    if (!isLoaded) {
      if (this.debug)
        console.log(
          "[AshFinder] Goal chunk not loaded — using 1s think timeout",
        );
      this.config.thinkTimeout = 1000;
    }

    // Validate elytra if fly mode is on.
    if (this.config.fly) {
      const torsoSlot = this.bot.getEquipmentDestSlot("torso");
      const wearing = this.bot.inventory.slots[torsoSlot];
      if (!wearing?.name.includes("elytra")) {
        const inInventory = this.bot.inventory
          .items()
          .find((i) => i.name.includes("elytra"));
        if (!inInventory)
          throw new Error("Fly mode is enabled but no elytra found.");
      }
    }

    try {
      const { path, status, bestNode } = await this.generatePath(goal, options);

      if (this.debug) {
        console.log(
          path.map(
            (node) =>
              `${node.attributes.name} (origin:${
                node.attributes.originVec ?? "none"
              }) (Target: ${node.worldPos})`,
          ),
        );
        console.log("Path status:", status);
      }

      const executionPromise = this.#pathExecutor.setPath(path, {
        partial: status === "partial",
        targetGoal: goal,
        bestNode,
        pathOptions: options,
      });

      this.emit("pathStarted", { path, status, goal });

      await executionPromise;
      return { status: "success" };
    } catch (err) {
      if (this.debug) console.error("[AshFinder] Path execution failed:", err);
      return { status: "failed", error: err };
    } finally {
      this.stopped = true;
      this.isPathing = false;
      this.currentGoal = null;
      this.config.thinkTimeout = defaultTimeout;
    }
  }

  /**
   * Choose between direct A* and waypoint navigation based on distance.
   *
   * @param {Goal} goal
   * @param {{
   *   waypointThreshold?: number,
   *   forceWaypoints?: boolean,
   *   forceAdaptive?: boolean,
   * }} [options={}]
   * @returns {Promise<{ status: string }>}
   */
  async gotoSmart(goal, options = {}) {
    const {
      waypointThreshold = 75,
      forceWaypoints = false,
      forceAdaptive = true,
    } = options;

    const distance = this.bot.entity.position.distanceTo(goal.getPosition());

    if (forceWaypoints || distance > waypointThreshold) {
      if (this.debug)
        console.log(
          `[AshFinder] Long-distance nav (${distance.toFixed(1)} blocks)`,
        );

      return forceAdaptive
        ? this.waypointPlanner.navigateWithSmartWaypoints(goal)
        : this.waypointPlanner.navigateWithWaypoints(goal);
    }

    if (this.debug)
      console.log(`[AshFinder] Direct nav (${distance.toFixed(1)} blocks)`);

    return this.goto(goal);
  }

  /**
   * Navigate using the waypoint system for long distances.
   * Prefer `gotoSmart` for new code; this exists for backward compatibility.
   *
   * @param {Goal} goal
   * @param {number} [waypointThreshold=75]
   * @returns {Promise<{ status: string }>}
   */
  async gotoWithWaypoints(goal, waypointThreshold = 75) {
    return this.gotoSmart(goal, { waypointThreshold, forceAdaptive: false });
  }

  /**
   * Execute a pre-computed path result (e.g. from `generatePath`).
   *
   * @param {{ path: Cell[], status: "found" | "partial" }} object
   * @param {Goal} goal
   * @returns {Promise<{ status: "success" | "failed", error?: Error }>}
   */
  async gotoWithPath(object, goal) {
    const { path, status } = object;

    const executionPromise = this.#pathExecutor.setPath(path, {
      partial: status === "partial",
      targetGoal: goal,
    });

    this.emit("pathStarted", { path, status, goal });

    try {
      await executionPromise;
      return { status: "success" };
    } catch (err) {
      if (this.debug) console.error("[AshFinder] Path execution failed:", err);
      return { status: "failed", error: err };
    }
  }

  /**
   * Continuously follow an entity, replanning whenever it moves significantly.
   *
   * @param {{ position: Vec3, isValid: boolean }} entity
   * @param {{ distance?: number, updateInterval?: number }} [options={}]
   */
  async followEntity(entity, options = {}) {
    const { distance = 2, updateInterval = 500 } = options;

    this.following = {
      entity,
      distance,
      active: true,
      lastTargetPos: entity.position.clone(),
    };

    const followLoop = async () => {
      if (!this.following?.active || !entity.isValid) {
        this.following = null;
        return;
      }

      const botPos = this.bot.entity.position;
      const entityPos = entity.position;
      const currentDist = botPos.distanceTo(entityPos);
      const movedDist = entityPos.distanceTo(this.following.lastTargetPos);

      if (movedDist > 3 || currentDist > distance + 3) {
        this.following.lastTargetPos = entityPos.clone();

        const followGoal = new GoalNear(entityPos, distance);
        this.goto(followGoal).catch(() => {});
      }

      setTimeout(followLoop, updateInterval);
    };

    followLoop();
  }

  /**
   * Stop following the current entity.
   */
  stopFollowing() {
    if (this.following) {
      this.following.active = false;
      this.following = null;
    }
    this.stop();
  }

  /**
   * @param {Vec3} pos
   * @returns {string}
   */
  posKey(pos) {
    const p = pos.floored ? pos.floored() : pos;
    return `${p.x},${p.y},${p.z}`;
  }

  /**
   * @param {Vec3} pos
   * @param {string} state - e.g. "air" or "placed"
   */
  applyVirtualToSearch(pos, state) {
    const key = this.posKey(pos);
    this._globalVirtual.set(key, state);

    if (this._searchController?.active) {
      this._searchController.applyVirtual(key, state);

      const { pruneOpenSet } = require("./utils");
      pruneOpenSet(this._searchController, this.bot, this.config);
    }
  }

  /**
   * @param {Vec3} pos
   */
  notifyBlockBroken(pos) {
    const p = pos.floored ? pos.floored() : pos;
    if (this.debug) console.log(`[AshFinder] notifyBlockBroken ${p}`);

    if (this._searchController?.nodemanager) {
      this._searchController.nodemanager.markNode(p, "broken");
    }
    this.applyVirtualToSearch(p, "air");
  }

  /**
   * @param {Vec3} pos
   */
  notifyBlockPlaced(pos) {
    const p = pos.floored ? pos.floored() : pos;
    if (this.debug) console.log(`[AshFinder] notifyBlockPlaced ${p}`);

    if (this._searchController?.nodemanager) {
      this._searchController.nodemanager.markNode(p, "placed");
    }
    this.applyVirtualToSearch(p, "placed");
  }
}

const DEFAULT_CONFIG = {
  blocksToAvoid: ["crafting_table", "chest", "furnace"],
  blocksToStayAway: ["cactus", "cobweb", "lava", "gravel"],
  avoidDistance: 8,
  experimentalMoves: false,
  /**
   * Will be bypassed by parkour moves tho
   */
  allowSprinting: true,
  swimming: true,
  placeBlocks: false,
  breakBlocks: false,
  parkour: true,
  checkBreakUpNodes: true,
  proParkour: false,
  fly: false,
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
    "sandstone",
    "diorite",
    "granite",
    "tuff",
    "cobbled_deepslate",
    "deepslate",
    "calcite",
  ],
  interactableBlocks: [
    "oak_door",
    "spruce_door",
    "birch_door",
    "jungle_door",
    "acacia_door",
    "dark_oak_door",
    "mangrove_door",
    "warped_door",
    "crimson_door",
    "oak_fence_gate",
    "spruce_fence_gate",
    "birch_fence_gate",
    "jungle_fence_gate",
    "acacia_fence_gate",
    "dark_oak_fence_gate",
    "mangrove_fence_gate",
    "warped_fence_gate",
    "crimson_fence_gate",
  ],
  climbableBlocks: ["vine", "ladder", "scaffolding"],
  closeInteractables: true,
  unbreakableBlocks: [
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
    "piston_head",
  ],
  thinkTimeout: 30000,
  stuckTimeout: 5000,
  maxPartialPaths: 5,
  debugMoves: false,
};

class AshFinderConfig {
  constructor() {
    this.reset();
  }

  /**
   * Restore all settings to their default values.
   */
  reset() {
    // Deep-copy arrays so mutations on one instance don't affect the defaults.
    for (const [key, value] of Object.entries(DEFAULT_CONFIG)) {
      this[key] = Array.isArray(value) ? [...value] : value;
    }
  }

  /**
   * Set a single configuration value.
   *
   * @param {string} key
   * @param {*} value
   */
  set(key, value) {
    if (!Object.hasOwn(this, key)) {
      throw new Error(`Unknown configuration key: "${key}"`);
    }
    this[key] = value;
  }

  /**
   * Get a single configuration value.
   *
   * @param {string} key
   * @returns {*}
   */
  get(key) {
    if (!Object.hasOwn(this, key)) {
      throw new Error(`Unknown configuration key: "${key}"`);
    }
    return this[key];
  }
}

class PathCache {
  constructor() {
    // chunkKey → Map<posHash, { gCost, worldPos, parent }>
    this.chunkData = new Map();
    this.maxAge = 30_000; // ms
    this.timestamps = new Map();
  }

  store(visitedChunks, closedNodes) {
    const now = Date.now();
    for (const chunkKey of visitedChunks) {
      this.chunkData.set(chunkKey, closedNodes);
      this.timestamps.set(chunkKey, now);
    }
  }

  getWarmNodes(startPos) {
    const chunkKey = `${startPos.x >> 4},${startPos.z >> 4}`;
    const cached = this.chunkData.get(chunkKey);
    if (!cached) return null;

    const age = Date.now() - (this.timestamps.get(chunkKey) ?? 0);
    if (age > this.maxAge) {
      this.invalidateChunk(chunkKey);
      return null;
    }
    return cached;
  }

  invalidateChunk(chunkKey) {
    this.chunkData.delete(chunkKey);
    this.timestamps.delete(chunkKey);
  }

  invalidateBlock(blockPos) {
    const chunkKey = `${blockPos.x >> 4},${blockPos.z >> 4}`;
    this.invalidateChunk(chunkKey);
  }
}

module.exports = { AshFinderConfig, AshFinderPlugin, PathCache };
