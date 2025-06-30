const Vec3 = require("vec3");
const { Cell, Astar } = require("./pathfinder");
const {
  getController,
  simulateUntil,
  getControlState,
  placeBlock,
  autoTool,
  createEndFunc,
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
    this.executing = false;
    this.partial = false;
    this.goal = null;

    this.placingState = false;
    this.placing = false;
    this.breakingState = false;
    this.digging = false;
    this.config = bot.ashfinder.config || {};

    this.params = {};

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
   */
  setPath(path, { partial = false, targetGoal = null, bestNode = null } = {}) {
    this.path = path;
    this.currentIndex = 0;
    this.jumpState = null;
    this.executing = true;
    this.partial = partial;
    this.goal = targetGoal;

    console.log(partial ? "Executing partial path" : "Executing full path");

    if (bestNode) {
      this.params.bestNode = bestNode;
    }
  }

  /**
   * Called on every physics tick
   */
  tick() {
    if (this.currentIndex >= this.path.length || !this.executing) {
      if (this.partial) {
        if (this.ashfinder.debug) console.warn("Reached end of partial path.");
        this.ashfinder.emit("goal-reach-partial", this.goal);
        this._handlePartialPathEnd(this.params.bestNode);
        this.stop();
        return;
      }

      this.ashfinder.emit("goal-reach", this.goal);
      this.stop();
      return;
    }

    const node = this.path[this.currentIndex];

    // console.log(node);

    if (this._hasReachedNode(node)) {
      this.currentIndex++;
      this.jumpState = null;
      this.bot.clearControlStates();
      if (this.ashfinder.debug)
        console.log(
          `Reached node: ${node.attributes.name} at ${node.worldPos}`
        );
      return;
    }

    this._executeMove(node);
  }

  async _handlePartialPathEnd(bestNode) {
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
        bot.ashfinder.config
      );

      if (targetPathFromPromising.status === "found") {
        const pathToPromising = await Astar(
          bot.entity.position.clone().floored(),
          bestNode.worldPos,
          bot,
          (pos) => pos.equals(bestNode.worldPos),
          bot.ashfinder.config
        );

        if (pathToPromising.status === "found") {
          const fullPath = [
            ...pathToPromising.path,
            ...targetPathFromPromising.path.slice(1), // avoid repeating the connecting node
          ];

          // Execute the full joined path
          this.setPath(fullPath);
          return;
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
      this.config
    );

    this.setPath(newPath.path, {
      partial: newPath.status === "partial",
      targetGoal: this.goal,
      bestNode: newPath.bestNode,
    });
  }

  /**
   * Executes the current move
   * @param {Cell} node
   */
  _executeMove(node) {
    const attributes = node.attributes;
    // console.log(`Executing move: ${node.attributes.name} at ${node.worldPos}`);

    if (attributes.sJump) {
      this._sprintJump(node);
      if (this.ashfinder.debug)
        console.log(`Executing sprint jump to ${node.worldPos}`);
    } else if (attributes.nJump) {
      if (attributes.place && attributes.place.length > 0) {
        this._placeBlock(node);
        if (this.ashfinder.debug)
          console.log(`Executing block placement at ${node.worldPos}`);
      }

      if (attributes.break && attributes.break.length > 0) {
        this._handleBreakingBlocks(node);
      }

      this._simpleJump(node);
      if (this.ashfinder.debug)
        console.log(`Executing simple jump to ${node.worldPos}`);
    } else {
      if (attributes.place && attributes.place.length > 0) {
        this._placeBlock(node);
        if (this.ashfinder.debug)
          console.log(`Executing block placement at ${node.worldPos}`);
      }

      if (attributes.break && attributes.break.length > 0) {
        this._handleBreakingBlocks(node);
      }

      this._walkTo(node.worldPos);
    }

    // this._walkTo(node.worldPos);
    // switch (node.action) {
    //   case "walk":
    //     this._walkTo(node.position);
    //     break;
    //   case "jump":
    //     this._simpleJump(node.position);
    //     break;
    //   case "sprint_jump":
    //     this._sprintJump(node);
    //     break;
    //   case "place":
    //     this._placeBlock(node);
    //     break;
    //   default:
    //     break;
    // }
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
   * @returns
   */
  _simpleJump(node) {
    const bot = this.bot;
    bot.lookAt(node.worldPos.offset(0, 1.6, 0), true);
    bot.setControlState("forward", true);

    if (this._shouldJumpNow(node.parent.worldPos, node.worldPos, bot)) {
      bot.setControlState("jump", true);

      if (!this.jumpState) this.jumpState = { timer: 0 };
      this.jumpState.timer++;

      if (this.jumpState.timer > 3) {
        bot.setControlState("jump", false);
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
      this._shouldJumpNow(node.parent.worldPos, node.worldPos, bot)
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
   *
   * @param {Cell} node
   * @returns
   */
  _placeBlock(node) {
    let promises = [];
    const bot = this.bot;

    const blockPlace = getBlockToPlace(bot);

    if (this.placingState) {
      if (this.ashfinder.debug)
        console.warn("Already placing blocks, skipping this node.");
      return;
    }

    this.placingState = true;

    for (const poss of node.attributes.place) {
      const vec3 = new Vec3(poss.x, poss.y, poss.z);

      const block = bot.blockAt(vec3);

      if (block.boundingBox === "empty") {
        promises.push(
          (async () => {
            try {
              if (!this.placing) {
                this.placing = true;

                //check if pos = bots pos
                if (vec3.floored().equals(bot.entity.position.floored())) {
                  bot.setControlState("jump", true);
                  while (true) {
                    let positionBelow = bot.entity.position.offset(0, -1, 0);
                    let blockBelow = bot.blockAt(positionBelow);

                    if (blockBelow.name === "air") break; // Wait until the bot is in the air.

                    await bot.waitForTicks(1);
                  }
                  bot.setControlState("jump", false);
                }

                if (vec3.distanceTo(bot.entity.position) <= 0.6) {
                  //move back abit
                  bot.setControlState("back", true);
                  await sleep(10);
                  bot.setControlState("back", false);
                }

                await equipBlockIfNeeded(bot, blockPlace);
                await placeBlockAtTarget(bot, poss, poss.dir, blockPlace);
                this.placing = false;
              }
            } catch (error) {
              console.error(`Error digging block at ${block.position}:`, error);
              this.placing = false;
            }
          })()
        );
      }
    }

    this.placingState = false;
  }

  /**
   * @param {Cell} cell
   */
  async _handleBreakingBlocks(cell) {
    let promises = [];
    const bot = this.bot;

    bot.clearControlStates();
    // and array of directional vec3
    const breakNodes = cell.attributes.break;

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
                await bot.dig(block, true);
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
   *
   * @param {Cell} node
   * @returns
   */
  _hasReachedNode(node) {
    const pos = this.bot.entity.position.floored().offset(0.5, 0, 0.5);
    const target = node.worldPos;

    const dx = Math.abs(pos.x - target.x);
    const dy = Math.abs(pos.y - target.y);
    const dz = Math.abs(pos.z - target.z);

    // console.log(
    //   `Checking if reached node: ${node.attributes.name} at ${target} - dx: ${dx}, dy: ${dy}, dz: ${dz}`
    // );

    const isCloseEnough = dx < 0.3 && dy <= 1 && dz < 0.3;
    const isOnGround = this.bot.entity.onGround;

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
        return dist < 0.4 && simState.onGround;
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
      resultState.pos.distanceTo(targetCenter) < 0.4 && resultState.onGround;
    return reached;
  }

  /**
   * Determines whether the bot is close enough to the edge to jump.
   * Works for both simple and sprint jumps.
   *
   * @param {Vec3} from - The starting position (node.from)
   * @param {Vec3} to - The target position (node.worldPos)
   * @param {Bot} bot - The Mineflayer bot
   * @returns {boolean}
   */
  _shouldJumpNow(from, to, bot) {
    const pos = bot.entity.position.floored().offset(0.5, 0, 0.5);

    // Direction bot should move toward
    const dir = to.minus(from).normalize();

    // console.log(
    //   `Calculating jump: from ${from} to ${to} - dir: ${dir}, pos: ${pos}`
    // );

    // Project bot’s position forward slightly to simulate run-up
    const edgePos = pos.offset(dir.x * 0.1, 0, dir.z * 0.1);

    // Target block center
    const toCenter = to;

    const dist = pos.distanceTo(edgePos);

    const onGround = bot.entity.onGround;
    // console.log(
    //   `Checking jump: from ${from} to ${to} - edgePos: ${edgePos}, dist: ${dist}, onGround: ${onGround}`
    // );

    const closeEnough = dist < 0.35;

    return onGround && closeEnough;
  }

  stop() {
    this.executing = false;
    this.bot.clearControlStates();
    this.jumpState = null;
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

async function sleep(ms = 2000) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = PathExecutor;
