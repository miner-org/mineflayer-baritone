const { Move, registerMoves, DirectionalVec3 } = require("./");

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

    node.attributes["cost"] = cost;

    neighbors.push(this.makeMovement(node, cost));
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
    let current = node.clone();
    const breakChain = [];
    let fallDepth = 0;

    // Allow breaking up to 3 blocks downward until solid block found
    for (let i = 0; i < 3; i++) {
      const below = current.down(1);
      if (this.manager.isNodeBroken(current)) return;

      if (this.isBreakble(current, this.config)) {
        breakChain.push(current.clone());
      } else if (this.isAir(current)) {
        // keep going down
      } else if (this.isSolid(current)) {
        break; // found floor
      } else {
        return; // not breakable or air, e.g. liquid
      }

      current = below;
      fallDepth++;
    }

    if (fallDepth === 0) return;

    const landingBlock = current;
    if (!this.isSolid(landingBlock)) return;

    const moveNode = landingBlock.up(1); // we land above the solid block
    moveNode.attributes = {};
    moveNode.attributes["name"] = this.name;
    moveNode.attributes["break"] = breakChain;

    const cost =
      this.COST_FALL + breakChain.length * this.COST_BREAK + fallDepth * 0.5; // slight fall penalty
    moveNode.attributes["cost"] = cost;

    neighbors.push(this.makeMovement(moveNode, cost));
  }
}

registerMoves([new MoveForwardDownBreak(), new MoveBreakDown()]);
