const { Move, registerMoves } = require("./");

class MoveBreakForward extends Move {
  addNeighbors(neighbors, config, manager, name) {
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
    if (this.isBreakble(forwardUpNode, config)) breakNodes.push(forwardUpNode);
    if (this.isBreakble(forwardNode, config)) breakNodes.push(forwardNode);

    // If no blocks to break, return
    if (breakNodes.length === 0) return;

    // Calculate the total dig time
    const totalDigTime = breakNodes.reduce(
      (time, node) => time + this.getNodeDigTime(node),
      0
    );
    targetNode.blocks.push(...breakNodes);

    targetNode.attributes["name"] = name;
    // Add the move to neighbors
    neighbors.push(
      this.makeBreakable(
        targetNode,
        this.COST_BREAK + Math.max(1, totalDigTime)
      )
    );
  }
}
class MoveBreakForwardUp extends Move {
  addNeighbors(neighbors, config, manager, name) {
    if (!config.breakBlocks) return;

    this.config = config;
    this.manager = manager;

    // Define relevant nodes
    const landingNode = this.up(1).forward(1);
    const standingNode = this.down(1, landingNode);

    const node2 = this.up(1, landingNode);

    const breakNode = landingNode.clone();
    const upNode = this.up(2);

    if (this.isStandable(landingNode) && this.isAir(upNode)) return;

    // Check if standing node is already broken or not solid
    if (manager.isNodeBroken(standingNode) || !this.isSolid(standingNode))
      return;

    // Determine breakable blocks and calculate dig times
    const blocksToBreak = [];

    if (this.isBreakble(breakNode, config)) blocksToBreak.push(breakNode);

    if (this.isBreakble(upNode, config)) blocksToBreak.push(upNode);
    if (this.isBreakble(node2, config)) blocksToBreak.push(node2);

    // If no blocks need breaking, return
    if (blocksToBreak.length === 0) return;

    const totalDigTime = blocksToBreak.reduce(
      (time, node) => time + this.getNodeDigTime(node),
      0
    );

    // this.break = true;
    landingNode.blocks.push(...blocksToBreak);

    landingNode.attributes["name"] = name;

    // Add the move to neighbors
    neighbors.push(
      this.makeBreakable(
        landingNode,
        this.COST_BREAK + Math.max(1, totalDigTime)
      )
    );
  }
}

class MoveBreakForwardDown extends Move {
  addNeighbors(neighbors, config, manager, name) {
    if (!config.breakBlocks) return;
    let targetNode = this.forward(1).down(1);
    this.manager = manager;

    // if (this.isSolid(this.down(0))) return;

    if (this.isStandable(targetNode)) return;

    let forwardNode = this.forward(1);
    let breakNode = forwardNode.down(1);
    let forwardUpNode = this.forward(1).up(1);
    let standingNode = this.down(1, targetNode);

    if (manager.isNodeBroken(standingNode)) return;

    if (!this.isSolid(standingNode)) return;

    if (this.isStandable(targetNode)) return;

    let breakBlocks = [];

    if (
      this.isSolid(forwardUpNode, ) ||
      this.isSolid(forwardUpNode.up(1))
    ) {
      breakBlocks.push(forwardUpNode);
    }
    if (this.isBreakble(forwardNode, config)) breakBlocks.push(forwardNode);

    if (this.isBreakble(breakNode, config)) breakBlocks.push(breakNode);

    // if (
    //   this.isBreakble(forwardNode, config) &&
    //   this.isAir(forwardUpNode) &&
    //   this.isBreakble(breakNode, config)
    // ) {
    //   breakBlocks.push(forwardNode);
    //   breakBlocks.push(breakNode);
    // }
    // if (this.isBreakble(breakNode, config) && this.isWalkable(forwardNode))
    //   breakBlocks.push(breakNode);

    if (breakBlocks.length === 0) return;

    // console.log("Breakblcosk", breakBlocks)

    //check if forwardNode and breakNode are breakable
    if (
      breakBlocks.includes(forwardNode) &&
      breakBlocks.includes(breakNode) &&
      this.isBreakble(forwardUpNode, config) &&
      !breakBlocks.includes(forwardUpNode)
    ) {
      breakBlocks.push(forwardUpNode);
    }

    if (
      breakBlocks.includes(forwardUpNode) &&
      breakBlocks.includes(breakNode) &&
      this.isBreakble(forwardNode, config) &&
      !breakBlocks.includes(forwardNode)
    ) {
      breakBlocks.push(forwardNode);
    }

    if (
      breakBlocks.length === 2 &&
      !breakBlocks.includes(forwardUpNode) &&
      this.isBreakble(forwardUpNode, config)
    ) {
      console.log("shit");
      breakBlocks.push(forwardUpNode);
    }

    let totalDigTime = breakBlocks.reduce(
      (time, node) => time + this.getNodeDigTime(node),
      0
    );

    // this.break = true;
    targetNode.blocks.push(...breakBlocks);

    // if (
    //   this.isBreakble(forwardNode, config) &&
    //   this.isAir(forwardUpNode) &&
    //   this.isBreakble(breakNode, config)
    // ) {
    //   targetNode.blocks.push(forwardNode);
    //   targetNode.blocks.push(breakNode);
    // }
    // if (this.isBreakble(breakNode, config) && this.isWalkable(forwardNode))
    //   targetNode.blocks.push(breakNode);
    targetNode.attributes["name"] = name;

    neighbors.push(
      this.makeBreakable(
        targetNode,
        this.COST_BREAK + Math.max(1, totalDigTime)
      )
    );
  }
}

class MoveBreakDown extends Move {
  addNeighbors(neighbors, config, manager, name) {
    if (!config.breakBlocks) return;

    let targetNode = this.down(1);
    let blockBelow = this.down(1);
    let blockTwoBelow = this.down(2);

    // Safety checks
    if (!this.isBreakble(blockBelow, config)) return;
    
    if (!this.isSafeToFallInto(blockTwoBelow)) return; // custom function

    let digTime = this.getNodeDigTime(blockBelow);
    if (digTime === 0) return;

    let fallCost = this.getFallCost(blockTwoBelow); // could be 1 for safe, higher for risk

    targetNode.blocks.push(blockBelow);
    targetNode.attributes["name"] = name;

    neighbors.push(
      this.makeBreakable(
        targetNode,
        this.COST_BREAK + digTime + fallCost
      )
    );
  }

  isSafeToFallInto(node) {
    if (this.isWater(node)) return false;
    if (this.isAir(node)) return true;
    if (this.isWalkable(node)) return true;
    return false;
  }

  getFallCost(node) {
    // You can make this more nuanced if you want
    return this.isAir(node) ? 1 : 0;
  }
}


registerMoves([
  MoveBreakForward,
  // MoveBreakForwardUp,
  // MoveBreakForwardDown,
  // MoveBreakDown,
]);
