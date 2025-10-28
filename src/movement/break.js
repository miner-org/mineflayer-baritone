const { Move, registerMoves, DirectionalVec3 } = require("./");

class MoveForwardDownBreak extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (!this.config.breakBlocks) return;

    for (const dir of cardinalDirections) {
      const originVec = new DirectionalVec3(origin.x, origin.y, origin.z, dir);

      // moving diagonally down one block
      const forwardNode = originVec.offset(dir.x, -1, dir.z);

      this.addNeighbors(neighbors, forwardNode, originVec);
    }
  }

  addNeighbors(neighbors, node, originVec) {
    const belowNode = node.down(1); // landing support
    const bodyNode = node; // feet
    const headNode = node.up(1);
    const topNode = node.up(2);

    // must be exactly one lower than origin
    if (Math.floor(node.y) !== Math.floor(originVec.y) - 1) return;

    // if it's already standable, no need for a break move
    if (this.isStandable(node)) return;

    // we must land on solid ground (and that ground must not be scheduled as broken)
    if (!this.isSolid(belowNode))
      return;

    // initialize
    node.attributes = node.attributes || {};
    node.attributes.name = this.name;
    node.attributes.break = [];

    // --- BODY (feet) ---
    if (!this.isAir(bodyNode)) {
      // if body is non-air and not breakable -> fail
      if (!this.isBreakable(bodyNode) ) {
        if (this.config.debugMoves)
          console.debug(
            `[${this.name}] body unbreakable: ${bodyNode.toString()}`
          );
        return;
      }
      node.attributes.break.push(bodyNode.clone());
    }

    // --- HEAD ---
    if (!this.isAir(headNode)) {
      if (!this.isBreakable(headNode) ) {
        if (this.config.debugMoves)
          console.debug(
            `[${this.name}] head unbreakable: ${headNode.toString()}`
          );
        return;
      }
      node.attributes.break.push(headNode.clone());
    }

    // --- ABOVE HEAD clearance ---
    if (!this.isAir(topNode)) {
      if (!this.isBreakable(topNode)) {
        if (this.config.debugMoves)
          console.debug(
            `[${this.name}] top unbreakable: ${topNode.toString()}`
          );
        return;
      }
      node.attributes.break.push(topNode.clone());
    }

    // --- Important: ensure this is actually a "break" scenario ---
    // If nothing would be broken (all air), then this move is redundant — bail.
    if ((node.attributes.break || []).length === 0) {
      if (this.config.debugMoves)
        console.debug(
          `[${this.name}] no blocks to break at ${node.toString()} — skipping`
        );
      return;
    }

    // compute cost + push
    const breakCost = node.attributes.break.length * this.COST_BREAK;
    const totalCost = this.COST_FALL + breakCost + 0.5;

    node.attributes.cost = totalCost;
    node.attributes.fallDistance = 1;

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
    if (!this.isSolid(footBlock))
      return;
    if (!this.isWalkable(this.origin)) return; // Can't start break if cramped

    let current = node.clone();
    const breakChain = [];
    let fallDepth = 0;

    for (let i = 0; i < 3; i++) {
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
