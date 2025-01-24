const { Move, registerMoves } = require("./");

class MoveForward extends Move {
  addNeighbors(neighbors, config, manager) {
    let forwardNode = this.forward(1);
    let standingNode = this.down(1, forwardNode);

    // Water movement handling
    if (this.isWater(this.origin)) {
      if (this.isWater(forwardNode)) {
        neighbors.push(this.makeMovement(forwardNode, this.COST_SWIM));
      }
      return;
    }

    // Prevent moving into broken nodes
    if (manager.isNodeBroken(standingNode)) return;

    // Handle half blocks like slabs and stairs
    if (this.isHalfBlock(forwardNode)) {
      let adjustedNode = this.getAdjustedNode(forwardNode);
      neighbors.push(this.makeMovement(adjustedNode, this.COST_NORMAL));
      return;
    }

    // Handle regular movement
    if (this.isStandable(forwardNode)) {
      neighbors.push(this.makeMovement(forwardNode, this.COST_NORMAL));
    }
  }

  // Helper to adjust Y-level for half blocks
  getAdjustedNode(node) {
    if (this.isStair(node) || this.isSlab(node)) {
      // Adjust the Y-level dynamically for half blocks
      return node.up(0.5);
    }
    return node;
  }
}

class MoveDiagonal extends Move {
  addNeighbors(neighbors, config, manager) {
    let forwardNode = this.forward(1);
    let rightNode = this.right(1);
    let targetNode = this.right(1, forwardNode);

    if (manager.isNodeBroken(targetNode.down(1))) return;

    //water movements
    // if (this.isWater(this.origin)) {
    //   if (
    //     this.isWater(forwardNode) &&
    //     this.isWater(rightNode) &&
    //     this.isWater(targetNode)
    //   ) {
    //     neighbors.push(this.makeMovement(targetNode, this.COST_DIAGONAL));
    //   }

    //   return;
    // }

    if (!this.isStandable(forwardNode) && !this.isStandable(rightNode)) return;

    if (this.isStandable(targetNode)) {
      neighbors.push(this.makeMovement(targetNode, this.COST_DIAGONAL));
    }
  }
}

// class MoveForwardUp extends Move {
//   addNeighbors(neighbors, config, manager) {
//     let landingNode = this.up(1).forward(1);
//     let standingNode = this.down(1, landingNode);
//     let upNode = this.up(1);

//     this.config = config;
//     this.manager = manager;
//     if (manager.isNodeBroken(standingNode)) return;

//     if (
//       this.isWalkable(upNode) &&
//       this.isStandable(landingNode) &&
//       !this.isFence(standingNode)
//     ) {
//       neighbors.push(this.makeMovement(landingNode, this.COST_UP));
//     }
//   }
// }

class MoveForwardUp extends Move {
  addNeighbors(neighbors, config, manager) {
    let targetNode = this.forward(1).up(1);
    let standingNode = this.forward(1);

    let headRoomNode = this.up(1);

    if (manager.isNodeBroken(standingNode)) return;

    if (!this.isSolid(standingNode)) return;

    if (
      this.isWalkable(headRoomNode) &&
      (this.isStandable(targetNode) || this.isStair(targetNode))
    ) {
      neighbors.push(this.makeMovement(targetNode, this.COST_UP));
    }
  }
}

class MoveForwardDown extends Move {
  addNeighbors(neighbors, config, manager) {
    const maxFallDist = config.maxFallDist || 3;
    let walkableNode = this.forward(1);

    // Check if the initial node is walkable
    if (!this.isWalkable(walkableNode)) return;

    if (this.isStair(this.down(1, walkableNode))) {
      neighbors.push(
        this.makeMovement(this.down(1, walkableNode), this.COST_FALL)
      );

      return;
    }

    let landingNode = walkableNode;
    let cost = 0;

    // Loop through downward nodes within the max fall distance
    for (let i = 0; i < maxFallDist; i++) {
      landingNode = landingNode.down(1); // Go down one level
      cost += 1; // Increment cost

      // If a standable node is found, add it as a valid neighbor
      if (
        this.isStandable(landingNode) &&
        !this.isStandable(walkableNode) &&
        !manager.isNodeBroken(landingNode.down(1))
      ) {
        neighbors.push(this.makeMovement(landingNode, this.COST_FALL * cost));
        return; // Exit early since we found a valid path
      }
    }
  }
}

//for entering water
class MoveForwardDownWater extends Move {
  addNeighbors(neighbors, config) {
    const maxFallDist = config.maxWaterDist || 256;

    let walkableNode = this.forward(1);

    if (!this.isWalkable(walkableNode)) return;

    let landingNode = walkableNode.clone();
    let cost = 0;
    for (let i = 0; i < maxFallDist; i++) {
      cost += 1;

      if (
        this.isWater(landingNode) &&
        this.isSolid(landingNode.down(1)) &&
        this.isAir(landingNode.up(1))
      ) {
        neighbors.push(this.makeMovement(landingNode, this.COST_FALL * cost));
        return;
      }
    }
  }
}

class MoveDiagonalUp extends Move {
  addNeighbors(neighbors, config, manager) {
    // Node diagonally up (forward and right)
    let landingNode = this.forward(1).right(1).up(1);

    // Clearance checks
    let forwardNode = this.forward(1); // Node directly forward
    let rightNode = this.right(1); // Node directly right
    let headNode1 = forwardNode.up(1); // Space above forward
    let headNode2 = rightNode.up(1); // Space above right
    let air = this.up(1);

    if (manager.isNodeBroken(landingNode.down(1))) return;

    if (!this.isWalkable(forwardNode) && !this.isWalkable(rightNode)) return;

    if (!this.isWalkable(air)) return;

    // Check if there's enough headroom and clearance
    if (!this.isWalkable(headNode1) || !this.isWalkable(headNode2)) return;

    // Ensure the landing node is standable
    if (
      this.isWalkable(headNode1) &&
      this.isStandable(landingNode) &&
      this.isWalkable(headNode2)
    ) {
      neighbors.push(
        this.makeMovement(landingNode, this.COST_DIAGONAL * this.COST_UP)
      );
    }
  }
}

registerMoves([
  MoveForward,
  MoveForwardUp,
  MoveForwardDown,
  MoveDiagonal,
  MoveForwardDownWater,
  MoveDiagonalUp,
]);
