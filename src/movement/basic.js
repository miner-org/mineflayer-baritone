const { Move, registerMoves, DirectionalVec3, clamp } = require("./");

class MoveForward extends Move {
  generate(cardinalDirections, origin, neighbors) {
    for (const dir of cardinalDirections) {
      this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, dir);
      const node = this.origin.forward(1);
      this.addNeighbors(neighbors, node);
    }
  }

  addNeighbors(neighbors, node) {
    const below = node.down(1);
    const head = node.up(1);

    const canPlace = this.config.placeBlocks && this.hasScaffoldingBlocks();
    const canBreak = this.config.breakBlocks;

    const isSolidBelow = this.isSolid(below);
    const isWalkableBelow = isSolidBelow && !this.manager.isNodeBroken(below);

    // 🔹 Must have something to stand on or be able to scaffold
    const canStand = isWalkableBelow || (canPlace && this.canPlaceBlock(below));

    if (!canStand) return;

    node.attributes = { name: this.name, break: [], place: [] };

    // 🔹 Scaffold placement
    if (
      !isSolidBelow &&
      canPlace &&
      this.canPlaceBlock(below) &&
      !this.manager.isAreaMarkedNode(below)
    ) {
      node.attributes.place.push(below.clone());
    }

    // 🔹 Reject if still nothing under feet
    if (!isSolidBelow && node.attributes.place.length === 0) return;

    // 🔹 Fences are always invalid
    if (this.isFence(node)) return;

    // 🔹 Handle standing block
    const interactable = this.isInteractable(node);
    if (!this.isAir(node)) {
      if (interactable) {
        // ok
      } else if (canBreak && this.isBreakable(node)) {
        node.attributes.break.push(node.clone());
      } else return;
    }

    // 🔹 Head clearance
    if (!this.isAir(head)) {
      if (canBreak && this.isBreakable(head)) {
        node.attributes.break.push(head.clone());
      } else return;
    }

    const totalCost =
      this.COST_NORMAL +
      node.attributes.break.length * this.COST_BREAK +
      node.attributes.place.length * this.COST_PLACE;

    node.attributes.cost = totalCost;
    node.attributes.interact = interactable;

    neighbors.push(this.makeMovement(node, totalCost));
  }

  canPlaceBlock(pos) {
    // Needs at least one neighbor solid block to attach
    const offsets = [
      [0, -1, 0],
      [1, 0, 0],
      [-1, 0, 0],
      [0, 0, 1],
      [0, 0, -1],
    ];
    return offsets.some(([dx, dy, dz]) => this.isSolid(pos.offset(dx, dy, dz)));
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

      let node = this.origin.offset(offset.x, 0, offset.z);

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
      const step = this.origin.forward(1).up(1); // where feet land
      const head = step.up(1); // head space
      this.addNeighbors(neighbors, step, head);
    }
  }

  addNeighbors(neighbors, node, head) {
    const below = node.down(1);
    const canPlace = this.config.placeBlocks && this.hasScaffoldingBlocks();
    const canBreak = this.config.breakBlocks;

    node.attributes = { name: this.name, break: [], place: [], nJump: true };

    const isSolidBelow = this.isSolid(below) && !this.isFence(below);

    const canScaffold =
      !isSolidBelow &&
      this.isAir(below) &&
      canPlace &&
      this.canPlaceBlock(below);

    if (!isSolidBelow && !canScaffold) return;

    if (canScaffold) node.attributes.place.push(below.clone());

    // --- Check foot block (node) ---
    const footBlock = this.getBlock(node);
    if (!this.isAir(node)) {
      if (!canBreak || !this.isBreakable(node)) return;
      // After breaking, must become walkable (air)
      node.attributes.break.push(node.clone());
    }

    // --- Check head + clearance ---
    const clearanceNodes = [head, this.origin.up(2)];
    for (const check of clearanceNodes) {
      if (!this.isAir(check)) {
        if (!canBreak || !this.isBreakable(check)) return;
        node.attributes.break.push(check.clone());
      }
    }

    // --- If no scaffold and foot block was breakable, make sure standing works ---
    if (!canScaffold && !this.isStandable(node)) return;

    const totalCost =
      this.COST_UP +
      node.attributes.break.length * this.COST_BREAK +
      node.attributes.place.length * this.COST_PLACE;

    node.attributes.cost = totalCost;
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
    return offsets.some(([dx, dy, dz]) => this.isSolid(pos.offset(dx, dy, dz)));
  }
}

class MoveForwardDown extends Move {
  generate(cardinalDirections, origin, neighbors) {
    for (const dir of cardinalDirections) {
      this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, dir);

      const forward = this.origin.offset(dir.x, 0, dir.z);

      if (this.isFence(this.origin.down(1))) return;

      this.addNeighbors(neighbors, forward);
    }
  }

  addNeighbors(neighbors, forward) {
    const headClear = forward.up(1); // where head goes while stepping down

    // Must be walkable and have head clearance
    if (!this.isWalkable(forward) || !this.isWalkable(headClear)) return;

    let maxFall = this.config.maxFallDist ?? 3;
    let fallDistance = 0;
    let below = forward.down(1);

    while (fallDistance < maxFall && this.isAir(below)) {
      fallDistance++;
      below = below.down(1);
    }

    if (!this.isSolid(below)) return;
    if (this.getBlock(below).name.includes("farmland")) return;

    const targetNode = below.up(1);

    // Still need to make sure we can fit there
    if (!this.isWalkable(targetNode)) return;

    targetNode.attributes["name"] = this.name;
    targetNode.attributes["fallDistance"] = fallDistance;

    const cost =
      this.COST_FALL +
      (fallDistance > 1 ? fallDistance * (this.COST_FALL_PER_BLOCK ?? 1) : 0);
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

  addNeighbors(neighbors, forward) {
    if (!this.isWalkable(forward)) return;

    let maxFall = this.config.maxFallDist ?? 3;
    let fallDistance = 0;
    let below = forward.down(1);

    // Ensure this move is actually DOWN
    if (forward.y >= this.origin.y) return; // ✅ Only allow lower

    // Fall until we hit something solid or max fall distance
    while (fallDistance < maxFall && this.isAir(below)) {
      fallDistance++;
      below = below.down(1);
    }

    if (!this.isSolid(below)) return;

    // Disallow farmland landing
    if (this.getBlock(below).name.includes("farmland")) return;

    const targetNode = below.up(1);

    // Only valid if still lower than origin (true downward step)
    if (targetNode.y >= this.origin.y) return;

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
  new MoveForward(10), // Basic walk = low cost priority
  new MoveDiagonal(10),
  new MoveForwardUp(10), // Step/jump up slightly higher priority
  new MoveForwardDown(10),
  new MoveDiagonalUp(10),
]);
