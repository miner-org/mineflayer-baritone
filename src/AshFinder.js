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

    const position = goal.position.clone();

    const result = await astar(
      bot.entity.position.clone(),
      position,
      bot,
      endFunc,
      this.config,
      excludedPositions,
      this.debug
    );

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
}

class AshFinderConfig {
  constructor() {
    // blocks to avoid breaking
    this.blocksToAvoid = ["crafting_table", "chest", "furnace", "gravel"];
    this.blocksToStayAway = ["cactus", "cobweb", "lava", "gravel"];
    this.avoidDistance = 8;
    this.swimming = true;
    this.placeBlocks = true;
    this.breakBlocks = true;
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
    this.climbableBlocks = [
      "vine",
      "ladder",
      "scaffolding",
    ];

    this.thinkTimeout = 5000;
  }
}

module.exports = { AshFinderConfig, AshFinderPlugin };
