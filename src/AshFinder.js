const EventEmitter = require("events");
const PathExecutor = require("./executor");
const { Goal, GoalFollowEntity } = require("./goal");
const { createEndFunc } = require("./utils");

const { Vec3 } = require("vec3");
const { Cell } = require("./pathfinder");
const { SmartWaypointPlanner, WaypointPlanner } = require("./waypoints");

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
    this.isPathing = false;
    this.config = new AshFinderConfig();
    this.debug = false;

    this.#pathExecutor = null;
    this.waypointPlanner = null;
    this.bot.on("spawn", () => {
      this.#pathExecutor = new PathExecutor(this.bot, this);
      this.waypointPlanner = new SmartWaypointPlanner(this.bot, this);
    });

    this.bot.on("death", () => {
      console.log(
        "Bot unfortunatly met its end and now we have to stop pathfinding. Such a shame"
      );
      this.stop();
    });
  }

  /**
   * Generate a path to the specified goal.
   * @param {Goal} goal Goal to reach
   * @param {{excludedPositions: Vec3[]}} options Positions to exclude from the pathfinding
   */
  async generatePath(goal, options = { excludedPositions: [] }) {
    const endFunc = createEndFunc(goal);
    const bot = this.bot;
    const position = goal.getPosition().clone();

    // ensure controller exists for this run
    this._searchController = this._searchController || {};
    this._searchController.debug = this.debug;
    // console.log("he was onece a dogg", options);

    const result = await astar(
      bot.entity.position.clone(),
      position,
      goal,
      bot,
      endFunc,
      this.config,
      options,
      this.debug,
      this._searchController
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

  disableFlight() {
    this.config.fly = false;
  }

  enableFlight() {
    this.config.fly = true;
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
    this.following = false;
    this.bot.clearControlStates();
    this.#pathExecutor.stop("pathfinder stopping");
    this.emit("stopped");
  }

  /**
   * Smart navigation that chooses between direct pathfinding and waypoints
   * @param {Goal} goal - Target goal
   * @param {Object} options - Navigation options
   * @param {number} options.waypointThreshold - Distance to trigger waypoints (default: 75)
   * @param {boolean} options.forceWaypoints - Always use waypoints
   * @param {boolean} options.forceAdaptive - Use smart waypoint system with failure handling
   */
  async gotoSmart(goal, options = {}) {
    const {
      waypointThreshold = 75,
      forceWaypoints = false,
      forceAdaptive = true,
    } = options;

    const start = this.bot.entity.position.clone();
    const goalPos = goal.getPosition();
    const distance = start.distanceTo(goalPos);

    // Decide strategy based on distance
    const shouldUseWaypoints = forceWaypoints || distance > waypointThreshold;

    if (shouldUseWaypoints) {
      console.log(`[AshFinder] Long distance: ${distance.toFixed(1)} blocks`);

      if (forceAdaptive) {
        // Use smart system with partial path handling
        return await this.waypointPlanner.navigateWithSmartWaypoints(goal);
      } else {
        // Use basic waypoint system
        return await this.waypointPlanner.navigateWithWaypoints(goal);
      }
    } else {
      // Direct pathfinding for short distances
      console.log(`[AshFinder] Direct path: ${distance.toFixed(1)} blocks`);
      return await this.goto(goal);
    }
  }

  /**
   *
   * @param {Goal} goal
   * @param {{excludedPositions?: Vec3[]}} options
   */
  async goto(goal, options = { excludedPositions: [] }) {
    if (!this.stopped) {
      throw new Error(
        "Already going to a goal, please wait until the current path is completed."
      );
    }

    this.stopped = false;
    this.isPathing = true;

    if (this.config.fly) {
      const elytraArmor =
        this.bot.inventory.slots[this.bot.getEquipmentDestSlot("torso")];
      if (!elytraArmor) {
        const elytraInv = this.bot.inventory
          .items()
          .find((i) => i.name.includes("elytra"));
        if (!elytraInv) throw new Error("No elytra found!");
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
              }) (Target: ${node.worldPos})`
          )
        );
        console.log(status);
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
      if (this.debug) console.error("Path execution failed:", err);

      return { status: "failed", error: err };
    } finally {
      this.stopped = true;
      this.isPathing = false;
    }
  }

  // /**
  //  *
  //  * @param {Goal} goal
  //  * @param {{excludedPositions?: Vec3[]}} options
  //  */
  // async flyTo(goal, options) {
  //   if (this.stopped) {
  //     options.fly = true;
  //     this.stopped = false;

  //     const result = await this.generatePath(goal, options);
  //     const { path, status } = result;

  //     if (this.debug) {
  //       console.log(path.map((node) => node.attributes.name));
  //       console.log(status);
  //     }

  //     // Set the path and get the execution promise
  //     const executionPromise = this.#pathExecutor.setPath(path, {
  //       partial: status === "partial",
  //       targetGoal: goal,
  //       bestNode: result.bestNode,
  //     });

  //     this.emit("pathStarted", {
  //       path,
  //       status,
  //       goal,
  //     });

  //     // Wait for the path to complete
  //     try {
  //       await executionPromise;
  //       return { status: "success" };
  //     } catch (err) {
  //       if (this.debug) console.error("Path execution failed:", err);
  //       return { status: "failed", error: err };
  //     }
  //   } else {
  //     const error =
  //       "Already going to a goal, please wait until the current path is completed.";
  //     console.log(error);
  //     throw new Error(error);
  //   }
  // }

  /**
   * Continuously follow an entity
   * @param {Entity} entity - Entity to follow
   * @param {Object} options
   * @param {number} options.distance - Distance to maintain
   * @param {number} options.updateInterval - How often to check position (ms)
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
      if (!this.following.active || !entity.isValid) {
        this.following = null;
        return;
      }

      const botPos = this.bot.entity.position;
      const entityPos = entity.position;
      const currentDist = botPos.distanceTo(entityPos);

      // Check if entity moved significantly
      const movedDist = entityPos.distanceTo(this.following.lastTargetPos);

      if (movedDist > 3 || currentDist > distance + 3) {
        this.following.lastTargetPos = entityPos.clone();

        // Use GoalNear for following
        const { GoalNear } = require("./goal");
        const goal = new GoalNear(entityPos, distance);

        try {
          // Don't await - let it run, we'll replan as needed
          this.goto(goal).catch(() => {});
        } catch (err) {
          // Already pathfinding, that's fine
        }
      }

      // Schedule next check
      setTimeout(followLoop, updateInterval);
    };

    followLoop();
  }

  /**
   * Stop following entity
   */
  stopFollowing() {
    if (this.following) {
      this.following.active = false;
      this.following = null;
    }
    this.stop();
  }

  /**
   * Navigate to goal using waypoint system for long distances
   * @param {Goal} goal - Target goal
   * @param {number} waypointThreshold - Distance threshold to use waypoints (default: 75)
   * @returns {Promise<{status: string}>}
   */
  async gotoWithWaypoints(goal, waypointThreshold = 75) {
    const bot = this.bot;
    const start = bot.entity.position.clone();
    const goalPos = goal.getPosition();
    const distance = start.distanceTo(goalPos);

    // Use waypoints for long distances
    if (distance > waypointThreshold) {
      console.log(
        `Long distance detected (${distance.toFixed(
          1
        )} blocks), using waypoint system`
      );

      const planner = new WaypointPlanner(bot, this);
      return await planner.navigateWithWaypoints(goal);
    } else {
      // Use regular pathfinding for short distances
      console.log(
        `Short distance (${distance.toFixed(
          1
        )} blocks), using direct pathfinding`
      );
      return await this.goto(goal);
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
    this._globalVirtual = this._globalVirtual || new Map();
    this._globalVirtual.set(key, state);

    if (this._searchController && this._searchController.active) {
      this._searchController.applyVirtual(key, state);

      const { pruneOpenSet } = require("./utils");
      const { moveClasses } = require("./movement");
      pruneOpenSet(this._searchController, this.bot, this.config);
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
      "piston_head",
    ];

    this.thinkTimeout = 30000;
    this.stuckTimeout = 5000;
    this.maxPartialPaths = 5;
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
      "piston_head",
    ];

    this.thinkTimeout = 5000;
    this.stuckTimeout = 5000;
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
