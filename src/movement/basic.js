const { Move, registerMoves, DirectionalVec3, clamp } = require("./");

class MoveForward extends Move {
  generate(cardinalDirections, origin, neighbors) {
    for (const dir of cardinalDirections) {
      this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, dir);

      const node = new DirectionalVec3(
        this.origin.x + dir.x,
        this.origin.y,
        this.origin.z + dir.z,
        dir
      );

      this.addNeighbors(neighbors, node);
    }
  }

  addNeighbors(neighbors, node) {
    const headNode = node.up(1);
    const belowNode = node.down(1);

    const canPlace = this.config.placeBlocks && this.hasScaffoldingBlocks();
    const canBreak = this.config.breakBlocks;

    node.attributes["name"] = this.name;
    node.attributes["break"] = [];
    node.attributes["place"] = [];

    const isSolidBelow = this.isSolid(belowNode);
    const isAirBelow = this.isAir(belowNode);

    if (this.manager.isNodeBroken(belowNode)) return;

    // Determine if we can stand (either on solid block or placed one)
    const canStand =
      isSolidBelow || (canPlace && this.canPlaceBlock(belowNode));

    if (!canStand) return;

    // Place block if needed
    if (
      !isSolidBelow &&
      canPlace &&
      this.canPlaceBlock(belowNode) &&
      !this.manager.isAreaMarkedNode(belowNode)
    ) {
      node.attributes["place"].push(belowNode.clone());
    }

    // Make sure body and head space are valid (or breakable)
    if (!this.isAir(node)) {
      if (this.isBreakble(node) && canBreak)
        node.attributes["break"].push(node.clone());
      else return;
    }

    if (!this.isAir(headNode)) {
      if (this.isBreakble(headNode) && canBreak)
        node.attributes["break"].push(headNode.clone());
      else return;
    }

    // We’ll assume config.scaffoldingLeft is available
    const remainingScaffolding = this.scaffoldingLeft() ?? 16; // fallback

    // Give expensive cost to avoid spamming blocks
    const scarcityFactor = clamp(20 / remainingScaffolding, 1, 10);
    const placeCost =
      (node.attributes["place"].length || 0) * this.COST_PLACE * scarcityFactor;

    const breakCost = (node.attributes["break"].length || 0) * this.COST_BREAK;

    const totalCost = this.COST_NORMAL + placeCost + breakCost;

    node.attributes["cost"] = totalCost;

    neighbors.push(this.makeMovement(node, totalCost));
  }

  canPlaceBlock(pos) {
    // Check if there is a solid neighbor to attach to
    const offsets = [
      [0, -1, 0],
      [1, 0, 0],
      [-1, 0, 0],
      [0, 0, 1],
      [0, 0, -1],
    ];

    return offsets.some(([dx, dy, dz]) => {
      const neighbor = pos.offset(dx, dy, dz);
      return this.isSolid(neighbor);
    });
  }
}

class MoveDiagonal extends Move {
  generate(cardinalDirections, origin, neighbors) {
    const diagonalOffsets = [
      { x: 1, z: 1 },
      { x: -1, z: 1 },
      { x: 1, z: -1 },
      { x: -1, z: -1 },
    ];

    for (const offset of diagonalOffsets) {
      this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, offset);

      const node = this.origin.offset(offset.x, 0, offset.z);

      // Check cardinal adjacent blocks
      const adj1 = this.origin.offset(offset.x, 0, 0); // East/West
      const adj2 = this.origin.offset(0, 0, offset.z); // North/South

      this.addNeighbors(neighbors, node, adj1, adj2);
    }
  }

  addNeighbors(neighbors, node, adj1, adj2) {
    const headNode = node.up(1);

    // Prevent corner cutting
    if (!this.isWalkable(adj1) || !this.isWalkable(adj2)) return;

    // Proceed with movement
    if (
      this.isWalkable(node) &&
      this.isStandable(node) &&
      this.isWalkable(headNode)
    ) {
      node.attributes["name"] = this.name;
      const cost = this.COST_DIAGONAL;
      node.attributes["cost"] = cost;
      neighbors.push(this.makeMovement(node, cost));
    }
  }
}

class MoveForwardUp extends Move {
  generate(cardinalDirections, origin, neighbors) {
    for (const dir of cardinalDirections) {
      this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, dir);

      const node = new DirectionalVec3(
        this.origin.x + dir.x,
        this.origin.y + 1,
        this.origin.z + dir.z,
        dir
      );

      const upNode = new DirectionalVec3(
        this.origin.x,
        this.origin.y + 2,
        this.origin.z,
        dir
      );

      this.addNeighbors(neighbors, node, upNode);
    }
  }

  /**
   *
   * @param {DirectionalVec3[]} neighbors
   * @param {DirectionalVec3} node
   * @param {DirectionalVec3} upNode
   * @returns
   */
  addNeighbors(neighbors, node, upNode) {
    const belowNode = node.down(1); // Block under landing position
    const headNode = node.up(1); // Head space at landing

    if (this.manager.isNodeBroken(node)) return;

    if (this.manager.isNodeBroken(belowNode)) return;

    const canPlace = this.config.placeBlocks && this.hasScaffoldingBlocks();
    const isSolidBelow = this.isSolid(belowNode);
    const isAirBelow = this.isAir(belowNode);

    const canScaffold =
      !isSolidBelow &&
      isAirBelow &&
      canPlace &&
      this.canPlaceBlock(belowNode) &&
      !this.manager.isNodeBroken(belowNode) &&
      !this.manager.isAreaMarkedNode(belowNode);

    // Skip if we can't stand on it and can't scaffold either
    if (!isSolidBelow && !canScaffold) return;

    node.attributes["name"] = this.name;
    node.attributes["break"] = [];
    node.attributes["place"] = [];

    // Scaffold if needed
    if (!isSolidBelow && canScaffold) {
      node.attributes["place"].push(belowNode.clone());
    }

    const testNodes = [upNode, node, headNode];

    for (const testNode of testNodes) {
      if (!this.isAir(testNode)) {
        if (this.config.breakBlocks && this.isBreakble(testNode)) {
          if (this.manager.isNodeBroken(testNode)) return;
          node.attributes["break"].push(testNode.clone());
        } else {
          return; // Not air and can't be broken
        }
      }
    }

    const breakCost = node.attributes["break"].length * this.COST_BREAK;
    const placeCost = node.attributes["place"].length * this.COST_PLACE;

    const totalCost = this.COST_UP + breakCost + placeCost;
    node.attributes["cost"] = totalCost;
    node.attributes["nJump"] = true;

    neighbors.push(this.makeMovement(node, totalCost));
  }

  canPlaceBlock(pos) {
    const offsets = [
      [0, -1, 0],
      [1, 0, 0],
      [-1, 0, 0],
      [0, 0, 1],
      [0, 0, -1],
    ];

    return offsets.some(([dx, dy, dz]) => {
      const neighbor = pos.offset(dx, dy, dz);
      return this.isSolid(neighbor);
    });
  }
}

class MoveForwardDown extends Move {
  generate(cardinalDirections, origin, neighbors) {
    for (const dir of cardinalDirections) {
      this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, dir);

      const forward = this.origin.offset(dir.x, 0, dir.z);
      this.addNeighbors(neighbors, forward);
    }
  }

  addNeighbors(neighbors, forward) {
    if (!this.isWalkable(forward)) return;

    let maxFall = this.config.maxFallDist ?? 3;
    let fallDistance = 0;
    let below = forward.down(1);

    while (fallDistance < maxFall && this.isAir(below)) {
      fallDistance++;
      below = below.down(1);
    }

    if (!this.isSolid(below)) return;

    // The node we're actually trying to stand in
    const targetNode = below.up(1);

    // Still need to make sure we can fit there
    if (!this.isWalkable(targetNode)) return;

    targetNode.attributes["name"] = this.name;
    targetNode.attributes["fallDistance"] = fallDistance;

    const cost =
      this.COST_FALL +
      (fallDistance > 0 ? fallDistance * (this.COST_FALL_PER_BLOCK ?? 1) : 0);
    targetNode.attributes["cost"] = cost;
    neighbors.push(this.makeMovement(targetNode, cost));
  }
}

class MoveDiagonalUp extends Move {
  generate(cardinalDirections, origin, neighbors) {
    const diagonalOffsets = [
      { x: 1, z: 1 },
      { x: -1, z: 1 },
      { x: 1, z: -1 },
      { x: -1, z: -1 },
    ];

    for (const offset of diagonalOffsets) {
      this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, offset);

      const node = this.origin.offset(offset.x, 1, offset.z);

      // Check cardinal adjacent blocks
      const adj1 = this.origin.offset(offset.x, 1, 0); // East/West
      const adj2 = this.origin.offset(0, 1, offset.z); // North/South

      this.addNeighbors(neighbors, node, adj1, adj2);
    }
  }

  addNeighbors(neighbors, node, adj1, adj2) {
    const headNode = node.up(1);
    const idk = this.origin.up(1);

    // Prevent corner cutting
    if (!this.isWalkable(adj1) || !this.isWalkable(adj2)) return;

    // Proceed with movement
    if (
      this.isWalkable(node) &&
      this.isStandable(node) &&
      this.isWalkable(headNode) &&
      this.isWalkable(idk)
    ) {
      node.attributes["name"] = this.name;
      node.attributes["cost"] = this.COST_DIAGONAL + this.COST_UP;
      node.attributes["nJump"] = true;
      neighbors.push(
        this.makeMovement(node, this.COST_DIAGONAL + this.COST_UP)
      );
    }
  }
}

class TestMove extends Move {
  generate(cardinalDirections, origin, neighbors) {
    for (const dir of cardinalDirections) {
      this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, dir);

      const node = new DirectionalVec3(
        this.origin.x + dir.x,
        this.origin.y,
        this.origin.z + dir.z,
        dir
      );

      this.addNeighbors(neighbors, node);
    }
  }

  addNeighbors(neighbors, node) {
    if (this.isStandable(node)) {
      node.attributes["name"] = this.name;
      neighbors.push(this.makeMovement(node, this.COST_NORMAL));
    }
  }
}

registerMoves([
  new MoveForward(),
  new MoveDiagonal(),
  new MoveForwardUp(),
  new MoveForwardDown(),
  new MoveDiagonalUp(),
  // new TestMove(),
]);
