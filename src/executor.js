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

    this.params = {};
    this.moveState = null; // <-- current move action lock

    this.bot.on("physicsTick", () => {
      if (this.executing) this.tick();
    });
  }

  /**
   * Set the configuration for the path executor
   * @param {Object} config - Configuration object
   */
  setConfig(config) {
    this.config = config;
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
  setPath(
    path,
    {
      partial = false,
      targetGoal = null,
      bestNode = null,
      finalGoal = null,
    } = {}
  ) {
    if (!this.currentPromise) {
      this.currentPromise = new Promise((resolve, reject) => {
        this.resolveCurrentPromise = resolve;
        this.rejectCurrentPromise = reject;
      });
    }

    this.finalGoal = finalGoal || targetGoal;

    this.path = path;
    this.currentIndex = 0;
    this.jumpState = null;
    this.executing = true;
    this.partial = partial;
    this.goal = targetGoal;

    if (this.ashfinder.debug)
      console.log(partial ? "Executing partial path" : "Executing full path");

    if (bestNode) {
      this.params.bestNode = bestNode;
    }

    return this.currentPromise;
  }

  /**
   * Called on every physics tick
   */
  tick() {
    if (!this.executing) return;

    const stillMoving = this._progressPath();
    if (!stillMoving) return;

    const node = this.path[this.currentIndex];
    if (!this._isBusy()) {
      this._executeMove(node); // async runs sequentially
    }
  }

  _progressPath() {
    while (
      this.currentIndex < this.path.length &&
      this._passedNode(this.path[this.currentIndex])
    ) {
      if (this.ashfinder.debug)
        console.log(
          `Skipping overshot node ${this.path[this.currentIndex].worldPos}`
        );
      this.currentIndex++;
      this.jumpState = null;
      this.bot.clearControlStates();
    }

    if (this.currentIndex >= this.path.length) {
      this._onGoalReached();
      return false;
    }

    const node = this.path[this.currentIndex];
    if (
      this._hasReachedNode(
        node,
        this.jumpState?.jumped || this.swimmingState
      ) &&
      !this._isBusy()
    ) {
      if (this.ashfinder.debug)
        console.log(`Reached node ${node.worldPos}, advancing index`);
      this.currentIndex++;
      this.jumpState = null;
      this.bot.clearControlStates();

      if (this.currentIndex >= this.path.length) {
        this._onGoalReached();
        return false;
      }
    }

    return true;
  }

  _onGoalReached() {
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
    // console.log(bestNode)
    const lastNode = this.path[this.path.length - 1];
    const pos = lastNode.worldPos;
    const bot = this.bot;

    //Create a new path from the promising node to the goal
    if (bestNode) {
      const endFunc = createEndFunc(this.goal);

      const targetPathFromPromising = await Astar(
        bestNode.worldPos,
        this.goal.position,
        bot,
        endFunc,
        this.ashfinder.config,
        [],
        this.ashfinder.debug
      );

      if (targetPathFromPromising.status === "found") {
        const pathToPromising = await Astar(
          bot.entity.position.clone().floored(),
          bestNode.worldPos,
          bot,
          (pos) => pos.equals(bestNode.worldPos),
          this.ashfinder.config,
          [],
          this.ashfinder.debug
        );

        if (pathToPromising.status === "found") {
          const fullPath = [
            ...pathToPromising.path,
            ...targetPathFromPromising.path.slice(1), // avoid repeating the connecting node
          ];

          // Execute the full joined path
          return this.setPath(fullPath);
        }
      }
    }

    // If no promising node or path found, just recalculate from current position
    const endFunc = createEndFunc(this.goal);
    const newPath = await Astar(
      bot.entity.position.clone().floored(),
      this.goal.position,
      bot,
      endFunc,
      this.config,
      [],
      this.ashfinder.debug
    );

    return this.setPath(newPath.path, {
      partial: newPath.status === "partial",
      targetGoal: this.goal,
      bestNode: newPath.bestNode,
    });
  }

  /**
   * Executes the current move
   * @param {Cell} node
   */
  async _executeMove(node) {
    if (this.moveState) return; // already executing this move
    this.moveState = node;

    if (this.ashfinder.debug)
      console.log(
        `Executing move: ${node.attributes.name} at ${node.worldPos}`
      );

    const attributes = node.attributes;

    try {
      if (attributes.swimming) {
        this._swimTo(node);
        return;
      }

      if (attributes.sJump) {
        const dist = attributes.dist || 1;
        this._sprintJump(node);
        if (this.ashfinder.debug) console.log("Executing a jump!");
        return;
      }

      if (attributes.nJump) {
        // Handle breaking first
        if (attributes.break?.length > 0) {
          await this._handleBreakingBlocks(node);
        }

        // Then block placement
        if (attributes.place?.length > 0) {
          await this._placeBlock(node);
        }

        // Finally jump
        this._simpleJump(node);
        return;
      }

      // --- Normal moves ---
      if (attributes.place?.length > 0) {
        if (attributes.ascend) {
          this._walkTo(node.worldPos);
          await this.jumpAndPlaceBlock(node);
        } else {
          await this._placeBlock(node);
        }
      }

      if (attributes.break?.length > 0) {
        await this._handleBreakingBlocks(node);
      }

      const block = this.bot.blockAt(node.worldPos);
      if (
        attributes.interact &&
        isInteractable(block) &&
        !block.getProperties().open
      ) {
        await this.bot.activateBlock(block);
      }

      if (attributes.ladder) {
        await this._climbLadder(node);
        return;
      }

      this._walkTo(node.worldPos);
    } finally {
      this.moveState = null; // unlock
    }
  }

  /**
   * Handles climbing ladders to reach the target node.
   */
  async _climbLadder(node) {
    const bot = this.bot;
    const target = node.worldPos;

    // Always face the ladder
    bot.lookAt(target.offset(0.5, 1.0, 0.5), true);

    // Start holding forward
    bot.setControlState("forward", true);

    // Decide climb direction
    if (node.worldPos.y > bot.entity.position.y) {
      // climbing up
      bot.setControlState("jump", true);
    } else {
      // climbing down
      bot.setControlState("sneak", true);
    }

    // Wait until we are close enough to the node center
    while (!this._hasReachedNode(node, true)) {
      await bot.waitForTicks(1);
    }

    // Stop movement
    bot.setControlState("forward", false);
    bot.setControlState("jump", false);
    bot.setControlState("sneak", false);
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
   *
   * @param {Cell} node
   */
  async jumpAndPlaceBlock(node) {
    const bot = this.bot;

    if (!this.toweringState.active) {
      this.toweringState.active = true;
      this.toweringState.phase = 0;
      bot.setControlState("jump", true);
      return;
    }

    // Wait until in the air
    if (this.toweringState.phase === 0) {
      const blockBelow = bot.blockAt(bot.entity.position.offset(0, -1, 0));
      if (blockBelow.name === "air") {
        this.toweringState.phase = 1;
      }
      return;
    }

    // Now in the air, place block
    if (this.toweringState.phase === 1) {
      bot.setControlState("jump", false); // Cancel jump hold
      const blockPos = bot.entity.position.offset(0, -1, 0).floored();
      const blockPlace = getBlockToPlace(bot);

      try {
        await equipBlockIfNeeded(bot, blockPlace);
        await placeBlockAtTarget(bot, blockPos, new Vec3(0, 1, 0), blockPlace);
      } catch (e) {
        console.warn("Towering block place failed:", e);
      }

      this.toweringState.active = false;
      this.toweringState.phase = 0;
    }
  }

  _isBusy() {
    return (
      this.placingState ||
      this.breakingState ||
      this.digging ||
      this.toweringState.active ||
      this.moveState !== null // <-- block if a move is mid-execution
    );
  }

  /**
   * Swims to the specified node, adjusting controls based on attributes.
   * Handles vertical movement in water using jump/sneak controls.
   * @param {Cell} node - The node to swim to, with attributes for vertical
   */
  _swimTo(node) {
    const bot = this.bot;
    bot.lookAt(node.worldPos.offset(0, 1.6, 0), true);
    bot.setControlState("forward", true);

    this.swimmingState = {
      active: true,
      sinking: node.attributes.down || false,
      floating: node.attributes.up || false,
    };

    const attr = node.attributes;

    if (attr.up) {
      bot.setControlState("jump", true); // In water, jump makes you go up
      bot.setControlState("sneak", false); // Sneak is not needed for upward swim
      this.swimmingState.floating = true;
    } else if (attr.down) {
      bot.setControlState("jump", false);
      bot.setControlState("sneak", true); // Sneak makes you go down
      this.swimmingState.sinking = true;
    } else {
      const yDist = Math.abs(bot.entity.position.y - node.worldPos.y);
      const xzDist =
        Math.abs(bot.entity.position.x - node.worldPos.x) +
        Math.abs(bot.entity.position.z - node.worldPos.z);
      // if we are some distance above the target we should sneak to go down
      if (yDist > 0.5 && xzDist < 0.5) {
        bot.setControlState("jump", false);
        bot.setControlState("sneak", true); // Sneak to go down
        this.swimmingState.sinking = true;
      } else {
        bot.setControlState("jump", true);
        bot.setControlState("sneak", false);
      }
    }

    // Optionally clear horizontal movement if the bot is doing a vertical move only
    // (e.g., vertical swim node without any x/z delta)
    if (
      node.parent &&
      node.worldPos.x === node.parent.worldPos.x &&
      node.worldPos.z === node.parent.worldPos.z
    ) {
      bot.setControlState("forward", false);
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
    bot.setControlState("forward", true);

    // Init jump state if needed
    if (!this.jumpState) this.jumpState = { active: false, timer: 0 };

    // Trigger jump once when reaching edge
    if (!this.jumpState.active) {
      if (
        this._shouldJumpNow(from, to, bot, true) ||
        this._shouldAutoJump(to, bot)
      ) {
        this.jumpState.active = true;
        this.jumpState.timer = 0;
        bot.setControlState("jump", true);
      }
    }

    // Handle jump timing & reset
    if (this.jumpState.active) {
      this.jumpState.timer++;
      if (this.jumpState.timer > 3) {
        bot.setControlState("jump", false);
        this.jumpState.active = false;
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
          console.warn("Jump simulation failed. Replanning or fallback?");
        this.stop(); // or trigger replanner
        return;
      }

      this.jumpState = { jumped: false, timer: 0 };
      bot.setControlState("sprint", true);
      bot.setControlState("forward", true);
    }

    bot.lookAt(node.worldPos.offset(0, 1.6, 0), true);

    if (
      !this.jumpState.jumped &&
      this._shouldJumpNow(node.parent.worldPos, node.worldPos, bot, false)
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
  }

  /**
   * Place all blocks required for a node, sequentially.
   */
  async _placeBlock(node) {
    const bot = this.bot;
    const blockPlace = getBlockToPlace(bot);
    bot.clearControlStates();

    await bot.waitForTicks(1);

    if (this.placingState) {
      if (this.ashfinder.debug)
        console.warn("Already placing blocks, skipping this node.");
      return;
    }

    this.placingState = true;

    try {
      for (const poss of node.attributes.place) {
        const vec3 = new Vec3(poss.x, poss.y, poss.z);
        const block = bot.blockAt(vec3);

        // Only try if target is empty
        if (!block || block.boundingBox !== "empty") continue;

        try {
          // --- If bot standing inside target, jump first ---
          if (vec3.floored().equals(bot.entity.position.floored())) {
            bot.setControlState("jump", true);
            while (true) {
              const blockBelow = bot.blockAt(
                bot.entity.position.offset(0, -1, 0)
              );
              if (blockBelow.name === "air") break; // Wait until bot is in the air
              await bot.waitForTicks(1);
            }
            bot.setControlState("jump", false);
          }

          // --- Step back if too close ---
          if (vec3.distanceTo(bot.entity.position) <= 0.6) {
            bot.setControlState("back", true);
            await sleep(10);
            bot.setControlState("back", false);
          }

          // --- Equip and place ---
          await equipBlockIfNeeded(bot, blockPlace);
          await placeBlockAtTarget(bot, poss, poss.dir, blockPlace);
        } catch (err) {
          console.error(`Error placing block at ${vec3}:`, err);
        }
      }

      if (this.ashfinder.debug)
        console.log(`✅ Placed ${node.attributes.place.length} block(s).`);
    } finally {
      this.placingState = false;
    }
  }

  /**
   * Break all blocks required for a node, sequentially.
   */
  async _handleBreakingBlocks(node) {
    const bot = this.bot;
    const breakNodes = node.attributes.break || [];

    if (this.breakingState) {
      if (this.ashfinder.debug)
        console.warn("Already breaking blocks, skipping this node.");
      return;
    }

    this.breakingState = true;
    bot.clearControlStates();

    try {
      for (const pos of breakNodes) {
        const block = bot.blockAt(pos);
        if (!block || block.boundingBox !== "block") continue;

        if (bot.ashfinder.debug)
          showPathParticleEffect(bot, block.position, {
            r: 0.11,
            g: 0.11,
            b: 0.11,
          });

        try {
          // Sequential dig with lock
          this.digging = true;
          await autoTool(bot, block);
          await bot.lookAt(block.position.offset(0.5, 0, 0.5), true);
          await dig(bot, block);
        } catch (err) {
          console.error(`Error digging block at ${block.position}:`, err);
        } finally {
          this.digging = false;
        }
      }
    } finally {
      this.breakingState = false;
    }
  }

  /**
   *
   * @param {Cell} node
   * @returns
   */
  _hasReachedNode(node, ignoreGround = false) {
    const pos = this.bot.entity.position;
    const target = node.worldPos.clone(); // center of block

    const block = this.bot.blockAt(node.worldPos);
    const blockName = block?.name ?? "";

    let yOffset = 0; // default: normal full block
    if (blockName.includes("farmland")) yOffset = 0.9375;
    else if (blockName.includes("fence") || blockName.includes("wall"))
      yOffset = 1.5;
    else if (blockName === "soul_sand") yOffset = 0.875;
    else if (blockName === "carpet") yOffset = 0.0625;
    else if (blockName === "snow") yOffset = 0.125;

    const topOfBlockY = node.worldPos.y + yOffset;

    const dx = Math.abs(pos.x - target.x);
    const dy = Math.abs(pos.y - topOfBlockY);
    const dz = Math.abs(pos.z - target.z);

    if (this.ashfinder.debug)
      console.log(`Target block: ${node.worldPos}, top Y: ${topOfBlockY}`);
    if (this.ashfinder.debug)
      console.log(
        `dx: ${dx.toFixed(4)}, dy: ${dy.toFixed(4)}, dz: ${dz.toFixed(4)}`
      );

    const isCloseEnough = dx < 0.35 && dy <= 0.35 && dz < 0.35;
    const isOnGround = this.bot.entity.onGround || ignoreGround;

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
    const dir = to.minus(from).normalize(); // direction we're moving

    // The block we're currently standing on
    const curBlockX = Math.floor(pos.x);
    const curBlockZ = Math.floor(pos.z);

    // Determine the forward edge of that block in our movement direction
    const edgeX = curBlockX + 0.5 + Math.sign(dir.x) * 0.5;
    const edgeZ = curBlockZ + 0.5 + Math.sign(dir.z) * 0.5;

    // Project bot position onto movement axis
    const botForwardDist =
      (pos.x - (curBlockX + 0.5)) * dir.x + (pos.z - (curBlockZ + 0.5)) * dir.z;

    // Distance to the edge of current block in that direction
    const blockEdgeDist = 0.5; // half-block from center to edge
    const distToEdge = blockEdgeDist - botForwardDist;

    // Threshold: jump slightly before falling off the edge
    const margin = isNJump ? 0.12 : 0.18;

    if (this.ashfinder.debug)
      console.log(`distToEdge: ${distToEdge.toFixed(3)}, margin: ${margin}`);

    return bot.entity.onGround && distToEdge <= margin;
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
    this.bot.clearControlStates();
    this.jumpState = null;

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
    const block1 = bot.blockAt(pos.offset(1, 0, 0));
    const block2 = bot.blockAt(pos.offset(-1, 0, 0));
    const block3 = bot.blockAt(pos.offset(0, 0, 1));
    const block4 = bot.blockAt(pos.offset(0, 0, -1));
    if (
      blockBelow.boundingBox === "empty" &&
      block1.boundingBox === "empty" &&
      block2.boundingBox === "empty" &&
      block3.boundingBox === "empty" &&
      block4.boundingBox === "empty"
    ) {
      //place a support
      await placeBlock(bot, bot.heldItem?.name, blockBelow.position.floored());
    }

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

module.exports = PathExecutor;
