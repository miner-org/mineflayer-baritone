const { Move, registerMoves } = require("./");

class MoveForward extends Move {
  addNeighbors(neighbors, config, manager, name) {
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

    let avoidancePenalty = this.getAvoidancePenalty(
      forwardNode,
      config.avoidDistance
    ); // Avoid within 3 blocks radius
    let movementCost = this.COST_NORMAL + avoidancePenalty;

    // Handle half blocks like slabs
    if (this.isHalfBlock(forwardNode)) {
      let adjustedNode = this.getAdjustedNodeSlab(forwardNode);
      neighbors.push(this.makeMovement(adjustedNode, movementCost));
      return;
    }

    if (this.isStair(forwardNode)) {
      let adjustedNode = this.getAdjustedNodeStair(forwardNode);
      neighbors.push(this.makeMovement(adjustedNode, movementCost));
      return;
    }

    // Handle regular movement
    if (this.isStandable(forwardNode)) {
      forwardNode.attributes["name"] = name;
      neighbors.push(this.makeMovement(forwardNode, movementCost));
      return;
    }

    if (this.isWalkable(forwardNode) && !this.isSolid(standingNode)) {
      if (!config.placeBlocks) return;
      if (!this.hasScaffoldingBlocks()) return;
      forwardNode.attributes["name"] = name;
      forwardNode.blocks.push(standingNode);
      neighbors.push(this.makePlace(forwardNode, this.COST_PLACE));
      return;
    }
  }

  // Helper to adjust Y-level for half blocks
  getAdjustedNodeSlab(node) {
    if (this.isSlab(node)) {
      // Adjust the Y-level dynamically for half blocks
      return node.up(0.5);
    }
    return node;
  }

  // Helper to adjust Y-level for stairs
  getAdjustedNodeStair(node) {
    // Handle the stair shapes provided
    // First, check if we need to adjust based on the stair shape.
    // Since stair shape is already offset by 0.5, we focus on Y adjustments.

    let stepOffset = 0.5; // Stair offset based on the shape you provided

    // Check the shape of the stair. The stair has two parts based on your input.
    let stairShape = this.getStairShape(node);

    // If the stair step is the lower part (starting step), we need to adjust the Y-level upward
    if (stairShape === 1) {
      return node.up(stepOffset);
    }
    // If it's the upper part of the stair, adjust by 0.5
    return node.up(stepOffset * 2);
  }

  // Helper function to determine the shape of the stair
  getStairShape(node) {
    // Determine if we are at the bottom (0.5 height) or top (1.0 height) of the stair
    let yOffset = node.y % 1;
    if (yOffset === 0.5) {
      return 1; // Lower part of the stair
    }
    return 2; // Upper part of the stair
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
      forwardNode.attributes["name"] = this.name;

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
  addNeighbors(neighbors, config, manager, name) {
    let targetNode = this.forward(1).up(1);
    let standingNode = this.forward(1);
    this.manager = manager;
    let headRoomNode = this.up(1);

    if (manager.isNodeBroken(standingNode)) return;

    // 1. Try walk
    if (this.isSolid(standingNode)) {
      if (this.isWalkable(headRoomNode) && this.isStandable(targetNode)) {
        targetNode.attributes["name"] = name;
        neighbors.push(this.makeMovement(targetNode, this.COST_UP));
        return;
      }
    }

    // 2. Try place block
    if (config.placeBlocks) {
      if (
        this.hasScaffoldingBlocks() &&
        this.isWalkable(targetNode) &&
        this.isSolid(standingNode.down(1))
      ) {
        targetNode.attributes["name"] = name;
        targetNode.blocks.push(standingNode);
        neighbors.push(this.makePlace(targetNode, this.COST_PLACE));
        return;
      }
    }

    // 3. Try breaking blocks
    if (config.breakBlocks) {
      let blocksToBreak = [];

      let aboveTarget = targetNode.up(1);
      let headRoomNode1 = headRoomNode.up(1);

      if (!this.isSolid(standingNode)) return;

      if (this.isBreakble(headRoomNode1, config))
        blocksToBreak.push(headRoomNode1);
      if (this.isBreakble(aboveTarget, config)) blocksToBreak.push(aboveTarget);
      if (this.isBreakble(targetNode, config)) blocksToBreak.push(targetNode);

      if (blocksToBreak.length === 0) return;

      let totalDigTime = 0;
      for (let block of blocksToBreak) {
        totalDigTime += this.getNodeDigTime(block);
      }

      if (totalDigTime === 0) return;

      targetNode.blocks.push(...blocksToBreak);
      targetNode.attributes["name"] = name;
      neighbors.push(
        this.makeBreakable(
          targetNode,
          this.COST_BREAK + Math.max(1, totalDigTime)
        )
      );
    }
  }
}

class MoveForwardDown extends Move {
  addNeighbors(neighbors, config, manager) {
    const maxFallDist = config.maxFallDist || 3;
    let walkableNode = this.forward(1);


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
        this.isWalkable(walkableNode) &&
        !this.almostFullBlock(landingNode) &&
        this.isStandable(landingNode) &&
        !this.isStandable(walkableNode) &&
        !manager.isNodeBroken(landingNode.down(1))
      ) {
        neighbors.push(this.makeMovement(landingNode, this.COST_FALL * cost));
        landingNode.attributes["name"] = this.name;
        return; // Exit early since we found a valid path
      }
    }


    if (this.isSolid(walkableNode.down(1))) {
      if (!config.breakBlocks) return;
      let breakNode = walkableNode.down(1);
      let potentialNode = walkableNode.up(1);

      if (!this.isSolid(landingNode.down(1))) return;

      let blocksToBreak = [];

      if (this.isBreakble(potentialNode, config))
        blocksToBreak.push(potentialNode);
      if (this.isBreakble(walkableNode, config))
        blocksToBreak.push(walkableNode);
      if (this.isBreakble(breakNode, config)) blocksToBreak.push(breakNode);

      if (blocksToBreak.length === 0) return;

      let totalDigTime = 0;
      for (let block of blocksToBreak) {
        totalDigTime += this.getNodeDigTime(block);
      }

      if (totalDigTime === 0) return;

      breakNode.blocks.push(...blocksToBreak);
      breakNode.attributes["name"] = this.name;
      neighbors.push(
        this.makeBreakable(
          breakNode,
          this.COST_BREAK + Math.max(1, totalDigTime)
        )
      );
    }
  }
}

//for jumping into water from high falls
class MoveForwardDownWater extends Move {
  addNeighbors(neighbors, config) {
    const maxFallDist = config.maxWaterDist || 256;

    let walkableNode = this.forward(1);

    if (!this.isWalkable(walkableNode)) return;

    if (this.isSolid(this.down(1, walkableNode))) return;

    let landingNode = walkableNode.clone();
    let cost = 0;
    for (let i = 0; i < maxFallDist; i++) {
      cost += 1;
      landingNode = landingNode.down(1);

      if (this.isSolid(landingNode)) return;

      if (
        this.isWater(landingNode) &&
        this.isSolid(landingNode.down(1)) &&
        this.isAir(landingNode.up(1))
      ) {
        landingNode.attributes["name"] = this.name;
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
      landingNode.attributes["name"] = this.name;
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
