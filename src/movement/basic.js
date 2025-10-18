const { Move, registerMoves, DirectionalVec3, clamp } = require("./");

class MoveForward extends Move {
  generate(cardinalDirections, origin, neighbors) {
    for (const dir of cardinalDirections) {
      const originVec = new DirectionalVec3(origin.x, origin.y, origin.z, dir);
      const node = originVec.forward(1);
      this.addNeighbors(neighbors, node, originVec);
    }
  }

  addNeighbors(neighbors, node, originVec) {
    const below = node.down(1);
    const head = node.up(1);
    const canPlace = this.config.placeBlocks && this.hasScaffoldingBlocks();
    const canBreak = this.config.breakBlocks;

    const originFloorY = Math.floor(originVec.y) - 1;
    const targetFloorY = Math.floor(below.y);

    if (targetFloorY !== originFloorY) return;

    const isSolidBelow = this.isSolid(below);
    const isWalkableBelow = isSolidBelow && !this.manager.isNodeBroken(below);

    const interactable = this.isInteractable(node);

    const canScaffold =
      !isSolidBelow &&
      this.isAir(node) &&
      canPlace &&
      this.canPlaceBlock(below) &&
      !this.manager.isAreaMarkedNode(below);

    const canStand = isWalkableBelow || canScaffold;
    if (!canStand && !interactable) return;

    if (interactable) {
      this.log("Node is interactable");
    }

    node.attributes = { name: this.name, break: [], place: [] };

    if (canScaffold) node.attributes.place.push(below.clone());
    if (!isSolidBelow && node.attributes.place.length === 0) return;
    if (this.isFence(node)) return;

    // --- FEET check ---
    if (!this.isAir(node) && !interactable) {
      if (
        canBreak &&
        this.isBreakable(node) &&
        !this.manager.isNodeBroken(node)
      ) {
        node.attributes.break.push(node.clone());
      } else {
        return;
      }
    }

    // --- HEAD check ---
    if (!this.isAir(head) && !interactable) {
      // ✅ allow crouch under slab/trapdoor instead of breaking
      if (this.isCrouchPassable(this.getBlock(head))) {
        node.attributes.crouch = true;
        // do NOT push to break[]
      } else {
        // fallback to break-or-deny
        if (
          !canBreak ||
          !this.isBreakable(head) ||
          this.manager.isNodeBroken(head)
        ) {
          return;
        }
        const breakingFeet = node.attributes.break.length > 0;
        const feetIsAir = this.isAir(node);

        if (!breakingFeet && !feetIsAir) return;
        node.attributes.break.push(head.clone());
      }
    }

    // --- support sanity ---
    if (node.attributes.break.some((b) => b.equals(node))) {
      const supportBelowSolid =
        this.isSolid(below) && !this.manager.isNodeBroken(below);
      const willPlaceBelow = node.attributes.place.length > 0;
      if (!supportBelowSolid && !willPlaceBelow) return;
    } else {
      if (
        !this.isStandable(node) &&
        node.attributes.place.length === 0 &&
        !interactable &&
        !node.attributes.crouch
      ) {
        return;
      }
    }

    // cost
    const totalCost =
      this.COST_NORMAL +
      (node.attributes.break.length || 0) * this.COST_BREAK +
      (node.attributes.place.length || 0) * this.COST_PLACE +
      (node.attributes.crouch ? this.COST_CROUCH || 0.5 : 0); // crouch penalty if you want

    node.attributes.cost = totalCost;
    node.attributes.interact = interactable;

    neighbors.push(this.makeMovement(node, totalCost));
  }

  /**
   * Returns true if block is a slab/trapdoor/etc. you can sneak under
   */
  isCrouchPassable(block) {
    if (!block) return false;
    const name = block.name;
    if (!name) return false;

    // this.log("checking crouch passable for", block);

    return (
      name.includes("slab") ||
      name.includes("trapdoor") ||
      name.includes("carpet")
    );
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
    if (this.isClimbable(origin)) return; // don't try to jump up if on ladder

    for (const dir of cardinalDirections) {
      const originVec = new DirectionalVec3(origin.x, origin.y, origin.z, dir);

      if (this.isWater(originVec)) return;
      const step = originVec.forward(1).up(1); // where feet land
      this.addNeighbors(neighbors, step, originVec);
    }
  }

  /**
   * Add valid upward movement neighbors
   * @param {Array} neighbors
   * @param {DirectionalVec3} node - the target position (feet)
   * @param {DirectionalVec3} originVec - the original position (for dir reference)
   */
  addNeighbors(neighbors, node, originVec) {
    const below = node.down(1); // landing support
    const head = node.up(1); // where your head will be after landing
    const above = originVec.up(2);

    const canPlace = this.config.placeBlocks && this.hasScaffoldingBlocks();
    const canBreak = this.config.breakBlocks;

    node.attributes = { name: this.name, break: [], place: [], nJump: true };

    // scaffold if needed
    if (!this.isSolid(below) && canPlace && this.canPlaceBlock(below)) {
      node.attributes.place.push(below.clone());
    }

    // mark breakables
    if (canBreak) {
      for (const testNode of [node, head, above]) {
        if (this.isSolid(testNode) && this.isBreakable(testNode)) {
          node.attributes.break.push(testNode.clone());
        }
      }
    }

    // landing must be standable (either solid below or scaffolded)
    if (!this.isStandable(node)) return;

    // head + space above must be air OR breakable
    if (!this.isAir(head) && !(canBreak && this.isBreakable(head))) return;
    if (!this.isAir(above) && !(canBreak && this.isBreakable(above))) return;

    // cost calc
    const cost =
      this.COST_UP +
      node.attributes.break.length * this.COST_BREAK +
      node.attributes.place.length * this.COST_PLACE;

    node.attributes.cost = cost;
    neighbors.push(this.makeMovement(node, cost));
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
      // build a fresh directional origin per dir to avoid type confusion
      const originVec = new DirectionalVec3(origin.x, origin.y, origin.z, dir);

      // forward at same Y as originVec
      const forward = originVec.offset(dir.x, 0, dir.z);

      // If there's a fence right under our origin, skip this direction only
      if (this.isFence(originVec.down(1))) continue;

      this.addNeighbors(neighbors, forward, originVec);
    }
  }

  /**
   * Add valid downward movement neighbors
   * @param {Array} neighbors
   * @param {DirectionalVec3} forward - the forward position at same Y as origin
   * @param {DirectionalVec3} originVec - the original position (for Y comparison)
   */
  addNeighbors(neighbors, forward, originVec) {
    // Must be walkable at the "forward" location and have head clearance there
    if (!this.isWalkable(forward)) return;

    const maxFall = this.config.maxFallDist ?? 3;
    let fallDistance = 0;
    let below = forward.down(1);

    // count how many air blocks until we hit a solid or exceed maxFall
    while (fallDistance < maxFall && this.isAir(below)) {
      fallDistance++;
      below = below.down(1);
    }

    // require that we actually drop at least 1 block — otherwise this isn't a "down" move
    if (fallDistance < 1) return;

    // must land on solid
    if (!this.isSolid(below)) return;

    // ignore farmland as landing (same as before)
    if (this.getBlock(below).name.includes("farmland")) return;

    const targetNode = below.up(1);

    // sanity: target must be strictly lower than origin
    if (Math.floor(targetNode.y) >= Math.floor(originVec.y)) return;

    // ensure we can fit at landing spot
    if (!this.isWalkable(targetNode)) return;

    targetNode.attributes = targetNode.attributes || {};
    targetNode.attributes.name = this.name;
    targetNode.attributes.fallDistance = fallDistance;

    const cost =
      this.COST_FALL +
      (fallDistance > 1 ? fallDistance * (this.COST_FALL_PER_BLOCK ?? 1) : 0);

    targetNode.attributes.cost = cost;

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

registerMoves([
  new MoveForward(10, {
    category: "basic",
    tags: ["ground", "horizontal", "breaking", "placing"],
    description:
      "Basic forward movement on flat ground with optional breaking/placing",
    testConfig: { breakBlocks: true, placeBlocks: true },
  }),
  new MoveDiagonal(10, {
    category: "basic",
    tags: ["ground", "diagonal"],
    description: "Diagonal movement on flat ground",
    testConfig: { breakBlocks: false, placeBlocks: false },
  }),
  new MoveForwardUp(10, {
    category: "basic",
    tags: ["vertical", "up", "jumping", "breaking", "placing"],
    description: "Step up movement with jump and optional breaking/placing",
    testConfig: { breakBlocks: true, placeBlocks: true },
  }),
  new MoveForwardDown(10, {
    category: "basic",
    tags: ["vertical", "down", "falling"],
    description: "Movement down to lower level with falling",
    testConfig: { breakBlocks: false, placeBlocks: false },
  }),
  new MoveDiagonalUp(10, {
    category: "basic",
    tags: ["diagonal", "vertical", "up"],
    description: "Diagonal upward movement",
    testConfig: { breakBlocks: false, placeBlocks: false },
  }),
]);
