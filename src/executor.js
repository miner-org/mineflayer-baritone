const Vec3 = require("vec3").Vec3;
const { Goal } = require("./goal");
const { Cell } = require("./pathfinder");
const {
  getController,
  simulateUntil,
  getControlState,
  placeBlock,
  autoTool,
  getLookAngles,
  angleDiff,
} = require("./utils");
const { PlayerState } = require("prismarine-physics");

const ALL_CONTROLS = [
  "forward",
  "back",
  "left",
  "right",
  "jump",
  "sprint",
  "sneak",
];

/** Block-type Y-offsets for reach-node calculations. */
const BLOCK_Y_OFFSETS = {
  farmland: 0.9375,
  fence: 1.5,
  wall: 1.5, // matched via includes("wall") && !includes("sign")
  soul_sand: 0.875,
  carpet: 0.0625,
  snow: 0.125,
  path: 0.9375, // matched via includes("path")
};

class PathExecutor {
  /**
   * @param {import("mineflayer").Bot} bot
   * @param {import("./AshFinder").AshFinderPlugin} ashfinder
   */
  constructor(bot, ashfinder) {
    this.bot = bot;
    /** @type {import("./AshFinder").AshFinderPlugin} */
    this.ashfinder = ashfinder;

    /** @type {Cell[]} */
    this.path = [];
    this.currentIndex = 0;
    this.jumpState = null;
    this.toweringState = { active: false, phase: 0 };
    this.swimmingState = { active: false, sinking: false, floating: false };
    /** @type {false | { phase: string, target: Vec3 }} */
    this.climbingState = false;
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
    this.breakingState = null;
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
    this.waypointTolerance = 3;

    /** Tracks visited positions to help detect stuck state. */
    this.visitedPositions = new Set();

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
            console.log("[PathExecutor] Resolving completion promise");
          resolve();
        };
        this.rejectCompletion = (err) => {
          if (this.ashfinder.debug)
            console.log(
              "[PathExecutor] Rejecting completion promise:",
              err?.message,
            );
          reject(err);
        };
      });
    }
  }

  /**
   * @param {Cell[]} path
   * @param {{
   *   partial?: boolean,
   *   targetGoal?: Goal,
   *   bestNode?: Cell,
   *   pathOptions?: object,
   * }} [options={}]
   * @returns {Promise<void>} Resolves when the full journey (including replans) completes.
   */
  setPath(path, options = {}) {
    const {
      partial = false,
      targetGoal = null,
      bestNode = null,
      pathOptions = null,
    } = options;

    this._startCompletionPromiseIfNeeded();

    this.path = path;
    this.currentIndex = 0;
    this.partial = partial;
    this.goal = targetGoal;
    this.params.bestNode = bestNode;
    this.pathOptions = pathOptions;
    this.executing = true;
    this.handlingEnd = false;
    this.handlingStuck = false;
    this.stuckState = { stuck: false, lastNodeTime: Date.now() };

    if (this.ashfinder.debug) {
      console.log(
        `[PathExecutor] ${partial ? "Partial" : "Full"} path set (${path.length} nodes) → ${targetGoal}`,
      );
    }

    return this.completionPromise;
  }

  async tick() {
    if (!this.executing) return;
    if (this.handlingEnd) return;
    if (this.handlingStuck) return;
    if (this.closingDoorState) return;

    if (this.currentIndex >= this.path.length) {
      this.handlingEnd = true;
      this._onPathEnd();
      return;
    }

    if (this.stuckState.stuck) {
      this.handlingStuck = true;
      this.handleStuck();
      return;
    }

    const node = this.path[this.currentIndex];

    if (this._isActionBusy()) {
      this.stuckState.lastNodeTime = Date.now();
      return;
    }

    if (this._hasReachedNode(node)) {
      this.currentIndex++;
      this.jumpState = false;
      this.toweringState.active = false;
      this.comingFromSJ = false;
      this._clearAllControls();

      // Close doors/gates we just passed through.
      if (
        this.previousNode?.attributes.interact &&
        this.ashfinder.config.closeInteractables &&
        !this.closingDoorState
      ) {
        const block = this.bot.blockAt(this.previousNode.worldPos);
        await this.bot.lookAt(node.worldPos, true);
        this.closingDoorState = true;

        if (block.getProperties().open) {
          await this.bot.activateBlock(block);
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
    await this._executeMove(node);
  }

  updateStuckState() {
    if (this.climbingState?.phase === "climbing") return;
    if (this.breakingState?.active) return;

    const elapsed = Date.now() - this.stuckState.lastNodeTime;
    if (elapsed >= this.ashfinder.config.stuckTimeout) {
      if (this.ashfinder.debug)
        console.log("[PathExecutor] Stuck detected — replanning");
      this.stuckState.stuck = true;
    }
  }

  /**
   * Externally-triggered replan (e.g. from a chunkColumnLoad event).
   * Safe to call at any time — no-ops if already handling stuck/end or not executing.
   */
  triggerReplan() {
    if (!this.executing || this.handlingStuck || this.handlingEnd) return;

    if (this.ashfinder.debug)
      console.log("[PathExecutor] Replan triggered externally");

    this.handlingStuck = true;
    this.handleStuck();
  }

  async handleStuck() {
    try {
      const newPath = await this._generateNextPath();
      if (!newPath.success === false) {
        // _generateNextPath returns { success: false } only on "no path"
        if (this.ashfinder.debug)
          console.log("[PathExecutor] No path found during replan");
        return;
      }
      this.setPath(newPath.path, {
        partial: newPath.status === "partial",
        targetGoal: this.goal,
        bestNode: newPath.bestNode,
        pathOptions: this.pathOptions,
      });
    } catch (error) {
      console.error("[PathExecutor] Replan failed:", error);
    } finally {
      this.stuckState = { stuck: false, lastNodeTime: Date.now() };
      this.handlingStuck = false;
    }
  }

  async _onPathEnd() {
    try {
      if (this.partial) {
        this.partial = false;
        const newPath = await this._generateNextPath();

        if (newPath.success === false) {
          if (this.ashfinder.debug)
            console.log(
              "[PathExecutor] Partial path exhausted with no continuation",
            );
          this._clearAllControls();
          this._resolveCompletion();
          this.executing = false;
          return;
        }

        this.setPath(newPath.path, {
          partial: newPath.status === "partial",
          targetGoal: this.goal,
          bestNode: newPath.bestNode,
          pathOptions: this.pathOptions,
        });
      } else {
        this._clearAllControls();
        this._resolveCompletion();
        this.executing = false;
      }
    } finally {
      this.handlingEnd = false;
    }
  }

  /**
   * @returns {Promise<{ success: false } | { path: Cell[], status: string, bestNode?: Cell }>}
   */
  async _generateNextPath() {
    const newPath = await this.ashfinder.generatePath(
      this.goal,
      this.pathOptions,
    );

    if (newPath.status === "no path") {
      return { success: false, reason: "no path" };
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

  /** @param {object} config */
  setConfig(config) {
    this.config = config;
  }

  resetStates() {
    this.placingState = false;
    this.placing = false;
    this.breakingState = null;
    this.digging = false;
    this.toweringState = { active: false, phase: 0 };
    this.swimmingState = { active: false, sinking: false, floating: false };
    this.elytraFlyingState = { active: false, gliding: false };
    this.stuckState = { stuck: false, stuckTimer: 0, lastNodeTime: 0 };
    this.climbingState = {};
    this.climbingTarget = null;
    this.interactingState = false;
    this.jumpState = null;
  }

  /**
   * Dispatch the correct movement sub-routine for `node`.
   * @param {Cell} node
   */
  async _executeMove(node) {
    if (this._isActionBusy()) return;

    if (this.ashfinder.debug) {
      showPathParticleEffect(this.bot, node.worldPos, {
        r: 0.1,
        g: 0.5,
        b: 0.4,
      });
      console.log(
        `[PathExecutor] Move: ${node.attributes.name} (cost:${node.attributes.cost})` +
          ` at ${node.worldPos}` +
          ` (places:${node.attributes.place?.length ?? 0}, breaks:${node.attributes.break?.length ?? 0})`,
      );
    }

    const attr = node.attributes;

    // Water takes priority.
    if (this._isInWater() || (attr.swim && !attr.dive)) {
      this._swimTo(node);
      return;
    }

    if (attr.sJump) {
      await this._sprintJump(node);
    } else if (attr.nJump) {
      if (
        attr.place?.length > 0 &&
        !this.placedNodes.has(node.worldPos.toString())
      ) {
        await this._placeBlock(node);
        this.placedNodes.add(node.worldPos.toString());
      }
      if (attr.break?.length > 0) await this._handleBreakingBlocks(node);
      if (this.breakingState?.active) return;
      await this._simpleJump(node);
    } else if (attr.ladder) {
      if (attr.descend) this._startClimbDown(node);
      else if (attr.enter) this._walkTo(node.worldPos);
      else this._startClimb(node);
    } else if (attr.interact && !this.interactingState && attr.interactBlock) {
      await this._handleInteract(node);
    } else if (attr.ascend) {
      if (
        !this.toweringState.active &&
        !this.placedNodes.has(node.worldPos.toString())
      ) {
        this._clearAllControls();
        await this.jumpAndPlaceBlock(node);
      }
    } else if (attr.isFlying) {
      if (!this.isFlying) await this._startPacketFly();
      await this._flyTo(node);
    } else if (attr.scaffoldingUp) {
      if (!this._isCentered(node.worldPos)) return;
      const distY = Math.abs(this.bot.entity.position.y - node.worldPos.y);
      if (distY < 1) return;
      this.bot.setControlState("jump", true);
    } else if (attr.scaffoldingDown) {
      if (!this._hasReachedNode(node, true)) return;
      if (!this._isCentered(node.worldPos)) return;
      this._clearAllControls();
      this.bot.setControlState("sneak", true);
    } else {
      if (
        attr.place?.length > 0 &&
        !this.placedNodes.has(node.worldPos.toString())
      ) {
        if (this._isBridgingMove(node)) {
          await this._safeBridge(node);
        } else {
          await this._placeBlock(node);
        }
        this.placedNodes.add(node.worldPos.toString());
      }

      if (attr.break?.length > 0) await this._handleBreakingBlocks(node);
      if (attr.crouch) this.bot.setControlState("sneak", true);
      if (this.breakingState?.active) return;
      if (this.isFlying) this._stopPacketFly();

      this._walkTo(node.worldPos);
    }
  }

  /**
   * Handle trapdoor / door interaction for a node.
   * @param {Cell} node
   */
  async _handleInteract(node) {
    const block = this.bot.blockAt(node.attributes.interactBlock);
    this.interactingState = true;

    try {
      await this.bot.lookAt(block.position, true);
      await this.bot.waitForTicks(1);

      await this.bot.activateBlock(block);
      await this.bot.waitForTicks(2);

      const updated = this.bot.blockAt(block.position);
      const isOpen = updated?.getProperties()?.open;

      if (isOpen) {
        // Horizontal trapdoor — walk under then close.
        this._walkTo(node.worldPos);
        await this.bot.waitForTicks(5);
        this._clearAllControls();
        await this.bot.waitForTicks(2);

        await this.bot.lookAt(block.position, true);
        await this.bot.activateBlock(block);
        await this.bot.waitForTicks(8);
      }
    } catch (err) {
      if (this.ashfinder.debug)
        console.warn("[PathExecutor] Interact failed:", err);
    } finally {
      this.interactingState = false;
    }
  }

  /** @param {Vec3} pos @returns {boolean} */
  _isCentered(pos) {
    const { x, z } = this.bot.entity.position;
    return (
      Math.abs(x - (pos.x + 0.5)) <= 0.6 && Math.abs(z - (pos.z + 0.5)) <= 0.6
    );
  }

  _isActionBusy() {
    if (this.climbingState && typeof this.climbingState === "object") {
      // Positioning phase should keep running; climbing/descending is not "busy".
      return false;
    }
    if (this.climbingState === true) return true;

    return (
      this.placingState ||
      this.breakingState?.active ||
      this.digging ||
      this.toweringState.active ||
      this.interactingState
    );
  }

  /**
   * @param {Cell} node
   * @param {boolean} [clearStates=true]
   */
  async _placeBlock(node, clearStates = true) {
    const bot = this.bot;
    const blockPlace = getBlockToPlace(bot);

    if (clearStates) this._clearAllControls();
    await bot.waitForTicks(5);

    if (this.placingState) {
      if (this.ashfinder.debug)
        console.warn("[PathExecutor] Already placing blocks — skipping");
      return;
    }

    this.placingState = true;

    for (const poss of node.attributes.place) {
      const vec3 = new Vec3(poss.x, poss.y, poss.z);
      const block = bot.blockAt(vec3);
      if (!block || block.boundingBox !== "empty") continue;

      try {
        // Step back if bot is inside the target space.
        const p = bot.entity.position;
        const inTarget =
          p.x > block.position.x &&
          p.x < block.position.x + 1 &&
          p.y > block.position.y - 0.1 &&
          p.y < block.position.y + 2 &&
          p.z > block.position.z &&
          p.z < block.position.z + 1;

        if (inTarget) {
          bot.setControlState("back", true);
          await bot.waitForTicks(2);
          bot.setControlState("back", false);
        }

        await equipBlockIfNeeded(bot, blockPlace);
        await placeBlockAtTarget(bot, poss, poss.dir, blockPlace);
      } catch (error) {
        console.error(`[PathExecutor] Error placing block at ${vec3}:`, error);
      }
    }

    this.placingState = false;
  }

  /**
   * Returns true if this node requires bridging over a gap.
   * @param {Cell} node
   * @returns {boolean}
   */
  _isBridgingMove(node) {
    if (!node.attributes.place?.length) return false;

    for (const placePos of node.attributes.place) {
      const blockBelow = this.bot.blockAt(placePos.offset(0, -1, 0));
      if (!blockBelow || blockBelow.boundingBox === "empty") return true;
    }

    return false;
  }

  /**
   * @param {Cell} node
   */
  async _safeBridge(node) {
    const bot = this.bot;
    const blockPlace = getBlockToPlace(bot);

    if (!blockPlace) {
      console.warn("[PathExecutor] No blocks available for bridging");
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

        const targetBlock = await this._positionAtEdge(
          targetPos,
          node.direction || placePos.dir,
        );

        if (!targetBlock) break;

        // Sneak while placing to avoid falling.
        bot.setControlState("sneak", true);
        await bot.waitForTicks(2);

        // Pick best face toward parent.
        const placeDir = node.parent.worldPos
          .clone()
          .minus(targetBlock.position.clone())
          .normalize();

        const faces = [
          { normal: new Vec3(1, 0, 0), offset: new Vec3(1, -0.5, 0.5) },
          { normal: new Vec3(-1, 0, 0), offset: new Vec3(0, -0.5, 0.5) },
          { normal: new Vec3(0, 1, 0), offset: new Vec3(0.5, 1, 0.5) },
          { normal: new Vec3(0, -1, 0), offset: new Vec3(0.5, 0, 0.5) },
          { normal: new Vec3(0, 0, 1), offset: new Vec3(0.5, -0.5, 1) },
          { normal: new Vec3(0, 0, -1), offset: new Vec3(0.5, -0.5, 0) },
        ];

        const bestFace = faces.reduce(
          (best, face) => {
            const dot = placeDir.dot(face.normal);
            return dot > best.dot ? { face, dot } : best;
          },
          { face: faces[3], dot: -Infinity },
        ).face;

        await bot.lookAt(targetPos.clone().add(bestFace.offset), true);
        await bot.waitForTicks(1);

        try {
          await placeBlock(bot, bot.heldItem?.name, targetPos.floored());
          if (this.ashfinder.debug)
            console.log(`[PathExecutor] Bridged at ${targetPos}`);
          await bot.waitForTicks(2);
        } catch (error) {
          console.error(
            `[PathExecutor] Bridge placement error at ${targetPos}:`,
            error,
          );
        }

        bot.setControlState("forward", true);
        await bot.waitForTicks(3);
        bot.setControlState("forward", false);
      }

      bot.setControlState("sneak", false);
    } finally {
      this.placingState = false;
      bot.setControlState("sneak", false);
    }
  }

  /**
   * @param {Vec3} targetBlock
   * @param {object} _direction
   * @returns {Promise<object>} The block at the bot's feet after positioning.
   */
  async _positionAtEdge(targetBlock, _direction) {
    const bot = this.bot;

    await bot.lookAt(targetBlock.offset(0, 1.5, 0));

    bot.setControlState("sneak", true);
    bot.setControlState("forward", true);

    let blockAtFeet;
    do {
      const pos = bot.entity.position;
      blockAtFeet = bot.blockAt(pos.floored().offset(0, -1, 0));
      await bot.waitForTicks(1);
    } while (blockAtFeet?.boundingBox !== "empty");

    return blockAtFeet;
  }

  async _handleBreakingBlocks(node) {
    if (this.breakingState?.active) return;

    const bot = this.bot;
    const breakNodes = node.attributes.break;
    if (!breakNodes?.length) return;

    this._clearAllControls();

    this.breakingState = {
      active: true,
      toBreak: breakNodes.length,
      broken: 0,
    };

    try {
      for (const pos of breakNodes) {
        const block = bot.blockAt(pos);
        if (!block || block.boundingBox !== "block") continue;

        if (this.ashfinder.debug) {
          showPathParticleEffect(bot, block.position, {
            r: 0.11,
            g: 0.11,
            b: 0.11,
          });
        }

        await autoTool(bot, block);
        await bot.lookAt(block.position.offset(0.5, 0.5, 0.5), true);

        // Re-check after looking — block may have changed.
        if (bot.blockAt(pos)?.boundingBox === "block") {
          await bot.dig(block, true);
          this.breakingState.broken++;
        }
      }
    } catch (err) {
      console.error("[PathExecutor] Block breaking failed:", err);
    } finally {
      this.breakingState = null;
    }
  }

  /** @returns {boolean} */
  _isInWater() {
    const pos = this.bot.entity.position;
    const headBlock = this.bot.blockAt(pos.offset(0, 1, 0));
    const bodyBlock = this.bot.blockAt(pos);
    return headBlock?.name === "water" || bodyBlock?.name === "water";
  }

  /** @param {Cell} node */
  _swimTo(node) {
    const bot = this.bot;
    const target = node.attributes.enterTarget ?? node.worldPos;
    const pos = bot.entity.position;
    const attr = node.attributes;
    const yDiff = target.y - pos.y;

    if (!this.swimmingState.active) {
      this.swimmingState = { active: true, sinking: false, floating: false };
    }

    const hDist = Math.sqrt((target.x - pos.x) ** 2 + (target.z - pos.z) ** 2);

    if (hDist > 0.3) {
      bot.lookAt(target, true);
      bot.setControlState("forward", true);
    } else {
      bot.setControlState("forward", false);
    }

    bot.setControlState("jump", false);
    bot.setControlState("sneak", false);

    const headBlock = bot.blockAt(pos.offset(0, 1, 0));
    const bodyBlock = bot.blockAt(pos);
    const atSurface = headBlock?.name === "air" && bodyBlock?.name === "water";

    if (attr.up || yDiff > 0.3) {
      bot.setControlState("jump", true);
      this.swimmingState.floating = true;
      this.swimmingState.sinking = false;
    } else if (attr.down || yDiff < -0.3) {
      bot.setControlState("sneak", true);
      this.swimmingState.sinking = true;
      this.swimmingState.floating = false;
    } else if (!atSurface) {
      const vy = bot.entity.velocity.y;
      if (vy < -0.01) bot.setControlState("jump", true);
      else if (vy > 0.05) bot.setControlState("sneak", true);
    }

    if (attr.exitWater) {
      bot.setControlState("forward", true);
      if (attr.climbOut) bot.setControlState("jump", true);
    }
  }

  /** @param {Vec3} target */
  _walkTo(target) {
    this.bot.lookAt(target.offset(0, 1.6, 0), true);
    this.bot.setControlState("sprint", true);
    this.bot.setControlState("forward", true);
  }

  /** @param {Cell} node */
  async _simpleJump(node) {
    const bot = this.bot;
    const from = node.parent.worldPos;
    const to = node.worldPos;

    const eyePos = bot.entity.position.offset(0, bot.entity.eyeHeight, 0);
    const { yaw } = getLookAngles(eyePos, to.offset(0, 1.5, 0));
    await bot.look(yaw, 0, true);

    if (Math.abs(angleDiff(bot.entity.yaw, yaw)) > 0.05) return;

    if (!this.jumpState) {
      this._clearAllControls();
      this.jumpState = {
        jumped: false,
        timer: 0,
        isAutoJump: false,
        forwardTicks: 0,
      };
    }

    bot.setControlState("sprint", false);
    bot.setControlState("forward", true);
    this.jumpState.forwardTicks++;

    if (node.attributes.up && this.jumpState.forwardTicks < 8) return;

    if (!this.jumpState.jumped) {
      const shouldJump = this._shouldJumpNow(
        from.floored(),
        to.floored(),
        bot,
        node.attributes?.up ?? false,
      );
      const shouldAutoJump = this._shouldAutoJump(to, bot);

      if (shouldJump || shouldAutoJump) {
        bot.setControlState("jump", true);
        this.jumpState.jumped = true;
        this.jumpState.timer = 0;
        this.jumpState.isAutoJump = shouldAutoJump;

        if (this.ashfinder.debug)
          console.log(
            `[PathExecutor] Simple jump (auto:${shouldAutoJump}, pos:${shouldJump})`,
          );
      }
    }

    if (this.jumpState.jumped) {
      this.jumpState.timer++;
      const maxTimer = this.jumpState.isAutoJump ? 3 : 10;
      if (this.jumpState.timer > maxTimer) {
        bot.setControlState("jump", false);
        this.jumpState = null;
      }
    }
  }

  /** @param {Cell} node */
  async _sprintJump(node) {
    const bot = this.bot;
    const from = node.parent.worldPos;
    const to = node.worldPos;

    const eyePos = bot.entity.position.offset(0, bot.entity.eyeHeight, 0);
    const { yaw } = getLookAngles(eyePos, to.offset(0, 1.6, 0));
    await bot.look(yaw, 0, true);

    if (Math.abs(angleDiff(bot.entity.yaw, yaw)) > 0.08) return;
    if (this.jumpState?.jumped && this.jumpState?.done) return;

    if (!this.jumpState) {
      if (this.ashfinder.debug && !this._canReachJumpTarget(from, to, true)) {
        console.warn(
          "[PathExecutor] Sprint jump sim failed — attempting anyway",
        );
      }

      this._clearAllControls();
      this.jumpState = {
        jumped: false,
        timer: 0,
        forwardTicks: 0,
        isAutoJump: false,
        done: false,
      };

      bot.setControlState("sprint", true);
      bot.setControlState("forward", true);
    }

    this.jumpState.forwardTicks++;

    if (node.attributes?.up && this.jumpState.forwardTicks < 6) return;

    if (!this.jumpState.jumped) {
      if (
        this._shouldJumpNow(
          from.floored(),
          to.floored(),
          bot,
          node.attributes?.up ?? false,
        )
      ) {
        this.jumpState.jumped = true;
        this.jumpState.timer = 0;
        bot.setControlState("jump", true);

        if (this.ashfinder.debug)
          console.log("[PathExecutor] Sprint jump triggered");
      }
    }

    if (this.jumpState.jumped) {
      this.jumpState.timer++;

      const dx = to.x - from.x;
      const dz = to.z - from.z;
      const horizontalDist = Math.sqrt(dx * dx + dz * dz);
      const maxTimer = horizontalDist >= 4 ? 20 : 5;

      if (this.jumpState.timer === 5 && node.attributes?.place) {
        await this._placeBlock(node, false);
      }

      if (this.jumpState.timer > maxTimer) {
        this._clearAllControls();
        this.jumpState = null;
        this.comingFromSJ = true;
      }
    }
  }

  /** @param {Cell} node */
  async _startClimb(node) {
    const bot = this.bot;
    const target = this._getLadderLookAtPos(node);

    if (!this.climbingState) this.climbingState = { lookedAtTarget: false };

    bot.lookAt(target.offset(0, 1, 0), true);
    await bot.waitForTicks(5);
    bot.setControlState("forward", true);
  }

  /** @param {Cell} node @returns {Vec3} */
  _getLadderLookAtPos(node) {
    const pos = node.worldPos;
    const block = this.bot.blockAt(pos);
    if (!block || block.name !== "ladder") return pos;

    const oppositeOffset = {
      north: { x: 0, z: 1 },
      south: { x: 0, z: -1 },
      west: { x: 1, z: 0 },
      east: { x: -1, z: 0 },
    };

    const off = oppositeOffset[block.getProperties().facing];
    return off ? pos.offset(off.x, 0, off.z) : pos;
  }

  /** @param {Cell} node */
  _startClimbDown(node) {
    const bot = this.bot;
    const target = node.attributes.enterTarget ?? node.worldPos;

    if (!this.climbingState) {
      this.climbingState = { phase: "positioning", target: target.clone() };
    }

    const pos = bot.entity.position;
    const dx = Math.abs(pos.x - target.x);
    const dz = Math.abs(pos.z - target.z);

    if (this.climbingState.phase === "positioning") {
      if (dx > 0.25 || dz > 0.25) {
        bot.lookAt(target, true);
        bot.setControlState("forward", true);
        return;
      }

      bot.setControlState("forward", false);
      this.climbingState.phase = "descending";
    }

    if (this.climbingState.phase === "descending") {
      bot.lookAt(target.offset(0, -1, 0), true);
    }
  }

  /**
   * @param {Vec3} target
   * @param {{ stiffness?: number, damping?: number, maxCorrection?: number, tolerance?: number }} [options={}]
   * @returns {boolean} True if within tolerance.
   */
  _hoverAt(target, options = {}) {
    const bot = this.bot;
    const {
      stiffness = 0.3,
      damping = 0.7,
      maxCorrection = 0.5,
      tolerance = 0.1,
    } = options;

    const pos = bot.entity.position;
    const vel = bot.entity.velocity;
    const dx = target.x - pos.x;
    const dy = target.y - pos.y;
    const dz = target.z - pos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    /** @param {number} val @param {number} max */
    const clamp = (val, max) => Math.max(-max, Math.min(max, val));

    if (dist < tolerance) {
      bot.entity.velocity.set(
        vel.x * damping,
        vel.y * damping,
        vel.z * damping,
      );
      return true;
    }

    const cx = clamp(dx * stiffness - vel.x, maxCorrection);
    const cy = clamp(dy * stiffness - vel.y, maxCorrection);
    const cz = clamp(dz * stiffness - vel.z, maxCorrection);

    const GRAVITY = 0.08;

    bot.entity.velocity.set(vel.x + cx, vel.y + cy + GRAVITY, vel.z + cz);

    return false;
  }

  /** @param {Cell} node */
  async _flyTo(node) {
    if (!this.isFlying || !this.elytraFlyingState.active) return;

    const stable = this._hoverAt(node.worldPos.clone(), {
      stiffness: 0.4,
      damping: 0.65,
      maxCorrection: 0.6,
      tolerance: 0.15,
    });

    if (stable && this.ashfinder.debug)
      console.log("[PathExecutor] Stable hover achieved");
  }

  async _startPacketFly() {
    if (this.isFlying) return;
    this.isFlying = true;

    const bot = this.bot;

    // Ensure elytra is equipped.
    const wearing = bot.inventory.slots[bot.getEquipmentDestSlot("torso")];
    if (!wearing?.name.includes("elytra")) {
      const inv = bot.inventory.items().find((i) => i.name.includes("elytra"));
      if (!inv) throw new Error("No elytra found for flight");
      await bot.equip(inv, "torso");
    }

    if (this.ashfinder.debug) console.log("[PathExecutor] Elytra liftoff…");

    bot.setControlState("jump", true);

    let attempts = 0;
    while (bot.entity.onGround && attempts++ < 40) await bot.waitForTicks(1);

    if (bot.entity.onGround) {
      bot.setControlState("jump", false);
      this.isFlying = false;
      throw new Error("Elytra liftoff failed");
    }

    await bot.waitForTicks(3);
    bot.setControlState("jump", false);

    // Wait for downward velocity before deploying.
    let fallTicks = 0;
    while (bot.entity.velocity.y > 0 && fallTicks++ < 20)
      await bot.waitForTicks(1);

    try {
      const sendElytraPacket = () =>
        bot._client.write("entity_action", {
          entityId: bot.entity.id,
          actionId: 8,
          jumpBoost: 0,
        });

      sendElytraPacket();

      let waitTicks = 0;
      while (!bot.entity.elytraFlying && waitTicks++ < 20) {
        await bot.waitForTicks(1);
        if (waitTicks % 5 === 0) sendElytraPacket();
      }

      if (!bot.entity.elytraFlying)
        console.warn("[PathExecutor] Elytra may not have activated");

      this.elytraFlyingState = { active: true, gliding: true, liftoff: true };

      // Initial forward boost.
      const { yaw } = bot.entity;
      bot.entity.velocity.set(
        -Math.sin(yaw) * 0.3,
        Math.max(bot.entity.velocity.y, -0.1),
        -Math.cos(yaw) * 0.3,
      );

      if (this.ashfinder.debug) console.log("[PathExecutor] Elytra active");
    } catch (error) {
      console.error("[PathExecutor] Elytra activation error:", error);
      this.isFlying = false;
      this.elytraFlyingState.active = false;
      throw error;
    }
  }

  async _stopPacketFly() {
    if (!this.isFlying) return;
    this.isFlying = false;

    await this.bot.elytraFly();
    this.elytraFlyingState = { active: false, gliding: false };

    if (this.flyingInterval) {
      clearInterval(this.flyingInterval);
      this.flyingInterval = null;
    }
  }

  /** @param {Cell} node */
  async jumpAndPlaceBlock(node) {
    if (this.toweringState.active) return;

    this.toweringState.active = true;
    this._clearAllControls();

    const bot = this.bot;
    const placePos = node.attributes.place[0];

    try {
      await this._snapToXZ(placePos);

      while (!bot.entity.onGround) await bot.waitForTicks(1);

      const blockPlace = getBlockToPlace(bot);
      await equipBlockIfNeeded(bot, blockPlace);

      await bot.waitForTicks(1);
      bot.setControlState("jump", true);
      await bot.waitForTicks(1);

      let lifted = false;
      for (let i = 0; i < 5; i++) {
        if (bot.entity.velocity.y > 0) {
          lifted = true;
          break;
        }
        await bot.waitForTicks(1);
      }

      if (!lifted) return;

      bot.look(bot.entity.yaw, 90, true);

      while (!bot.entity.onGround) {
        const footPos = bot.entity.position.floored().offset(0.5, -0.5, 0.5);
        const below = bot.blockAt(footPos);

        if (below?.boundingBox === "empty") {
          try {
            await placeBlockAtTarget(bot, placePos, { x: 0, z: 0 }, blockPlace);
          } catch {
            /* non-fatal */
          }
        }

        await bot.waitForTicks(1);
      }
    } finally {
      bot.setControlState("jump", false);
      this._clearAllControls();
      this.toweringState.active = false;
      this.toweringState.phase = 0;
    }
  }

  /** @param {Vec3} targetPos */
  async _snapToXZ(targetPos) {
    const bot = this.bot;
    this._clearAllControls();

    while (true) {
      const dx = targetPos.x - bot.entity.position.x;
      const dz = targetPos.z - bot.entity.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < 0.35) {
        this._clearAllControls();
        break;
      }

      bot.lookAt(
        new Vec3(targetPos.x, bot.entity.position.y, targetPos.z),
        true,
      );
      bot.setControlState("forward", dist >= 0.3);
      await bot.waitForTicks(1);
    }
  }

  /**
   * Simulate a jump and check whether the bot can reach `to`.
   * @param {Vec3} from @param {Vec3} to @param {boolean} [sprint=false]
   * @returns {boolean}
   */
  _canReachJumpTarget(from, to, sprint = false) {
    const control = getControlState(this.bot);
    const state = new PlayerState(this.bot, control);
    state.pos = from.clone();

    const controller = getController(to, true, sprint, 2);
    const result = simulateUntil(
      this.bot,
      (s) => s.pos.distanceTo(to) < 0.5 && s.onGround,
      controller,
      30,
      state,
    );

    return result.pos.distanceTo(to) < 0.5 && result.onGround;
  }

  /**
   * Returns true when the bot is close enough to the edge to jump.
   * @param {Vec3} from @param {Vec3} to @param {object} bot @param {boolean} [up=false]
   * @returns {boolean}
   */
  _shouldJumpNow(from, to, bot, up = false) {
    const pos = bot.entity.position;
    const center = from.offset(0.5, 0, 0.5);
    const dir = to.clone().subtract(from);
    dir.y = 0;

    if (dir.x === 0 && dir.z === 0) return pos.distanceTo(center) <= 0.35;

    dir.normalize();

    let edgeDist = up ? 0.55 : 0.3;
    if (Math.abs(to.x - from.x) >= 3 || Math.abs(to.z - from.z) >= 3) {
      edgeDist = 0.25;
    }

    const jumpPoint = center.clone().add(dir.clone().scaled(edgeDist));
    return pos.distanceTo(jumpPoint) <= 0.25;
  }

  /**
   * Returns true when there is a climbable ledge directly in front of the bot.
   * @param {Vec3} target @param {object} bot
   * @returns {boolean}
   */
  _shouldAutoJump(target, bot) {
    const pos = bot.entity.position;
    const dir = target.minus(pos).normalize();
    const frontPos = pos.offset(dir.x, 0, dir.z).floored();

    const front = bot.blockAt(frontPos);
    const aboveFront = bot.blockAt(frontPos.offset(0, 1, 0));
    const twoAbove = bot.blockAt(frontPos.offset(0, 2, 0));

    return (
      bot.entity.onGround &&
      front?.boundingBox === "block" &&
      (!aboveFront || aboveFront.boundingBox === "empty") &&
      (!twoAbove || twoAbove.boundingBox === "empty")
    );
  }

  /** @param {Cell} node @returns {boolean} */
  _passedNode(node) {
    const pos = this.bot.entity.position;
    const target = node.worldPos;
    const dx = Math.abs(pos.x - target.x);
    const dz = Math.abs(pos.z - target.z);

    if (dx < 0.35 && dz < 0.35) return false;

    if (node.parent) {
      const prev = node.parent.worldPos;
      const moveDir = target.minus(prev).normalize();
      const botOffset = pos.minus(target);
      const progress = botOffset.x * moveDir.x + botOffset.z * moveDir.z;
      return progress > 0.25;
    }

    return dx > 0.7 || dz > 0.7;
  }

  /**
   * Returns true if the next `maxLookahead` nodes are all flat, simple moves.
   * @param {number} startIndex
   * @returns {boolean}
   */
  _isStraightFlatRun(startIndex) {
    const MAX_LOOKAHEAD = 3;
    const startNode = this.path[startIndex];

    for (
      let i = 0;
      i < MAX_LOOKAHEAD && startIndex + i < this.path.length;
      i++
    ) {
      const node = this.path[startIndex + i];
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
   * @param {Cell} node
   * @param {boolean} [ignoreGround=false]
   * @returns {boolean}
   */
  _hasReachedNode(node, ignoreGround = false) {
    const pos = this.bot.entity.position;
    const target = node.worldPos.clone();

    if (this.ashfinder.debug) {
      console.log(`[PathExecutor] Reach check → bot:${pos} target:${target}`);
    }

    const block = this.bot.blockAt(node.worldPos);
    const blockName = block?.name ?? "";

    // Ladder descent
    if (node.attributes?.descend && node.attributes?.ladder) {
      const centerTarget = node.attributes.enterTarget ?? target;
      const dx = Math.abs(pos.x - centerTarget.x);
      const dy = Math.abs(pos.y - centerTarget.y);
      const dz = Math.abs(pos.z - centerTarget.z);

      if (node.attributes.name === "MoveLadderEnterDescend")
        return dx < 0.2 && dy < 0.55 && dz < 0.2;

      return dx < 0.45 && dy < 0.55 && dz < 0.45;
    }

    // Swimming
    if (node.attributes?.swim || blockName === "water") {
      const dx = Math.abs(pos.x - target.x);
      const dy = Math.abs(pos.y - target.y);
      const dz = Math.abs(pos.z - target.z);
      return dx < 0.5 && dz < 0.5 && dy < 0.6;
    }

    // Compute Y offset based on block type.
    let yOffset = 0;
    if (blockName === "farmland" || blockName.includes("path")) {
      yOffset = 0.9375;
    } else if (
      blockName.includes("fence") ||
      (blockName.includes("wall") && !blockName.includes("sign"))
    ) {
      yOffset = 1.5;
    } else if (blockName === "soul_sand") {
      yOffset = 0.875;
    } else if (blockName === "carpet") {
      yOffset = 0.0625;
    } else if (blockName === "snow") {
      yOffset = 0.125;
    }

    const topOfBlockY = node.worldPos.y + yOffset;
    const dx = Math.abs(pos.x - target.x);
    const dy = Math.abs(pos.y - topOfBlockY);
    const dz = Math.abs(pos.z - target.z);

    let hThresh = this.comingFromSJ ? 0.45 : 0.35;
    if (node.attributes.scaffolding) hThresh = 0.7;

    const yThresh = node.attributes.nJump || node.attributes.sJump ? 1 : 0.67;

    const isCloseEnough = dx < hThresh && dy <= yThresh && dz < hThresh;
    const isOnGround =
      this.bot.entity.onGround ||
      ignoreGround ||
      this._isInWater() ||
      node.attributes.isFlying ||
      node.attributes.ladder;

    return isCloseEnough && isOnGround;
  }

  _clearAllControls() {
    for (const state of ALL_CONTROLS) {
      this.bot.setControlState(state, false);
    }
  }

  /** @param {string} [reason="death"] */
  stop(reason = "death") {
    this.executing = false;
    this.placedNodes.clear();
    this._clearAllControls();
    this.jumpState = null;
    this.toweringState.active = false;
    this.swimmingState.active = false;
    this.ashfinder.stopped = true;
    this.visitedPositions.clear();

    if (this.rejectCurrentPromise) {
      this.rejectCurrentPromise(reason);
      this.resolveCurrentPromise = null;
      this.rejectCurrentPromise = null;
      this.currentPromise = null;
    }
  }
}

/**
 * @param {import("mineflayer").Bot} bot
 * @returns {import("prismarine-item").Item | undefined}
 */
function getBlockToPlace(bot) {
  return bot.inventory
    .items()
    .find((item) => bot.ashfinder.config.disposableBlocks.includes(item.name));
}

/**
 * @param {import("mineflayer").Bot} bot
 * @param {import("prismarine-item").Item | null | undefined} item
 */
async function equipBlockIfNeeded(bot, item) {
  if (!item) {
    console.warn("[PathExecutor] equipBlockIfNeeded: item is null/undefined");
    return;
  }
  await bot.equip(item, "hand");
}

/**
 * @param {import("mineflayer").Bot} bot
 * @param {Vec3} cell
 * @param {object} _dir
 * @param {import("prismarine-item").Item} blockPlace
 */
async function placeBlockAtTarget(bot, cell, _dir, blockPlace) {
  try {
    await equipBlockIfNeeded(bot, blockPlace);
    bot.clearControlStates();
    await placeBlock(bot, bot.heldItem?.name, cell.floored());
  } catch (error) {
    const block = bot.blockAt(cell);
    console.error(
      `[PathExecutor] placeBlockAtTarget failed at ${block?.position}:`,
      error,
    );
  }
}

/**
 * @param {import("mineflayer").Bot} bot
 * @param {Vec3} point
 * @param {{ r: number, g: number, b: number }} [colors]
 */
function showPathParticleEffect(
  bot,
  point,
  colors = { r: 0.2, g: 0.82, b: 0.48 },
) {
  bot.chat(
    `/particle dust{color:[${colors.r}, ${colors.g}, ${colors.b}],scale:1}` +
      ` ${point.x} ${point.y} ${point.z} 0.1 0.1 0.1 1 4 force`,
  );
}

module.exports = PathExecutor;
