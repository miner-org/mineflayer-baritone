const Vec3 = require("vec3").Vec3;
const { Goal } = require("./goal");
const { Cell, Astar } = require("./pathfinder");
const {
  getController,
  simulateUntil,
  getControlState,
  placeBlock,
  autoTool,
  createEndFunc,
  dig,
} = require("./utils");
const { PlayerState } = require("prismarine-physics");

class PathExecutor {
  /**
   * @param {import("mineflayer").Bot} bot - The mineflayer bot instance
   * @param {import("./AshFinder").AshFinderPlugin} ashfinder - The AshFinder plugin instance
   */
  constructor(bot, ashfinder) {
    this.bot = bot;
    /**
     * @type {import("./AshFinder").AshFinderPlugin}
     */
    this.ashfinder = ashfinder;

    /**
     * @type {Cell[]}
     */
    this.path = [];
    this.currentIndex = 0;
    this.jumpState = null;
    this.toweringState = { active: false, phase: 0 };
    this.swimmingState = { active: false, sinking: false, floating: false };
    this.climbingState = false; // Can be false or { phase: 'positioning'|'climbing'|'descending', target: Vec3 }
    this.interactingState = false;
    this.elytraFlyingState = { active: false, gliding: false };

    this.placedNodes = new Set();

    this.executing = false;
    this.partial = false;
    this.goal = null;

    this.placingState = false;
    this.placing = false;
    this.breakingState = false;
    this.digging = false;
    this.config = bot.ashfinder.config || {};

    this.currentPromise = null;
    this.resolveCurrentPromise = null;
    this.rejectCurrentPromise = null;
    this.finalGoal = null;

    this.previousNode = null;
    this.previousGravity = bot.physics.gravity;

    this.isFlying = false;
    this.flyingInterval = null;

    this.currentWaypoint = null;
    this.waypointTolerance = 3; // How close to get to intermediate waypoints

    this.lastPosition = null; // Vec3 of last check
    this.stuckTimer = 0; // ticks stuck count
    this.stuckThreshold = 800; // ticks to consider stuck (~1 sec at 20 ticks/sec)
    this.stuckDistanceThreshold = 0.35; // how much movement counts as NOT stuck

    this.visitedPositions = new Set(); // Track where we've been
    this.lastProgressTime = Date.now(); // Track when we last made progress
    this.progressCheckInterval = 2000; // Check progress every 2 seconds
    this.noProgressTimeout = 30000; // Replan if no progress for 30 seconds

    this.params = {};

    this.bot.on("physicsTick", () => {
      if (this.executing) this.tick();
    });
  }

  /**
   * Set a new path to execute
   * @param {Cell[]} path - Array of nodes with `position` and `action`
   * @param {Object} options
   * @param {boolean} options.partial - Whether this is a partial path
   * @param {Goal} options.targetGoal - The current target goal
   * @param {Cell} options.bestNode - The best node found if path is partial
   * @param {Goal} options.finalGoal - The ultimate goal we're trying to reach (for partial paths)
   */
  setPath(path, options = {}) {
    const {
      partial = false,
      targetGoal = null,
      bestNode = null,
      finalGoal = null,
      isWaypoint = false,
      waypointIndex = null,
    } = options;

    // Only create a new promise if one doesn't exist (i.e., not replanning)
    if (!this.currentPromise || !isWaypoint) {
      this.currentPromise = new Promise((resolve, reject) => {
        this.resolveCurrentPromise = resolve;
        this.rejectCurrentPromise = reject;
      });
    }

    this.finalGoal = finalGoal || targetGoal;
    this.currentWaypoint = isWaypoint ? targetGoal : null;
    this.waypointIndex = waypointIndex;

    this.path = path;
    this.currentIndex = 0;
    this.placedNodes.clear();
    this.jumpState = null;
    this.executing = true;
    this.partial = partial;
    this.goal = targetGoal;

    if (this.ashfinder.debug) {
      const wpInfo = isWaypoint ? ` (waypoint ${waypointIndex})` : "";
      console.log(
        `${partial ? "Executing partial" : "Executing full"} path${wpInfo}`
      );
    }

    if (bestNode) {
      this.params.bestNode = bestNode;
    }

    return this.currentPromise;
  }

  /**
   * Set the configuration for the path executor
   * @param {Object} config - Configuration object
   */
  setConfig(config) {
    this.config = config;
  }

  /**
   * Called on every physics tick
   */
  async tick() {
    if (!this.executing) return;

    const pos = this.bot.entity.position;

    // Check for actual progress toward goal
    if (this._checkStuckConditions(pos)) {
      console.warn("Bot is stuck, replanning...");
      this._handleStuckState();
      return;
    }

    // Update last position for next check
    this.lastPosition = pos.clone();

    // path complete check
    if (this.currentIndex >= this.path.length) {
      this._onGoalReached();
      return;
    }

    const node = this.path[this.currentIndex];
    const nextNode = this.path[this.currentIndex + 1];

    if (this._isActionBusy()) return;

    const reached = this._hasReachedNode(
      node,
      this.jumpState?.jumped ||
        this.toweringState.active ||
        this.swimmingState?.active ||
        this.climbingState
    );

    if (reached) {
      // stop climbing controls if this was a ladder node
      if (node.attributes.ladder) {
        // console.log("Dih")
        this.bot.setControlState("forward", false);
        this.bot.setControlState("jump", false);
        this.bot.setControlState("sneak", false);
        this.climbingState = false; // Reset entire state
        this.climbingTarget = null;
      }

      if (!this.bot.physicsEnabled) this.bot.physicsEnabled = true;

      // ---- SAVE PREVIOUS NODE BEFORE ADVANCING ----
      this.previousNode = node;

      // handle interactables on previous node
      // if (
      //   this.previousNode?.attributes.interact &&
      //   this.ashfinder.config.closeInteractables
      // ) {
      //   const blockAt = this.bot.blockAt(this.previousNode.worldPos);
      //   if (blockAt && blockAt.getProperties().open) {
      //     if (this.ashfinder.debug)
      //       console.log(`Closing block at ${this.previousNode.worldPos}`);
      //     await this.bot.lookAt(this.previousNode.worldPos, true);
      //     try {
      //       await this.bot.activateBlock(blockAt);
      //     } catch (error) {
      //       console.log("Error closing block:", error);
      //     }
      //   }
      // }

      this.currentIndex++;
      this.jumpState = null;
      this.bot.setControlState("sprint", false);
      this._clearAllControls();

      if (this.ashfinder.debug)
        console.log(
          `Reached node: ${node.attributes.name} at ${node.worldPos}`
        );
      return;
    }

    this.currentPromise = this._executeMove(node, nextNode);
    await this.currentPromise;
    this.currentPromise = null;
  }

  /**
   * Comprehensive stuck detection system
   * @param {Vec3} currentPos - Current bot position
   * @returns {boolean} - True if bot is stuck
   */
  _checkStuckConditions(currentPos) {
    const now = Date.now();

    // Track visited positions for loop detection
    const posKey = `${Math.floor(currentPos.x)},${Math.floor(
      currentPos.y
    )},${Math.floor(currentPos.z)}`;
    if (!this.visitedPositions.has(posKey)) {
      this.visitedPositions.add(posKey);
      this.lastProgressTime = now;

      // Prevent memory leak on very long paths
      if (this.visitedPositions.size > 10000) {
        const oldest = Array.from(this.visitedPositions).slice(0, 5000);
        oldest.forEach((key) => this.visitedPositions.delete(key));
      }
    }

    // Check 1: No new positions visited for too long
    if (now - this.lastProgressTime > this.noProgressTimeout) {
      return true;
    }

    // Check 2: Physical movement detection
    if (this.lastPosition && !this._isValidStationary()) {
      const movement = this._calculateMovement(currentPos, this.lastPosition);

      if (!movement.isMoving) {
        this.stuckTimer++;

        // Progressive timeout based on context
        const threshold = this._getStuckThreshold();

        if (this.stuckTimer > threshold) {
          return true;
        }
      } else {
        this.stuckTimer = 0;
      }
    }

    // Check 3: Repetitive position cycling (going back and forth)
    if (this._detectPositionCycle()) {
      return true;
    }

    return false;
  }

  /**
   * Calculate movement metrics between two positions
   * @param {Vec3} current - Current position
   * @param {Vec3} previous - Previous position
   * @returns {Object} Movement data
   */
  _calculateMovement(current, previous) {
    const verticalMovement = Math.abs(current.y - previous.y);
    const horizontalMovement = Math.sqrt(
      Math.pow(current.x - previous.x, 2) + Math.pow(current.z - previous.z, 2)
    );

    const totalMovement = Math.sqrt(
      horizontalMovement * horizontalMovement +
        verticalMovement * verticalMovement
    );

    return {
      vertical: verticalMovement,
      horizontal: horizontalMovement,
      total: totalMovement,
      isMoving:
        verticalMovement > 0.05 ||
        horizontalMovement > this.stuckDistanceThreshold,
    };
  }

  /**
   * Check if bot is legitimately stationary (not stuck)
   * @returns {boolean}
   */
  _isValidStationary() {
    // Bot is busy with actions that prevent movement
    if (this._isActionBusy()) return true;

    const node = this.path[this.currentIndex];
    if (!node) return false;

    // Legitimate stationary states
    return (
      this.swimmingState?.active ||
      node.attributes?.interact ||
      node.attributes?.ladder ||
      !this.bot.entity.onGround // In air
    );
  }

  /**
   * Get adaptive stuck threshold based on current action
   * @returns {number} Ticks before considering stuck
   */
  _getStuckThreshold() {
    const node = this.path[this.currentIndex];

    // Higher thresholds for complex actions
    if (node?.attributes?.ascend) return 1200; // Towering needs more time
    if (node?.attributes?.swim) return 1000; // Swimming can be slow
    if (node?.attributes?.parkour) return 600; // Parkour needs precision
    if (this.swimmingState?.active) return 1000;

    return this.stuckThreshold; // Default 800 ticks
  }

  /**
   * Detect if bot is cycling between same positions
   * @returns {boolean}
   */
  _detectPositionCycle() {
    if (this.visitedPositions.size < 10) return false;

    const recentPositions = Array.from(this.visitedPositions).slice(-20);
    const uniqueRecent = new Set(recentPositions);

    // If we're revisiting the same ~3 positions repeatedly
    if (uniqueRecent.size <= 3 && recentPositions.length >= 15) {
      if (this.ashfinder.debug) {
        console.log("Detected position cycling pattern");
      }
      return true;
    }

    return false;
  }

  /**
   * Handle stuck state and initiate recovery
   */
  _handleStuckState() {
    this.stuckTimer = 0;
    this.visitedPositions.clear();
    this.lastProgressTime = Date.now();

    // Optional: Try small random movement to escape local traps
    if (this.bot.entity.onGround) {
      const randomDir = Math.random() < 0.5 ? "left" : "right";
      this.bot.setControlState(randomDir, true);
      setTimeout(() => this.bot.setControlState(randomDir, false), 200);
    }

    this.replanPath();
  }

  replanPath() {
    if (this.ashfinder.debug) console.log("Replanning path...");

    const originalResolve = this.resolveCurrentPromise;
    const originalReject = this.rejectCurrentPromise;

    this.currentIndex = 0;
    this.placedNodes.clear();
    this.executing = false;
    this.resetStates();

    // Determine target: current waypoint or final goal
    const targetGoal = this.currentWaypoint || this.finalGoal;

    if (!targetGoal) {
      console.error("No target goal available for replanning!");
      if (originalReject) {
        originalReject(new Error("No target goal for replanning"));
      }
      this.stop();
      this.ashfinder.stop();
      return;
    }

    this.findPathToGoal(targetGoal)
      .then(() => {
        // Path found - execution continues via tick()
      })
      .catch((err) => {
        if (originalReject) {
          originalReject(err);
        }
        this.stop();
        this.ashfinder.stop();
      });

    this.resolveCurrentPromise = originalResolve;
    this.rejectCurrentPromise = originalReject;
  }

  resetStates() {
    this.placingState = false;
    this.placing = false;
    this.breakingState = false;
    this.digging = false;
    this.toweringState = { active: false, phase: 0 };
    this.swimmingState = { active: false, sinking: false, floating: false };
    this.elytraFlyingState = { active: false, gliding: false };
    this.climbingState = false;
    this.climbingTarget = null;
    this.interactingState = false;
    this.jumpState = null;
    this.lastPosition = null;
    this.stuckTimer = 0;
  }

  /**
   *
   * @returns {Promise<void>}
   * */
  async findPathToGoal(targetGoal = null) {
    const goal = targetGoal || this.finalGoal;

    if (!goal) {
      console.warn("No goal set for pathfinding!");
      return;
    }

    const endFunc = createEndFunc(goal);
    const newPath = await Astar(
      this.bot.entity.position.clone().floored(),
      goal.getPosition(),
      goal,
      this.bot,
      endFunc,
      this.ashfinder.config,
      [],
      this.ashfinder.debug
    );

    if (newPath.status === "no path") {
      if (this.rejectCurrentPromise) {
        this.rejectCurrentPromise(new Error("No path found"));
        this.rejectCurrentPromise = null;
        this.resolveCurrentPromise = null;
        this.currentPromise = null;
      }
      return;
    }

    return this.setPath(newPath.path, {
      partial: newPath.status === "partial",
      targetGoal: goal,
      bestNode: newPath.bestNode,
      isWaypoint: !!this.currentWaypoint,
      waypointIndex: this.waypointIndex,
    });
  }

  /**
   * Executes the current move
   * @param {Cell} node
   * @param {Cell} nextNode
   */
  async _executeMove(node, nextNode) {
    // console.log("F")
    if (this._isActionBusy()) return;

    if (this.ashfinder.debug) {
      showPathParticleEffect(this.bot, node.worldPos, {
        r: 0.1,
        g: 0.5,
        b: 0.4,
      });
    }

    const attributes = node.attributes;
    const block = this.bot.blockAt(node.worldPos);

    if (this.ashfinder.debug)
      console.log(
        `Executing move: ${node.attributes.name} at ${node.worldPos} (${attributes.place?.length} places, ${attributes.break?.length} breaks)`
      );

    // Handle water-related moves first
    if (this._isInWater() || (attributes.swim && !attributes.dive)) {
      if (this.ashfinder.debug) console.log("Executing water-based movement");
      this._swimTo(node);
      return;
    }

    if (nextNode && nextNode.attributes.parkour && !attributes.parkour) {
      this.bot.setControlState("sprint", true);
    }

    if (attributes.sJump) {
      this._sprintJump(node);
    } else if (attributes.nJump) {
      if (
        attributes.place?.length > 0 &&
        !this.placedNodes.has(node.worldPos.toString())
      ) {
        await this._placeBlock(node);
        this.placedNodes.add(node.worldPos.toString());
      }

      if (attributes.break?.length > 0) {
        await this._handleBreakingBlocks(node);
      }

      this._simpleJump(node);
    } else if (attributes.ladder) {
      if (attributes.descend) {
        this._startClimbDown(node);
      } else this._startClimb(node);

      return;
    } else if (
      attributes.interact &&
      !this.interactingState &&
      !block.getProperties().open
    ) {
      if (this.ashfinder.debug)
        console.log(`Interacting with block at ${node.worldPos}`);

      await this.bot.lookAt(node.worldPos, true);
      this.interactingState = true;

      try {
        await this.bot.activateBlock(block);
      } catch (error) {
        console.log("Error interacting with block:", error);
      } finally {
        this.interactingState = false;
      }
    } else if (attributes.ascend) {
      if (
        !this.toweringState.active &&
        !this.placedNodes.has(node.worldPos.toString())
      ) {
        await this.jumpAndPlaceBlock(node);
        // this.placedNodes.add(node.worldPos.toString());
      }
    } else if (attributes.isFlying) {
      //verticla movements123
      //gay men
      if (!this.isFlying) await this._startPacketFly();
      await this._flyTo(node);
    } else {
      if (
        attributes.place?.length > 0 &&
        !this.placedNodes.has(node.worldPos.toString())
      ) {
        // Check if this is a bridging scenario (placing over void/gap)
        const isBridging = this._isBridgingMove(node);

        if (isBridging) {
          await this._safeBridge(node);
        } else {
          await this._placeBlock(node);
        }

        this.placedNodes.add(node.worldPos.toString());
      }

      if (attributes.break?.length > 0) {
        await this._handleBreakingBlocks(node);
      }

      if (attributes.crouch) {
        this.bot.setControlState("sneak", true);
      }

      // this.bot.physics.gravity = this.previousGravity;
      if (this.isFlying) this._stopPacketFly();

      this._walkTo(node.worldPos);
    }
  }

  _isActionBusy() {
    // Don't block if we're positioning for any ladder movement
    if (this.climbingState && typeof this.climbingState === "object") {
      if (this.climbingState.phase === "positioning") {
        return false; // Allow _executeMove to keep running
      }
      // During actual climbing/descending, we're busy
      return false;
    }

    // Legacy boolean check (if not using phased climbing)
    if (this.climbingState === true) {
      return true;
    }

    return (
      this.placingState ||
      this.breakingState ||
      this.digging ||
      this.toweringState.active ||
      this.interactingState
    );
  }

  /**
   * Place all blocks required for a node, sequentially.
   */
  async _placeBlock(node) {
    const bot = this.bot;
    const blockPlace = getBlockToPlace(bot);

    this._clearAllControls();
    await bot.waitForTicks(5);

    if (this.placingState) {
      if (this.ashfinder.debug)
        console.warn("Already placing blocks, skipping node.");
      return;
    }

    this.placingState = true;

    for (const poss of node.attributes.place) {
      const vec3 = new Vec3(poss.x, poss.y, poss.z);
      const block = bot.blockAt(vec3);

      if (!block || block.boundingBox !== "empty") continue;

      try {
        // Move bot if inside target spot
        const p = bot.entity.position;
        if (
          p.x > block.position.x &&
          p.x < block.position.x + 1 &&
          p.y > block.position.y - 0.1 &&
          p.y < block.position.y + 2 &&
          p.z > block.position.z &&
          p.z < block.position.z + 1
        ) {
          bot.setControlState("back", true);
          await bot.waitForTicks(2);
          bot.setControlState("back", false);
        }

        await equipBlockIfNeeded(bot, blockPlace);
        await placeBlockAtTarget(bot, poss, poss.dir, blockPlace);
      } catch (error) {
        console.error(`Error placing block at ${vec3}:`, error);
      }
    }

    this.placingState = false;
  }

  /**
   * Check if this move requires bridging over a gap
   * @param {Cell} node
   * @returns {boolean}
   */
  _isBridgingMove(node) {
    if (!node.attributes.place?.length) return false;

    // Check if we're placing blocks over empty space (void/gap)
    for (const placePos of node.attributes.place) {
      const blockBelow = this.bot.blockAt(placePos.offset(0, -1, 0));

      // If placing over air/void = bridging
      if (!blockBelow || blockBelow.boundingBox === "empty") {
        return true;
      }
    }

    return false;
  }

  /**
   * Safely bridge across a gap like Baritone
   * @param {Cell} node
   */
  async _safeBridge(node) {
    const bot = this.bot;
    const blockPlace = getBlockToPlace(bot);

    if (!blockPlace) {
      console.warn("No blocks to place for bridging!");
      return;
    }

    this._clearAllControls();
    await bot.waitForTicks(3);

    if (this.placingState) return;

    this.placingState = true;

    try {
      await equipBlockIfNeeded(bot, blockPlace);

      for (const placePos of node.attributes.place) {
        const targetPos = new Vec3(placePos.x, placePos.y, placePos.z);
        const block = bot.blockAt(targetPos);

        if (!block || block.boundingBox !== "empty") continue;

        // --- BARITONE-STYLE BRIDGING ---

        // 1. Position at edge safely
        await this._positionAtEdge(
          targetPos,
          node.attributes.dir || placePos.dir
        );

        // 2. Sneak to prevent falling
        bot.setControlState("sneak", true);
        await bot.waitForTicks(2);

        // 3. Look down at placement position
        await bot.lookAt(targetPos.offset(0.5, 0, 0.5), true);
        await bot.waitForTicks(1);

        // 4. Place block
        try {
          await placeBlock(bot, bot.heldItem?.name, targetPos.floored());

          if (this.ashfinder.debug) {
            console.log(`Bridged block at ${targetPos}`);
          }

          await bot.waitForTicks(2);
        } catch (error) {
          console.error(`Error bridging at ${targetPos}:`, error);
        }

        // 5. Walk onto the placed block carefully
        bot.setControlState("forward", true);
        await bot.waitForTicks(3);
        bot.setControlState("forward", false);
      }

      // Release sneak after bridging
      bot.setControlState("sneak", false);
    } finally {
      this.placingState = false;
      bot.setControlState("sneak", false);
    }
  }

  /**
   * Position the bot at the edge for safe bridging
   * @param {Vec3} targetBlock - Where we want to place
   * @param {Object} direction - Direction vector
   */
  async _positionAtEdge(targetBlock, direction) {
    const bot = this.bot;
    const pos = bot.entity.position;

    // Calculate edge position (move toward target until at edge)
    const dir = direction
      ? new Vec3(direction.x, 0, direction.z).normalize()
      : targetBlock.minus(pos).normalize();

    // Move to edge of current block
    const edgeThreshold = 0.3; // Distance from edge to start placing

    while (true) {
      const currentPos = bot.entity.position;
      const distToTarget = currentPos.distanceTo(targetBlock);

      // Check if we're at appropriate distance
      if (distToTarget < 1.2 && distToTarget > 0.8) {
        break; // Good position
      }

      // Check if we're about to fall
      const blockAhead = bot.blockAt(
        currentPos.offset(dir.x * 0.5, -1, dir.z * 0.5).floored()
      );

      if (!blockAhead || blockAhead.boundingBox === "empty") {
        // At edge, stop
        break;
      }

      // Move forward slightly
      bot.lookAt(targetBlock.offset(0.5, 0, 0.5), true);
      bot.setControlState("forward", true);
      await bot.waitForTicks(1);
      bot.setControlState("forward", false);
      await bot.waitForTicks(1);
    }

    bot.setControlState("forward", false);
  }

  _isInWater() {
    const bot = this.bot;
    const headBlock = bot.blockAt(bot.entity.position.offset(0, 1, 0));
    const bodyBlock = bot.blockAt(bot.entity.position);

    return (
      (headBlock && headBlock.name === "water") ||
      (bodyBlock && bodyBlock.name === "water")
    );
  }

  /**
   * Checks if a move requires getting out of water
   */
  _isWaterExitMove(node) {
    if (!node.parent) return false;

    const fromY = node.parent.worldPos.y;
    const toY = node.worldPos.y;

    // Moving up from water level suggests exiting water
    return toY > fromY && this._isInWater();
  }

  _onGoalReached() {
    // Check if we're following an entity
    if (this.ashfinder.following?.active) {
      const entity = this.ashfinder.following.entity;
      const distance = this.ashfinder.following.distance;

      if (!entity.isValid) {
        this.ashfinder.stopFollowing();
        return;
      }

      const currentDist = this.bot.entity.position.distanceTo(entity.position);

      // If entity is still far, keep following
      if (currentDist > distance) {
        if (this.ashfinder.debug) {
          console.log(
            `Entity moved, continuing follow (dist: ${currentDist.toFixed(1)})`
          );
        }

        const { GoalNear } = require("./goal");
        const goal = new GoalNear(entity.position, distance);

        this.findPathToGoal(goal).catch(() => {
          this.ashfinder.stopFollowing();
        });
        return;
      }
    }

    // If this was a waypoint, don't stop - the waypoint planner will continue
    if (this.currentWaypoint) {
      if (this.ashfinder.debug) {
        console.log(
          `Reached waypoint ${this.waypointIndex}, ready for next segment`
        );
      }

      this.ashfinder.emit("waypoint-reached", {
        waypoint: this.currentWaypoint,
        index: this.waypointIndex,
      });

      if (this.resolveCurrentPromise) {
        this.resolveCurrentPromise();
        this.resolveCurrentPromise = null;
        this.rejectCurrentPromise = null;
        this.currentPromise = null;
      }

      // Don't call stop() - waypoint planner will handle next segment
      this.executing = false;
      this.visitedPositions.clear();
      return;
    }

    // Regular goal reached
    if (this.partial) {
      if (this.ashfinder.debug) console.warn("Reached end of partial path.");
      this.ashfinder.emit("goal-reach-partial", this.goal);
      this.partial = false;
      this._handlePartialPathEnd(this.params.bestNode).catch((err) => {
        if (this.rejectCurrentPromise) {
          this.rejectCurrentPromise(err);
          this.rejectCurrentPromise = null;
          this.resolveCurrentPromise = null;
          this.currentPromise = null;
        }
        this.stop();
        this.ashfinder.stop();
      });
      return;
    }

    this.ashfinder.emit("goal-reach", this.goal);
    if (this.resolveCurrentPromise) {
      this.resolveCurrentPromise();
      this.resolveCurrentPromise = null;
      this.rejectCurrentPromise = null;
      this.currentPromise = null;
    }
    this.stop();
    this.ashfinder.stop();
  }

  async _handlePartialPathEnd(bestNode) {
    const bot = this.bot;
    const currentPos = bot.entity.position.clone().floored();

    if (this.ashfinder.debug) {
      console.log(
        `Partial path ended at ${currentPos}, continuing to ${this.goal.getPosition()}`
      );
    }

    // Pass visited positions to avoid revisiting same areas
    const excludedPositions = Array.from(this.visitedPositions).map((key) => {
      const [x, y, z] = key.split(",").map(Number);
      return new Vec3(x, y, z);
    });

    const endFunc = createEndFunc(this.goal);
    const newPath = await Astar(
      currentPos,
      this.goal.getPosition(),
      this.goal,
      bot,
      endFunc,
      this.ashfinder.config,
      excludedPositions, // Avoid areas we've already explored
      this.ashfinder.debug
    );

    if (newPath.status === "no path") {
      // If no path avoiding visited areas, try again without exclusions
      if (excludedPositions.length > 0) {
        if (this.ashfinder.debug) {
          console.log(
            "No path found avoiding visited areas, trying without exclusions"
          );
        }

        const retryPath = await Astar(
          currentPos,
          this.goal.getPosition(),
          this.goal,
          bot,
          endFunc,
          this.ashfinder.config,
          [],
          this.ashfinder.debug
        );

        if (retryPath.status === "no path") {
          throw new Error(
            "No path found to goal after partial path completion"
          );
        }

        return this.setPath(retryPath.path, {
          partial: retryPath.status === "partial",
          targetGoal: this.goal,
          bestNode: retryPath.bestNode,
        });
      }

      throw new Error("No path found to goal after partial path completion");
    }

    return this.setPath(newPath.path, {
      partial: newPath.status === "partial",
      targetGoal: this.goal,
      bestNode: newPath.bestNode,
    });
  }

  _clearAllControls() {
    const states = [
      "forward",
      "back",
      "left",
      "right",
      "jump",
      "sprint",
      "sneak",
    ];
    for (const state of states) {
      this.bot.setControlState(state, false);
    }
  }

  /**
   *
   * @param {Cell} node
   */
  async _flyTo(node) {
    const bot = this.bot;
    const target = node.worldPos.clone();

    if (!this.isFlying) return;

    const pos = bot.entity.position;
    const dir = target.minus(pos);

    // Calculate velocity based on look direction
    const speed = 1.5;
    const yaw = bot.entity.yaw;
    const pitch = bot.entity.pitch;

    const vx = -Math.sin(yaw) * Math.cos(pitch) * speed;
    const vy = -Math.sin(pitch) * speed;
    const vz = Math.cos(yaw) * Math.cos(pitch) * speed;

    // Look towards target
    await bot.lookAt(target.offset(0.5, 0.5, 0.5), true);

    // Send position packets to move
    bot._client.write("position_look", {
      x: pos.x + vx * 0.05,
      y: pos.y + vy * 0.05,
      z: pos.z + vz * 0.05,
      yaw: bot.entity.yaw,
      pitch: bot.entity.pitch,
      onGround: false,
    });

    bot.setControlState("forward", true);
  }

  async _startPacketFly() {
    if (this.isFlying) return;

    this.isFlying = true;

    let elytra = null;

    const elytraArmor =
      this.bot.inventory.slots[this.bot.getEquipmentDestSlot("torso")];

    if (!elytraArmor || !elytraArmor.name.includes("elytra")) {
      const elytraInv = this.bot.inventory
        .items()
        .find((i) => i.name.includes("elytra"));

      if (!elytraInv) throw new Error("No elytra found!");

      elytra = elytraInv;
      await this.bot.equip(elytra, "torso");
    } else {
      elytra = elytraArmor;
    }

    // Start elytra gliding
    this.bot.setControlState("jump", true);
    this.bot._client.write("entity_action", {
      entityId: this.bot.entity.id,
      actionId: 8, // Start fall flying
      jumpBoost: 0,
    });

    this.elytraFlyingState.active = true;
    this.elytraFlyingState.gliding = true;
  }

  async _stopPacketFly() {
    if (!this.isFlying) return;

    this.isFlying = false;

    // Stop fall flying
    await this.bot.elytraFly();

    this.elytraFlyingState.active = false;
    this.elytraFlyingState.gliding = false;

    if (this.flyingInterval) {
      clearInterval(this.flyingInterval);
      this.flyingInterval = null;
    }
  }

  /**
   * Handles climbing ladders to reach the target node.
   */
  _startClimb(node) {
    const bot = this.bot;
    const target = node.worldPos;

    // Initialize climbing state with phases
    if (!this.climbingState) {
      this.climbingState = { phase: "positioning", target: target.clone() };
    }

    const pos = bot.entity.position;
    const dx = Math.abs(pos.x - target.x);
    const dz = Math.abs(pos.z - target.z);

    // Phase 1: Position in front of ladder
    if (this.climbingState.phase === "positioning") {
      if (dx > 0.25 || dz > 0.25) {
        bot.lookAt(target.offset(0, 1, 0), true);
        bot.setControlState("forward", true);
        if (this.ashfinder.debug) console.log("Positioning for ladder climb");
        return;
      }

      // Positioned! Move to climbing phase
      bot.setControlState("forward", false);
      this.climbingState.phase = "climbing";
      if (this.ashfinder.debug) console.log("Positioned, starting climb");
    }

    // Phase 2: Actually climb
    if (this.climbingState.phase === "climbing") {
      bot.setControlState("forward", true);
      // bot.setControlState("jump", true);
    }
  }

  _startClimbDown(node) {
    const bot = this.bot;
    const target = node.attributes.enterTarget || node.worldPos;

    // Initialize climbing state with phases
    if (!this.climbingState) {
      this.climbingState = { phase: "positioning", target: target.clone() };
    }

    const pos = bot.entity.position;
    const dx = Math.abs(pos.x - target.x);
    const dz = Math.abs(pos.z - target.z);

    // Phase 1: Position to center
    if (this.climbingState.phase === "positioning") {
      if (dx > 0.25 || dz > 0.25) {
        bot.lookAt(target, true);
        bot.setControlState("forward", true);
        if (this.ashfinder.debug) console.log("Positioning for ladder descent");
        return;
      }

      // Centered! Move to descent phase
      bot.setControlState("forward", false);
      this.climbingState.phase = "descending";
      if (this.ashfinder.debug) console.log("Positioned, starting descent");
    }

    // Phase 2: Actually descend
    if (this.climbingState.phase === "descending") {
      bot.lookAt(target.offset(0, -1, 0), true);
      // bot.setControlState("sneak", true);
    }
  }

  /**
   * Sprint-jump across a chain of flat nodes.
   * Auto-skips intermediate nodes to prevent backtracking.
   */
  _sprintJumpLookahead() {
    const bot = this.bot;
    const startIdx = this.currentIndex;
    const startNode = this.path[startIdx];

    if (!startNode) {
      if (this.ashfinder.debug)
        console.warn("No start node for sprint jump lookahead");
      return;
    }

    // Init sprinting state if not already
    if (!this.jumpState) {
      this.jumpState = { jumped: false, timer: 0 };
      bot.setControlState("sprint", true);
      bot.setControlState("forward", true);
    }

    // Always face the final node in the chain (or at least a few nodes ahead)
    const lookAheadIdx = Math.min(startIdx + 3, this.path.length - 1);
    const lookTarget = this.path[lookAheadIdx].worldPos.offset(0, 1.6, 0);
    bot.lookAt(lookTarget, true);

    if (this.currentIndex >= this.path.length) {
      this._onGoalReached();
      return;
    }

    if (startIdx + 1 >= this.path.length) {
      if (this.ashfinder.debug)
        console.warn("No next node for sprint jump lookahead");
      return;
    }

    // Jump timing
    if (
      !this.jumpState.jumped &&
      this._shouldJumpNow(
        startNode.worldPos,
        this.path[startIdx + 1].worldPos,
        bot
      )
    ) {
      bot.setControlState("jump", true);
      this.jumpState.jumped = true;
    }

    if (this.jumpState.jumped) {
      this.jumpState.timer++;
      if (this.jumpState.timer > 5) {
        bot.setControlState("jump", false);
      }
    }

    // --- Skip nodes that we already passed mid-sprint ---
    while (
      this.currentIndex < this.path.length &&
      this._passedNode(this.path[this.currentIndex])
    ) {
      if (this.ashfinder.debug)
        console.log(
          `Sprint chaining: skipping node ${
            this.path[this.currentIndex].worldPos
          }`
        );
      this.currentIndex++;
      this.jumpState = this.jumpState; // keep sprint state alive
    }

    // End sprint chain if terrain changes
    if (
      this.currentIndex >= this.path.length ||
      !this._isStraightFlatRun(this.currentIndex)
    ) {
      if (this.ashfinder.debug) console.log("Sprint chain ended.");
      bot.setControlState("sprint", false);
    }
  }

  /**
   * Checks if the bot has passed a node (used for skipping during sprint chains)
   */
  _passedNode(node) {
    const pos = this.bot.entity.position;
    const target = node.worldPos;

    // If we're still within a reasonable radius, we haven't passed it
    const dx = Math.abs(pos.x - target.x);
    const dz = Math.abs(pos.z - target.z);
    if (dx < 0.35 && dz < 0.35) return false; // Still basically on/near it

    // If there is a parent node, use direction projection
    if (node.parent) {
      const prev = node.parent.worldPos;
      const moveDir = target.minus(prev).normalize(); // Direction we were traveling
      const botOffset = pos.minus(target); // Bot position relative to node

      // Project bot's offset onto movement direction
      const forwardProgress = botOffset.x * moveDir.x + botOffset.z * moveDir.z;

      // Passed node if we're > ~0.25 blocks beyond its center
      return forwardProgress > 0.25;
    }

    // If no parent, fallback: treat being clearly beyond as passed
    return dx > 0.7 || dz > 0.7;
  }

  _isStraightFlatRun(startIndex) {
    let maxLookahead = 3;
    const startNode = this.path[startIndex];

    for (
      let i = 0;
      i < maxLookahead && startIndex + i < this.path.length;
      i++
    ) {
      const node = this.path[startIndex + i];

      // Node must be simple flat forward move
      if (
        node.attributes.name !== "MoveForward" &&
        node.attributes.name !== "MoveDiagonal"
      )
        return false;
      if (node.attributes.place?.length || node.attributes.break?.length)
        return false;
      if (node.worldPos.y !== startNode.worldPos.y) return false;
    }

    return true;
  }

  /**
   * Handles towering (jump + place under feet)
   * @param {Cell} node
   */
  async jumpAndPlaceBlock(node) {
    const bot = this.bot;

    if (this.toweringState.active) return;
    this._clearAllControls();
    this.toweringState.active = true;

    try {
      const blockPlace = getBlockToPlace(bot);

      bot.setControlState("jump", true);

      console.log("one");

      await equipBlockIfNeeded(bot, blockPlace);

      await bot.lookAt(bot.entity.position.offset(0, -1, 0), true);

      while (!bot.entity.onGround) {
        const footPos = bot.entity.position.floored().offset(0.5, -0.5, 0.5);
        const blockBelow = bot.blockAt(footPos);
        if (blockBelow && blockBelow.boundingBox === "empty") {
          try {
            await placeBlockAtTarget(bot, footPos, { x: 0, z: 0 }, blockPlace);
            if (this.ashfinder.debug)
              console.log(`Placed block at ${footPos} while towering`);
          } catch (err) {
            if (this.ashfinder.debug)
              console.warn("Towering place failed, retrying...", err);
          }
        }
        await bot.waitForTicks(1);
      }

      bot.setControlState("jump", false);
    } finally {
      bot.setControlState("jump", false);
      this.toweringState.active = false;
      this.toweringState.phase = 0;
    }
  }

  /**
   * Swims to the specified node with proper vertical control
   * @param {Cell} node - The node to swim to
   */
  _swimTo(node) {
    const bot = this.bot;
    const target = node.attributes.enterTarget
      ? node.attributes.enterTarget
      : node.worldPos;
    const pos = bot.entity.position;

    const attr = node.attributes;
    const yDiff = target.y - pos.y;

    // Initialize swimming state
    if (!this.swimmingState.active) {
      this.swimmingState = {
        active: true,
        sinking: false,
        floating: false,
      };
    }

    // ═══════════════════════════
    // HORIZONTAL MOVEMENT
    // ═══════════════════════════
    const horizontalDist = Math.sqrt(
      Math.pow(target.x - pos.x, 2) + Math.pow(target.z - pos.z, 2)
    );

    if (horizontalDist > 0.3) {
      bot.lookAt(target.offset(0, 0, 0), true);
      bot.setControlState("forward", true);
    } else {
      bot.setControlState("forward", false);
    }

    // ═══════════════════════════
    // VERTICAL MOVEMENT
    // ═══════════════════════════

    // Clear previous vertical controls
    bot.setControlState("jump", false);
    bot.setControlState("sneak", false);

    // Determine if we need to go up or down
    const targetIsAbove = yDiff > 0.3;
    const targetIsBelow = yDiff < -0.3;

    // Check if we're at the surface (head in air, body in water)
    const headBlock = bot.blockAt(pos.offset(0, 1, 0));
    const bodyBlock = bot.blockAt(pos);
    const atSurface = headBlock?.name === "air" && bodyBlock?.name === "water";

    if (attr.up || targetIsAbove) {
      // SWIMMING UP
      bot.setControlState("jump", true);
      this.swimmingState.floating = true;
      this.swimmingState.sinking = false;

      if (this.ashfinder.debug) console.log("Swimming up");
    } else if (attr.down || targetIsBelow) {
      // SWIMMING DOWN
      bot.setControlState("sneak", true);
      this.swimmingState.sinking = true;
      this.swimmingState.floating = false;

      if (this.ashfinder.debug) console.log("Swimming down");
    } else {
      // HORIZONTAL - maintain current depth or surface
      if (atSurface) {
        // Stay at surface
        bot.setControlState("jump", false);
        bot.setControlState("sneak", false);
      } else {
        // Maintain depth with slight upward pressure to avoid sinking
        const velocityY = bot.entity.velocity.y;

        if (velocityY < -0.01) {
          // Sinking - counteract
          bot.setControlState("jump", true);
        } else if (velocityY > 0.05) {
          // Rising - counteract
          bot.setControlState("sneak", true);
        } else {
          // Stable
          bot.setControlState("jump", false);
          bot.setControlState("sneak", false);
        }
      }

      if (this.ashfinder.debug) console.log("Swimming horizontally");
    }

    // ═══════════════════════════
    // EXITING WATER
    // ═══════════════════════════
    if (attr.exitWater) {
      // Climbing out requires extra jump power
      if (attr.climbOut) {
        bot.setControlState("jump", true);
        bot.setControlState("forward", true);
        if (this.ashfinder.debug) console.log("Climbing out of water");
      } else {
        // Just stepping out
        bot.setControlState("forward", true);
        bot.setControlState("jump", false);
        if (this.ashfinder.debug) console.log("Stepping out of water");
      }
    }
  }

  /**
   *
   * @param {Vec3} target
   * @returns
   */
  _walkTo(target) {
    this.bot.lookAt(target.offset(0, 1.6, 0), true);
    this.bot.setControlState("forward", true);
  }

  /**
   *
   * @param {Cell} node
   */
  _simpleJump(node) {
    const bot = this.bot;
    const from = node.parent.worldPos;
    const to = node.worldPos;

    // Look toward jump direction
    bot.lookAt(to.offset(0, 1.6, 0), true);

    // Ensure we're moving forward cleanly
    if (!this.jumpState) {
      this._clearAllControls();
    }

    bot.setControlState("forward", true);

    // Init jump state if needed
    if (!this.jumpState)
      this.jumpState = { jumped: false, timer: 0, isAutoJump: false };

    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const horizontalDist = Math.sqrt(dx * dx + dz * dz);

    // Trigger jump once when reaching edge
    if (!this.jumpState.jumped) {
      const shouldJumpNow = this._shouldJumpNow(
        from.floored(),
        to.floored(),
        bot,
        true
      );
      const shouldAutoJump = this._shouldAutoJump(to, bot);
      const isGapJump = horizontalDist > 0.9 && horizontalDist < 1.4;

      if (shouldJumpNow || shouldAutoJump || isGapJump) {
        this.jumpState.jumped = true;
        this.jumpState.timer = 0;
        this.jumpState.isAutoJump = shouldAutoJump; // Track if this is an auto-jump
        bot.setControlState("jump", true);

        if (this.ashfinder.debug) {
          console.log(`Simple jump triggered (autoJump: ${shouldAutoJump})`);
        }
      }
    }

    // Handle jump timing & reset
    if (this.jumpState.jumped) {
      this.jumpState.timer++;

      // Use longer timer for auto-jumps (climbing up blocks)
      const maxTimer = this.jumpState.isAutoJump ? 8 : 2;

      if (this.jumpState.timer > maxTimer) {
        bot.setControlState("jump", false);

        // Only reset if we're on ground or falling (prevents premature reset mid-air)
        if (bot.entity.onGround || bot.entity.velocity.y < -0.1) {
          this.jumpState = null;

          if (this.ashfinder.debug) {
            console.log("Jump state reset - on ground or falling");
          }
        }
      }
    }
  }

  /**
   *
   * @param {Cell} node
   * @returns
   */
  _sprintJump(node) {
    const bot = this.bot;

    if (!this.jumpState) {
      const canMakeIt = this._canReachJumpTarget(
        node.parent.worldPos,
        node.worldPos,
        true
      );

      if (!canMakeIt) {
        if (this.ashfinder.debug)
          console.warn("Jump simulation failed - attempting anyway");
      }

      if (this.ashfinder.debug)
        console.log("Attempting sprint jump to", node.worldPos);

      this.jumpState = { jumped: false, timer: 0 };

      // NEW: Make sure we're not moving in wrong direction first
      this._clearAllControls();

      bot.setControlState("sprint", true);
      bot.setControlState("forward", true);
    }

    bot.lookAt(node.worldPos.offset(0, 1.6, 0), true);

    if (
      !this.jumpState.jumped &&
      this._shouldJumpNow(
        node.parent.worldPos.floored(),
        node.worldPos.floored(),
        bot,
        false
      )
    ) {
      bot.setControlState("jump", true);
      this.jumpState.jumped = true;
    }

    if (this.jumpState.jumped) {
      this.jumpState.timer++;
      if (this.jumpState.timer > 5) {
        bot.setControlState("jump", false);
        // NEW: Don't stop sprint immediately, let momentum carry
        if (this.jumpState.timer > 10) {
          bot.setControlState("sprint", false);
        }
      }
    }
  }

  /**
   * Break all blocks required for a node, sequentially.
   */
  async _handleBreakingBlocks(node) {
    let promises = [];

    const bot = this.bot;
    this._clearAllControls();

    // and array of directional vec3
    const breakNodes = node.attributes.break;

    this.breakingState = true;

    for (const pos of breakNodes) {
      const block = bot.blockAt(pos);

      // console.log(block.position)

      if (bot.ashfinder.debug)
        showPathParticleEffect(bot, block.position, {
          r: 0.11,
          b: 0.11,
          g: 0.11,
        });

      if (block.boundingBox === "block") {
        promises.push(
          (async () => {
            try {
              if (!this.digging) {
                this.digging = true;

                await autoTool(bot, block);
                await bot.lookAt(block.position.offset(0.5, 0, 0.5), true);
                await dig(bot, block);
                this.digging = false;
              }
            } catch (error) {
              console.error(`Error digging block at ${block.position}:`, error);
              this.digging = false;
            }
          })()
        );
      }
    }

    await Promise.all(promises);

    this.breakingState = false;
  }

  /**
   * Checks if the bot has reached the target node.
   * Considers position, onGround state, and block-specific offsets.
   * @param {Cell} node - The target node to check
   * @param {boolean} ignoreGround - If true, ignores onGround requirement (for swimming/climbing)
   * @returns {boolean} - True if the bot is close enough to the node
   */
  _hasReachedNode(node, ignoreGround = false) {
    const pos = this.bot.entity.position;
    const target = node.worldPos.clone();

    if (this.ashfinder.debug) {
      console.log("Bot Pos");
      console.log(pos.toString());
      console.log("===");
    }

    const block = this.bot.blockAt(node.worldPos);
    const blockName = block?.name ?? "";

    // Special handling for ladder descent entry
    if (node.attributes?.descend && node.attributes?.ladder) {
      // console.log("Ladder Check");
      const centerTarget = node.attributes.enterTarget || target;
      const dx = Math.abs(pos.x - centerTarget.x);
      const dy = Math.abs(pos.y - centerTarget.y);
      const dz = Math.abs(pos.z - centerTarget.z);

      // console.log("Ladder DIST:", dx, dy, dz);

      // More lenient for initial descent positioning
      if (node.attributes.name === "MoveLadderEnterDescend") {
        return dx < 0.2 && dy < 0.55 && dz < 0.2;
      }

      // Tighter tolerance once actively descending
      return dx < 0.45 && dy < 0.55 && dz < 0.45;
    }

    // ═══ SPECIAL HANDLING FOR WATER ═══
    if (node.attributes?.swim || blockName === "water") {
      const dx = Math.abs(pos.x - target.x);
      const dy = Math.abs(pos.y - target.y);
      const dz = Math.abs(pos.z - target.z);

      // More lenient thresholds for swimming
      const horizontalClose = dx < 0.5 && dz < 0.5;
      const verticalClose = dy < 0.6;

      if (this.ashfinder.debug) {
        console.log(
          `Swimming check - dx: ${dx.toFixed(2)}, dy: ${dy.toFixed(
            2
          )}, dz: ${dz.toFixed(2)}`
        );
      }

      return horizontalClose && verticalClose;
    }

    // ═══ REGULAR BLOCK HANDLING ═══
    let yOffset = 0;
    if (blockName.includes("farmland")) yOffset = 0.9375;
    else if (blockName.includes("fence") || blockName.includes("wall"))
      yOffset = 1.5;
    else if (blockName === "soul_sand") yOffset = 0.875;
    else if (blockName === "carpet") yOffset = 0.0625;
    else if (blockName === "snow") yOffset = 0.125;
    else if (blockName.includes("path")) yOffset = 0.9375;

    const topOfBlockY = node.worldPos.y + yOffset;

    const dx = Math.abs(pos.x - target.x);
    const dy = Math.abs(pos.y - topOfBlockY);
    const dz = Math.abs(pos.z - target.z);

    if (this.ashfinder.debug) {
      console.log(`Target block: ${node.worldPos}, top Y: ${topOfBlockY}`);
      console.log(
        `dx: ${dx.toFixed(4)}, dy: ${dy.toFixed(4)}, dz: ${dz.toFixed(4)}`
      );
    }

    const isCloseEnough = dx < 0.35 && dy <= 0.55 && dz < 0.35;

    const isInWater = this._isInWater();
    const isOnGround =
      this.bot.entity.onGround ||
      ignoreGround ||
      isInWater ||
      node.attributes.isFlying;

    return isCloseEnough && isOnGround;
  }
  /**
   * Simulate a jump from `from` to `to` using PlayerState to check feasibility.
   * @param {Vec3} from - Starting block pos
   * @param {Vec3} to - Target block pos
   * @param {boolean} sprint - Should sprint be held?
   * @returns {boolean} - True if simulation lands near `to`
   */
  _canReachJumpTarget(from, to, sprint = false) {
    const bot = this.bot;

    // Create the simulated state from bot + control
    const control = getControlState(bot);
    const state = new PlayerState(bot, control);
    state.pos = from.clone();

    const targetCenter = to;
    const jumpAfterTicks = 2;
    const maxTicks = 30;

    // Build a tick-based controller
    const controller = getController(
      targetCenter,
      true,
      sprint,
      jumpAfterTicks
    );

    // Run simulation until goal or timeout
    const resultState = simulateUntil(
      bot,
      (simState) => {
        const dist = simState.pos.distanceTo(targetCenter);
        return dist < 0.5 && simState.onGround;
      },
      controller,
      maxTicks,
      state
    );

    if (this.ashfinder.debug)
      console.log(
        `Simulation result: pos=${resultState.pos}, onGround=${resultState.onGround}, ticks=${resultState.ticks}`
      );

    const reached =
      resultState.pos.distanceTo(targetCenter) < 0.5 && resultState.onGround;
    return reached;
  }

  /**
   * Determines whether the bot is close enough to the edge to jump.
   * Works for both simple and sprint jumps.
   *
   * @param {Vec3} from - The starting position (node.from)
   * @param {Vec3} to - The target position (node.worldPos)
   * @param {Bot} bot - The Mineflayer bot
   * @param {boolean} [isNJump=false] - Whether this is a nJump move (affects threshold)
   * @returns {boolean}
   */
  _shouldJumpNow(from, to, bot, isNJump = false) {
    const pos = bot.entity.position.clone();

    if (this.ashfinder.debug)
      console.log(`Bot pos: ${pos}, from: ${from}, to: ${to}`);

    // movement direction (xz only)
    const dir = to.minus(from).normalize();
    dir.y = 0;

    // center of current block
    const fromCenter = from.offset(0.5, 0, 0.5);

    // edge point = center + 0.5 * direction
    const edgePoint = fromCenter.offset(dir.x * 0.5, 0, dir.z * 0.5);

    // dist from bot to that edge point (xz only)
    const dx = pos.x - edgePoint.x;
    const dz = pos.z - edgePoint.z;
    const distToEdge = Math.sqrt(dx * dx + dz * dz);

    // margin depends on jump type
    const margin = isNJump ? 0.07 : 0.3;

    if (this.ashfinder.debug) {
      console.log(`distToEdge: ${distToEdge.toFixed(3)}, margin: ${margin}`);
    }

    const onGroundish = bot.entity.onGround || bot.entity.velocity.y < 0.05;
    return onGroundish && distToEdge <= margin;
  }

  /**
   * Determines whether the bot should auto-jump up a 1-block ledge.
   *
   * @param {Vec3} target - The target position the bot is moving toward.
   * @param {import("mineflayer").Bot} bot - The Mineflayer bot.
   * @returns {boolean}
   */
  _shouldAutoJump(target, bot) {
    const pos = bot.entity.position;
    const dir = target.minus(pos).normalize();

    // Where the bot is heading (just in front)
    const frontPos = pos.offset(dir.x, 0, dir.z).floored();

    const blockInFront = bot.blockAt(frontPos);
    const blockAboveFront = bot.blockAt(frontPos.offset(0, 1, 0));
    const blockTwoAboveFront = bot.blockAt(frontPos.offset(0, 2, 0));

    const onGround = bot.entity.onGround;

    // Block in front is 1 block higher than current, and above it is empty
    const canJumpUp =
      blockInFront?.boundingBox === "block" &&
      (!blockAboveFront || blockAboveFront.boundingBox === "empty") &&
      (!blockTwoAboveFront || blockTwoAboveFront.boundingBox === "empty");

    return onGround && canJumpUp;
  }

  stop() {
    this.executing = false;
    this.placedNodes.clear();
    this._clearAllControls();
    this.jumpState = null;
    this.toweringState.active = false;
    this.swimmingState.active = false;
    this.ashfinder.stopped = true;
    this.visitedPositions.clear(); // Clear on stop
    this.lastProgressTime = Date.now();

    if (this.rejectCurrentPromise) {
      this.rejectCurrentPromise(new Error("Path execution was stopped"));
      this.resolveCurrentPromise = null;
      this.rejectCurrentPromise = null;
      this.currentPromise = null;
    }
  }
}

function getBlockToPlace(bot) {
  return bot.inventory
    .items()
    .find((item) => bot.ashfinder.config.disposableBlocks.includes(item.name));
}

async function equipBlockIfNeeded(bot, item) {
  if (!item) {
    console.log("Item is undefined or null");
    return;
  }

  await bot.equip(item, "hand");
}

/**
 * @param {DirectionalVec3} cell
 */
async function placeBlockAtTarget(bot, cell, dir, blockPlace) {
  const pos = cell;
  const block = bot.blockAt(pos);

  const dirVec = new Vec3(dir.x, 0, dir.z);

  try {
    await equipBlockIfNeeded(bot, blockPlace);
    bot.clearControlStates();

    const blockBelow = bot.blockAt(pos.offset(0, -1, 0));
    //TODO: make this not shit
    // const block1 = bot.blockAt(pos.offset(1, 0, 0));
    // const block2 = bot.blockAt(pos.offset(-1, 0, 0));
    // const block3 = bot.blockAt(pos.offset(0, 0, 1));
    // const block4 = bot.blockAt(pos.offset(0, 0, -1));
    // if (
    //   blockBelow.boundingBox === "empty" &&
    //   block1.boundingBox === "empty" &&
    //   block2.boundingBox === "empty" &&
    //   block3.boundingBox === "empty" &&
    //   block4.boundingBox === "empty"
    // ) {
    //   //place a support
    //   await placeBlock(bot, bot.heldItem?.name, blockBelow.position.floored());
    // }

    await placeBlock(bot, bot.heldItem?.name, pos.floored());
  } catch (error) {
    console.error(`Error placing block at ${block.position}:`, error);
  }
}

function showPathParticleEffect(
  bot,
  point,
  colors = { r: 0.2, g: 0.82, b: 0.48 }
) {
  bot.chat(
    `/particle dust{color:[${colors.r}, ${colors.g}, ${colors.b}],scale:1} ${point.x} ${point.y} ${point.z} 0.1 0.1 0.1 1 4 force`
  );
  // bot.chat(
  //   `/particle dust ${colors.r} ${colors.g} ${colors.b} 1 ${point.x} ${point.y} ${point.z} 0.1 0.1 0.1 2 10 force`
  // );
}

function isInteractable(block) {
  if (!block || !block.name) return false;

  const interactableBlocks = new Set([
    // Doors
    "oak_door",
    "birch_door",
    "spruce_door",
    "jungle_door",
    "acacia_door",
    "dark_oak_door",
    "mangrove_door",
    "cherry_door",
    "bamboo_door",
    "iron_door",
    "crimson_door",
    "warped_door",

    // Fence Gates
    "oak_fence_gate",
    "birch_fence_gate",
    "spruce_fence_gate",
    "jungle_fence_gate",
    "acacia_fence_gate",
    "dark_oak_fence_gate",
    "mangrove_fence_gate",
    "cherry_fence_gate",
    "bamboo_fence_gate",
    "crimson_fence_gate",
    "warped_fence_gate",
  ]);

  return interactableBlocks.has(block.name);
}

async function sleep(ms = 2000) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function enableCreativeFlight(bot) {
  const abilities = {
    // Packet structure for client abilities
    flags: 0b00000101, // invulnerable + flying
    flyingSpeed: 0.05,
    walkingSpeed: 0.1,
  };
  bot._client.write("abilities", abilities);
}

function disableCreativeFlight(bot) {
  const abilities = {
    flags: 0b00000001, // invulnerable only
    flyingSpeed: 0.05,
    walkingSpeed: 0.1,
  };
  bot._client.write("abilities", abilities);
}

module.exports = PathExecutor;
