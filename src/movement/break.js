const { Move, registerMoves } = require("./");
const divideFactor = 1;

class MoveBreakForward extends Move {
  addNeighbors(neighbors, config, manager) {
    if (!config.breakBlocks) return;

    let targetNode = this.forward(1);
    
    this.manager = manager;
    // Define forward and upward nodes
    let forwardNode = targetNode.clone();
    let forwardUpNode = this.forward(1).up(1);
    let standingNode = this.down(1, targetNode);

    // if (this.isStandable(forwardNode)) return;

    // Check if the standing node is already broken (air)
    if (manager.isNodeBroken(standingNode)) return;

    if (!this.isSolid(standingNode)) return;

    // Determine breakable blocks
    const breakNodes = [];
    if (this.isBreakble(forwardUpNode, config) && this.isAir(forwardNode))
      breakNodes.push(forwardUpNode);
    if (this.isBreakble(forwardNode, config) && this.isAir(forwardUpNode))
      breakNodes.push(forwardNode);
    if (
      this.isBreakble(forwardUpNode, config) &&
      this.isBreakble(forwardNode, config)
    ) {
      breakNodes.push(forwardUpNode);
      breakNodes.push(forwardNode);
    }

    // If no blocks to break, return
    if (breakNodes.length === 0) return;

    // Calculate the total dig time
    const totalDigTime = breakNodes.reduce(
      (time, node) => time + this.getNodeDigTime(node),
      0
    );
    if (this.isBreakble(forwardUpNode, config) && this.isAir(forwardNode))
      targetNode.blocks.push(forwardUpNode);
    if (this.isBreakble(forwardNode, config) && this.isAir(forwardUpNode))
      targetNode.blocks.push(forwardNode);
    if (
      this.isBreakble(forwardUpNode, config) &&
      this.isBreakble(forwardNode, config)
    ) {
      targetNode.blocks.push(forwardUpNode);
      targetNode.blocks.push(forwardNode);
    }

    // Add the move to neighbors
    neighbors.push(
      this.makeBreakable(
        targetNode,
        this.COST_BREAK * Math.min(1, totalDigTime / divideFactor)
      )
    );
  }
}
class MoveBreakForwardUp extends Move {
  addNeighbors(neighbors, config, manager) {
    if (!config.breakBlocks) return;

    this.config = config;
    this.manager = manager;

    // Define relevant nodes
    const landingNode = this.up(1).forward(1);
    const standingNode = this.down(1, landingNode);

    const node2 = this.up(1, landingNode);

    const breakNode = landingNode.clone();
    const upNode = this.up(2);

    if (this.isStandable(landingNode)) return;

    // Check if standing node is already broken or not solid
    if (manager.isNodeBroken(standingNode) || !this.isSolid(standingNode))
      return;

    // Determine breakable blocks and calculate dig times
    const blocksToBreak = [];

    if (this.isBreakble(upNode, config)) blocksToBreak.push(upNode);
    if (this.isBreakble(breakNode, config)) blocksToBreak.push(breakNode);
    if (this.isBreakble(node2, config)) blocksToBreak.push(node2);

    // If no blocks need breaking, return
    if (blocksToBreak.length === 0) return;

    const totalDigTime = blocksToBreak.reduce(
      (time, node) => time + this.getNodeDigTime(node),
      0
    );

    this.break = true;
    if (this.isBreakble(upNode, config)) landingNode.blocks.push(upNode);
    if (this.isBreakble(breakNode, config)) landingNode.blocks.push(breakNode);
    if (this.isBreakble(node2, config)) landingNode.blocks.push(node2);

    // Add the move to neighbors
    neighbors.push(
      this.makeBreakable(
        landingNode,
        this.COST_BREAK *
          this.COST_UP *
          Math.min(1, totalDigTime / divideFactor)
      )
    );
  }
}

class MoveBreakForwardDown extends Move {
  addNeighbors(neighbors, config, manager) {
    if (!config.breakBlocks) return;
    let targetNode = this.forward(1).down(1);
    this.manager = manager;

    let breakNode = targetNode.clone();
    let forwardNode = this.forward(1);
    let forwardUpNode = this.up(1, forwardNode);
    let standingNode = this.down(1, targetNode);
    

    if (manager.isNodeBroken(standingNode)) return;

    if (!this.isSolid(standingNode)) return;

    let breakBlocks = [];

    if (
      this.isBreakble(forwardNode, config) &&
      this.isBreakble(breakNode, config) &&
      this.isBreakble(forwardUpNode, config)
    ) {
      breakBlocks.push(forwardUpNode);
      breakBlocks.push(forwardNode);
      breakBlocks.push(breakNode);
    }

    if (
      this.isBreakble(forwardNode, config) &&
      this.isAir(forwardUpNode) &&
      this.isBreakble(breakNode, config)
    ) {
      breakBlocks.push(forwardNode);
      breakBlocks.push(breakNode);
    }
    if (this.isBreakble(breakNode, config) && this.isWalkable(forwardNode))
      breakBlocks.push(breakNode);

    if (breakBlocks.length === 0) return;

    let totalDigTime = breakBlocks.reduce(
      (time, node) => time + this.getNodeDigTime(node),
      0
    );

    this.break = true;
    if (
      this.isBreakble(forwardNode, config) &&
      this.isBreakble(breakNode, config) &&
      this.isBreakble(forwardUpNode, config)
    ) {
      targetNode.blocks.push(forwardUpNode);
      targetNode.blocks.push(forwardNode);
      targetNode.blocks.push(breakNode);
    }

    if (
      this.isBreakble(forwardNode, config) &&
      this.isAir(forwardUpNode) &&
      this.isBreakble(breakNode, config)
    ) {
      targetNode.blocks.push(forwardNode);
      targetNode.blocks.push(breakNode);
    }
    if (this.isBreakble(breakNode, config) && this.isWalkable(forwardNode))
      targetNode.blocks.push(breakNode);

    neighbors.push(
      this.makeBreakable(
        targetNode,
        this.COST_BREAK *
          this.COST_UP *
          Math.min(1, totalDigTime / divideFactor)
      )
    );
  }
}

class MoveBreakDown extends Move {
  addNeighbors(neighbors, config, manager) {
    if (!config.breakBlocks) return;

    // Calculate the target positions
    let landingNode = this.down(1); // Step down one block
    let standingNode = this.down(1, landingNode); // The current standing node
    let breakNode = this.down(1); // The block to be broken (one step down)
    let downNode = this.down(2); // The block below that (to ensure no obstruction)

    this.config = config;
    this.manager = manager;

    // Ensure the standing node is not already broken
    if (manager.isNodeBroken(standingNode)) return;

    if (!this.isStandable(standingNode)) return;

    // Check if the standing node is solid, the break node is breakable, and no obstruction below
    if (
      !manager.isNodeBroken(standingNode) &&
      this.isSolid(standingNode) &&
      this.isAir(downNode) &&
      this.isBreakable(breakNode, config)
    ) {
      this.break = true;
      const digTime = this.getNodeDigTime(breakNode);

      landingNode.blocks.push(breakNode);

      neighbors.push(
        this.makeBreakable(landingNode, this.COST_BREAK * digTime)
      );
    }
  }
}

registerMoves([
  MoveBreakForward,
  MoveBreakForwardUp,
  MoveBreakForwardDown,
  // MoveBreakDown,
]);
