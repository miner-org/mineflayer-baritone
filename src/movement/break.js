const { Move, registerMoves, DirectionalVec3 } = require("./");

class MoveForwardDownBreak extends Move {
  generate(cardinalDirections, origin, neighbors) {
    // ❌ If breaking blocks is disabled, skip this move
    if (!this.config.breakBlocks) return;

    for (const dir of cardinalDirections) {
      this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, dir);

      // We are moving diagonally down one block
      const forwardNode = this.origin.offset(dir.x, -1, dir.z);
      this.addNeighbors(neighbors, forwardNode);
    }
  }

  addNeighbors(neighbors, node) {
    const belowNode = node.down(1); // support block
    const bodyNode = node; // feet position
    const headNode = node.up(1); // head space
    const topNode = node.up(2); // clearance above head

    // ✅ Must actually be lower than origin
    // In addNeighbors():
    if (node.y !== this.origin.y - 1) return; // ✅ must be exactly 1 down

    // ❌ If we can already stand there, no need for a "break" move
    if (this.isStandable(node)) return;

    // ✅ Ensure we land on something solid
    if (!this.isSolid(belowNode) || this.manager.isNodeBroken(belowNode))
      return;

    // ✅ Initialize attributes
    node.attributes["name"] = this.name;
    node.attributes["break"] = [];

    // --- Check body block (feet position) ---
    if (!this.isAir(bodyNode)) {
      if (this.isBreakable(bodyNode)) {
        if (this.manager.isNodeBroken(bodyNode)) return;
        node.attributes["break"].push(bodyNode.clone());
      } else return;
    }

    // --- Check head block ---
    if (!this.isAir(headNode)) {
      if (this.isBreakable(headNode)) {
        if (this.manager.isNodeBroken(headNode)) return;
        node.attributes["break"].push(headNode.clone());
      } else return;
    }

    // --- Check block above head for jump clearance ---
    if (!this.isAir(topNode)) {
      if (this.isBreakable(topNode)) {
        if (this.manager.isNodeBroken(topNode)) return;
        node.attributes["break"].push(topNode.clone());
      } else return;
    }

    // ✅ Compute cost (fall + breaking)
    const breakCost = node.attributes["break"].length * this.COST_BREAK;
    const totalCost = this.COST_FALL + breakCost + 0.5; // slight penalty

    node.attributes["cost"] = totalCost;
    node.attributes["fallDistance"] = 1; // always 1-block down break

    neighbors.push(this.makeMovement(node, totalCost));
  }
}

class MoveBreakDown extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (!this.config.breakBlocks) return;

    this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, {
      x: 0,
      z: 0,
    });
    const down = this.origin.offset(0, -1, 0); // drop one
    this.addNeighbors(neighbors, down);
  }

  /**
   *
   * @param {DirectionalVec3[]} neighbors
   * @param {DirectionalVec3} node
   */
  addNeighbors(neighbors, node) {
    const footBlock = this.origin.down(1);

    // 🔹 Must start on something safe to break down
    if (!this.isSolid(footBlock) || this.manager.isNodeBroken(footBlock))
      return;
    if (!this.isWalkable(this.origin)) return; // Can't start break if cramped

    let current = node.clone();
    const breakChain = [];
    let fallDepth = 0;

    for (let i = 0; i < 3; i++) {
      if (this.manager.isNodeBroken(current)) return;

      if (this.isBreakable(current, this.config)) {
        breakChain.push(current.clone());
      } else if (this.isAir(current)) {
        // free fall
      } else if (this.isSolid(current)) {
        break; // found floor
      } else {
        return; // liquids or other junk
      }

      current = current.down(1);
      fallDepth++;
    }

    if (fallDepth === 0 || breakChain.length === 0) return;

    const landingBlock = current;
    if (!this.isSolid(landingBlock)) return;

    const moveNode = landingBlock.up(1);
    moveNode.attributes = {
      name: this.name,
      break: breakChain,
      cost:
        this.COST_FALL + breakChain.length * this.COST_BREAK + fallDepth * 0.5,
    };

    neighbors.push(this.makeMovement(moveNode, moveNode.attributes.cost));
  }
}

registerMoves([new MoveForwardDownBreak(30), new MoveBreakDown(30)]);
