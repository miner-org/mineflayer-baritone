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
    const below = node.down(1); // block we stand on for the target
    const head = node.up(1); // head clearance
    const canPlace = this.config.placeBlocks && this.hasScaffoldingBlocks();
    const canBreak = this.config.breakBlocks;

    const originFloorY = Math.floor(originVec.y) - 1; // block Y we're standing on at origin
    const targetFloorY = Math.floor(below.y); // candidate floor Y

    // === STRICT FLAT RULE ===
    // MoveForward is *only* flattened horizontal movement.
    if (targetFloorY !== originFloorY) {
      if (this.config.debugMoves)
        console.debug(
          `[MoveForward] skip: not same-level (originFloor=${originFloorY} targetFloor=${targetFloorY}) node=${node.toString()}`
        );
      return;
    }

    const isSolidBelow = this.isSolid(below);
    const isWalkableBelow = isSolidBelow && !this.manager.isNodeBroken(below);

    // Only scaffold if it's actually a gap at same level and target spot is empty
    const canScaffold =
      !isSolidBelow &&
      this.isAir(node) &&
      canPlace &&
      this.canPlaceBlock(below) &&
      !this.manager.isAreaMarkedNode(below);

    const canStand = isWalkableBelow || canScaffold;
    if (!canStand) {
      if (this.config.debugMoves)
        console.debug(`[MoveForward] can't stand at ${node.toString()}`);
      return;
    }

    // init attributes
    node.attributes = { name: this.name, break: [], place: [] };

    // add scaffold if needed
    if (canScaffold) node.attributes.place.push(below.clone());

    // if still can't stand after optional scaffold, bail
    if (!isSolidBelow && node.attributes.place.length === 0) return;

    // fences are always invalid
    if (this.isFence(node)) return;

    const interactable = this.isInteractable(node);

    // console.log(interactable);

    // --- FEET (node) handling ---
    if (!this.isAir(node) && !interactable) {
        if (
        canBreak &&
        this.isBreakable(node) &&
        !this.manager.isNodeBroken(node)
      ) {
        // breaking the feet block is allowed — but it MUST NOT change the floor level
        // (we already enforce same-level above, so below must still be originFloor)
        node.attributes.break.push(node.clone());
      } else {
        // unbreakable block in feet => cannot move here
        if (this.config.debugMoves)
          console.debug(
            `[MoveForward] feet blocked/unbreakable: ${node.toString()}`
          );
        return;
      }
    }

    // --- HEAD handling ---
    if (!this.isAir(head) && !interactable) {
      if (
        !canBreak ||
        !this.isBreakable(head) ||
        this.manager.isNodeBroken(head)
      ) {
        if (this.config.debugMoves)
          console.debug(
            `[MoveForward] head blocked/unbreakable: ${head.toString()}`
          );
        return;
      }

      const breakingFeet = node.attributes.break.length > 0;
      const feetIsAir = this.isAir(node);

      // disallow only-head-break when feet is solid and not being broken (avoid acting as step-up)
      if (!breakingFeet && !feetIsAir) {
        if (this.config.debugMoves)
          console.debug(
            `[MoveForward] refuse only-head-break at ${node.toString()}`
          );
        return;
      }

      node.attributes.break.push(head.clone());
    }

    // --- final sanity: ensure support underfoot after planned actions ---
    if (node.attributes.break.some((b) => b.equals(node))) {
      // we're breaking the feet block — ensure there's a solid block underfoot (or we placed one)
      const supportBelowSolid =
        this.isSolid(below) && !this.manager.isNodeBroken(below);
      const willPlaceBelow = node.attributes.place.length > 0;
      if (!supportBelowSolid && !willPlaceBelow) {
        if (this.config.debugMoves)
          console.debug(
            `[MoveForward] would fall after breaking feet: ${node.toString()}`
          );
        return;
      }
    } else {
      // feet not being broken — must be standable (or scaffolding already planned) unless it's an interactable
      if (
        !this.isStandable(node) &&
        node.attributes.place.length === 0 &&
        !interactable
      ) {
        if (this.config.debugMoves)
          console.debug(
            `[MoveForward] not standable after checks: ${node.toString()}`
          );
        return;
      }
    }

    // cost calc
    const totalCost =
      this.COST_NORMAL +
      (node.attributes.break.length || 0) * this.COST_BREAK +
      (node.attributes.place.length || 0) * this.COST_PLACE;

    node.attributes.cost = totalCost;
    node.attributes.interact = interactable;
    // console.log(node.attributes);

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
      const step = originVec.forward(1).up(1); // where feet land
      const head = step.up(1); // head space
      this.addNeighbors(neighbors, step, head, originVec);
    }
  }

  addNeighbors(neighbors, node, head, originVec) {
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
    if (!this.isAir(node)) {
      if (!canBreak || !this.isBreakable(node)) return;
      node.attributes.break.push(node.clone());
    }

    // --- Check head + clearance ---
    const clearanceNodes = [head, originVec.up(2)];
    for (const check of clearanceNodes) {
      if (!this.isAir(check)) {
        if (!canBreak) return;
        if (!this.isBreakable(check)) return;
        node.attributes.break.push(check.clone());
      }
    }

    // --- If no scaffold and foot block was breakable, make sure standing works ---
    if (
      !canScaffold &&
      !this.isStandable(node) &&
      node.attributes.break.length === 0
    )
      return;

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
      // build a fresh directional origin per dir to avoid type confusion
      const originVec = new DirectionalVec3(origin.x, origin.y, origin.z, dir);

      // forward at same Y as originVec
      const forward = originVec.offset(dir.x, 0, dir.z);

      // If there's a fence right under our origin, skip this direction only
      if (this.isFence(originVec.down(1))) continue;

      this.addNeighbors(neighbors, forward, originVec);
    }
  }

  addNeighbors(neighbors, forward, originVec) {
    // head space while moving down (for the forward position)
    const headClear = forward.up(1);

    // Must be walkable at the "forward" location and have head clearance there
    if (!this.isWalkable(forward) || !this.isWalkable(headClear)) return;

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
  new MoveForward(10), // Basic walk = low cost priority
  new MoveDiagonal(10),
  new MoveForwardUp(10), // Step/jump up slightly higher priority
  new MoveForwardDown(10),
  new MoveDiagonalUp(10),
]);
