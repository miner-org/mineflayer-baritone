const { Move, registerMoves, DirectionalVec3 } = require("./");

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

class MoveForwardDownBreak extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (!this.config.breakBlocks) return;

    for (const dir of cardinalDirections) {
      this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, dir);
      const forward = this.origin.offset(dir.x, -1, dir.z); // drop one
      this.addNeighbors(neighbors, forward);
    }
  }

  addNeighbors(neighbors, node) {
    const belowNode = node.down(1); // Standing support
    const bodyNode = node; // Feet position
    const headNode = node.up(1); // Head level
    const topNode = node.up(2);

    if (!this.isSolid(belowNode)) return;

    node.attributes["name"] = this.name;
    node.attributes["break"] = [];

    if (!this.isAir(node)) {
      if (this.isBreakble(node)) node.attributes["break"].push(node.clone());
      else return;
    }

    if (!this.isAir(headNode)) {
      if (this.isBreakble(headNode))
        node.attributes["break"].push(headNode.clone());
      else return;
    }

    // Above head
    if (!this.isAir(topNode)) {
      if (this.isBreakble(topNode))
        node.attributes["break"].push(topNode.clone());
      else return;
    }

    node.attributes["name"] = this.name;

    const cost =
      this.COST_FALL + node.attributes["break"].length * this.COST_BREAK;

    neighbors.push(this.makeMovement(node, cost));
  }
}

registerMoves([
  // MoveBreakForward,
  // MoveBreakForwardUp,
  new MoveForwardDownBreak(),
  // MoveBreakDown,
]);
