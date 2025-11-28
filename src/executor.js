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
    this.elytraFlyingState = { active: false, gliding: false, liftoff: false };
    this.bridgingState = { active: false, positioning: false, placing: false };
    this.stuckState = { stuck: false, lastNodeTime: Date.now() };

    this.placedNodes = new Set();

    this.executing = false;
    this.partial = false;
    this.goal = null;
    this.pathOptions = null;

    this.placingState = false;
    this.placing = false;
    this.breakingState = false;
    this.digging = false;
    this.config = bot.ashfinder.config || {};
    this.comingFromSJ = false;

    this.currentPromise = null;
    this.resolveCurrentPromise = null;
    this.rejectCurrentPromise = null;

    this.completionPromise = null;
    this.resolveCompletion = null;
    this.rejectCompletion = null;

    this.movePromise = null;

    this.finalGoal = null;

    this.previousNode = null;
    this.previousGravity = bot.physics.gravity;

    this.isFlying = false;
    this.flyingInterval = null;

    this.closingDoorState = false;

    this.currentWaypoint = null;
    this.waypointTolerance = 3; // How close to get to intermediate waypoints

    this.visitedPositions = new Set(); // Track where we've been

    this.params = {};

    this.handlingEnd = false;
    this.handlingStuck = false;

    this.paused = false;
    this.running = false;

    this._startLoop();
  }

  _startLoop() {
    if (this.running) return;
    this.running = true;

    const loop = async () => {
      if (!this.running) return;

      if (!this.paused) this.tick();
      setTimeout(loop, 20);
    };

    loop();
  }

  _startCompletionPromiseIfNeeded() {
    if (!this.completionPromise) {
      this.completionPromise = new Promise((resolve, reject) => {
        this.resolveCompletion = () => {
          if (this.ashfinder.debug)
            console.log("[executor] resolving completion promise");
          resolve();
        };
        this.rejectCompletion = (err) => {
          if (this.ashfinder.debug)
            console.log(
              "[executor] rejecting completion promise:",
              err && err.message
            );
          reject(err);
        };
      });
    }
  }

  /**
   * Set a new path to execute
   * @param {Cell[]} path - Array of nodes with `position` and `action`
   * @param {Object} options
   * @param {boolean} options.partial - Whether this is a partial path
   * @param {Goal} options.targetGoal - The current target goal
   * @param {Cell} options.bestNode - The best node found if path is partial
   * @param {Goal} options.finalGoal - The ultimate goal we're trying to reach (for partial paths)
   * @param {Object} options.pathOptions
   */
  setPath(path, options = {}) {
    const {
      partial = false,
      targetGoal = null,
      bestNode = null,
      pathOptions = null,
    } = options;

    // ensure there's a single completion promise for the whole goto() lifecycle
    this._startCompletionPromiseIfNeeded();

    // configure executor for this path segment
    this.path = path;
    this.currentIndex = 0;
    this.partial = partial;
    this.goal = targetGoal;
    this.params.bestNode = bestNode;
    this.pathOptions = pathOptions;
    this.executing = true;
    this.handlingEnd = false; // new path = new flow
    this.handlingStuck = false;
    this.stuckState = { stuck: false, lastNodeTime: Date.now() };

    if (this.ashfinder.debug) {
      console.log(
        `${
          partial ? "Executing partial" : "Executing full"
        } path to ${targetGoal}`
      );
    }

    // return the single completion promise (same across replans)
    return this.completionPromise;
  }

  /**
   * Called on every physics tick
   */
  async tick() {
    if (!this.executing) return;

    // prevent duplicate end triggers
    if (this.handlingEnd) return;

    if (this.handlingStuck) return;

    if (this.closingDoorState) return;

    if (this.currentIndex >= this.path.length) {
      this.handlingEnd = true;
      this._onPathEnd();
      return;
    }

    if (this.stuckState.stuck && !this.handlingStuck) {
      this.handlingStuck = true;
      this.handleStuck();
      return;
    }

    const node = this.path[this.currentIndex];
    if (this._isActionBusy()) return;

    const reached = this._hasReachedNode(node);
    if (reached) {
      this.currentIndex++;
      this.jumpState = null;
      this.comingFromSJ = false;
      this._clearAllControls();

      if (
        this.previousNode &&
        this.previousNode.attributes.interact &&
        this.ashfinder.config.closeInteractables &&
        !this.closingDoorState
      ) {
        let block = this.bot.blockAt(this.previousNode.worldPos);
        await this.bot.lookAt(node.worldPos, true);
        this.closingDoorState = true;
        if (block.getProperties().open) {
          await this.bot.activateBlock(block);
          block = this.bot.blockAt(this.previousNode.worldPos);
          await this.bot.waitForTicks(1);
        }

        this.closingDoorState = false;
      }

      this.previousNode = node;
      this.stuckState.lastNodeTime = Date.now();

      if (this.currentIndex >= this.path.length) {
        this.handlingEnd = true;
        this._onPathEnd();
      }
      return;
    }

    this.updateStuckState();

    this._executeMove(node);
  }

  updateStuckState() {
    //basically we just check time diff
    const currentTime = Date.now();
    const timeSinceLastNode = currentTime - this.stuckState.lastNodeTime;

    if (timeSinceLastNode >= this.ashfinder.config.stuckTimeout) {
      console.log("Ashfinder is stuck cuz its very noob!");
      console.log("replanning!");

      this.stuckState.stuck = true;
    }
  }

  async handleStuck() {
    try {
      const newPath = await this._generateNextPath();
      this.setPath(newPath.path, {
        partial: newPath.status === "partial",
        targetGoal: this.goal,
        bestNode: newPath.bestNode,
        pathOptions: this.pathOptions,
      });
    } catch (error) {
      console.log("Failed to generate a path");
      console.error(error);
    }
  }

  async _onPathEnd() {
    try {
      if (this.partial) {
        this.partial = false;
        const newPath = await this._generateNextPath();
        this.setPath(newPath.path, {
          partial: newPath.status === "partial",
          targetGoal: this.goal,
          bestNode: newPath.bestNode,
          pathOptions: this.pathOptions,
        });
      } else {
        this._resolveCompletion();
        this.executing = false;
      }
    } finally {
      this.handlingEnd = false; // always release lock after handling
    }
  }

  async _generateNextPath() {
    // if you want to pass exclusions use this.visitedPositions -> pathOptions currently
    const newPath = await this.ashfinder.generatePath(
      this.goal,
      this.pathOptions
    );
    if (newPath.status === "no path") {
      throw new Error("No path found after partial path");
    }
    return newPath;
  }

  _resolveCompletion() {
    if (this.resolveCompletion) {
      try {
        this.resolveCompletion();
      } finally {
        this._clearCompletion();
      }
    }
  }

  _rejectCompletion(err) {
    if (this.rejectCompletion) {
      try {
        this.rejectCompletion(err);
      } finally {
        this._clearCompletion();
      }
    }
  }

  _clearCompletion() {
    this.completionPromise = null;
    this.resolveCompletion = null;
    this.rejectCompletion = null;
  }

  /**
   * Set the configuration for the path executor
   * @param {Object} config - Configuration object
   */
  setConfig(config) {
    this.config = config;
  }

  resetStates() {
    this.placingState = false;
    this.placing = false;
    this.breakingState = false;
    this.digging = false;
    this.toweringState = { active: false, phase: 0 };
    this.swimmingState = { active: false, sinking: false, floating: false };
    this.elytraFlyingState = { active: false, gliding: false };
    this.stuckState = { stuck: false, stuckTimer: 0, lastNodeTime: 0 };
    this.climbingState = false;
    this.climbingTarget = null;
    this.interactingState = false;
    this.jumpState = null;
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
        `Executing move: ${node.attributes.name} (cost:${node.attributes.cost}) at ${node.worldPos} (${attributes.place?.length} places, ${attributes.break?.length} breaks)`
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
      if (this.ashfinder.debug) console.log("Sprint jumping");
      await this._sprintJump(node);
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

      if (this.ashfinder.debug) console.log("simple jumping");

      await this._simpleJump(node);
    } else if (attributes.ladder) {
      if (attributes.descend) {
        this._startClimbDown(node);
      } else this._startClimb(node);

      return;
    } else if (
      attributes.interact &&
      !this.interactingState &&
      attributes.interactBlock
    ) {
      const block = this.bot.blockAt(attributes.interactBlock);
      const isOpen = block?.getProperties()?.open;

      this.interactingState = true;

      try {
        // 1. Look at trapdoor
        await this.bot.lookAt(block.position, true);
        await this.bot.waitForTicks(1);

        // 2. Toggle trapdoor state
        await this.bot.activateBlock(block);
        await this.bot.waitForTicks(2);

        // 3. If trapdoor is now HORIZONTAL, we gotta enter crawl mode
        const updated = this.bot.blockAt(block.position);
        const nowOpen = updated?.getProperties()?.open;

        const isHorizontal = nowOpen; // (for trapdoors, open = horizontal)

        if (isHorizontal) {
          // 4. Walk under trapdoor
          this._walkTo(node.worldPos);
          await this.bot.waitForTicks(5);

          this._clearAllControls();

          await this.bot.waitForTicks(2);

          await this.bot.lookAt(block.position, true);
          await this.bot.activateBlock(block);

          await this.bot.waitForTicks(8);
        }
      } catch (err) {
        console.log("Trapdoor interaction fail:", err);
      } finally {
        this.interactingState = false;
      }

      return;
    } else if (attributes.ascend) {
      if (
        !this.toweringState.active &&
        !this.placedNodes.has(node.worldPos.toString())
      ) {
        this._clearAllControls();
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
        const targetBlock = await this._positionAtEdge(
          targetPos,
          node.direction || placePos.dir
        );

        if (!targetBlock) {
          console.log("put a bullet in my head");
          break;
        }

        // 2. Sneak to prevent falling
        bot.setControlState("sneak", true);
        await bot.waitForTicks(2);

        // 3. Look at the closest face in the direction of placeDir
        const placeDir = node.parent.worldPos
          .clone()
          .minus(targetBlock.position.clone())
          .normalize();

        const faces = [
          { normal: new Vec3(1, 0, 0), offset: new Vec3(1, 0.5, 0.5) }, // east
          { normal: new Vec3(-1, 0, 0), offset: new Vec3(0, 0.5, 0.5) }, // west
          { normal: new Vec3(0, 1, 0), offset: new Vec3(0.5, 1, 0.5) }, // up
          { normal: new Vec3(0, -1, 0), offset: new Vec3(0.5, 0, 0.5) }, // down
          { normal: new Vec3(0, 0, 1), offset: new Vec3(0.5, 0.5, 1) }, // south
          { normal: new Vec3(0, 0, -1), offset: new Vec3(0.5, 0.5, 0) }, // north
        ];

        let bestFace = null;
        let bestDot = -Infinity;

        for (const face of faces) {
          const dot = placeDir.dot(face.normal);
          if (dot > bestDot) {
            bestDot = dot;
            bestFace = face;
          }
        }

        // safety fallback
        if (!bestFace) {
          bestFace = faces[3]; // look down
        }

        // compute target look point
        const facePoint = targetPos.clone().add(bestFace.offset);

        // actually look there
        await bot.lookAt(facePoint, true);
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
    let pos = bot.entity.position;

    await this.bot.lookAt(targetBlock.offset(0, 1.5, 0));

    bot.setControlState("sneak", true);
    bot.setControlState("forward", true);

    let blockAtFeet = bot.blockAt(pos.floored().offset(0, -1, 0));

    while (blockAtFeet.boundingBox !== "empty") {
      pos = bot.entity.position;
      blockAtFeet = bot.blockAt(pos.floored().offset(0, -1, 0));
      await bot.waitForTicks(1);
    }

    return blockAtFeet;
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
   * Hover at a specific position using velocity adjustments
   * @param {Vec3} target - Target position to hover at
   * @param {Object} options - Hover configuration
   */
  _hoverAt(target, options = {}) {
    const bot = this.bot;
    const pos = bot.entity.position;
    const vel = bot.entity.velocity;

    const {
      stiffness = 0.3, // How aggressively to correct position (0-1)
      damping = 0.7, // Velocity damping to prevent oscillation (0-1)
      maxCorrection = 0.5, // Max velocity correction per tick
      tolerance = 0.1, // Distance at which hovering is "good enough"
    } = options;

    // Calculate position error
    const dx = target.x - pos.x;
    const dy = target.y - pos.y;
    const dz = target.z - pos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist < tolerance) {
      // We're close enough - just kill velocity to stay put
      bot.entity.velocity.set(
        vel.x * damping,
        vel.y * damping,
        vel.z * damping
      );
      return true; // Hovering successfully
    }

    // Calculate desired velocity to reach target (proportional control)
    const desiredVelX = dx * stiffness;
    const desiredVelY = dy * stiffness;
    const desiredVelZ = dz * stiffness;

    // Calculate velocity correction needed
    const correctionX = desiredVelX - vel.x;
    const correctionY = desiredVelY - vel.y;
    const correctionZ = desiredVelZ - vel.z;

    // Clamp corrections to prevent overshooting
    const clamp = (val, max) => Math.max(-max, Math.min(max, val));
    const limitedCorrectionX = clamp(correctionX, maxCorrection);
    const limitedCorrectionY = clamp(correctionY, maxCorrection);
    const limitedCorrectionZ = clamp(correctionZ, maxCorrection);

    // Apply velocity correction with damping
    bot.entity.velocity.set(
      vel.x + limitedCorrectionX,
      vel.y + limitedCorrectionY,
      vel.z + limitedCorrectionZ
    );

    // Counter gravity for Y-axis stability
    const gravityCompensation = 0.08; // Roughly matches Minecraft gravity
    bot.entity.velocity.y += gravityCompensation;

    return false; // Still moving to hover position
  }

  /**
   * Fly to a node using elytra with direct velocity control
   * @param {Cell} node
   */
  async _flyTo(node) {
    const bot = this.bot;
    const target = node.worldPos.clone();
    const pos = bot.entity.position;

    if (!this.isFlying) return;

    if (!this.elytraFlyingState.active) return;

    const direction = node.attributes.flyDirection ?? "forward";
    const vel = bot.entity.velocity;

    // HOVER MODE - velocity-based position hold
    const isStable = this._hoverAt(target, {
      stiffness: 0.4,
      damping: 0.65,
      maxCorrection: 0.6,
      tolerance: 0.15,
    });

    if (isStable && this.ashfinder.debug) {
      console.log("Stable hover achieved");
    }

    // // Calculate direction to target
    // const dx = target.x - pos.x;
    // const dy = target.y - pos.y;
    // const dz = target.z - pos.z;
    // const horizontalDist = Math.sqrt(dx * dx + dz * dz);
    // const totalDist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // // Normalize direction
    // const dirX = dx / Math.max(totalDist, 0.01);
    // const dirY = dy / Math.max(totalDist, 0.01);
    // const dirZ = dz / Math.max(totalDist, 0.01);

    // // Elytra physics constants
    // const baseSpeed = 0.6; // Base horizontal gliding speed
    // const maxSpeed = 1.5; // Max safe speed
    // const liftForce = 0.12; // Upward force when climbing
    // const gravityCounter = 0.04; // Counter gravity during horizontal flight

    // if (direction === "up" || dy > 1) {
    //   // CLIMBING - need strong upward velocity
    //   const targetVelX = dirX * baseSpeed * 0.8;
    //   const targetVelY = Math.max(0.3, dirY * 0.5 + liftForce);
    //   const targetVelZ = dirZ * baseSpeed * 0.8;

    //   bot.entity.velocity.set(
    //     vel.x * 0.7 + targetVelX * 0.3, // Smooth transition
    //     targetVelY,
    //     vel.z * 0.7 + targetVelZ * 0.3
    //   );
    // } else if (direction === "down" || dy < -1) {
    //   // DESCENDING - let gravity help, control speed
    //   const currentSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);

    //   if (currentSpeed > maxSpeed) {
    //     // Air brake
    //     bot.entity.velocity.set(vel.x * 0.9, vel.y, vel.z * 0.9);
    //   } else {
    //     // Maintain downward trajectory
    //     const targetVelX = dirX * baseSpeed * 1.2;
    //     const targetVelZ = dirZ * baseSpeed * 1.2;

    //     bot.entity.velocity.set(
    //       vel.x * 0.8 + targetVelX * 0.2,
    //       Math.min(vel.y, -0.2), // Ensure descending
    //       vel.z * 0.8 + targetVelZ * 0.2
    //     );
    //   }
    // } else {
    //   // HORIZONTAL FLIGHT - maintain altitude and speed
    //   const targetVelX = dirX * baseSpeed;
    //   const targetVelZ = dirZ * baseSpeed;

    //   // Counter gravity to maintain altitude
    //   const altitudeCorrection = dy > 0.5 ? gravityCounter : -gravityCounter;

    //   bot.entity.velocity.set(
    //     vel.x * 0.85 + targetVelX * 0.15,
    //     vel.y + altitudeCorrection,
    //     vel.z * 0.85 + targetVelZ * 0.15
    //   );

    //   // Speed maintenance
    //   const currentSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
    //   if (currentSpeed < 0.3) {
    //     // Boost to prevent stall
    //     const boostFactor = 0.3 / Math.max(currentSpeed, 0.1);
    //     bot.entity.velocity.set(
    //       vel.x * boostFactor,
    //       vel.y - 0.05, // Slight dive to gain speed
    //       vel.z * boostFactor
    //     );
    //   }
    // }

    // // Look at target (visual only, doesn't affect flight)
    // await bot.lookAt(target, false);
  }

  async _startPacketFly() {
    if (this.isFlying) return;
    this.isFlying = true;

    const bot = this.bot;
    let elytra = null;

    // Equip elytra
    const elytraArmor = bot.inventory.slots[bot.getEquipmentDestSlot("torso")];

    if (!elytraArmor || !elytraArmor.name.includes("elytra")) {
      const elytraInv = bot.inventory
        .items()
        .find((i) => i.name.includes("elytra"));

      if (!elytraInv) throw new Error("No elytra found!");

      elytra = elytraInv;
      await bot.equip(elytra, "torso");
    } else {
      elytra = elytraArmor;
    }

    // Phase 1: Liftoff - jump until airborne
    if (this.ashfinder.debug) console.log("Starting elytra liftoff...");

    bot.setControlState("jump", true);

    // Wait until we're in the air and have some upward velocity
    let liftoffAttempts = 0;
    const maxLiftoffAttempts = 40; // ~2 seconds at 20 ticks/sec

    while (bot.entity.onGround && liftoffAttempts < maxLiftoffAttempts) {
      await bot.waitForTicks(1);
      liftoffAttempts++;
    }

    if (bot.entity.onGround) {
      bot.setControlState("jump", false);
      this.isFlying = false;
      throw new Error("Failed to lift off for elytra flight");
    }

    // Keep jumping a bit more to gain height
    await bot.waitForTicks(3);
    bot.setControlState("jump", false);

    // Phase 2: Activate elytra mid-air
    if (this.ashfinder.debug) console.log("Activating elytra glide...");

    // Wait for falling state (velocity going down)
    let fallWaitTicks = 0;
    while (bot.entity.velocity.y > 0 && fallWaitTicks < 20) {
      await bot.waitForTicks(1);
      fallWaitTicks++;
    }

    // Manually trigger elytra using packet
    try {
      bot._client.write("entity_action", {
        entityId: bot.entity.id,
        actionId: 8, // Start elytra flying
        jumpBoost: 0,
      });

      if (this.ashfinder.debug) console.log("Elytra packet sent");

      // Wait for elytra state to activate
      let elytraWaitTicks = 0;
      while (!bot.entity.elytraFlying && elytraWaitTicks < 20) {
        await bot.waitForTicks(1);
        elytraWaitTicks++;

        // Retry packet if not working
        if (elytraWaitTicks % 5 === 0) {
          bot._client.write("entity_action", {
            entityId: bot.entity.id,
            actionId: 8,
            jumpBoost: 0,
          });
        }
      }

      if (!bot.entity.elytraFlying) {
        console.warn("Elytra did not activate, but continuing anyway");
      }

      this.elytraFlyingState.active = true;
      this.elytraFlyingState.gliding = true;
      this.elytraFlyingState.liftoff = true;

      // Phase 3: Initial velocity boost for stable glide
      const vel = bot.entity.velocity;
      const yaw = bot.entity.yaw;

      // Give forward momentum in the direction we're facing
      const forwardX = -Math.sin(yaw) * 0.3;
      const forwardZ = -Math.cos(yaw) * 0.3;

      bot.entity.velocity.set(
        forwardX,
        Math.max(vel.y, -0.1), // Gentle descent or maintain altitude
        forwardZ
      );

      if (this.ashfinder.debug) {
        console.log(
          `Elytra flying activated! State: ${bot.entity.elytraFlying}`
        );
      }
    } catch (error) {
      console.error("Error activating elytra:", error);
      this.isFlying = false;
      this.elytraFlyingState.active = false;
      throw error;
    }
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

    const placePos = node.attributes.place[0];
    //make sure we are actually FUCKING STANDING WHERE WE NEED TO BE
    await bot.lookAt(placePos, true);
    let dist = bot.entity.position.distanceTo(placePos);

    while (dist > 0.67) {
      // console.log(dist);
      bot.setControlState("forward", true);
      await bot.lookAt(placePos, true);
      dist = bot.entity.position.distanceTo(placePos);
      await bot.waitForTicks(1);
    }

    this._clearAllControls();

    try {
      const blockPlace = getBlockToPlace(bot);

      bot.setControlState("jump", true);

      // console.log("one");

      await equipBlockIfNeeded(bot, blockPlace);

      await bot.lookAt(node.worldPos.offset(0, -1, 0), true);

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
    this.bot.setControlState("sprint", true);
    this.bot.setControlState("forward", true);
  }

  /**
   *
   * @param {Cell} node
   */
  async _simpleJump(node) {
    const bot = this.bot;
    const from = node.parent.worldPos;
    const to = node.worldPos;

    // Look toward jump direction
    await bot.lookAt(to.offset(0, 1.5, 0), true);

    if (this.jumpState && this.jumpState.jumped) return;

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
        true,
        node.attributes?.up ?? false
      );
      const shouldAutoJump = this._shouldAutoJump(to, bot);
      const isGapJump = horizontalDist > 0.9 && horizontalDist < 1.4;

      if (shouldJumpNow || shouldAutoJump || isGapJump) {
        this.jumpState.jumped = true;
        this.jumpState.timer = 0;
        this.jumpState.isAutoJump = shouldAutoJump; // Track if this is an auto-jump
        bot.setControlState("jump", true);

        if (this.ashfinder.debug) {
          console.log(
            `Simple jump triggered (autoJump: ${shouldAutoJump}) (shouldJumpNow: ${shouldJumpNow}) (GapJump:${isGapJump})`
          );
        }
      }
    }

    // Handle jump timing & reset
    if (this.jumpState.jumped) {
      this.jumpState.timer++;

      // Use longer timer for auto-jumps (climbing up blocks)
      const maxTimer = this.jumpState.isAutoJump ? 3 : 10;

      if (this.jumpState.timer > maxTimer) {
        bot.setControlState("jump", false);
        this.jumpState = null;
      }
    }
  }

  /**
   *
   * @param {Cell} node
   * @returns
   */
  async _sprintJump(node) {
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

      this._clearAllControls();

      bot.setControlState("sprint", true);
      bot.setControlState("forward", true);
    }

    await bot.lookAt(node.worldPos.offset(0, 1.6, 0), true);
    // await bot.waitForTicks(1);

    if (
      !this.jumpState.jumped &&
      this._shouldJumpNow(
        node.parent.worldPos.floored(),
        node.worldPos.floored(),
        bot,
        false,
        node.attributes?.up ?? false
      )
    ) {
      bot.setControlState("jump", true);
      this.jumpState.jumped = true;
    }

    if (this.jumpState.jumped) {
      this.jumpState.timer++;
      const dist = node.parent.worldPos.xzDistanceTo(node.worldPos);
      let jumpTime = 5;
      if (dist === 4) {
        jumpTime = 15;
      }

      // console.log(dist);

      if (this.jumpState.timer > jumpTime) {
        this._clearAllControls();
        this.comingFromSJ = true;
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

    const horizontalThresh = this.comingFromSJ ? 0.45 : 0.35;

    const isCloseEnough =
      dx < horizontalThresh && dy <= 0.55 && dz < horizontalThresh;

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
   * @param {boolean} [up=false]
   * @returns {boolean}
   */
  _shouldJumpNow(from, to, bot, isNJump = false, up = false) {
    const pos = bot.entity.position.clone();
    const vel = bot.entity.velocity.clone(); // horizontal speed matters
    const dt = 1 / 20; // one tick

    const centerOfBlock = from.offset(0.5, 0, 0.5);
    const near = (a, b, tol) => a.distanceTo(b) <= tol;

    // jump edge tuning
    let idealEdgeDist = up ? 0.55 : 0.45;
    const baseTolerance = 0.28;

    // compute direction
    const dir = to.clone().subtract(from);
    if (dir.x === 0 && dir.z === 0) {
      return near(centerOfBlock, pos, 0.35);
    }

    if (dir.x >= 2 || dir.z >= 2) {
      idealEdgeDist = 0.25;
    }

    const dirFlat = dir.clone();
    dirFlat.y = 0;
    dirFlat.normalize();

    // the "perfect" jump point
    const idealJumpPoint = centerOfBlock.offset(
      dirFlat.x * idealEdgeDist,
      0,
      dirFlat.z * idealEdgeDist
    );

    // Horizontal velocity along the jump direction
    const horizVel = vel.clone();
    horizVel.y = 0;

    const speedTowardEdge = horizVel.dot(dirFlat); // signed speed

    // how far we are from jump point rn
    const distToEdge = pos.distanceTo(idealJumpPoint);

    // how far we will move next tick (before jump triggers)
    const predictedMove = Math.max(speedTowardEdge * dt, 0);

    // dynamic tolerance
    const dynamicTol = baseTolerance + Math.min(predictedMove * 1.4, 0.15);
    // fast = looser, slow = tighter

    // final decision
    return Math.abs(distToEdge - predictedMove) <= dynamicTol;
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

  stop(reason = "death") {
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
      this.rejectCurrentPromise(reason);
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
