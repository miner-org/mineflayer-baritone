const { Move, registerMoves, DirectionalVec3, clamp } = require("./");

class MoveForward extends Move {
  generate(cardinalDirections, origin, neighbors, end) {
    for (const dir of cardinalDirections) {
      const snappedY = Math.floor(origin.y + 0.5); // round to nearest block
      const originVec = new DirectionalVec3(origin.x, snappedY, origin.z, dir);
      const node = originVec.forward(1);

      this.addNeighbors(neighbors, node, originVec, end);
    }
  }

  addNeighbors(neighbors, node, originVec, end) {
    const below = node.down(1);
    const head = node.up(1);
    const canPlace = this.config.placeBlocks && this.hasScaffoldingBlocks();
    const canBreak = this.config.breakBlocks;

    const isSolidBelow = this.isSolid(below) && !this.isClimbable(below);
    const interactable = this.isInteractable(node) && !this.isTrapdoor(node);
    const isFeetAir = this.isAir(node);
    const isHeadAir = this.isAir(head);

    // Check if we're currently standing on a bottom trapdoor at origin
    const originIsOnBottomTrapdoor = this.isBottomTrapdoor(originVec);

    // Top trapdoors: always walkable like a solid floor
    // Bottom trapdoors: only walkable if we're already standing on a bottom trapdoor
    const isWalkableTrapdoorBelow =
      (this.isTopTrapdoor(below) &&
        !this.getBlock(below).getProperties().open) ||
      (this.isBottomTrapdoor(node) &&
        originIsOnBottomTrapdoor &&
        !this.getBlock(node).getProperties().open);

    if (
      (this.isSlab(below) && this.isHalfSlab(below)) ||
      (this.isSlab(node) && this.isHalfSlab(node)) ||
      isWalkableTrapdoorBelow
    ) {
      node.attributes = {
        name: this.name,
        break: [],
        place: [],
        crouch: false,
        cost: this.COST_NORMAL,
        interact: false,
      };

      neighbors.push(this.makeMovement(node, node.attributes.cost));
      return;
    }

    if (isSolidBelow && interactable) {
      node.attributes = {
        name: this.name,
        break: [],
        place: [],
        crouch: false,
        cost: this.COST_NORMAL,

        interact: true,
        interactBlock: node,
      };

      neighbors.push(this.makeMovement(node, node.attributes.cost));
      return;
    }

    if (isSolidBelow && isFeetAir && isHeadAir && !interactable) {
      node.attributes = {
        name: this.name,
        break: [],
        place: [],
        cost: this.COST_NORMAL,
        interact: false,
      };
      neighbors.push(this.makeMovement(node, node.attributes.cost));
      return;
    }

    if (
      isSolidBelow &&
      isFeetAir &&
      this.isSlab(head) &&
      !this.isHalfSlab(head) &&
      this.config.usingCustomPhysics
    ) {
      //sneaking
      node.attributes = {
        name: this.name,
        break: [],
        place: [],
        cost: this.COST_NORMAL,
        interact: false,
        crouch: true,
      };
      neighbors.push(this.makeMovement(node, node.attributes.cost));
      return;
    }

    // --- continue with normal checks if not standable ---
    const canScaffold =
      !isSolidBelow &&
      this.isAir(node) &&
      canPlace &&
      this.canPlaceBlock(below) &&
      !this.manager.isAreaMarkedNode(below) &&
      this.canAffordPlacement(1);
    const canStand = isSolidBelow || canScaffold;
    if (!canStand && !interactable) return;

    node.attributes = { name: this.name, break: [], place: [] };

    if (canScaffold) node.attributes.place.push(below.clone());
    if (!isSolidBelow && node.attributes.place.length === 0) return;
    if (this.isFence(node)) return;

    // --- FEET check ---
    if (!this.isAir(node) && !interactable) {
      if (canBreak && this.isBreakable(node)) {
        node.attributes.break.push(node.clone());
      }
    }

    // --- HEAD check ---
    if (
      !this.isAir(head) &&
      !this.getBlock(head).name.includes("torch") &&
      !interactable
    ) {
      if (!canBreak || !this.isBreakable(head)) return;
      node.attributes.break.push(head.clone());
    }

    if (node.attributes.break.some((b) => b.equals(node))) {
      const supportBelowSolid = this.isSolid(below);
      const willPlaceBelow = node.attributes.place.some((p) => p.equals(below));
      if (!supportBelowSolid && !willPlaceBelow) return;
    } else if (node.attributes.break.length === 0) {
      if (
        !this.isStandable(node) &&
        node.attributes.place.length === 0 &&
        !interactable &&
        !node.attributes.crouch
      ) {
        return;
      }
    }

    if (!canBreak && !this.isStandable(node)) return;

    const breakCost =
      node.attributes.break.length > 0
        ? this.COST_BREAK * node.attributes.break.length
        : 0;
    const placeCost =
      node.attributes.place.length > 0
        ? this.COST_PLACE * node.attributes.place.length
        : 0;
    const totalCost = this.COST_NORMAL + breakCost + placeCost;

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
      const originVec = new DirectionalVec3(
        origin.x,
        origin.y,
        origin.z,
        offset,
      );

      const node = originVec.offset(offset.x, 0, offset.z);

      const adj1 = originVec.offset(offset.x, 0, 0);
      const adj2 = originVec.offset(0, 0, offset.z);

      this.addNeighbors(neighbors, node, adj1, adj2);
    }
  }

  addNeighbors(neighbors, node, adj1, adj2) {
    const headNode = node.up(1);

    const adj1Blocked = !this.isWalkable(adj1) && !this.isStandable(adj1);
    const adj2Blocked = !this.isWalkable(adj2) && !this.isStandable(adj2);

    if (adj1Blocked && adj2Blocked) return;

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
    if (this.config.fly) return;
    for (const dir of cardinalDirections) {
      const snappedY = Math.floor(origin.y + 0.5); // round to nearest block
      const originVec = new DirectionalVec3(origin.x, snappedY, origin.z, dir);

      if (this.isWater(originVec)) return;
      if (this.isClimbable(originVec)) return;

      const step = originVec.forward(1).up(1); // now always integer Y
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
    const below = node.down(1);
    const head = node.up(1);
    const above = originVec.up(2);

    const canPlace = this.config.placeBlocks && this.hasScaffoldingBlocks();
    const canBreak = this.config.breakBlocks;

    node.attributes = { name: this.name, break: [], place: [], nJump: true };

    // === EARLY EXIT if already standable ===
    if (this.isStandable(node) && this.isAir(above)) {
      if (
        this.isStair(below) &&
        !this.isTopStair(below) &&
        !this.facingOpposite(node.dir, below)
      ) {
        node.attributes.stair = true; // then just fucking walk no jump
      }
      const cost = this.COST_UP; // just normal jump cost, no extras
      node.attributes.cost = cost;
      neighbors.push(this.makeMovement(node, cost));
      return;
    }

    // === Otherwise continue with placement/break logic ===
    if (
      !this.isSolid(below) &&
      canPlace &&
      this.canPlaceBlock(below) &&
      this.canAffordPlacement(1)
    ) {
      node.attributes.place.push(below.clone());
    }

    if (canBreak) {
      for (const testNode of [node, head, above]) {
        if (this.isSolid(testNode) && this.isBreakable(testNode)) {
          node.attributes.break.push(testNode.clone());
        }
      }
    }

    // filter out invalids
    if (canBreak && node.attributes.break.length === 0) return;
    if (canPlace && !this.isSolid(below) && node.attributes.place.length === 0)
      return;

    if (!canBreak && !this.isStandable(node)) return;

    if (!canBreak) {
      if (!this.isAir(node) || !this.isAir(head) || !this.isAir(above)) return;
    }

    if (
      canBreak &&
      node.attributes.break.length === 0 &&
      !this.isStandable(node)
    )
      return;

    if (canBreak && node.attributes.break.length > 0) {
      const willPlaceBelow = node.attributes.place.some((p) => p.equals(below));
      if (!this.isSolid(below) && !willPlaceBelow) return;
    }

    const breakCost =
      node.attributes.break.length > 0
        ? this.COST_BREAK * node.attributes.break.length
        : 0;
    const placeCost =
      node.attributes.place.length > 0
        ? this.COST_PLACE * node.attributes.place.length
        : 0;
    const totalCost = this.COST_NORMAL + breakCost + placeCost;

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

  /**
   *
   * @param {{x: number, z: number}} dir
   * @param {DirectionalVec3} node
   */
  facingOpposite(dir, node) {
    const facingMap = {
      north: { x: 0, z: -1 },
      south: { x: 0, z: 1 },
      east: { x: 1, z: 0 },
      west: { x: -1, z: 0 },
    };

    const nodeDirection = this.getBlock(node)?.getProperties()?.facing ?? null;
    if (!nodeDirection) return false;

    const facing = facingMap[nodeDirection];
    if (!facing) return false;

    return !(dir.x === facing.x && dir.z === facing.z);
  }
}

class MoveForwardDown extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (this.config.fly) return;
    for (const dir of cardinalDirections) {
      const snappedY = Math.floor(origin.y + 0.5); // round to nearest block
      const originVec = new DirectionalVec3(origin.x, snappedY, origin.z, dir);

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

    // console.log(this.getBlock(below));

    // count how many air blocks until we hit a solid or exceed maxFall
    while (fallDistance < maxFall && this.isAir(below)) {
      fallDistance++;
      below = below.down(1);
    }

    const canPlace = this.config.placeBlocks && this.hasScaffoldingBlocks();

    // If we ended on air, try scaffolding
    let willPlace = false;

    if (this.isAir(below)) {
      if (canPlace && this.canPlaceBlock(below) && this.canAffordPlacement(1)) {
        willPlace = true;
      } else {
        return; // no landing, no scaffold → invalid move
      }
    }

    if (
      !willPlace &&
      !this.isSolid(below) &&
      !this.isHalfSlab(below) &&
      !this.isBottomTrapdoor(below)
    )
      return;

    // ignore farmland as landing (same as before)
    if (this.getBlock(below).name.includes("farmland")) return;

    let targetNode;

    if (willPlace) {
      targetNode = below.up(1);
    } else {
      const isBottomTD = this.isBottomTrapdoor(below);
      targetNode = this.isHalfSlab(below)
        ? below.up(0.5)
        : isBottomTD
          ? below.up(0.1875)
          : below.up(1);
    }

    targetNode.attributes = targetNode.attributes || {};
    targetNode.attributes.name = this.name;
    targetNode.attributes.fallDistance = fallDistance;
    targetNode.attributes.originVec = originVec;
    targetNode.attributes.break = [];
    targetNode.attributes.place = [];

    if (willPlace) {
      targetNode.attributes.place.push(below.clone());
    }

    const placeCost = willPlace ? this.COST_PLACE : 0;
    const cost =
      this.COST_FALL + (fallDistance > 1 ? fallDistance : 0) + placeCost;

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
      const snappedY = Math.floor(origin.y + 0.5); // round to nearest block
      const originVec = new DirectionalVec3(
        origin.x,
        snappedY,
        origin.z,
        offset,
      );

      const node = originVec.offset(offset.x, 1, offset.z);

      if (this.isClimbable(originVec)) continue;

      if (!this.isWalkable(originVec.up(1))) continue;

      // Check cardinal adjacent blocks
      const adj1 = originVec.offset(offset.x, 1, 0); // East/West
      const adj2 = originVec.offset(0, 1, offset.z); // North/South

      this.addNeighbors(neighbors, node, adj1, adj2);
    }
  }

  addNeighbors(neighbors, node, adj1, adj2) {
    const headNode = node.up(1);

    const adj1Blocked = !this.isWalkable(adj1) && !this.isStandable(adj1);
    const adj2Blocked = !this.isWalkable(adj2) && !this.isStandable(adj2);

    if (adj1Blocked && adj2Blocked) return;

    // Must be able to step *onto* the diagonal block
    if (!this.isWalkable(node) || !this.isStandable(node)) return;

    // Headspace must be clear
    if (!this.isAir(headNode)) return;

    node.attributes["name"] = this.name;
    const cost = this.COST_DIAGONAL + this.COST_UP;
    node.attributes["cost"] = cost;
    node.attributes["nJump"] = true;
    neighbors.push(this.makeMovement(node, cost));
  }
}

class MoveDiagonalDown extends Move {
  generate(cardinalDirections, origin, neighbors) {
    const diagonalOffsets = [
      { x: 1, z: 1 },
      { x: -1, z: 1 },
      { x: 1, z: -1 },
      { x: -1, z: -1 },
    ];

    for (const offset of diagonalOffsets) {
      const snappedY = Math.floor(origin.y + 0.5);
      const originVec = new DirectionalVec3(
        origin.x,
        snappedY,
        origin.z,
        offset,
      );

      // forward-diagonal at same Y first
      const forwardDiag = originVec.offset(offset.x, 0, offset.z);

      // cardinal adjacents for corner clipping
      const adj1 = originVec.offset(offset.x, 0, 0);
      const adj2 = originVec.offset(0, 0, offset.z);

      this.addNeighbors(neighbors, forwardDiag, adj1, adj2, originVec);
    }
  }

  addNeighbors(neighbors, forwardDiag, adj1, adj2, originVec) {
    const adj1Blocked = !this.isWalkable(adj1) && !this.isStandable(adj1);
    const adj2Blocked = !this.isWalkable(adj2) && !this.isStandable(adj2);
    if (adj1Blocked && adj2Blocked) return;

    if (!this.isWalkable(forwardDiag)) return;

    const maxFall = this.config.maxFallDist ?? 3;
    const canPlace = this.config.placeBlocks && this.hasScaffoldingBlocks();

    let fallDistance = 0;
    let below = forwardDiag.down(1);

    // Scan downward
    while (fallDistance < maxFall && this.isAir(below)) {
      fallDistance++;
      below = below.down(1);
    }

    let willPlace = false;

    // If still air after scan → try scaffold
    if (this.isAir(below)) {
      if (canPlace && this.canPlaceBlock(below) && this.canAffordPlacement(1)) {
        willPlace = true;
      } else {
        return;
      }
    }

    // Validate landing if not placing
    if (
      !willPlace &&
      !this.isSolid(below) &&
      !this.isHalfSlab(below) &&
      !this.isBottomTrapdoor(below)
    )
      return;

    if (!willPlace && this.getBlock(below).name.includes("farmland")) return;

    // Build target landing position
    let targetNode;
    if (willPlace) {
      targetNode = below.up(1);
    } else {
      const isBottomTD = this.isBottomTrapdoor(below);
      targetNode = this.isHalfSlab(below)
        ? below.up(0.5)
        : isBottomTD
          ? below.up(0.1875)
          : below.up(1);
    }

    const headNode = targetNode.up(1);

    if (!this.isWalkable(headNode)) return;

    targetNode.attributes = targetNode.attributes || {};
    targetNode.attributes.name = this.name;
    targetNode.attributes.fallDistance = fallDistance;
    targetNode.attributes.originVec = originVec;
    targetNode.attributes.place = [];
    targetNode.attributes.break = [];

    if (willPlace) {
      targetNode.attributes.place.push(below.clone());
    }

    const placeCost = willPlace ? this.COST_PLACE : 0;

    const cost =
      this.COST_DIAGONAL +
      this.COST_FALL +
      (fallDistance > 1 ? fallDistance : 0) +
      placeCost;

    targetNode.attributes.cost = cost;

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
  new MoveDiagonalDown(10),
]);
