const { Move, registerMoves, DirectionalVec3 } = require("./");

class MoveForwardParkour extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (!this.config.parkour) return;

    const minDistance = 2; // ⬅ skip 1-block moves, leave for MoveForward/Up
    const maxDistance = 3;

    for (const dir of cardinalDirections) {
      this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, dir);

      // Skip if starting in/above water
      if (this.isWater(this.origin) || this.isWater(this.origin.down(1)))
        continue;

      for (let dist = minDistance; dist <= maxDistance; dist++) {
        const landingNode = this.origin.forward(dist + 1);
        this.addNeighbors(neighbors, landingNode, dist);
      }
    }
  }

  addNeighbors(neighbors, landingNode, dist) {
    const manager = this.manager;
    const standingNode = landingNode.down(1);

    // ❌ Reject any vertical difference at start or landing
    if (landingNode.y !== this.origin.y) return;
    if (standingNode.y !== this.origin.y - 1) return;

    if (manager.isNodeBroken(this.origin) || manager.isNodeBroken(standingNode))
      return;

    // Setup nodes to check
    const gapNodes = [];
    const airNodes = [];

    let last = this.origin;
    for (let i = 1; i <= dist; i++) {
      const forward = last.forward(1);

      // ❌ Skip any vertical drift
      if (forward.y !== this.origin.y) return;

      gapNodes.push(forward.up(1)); // body space
      airNodes.push(forward.down(1)); // feet space
      last = forward;
    }

    // Must be a clean horizontal jump
    const shouldJump = airNodes.every(
      (node) => this.isAir(node) || this.isWater(node)
    );
    if (!shouldJump) return;

    const allWalkable = gapNodes.every((node) => this.isWalkable(node));
    if (!allWalkable || !this.isStandable(landingNode)) return;

    // Attributes
    landingNode.attributes = {
      name: this.name,
      cost: this.COST_PARKOUR * dist,
      sJump: true,
      dist,
    };

    neighbors.push(this.makeMovement(landingNode, landingNode.attributes.cost));
  }
}

class MoveForwardParkourUp extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (!this.config.parkour) return;

    for (const dir of cardinalDirections) {
      this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, dir);

      for (let distance = 2; distance <= 3; distance++) {
        // Good: starts at 2
        // Just be extra safe, bail if distance 1 is somehow reached
        if (distance === 1) continue;

        const landingNode = this.forward(distance).up(1);
        this.addNeighbors(neighbors, distance, landingNode);
      }
    }
  }

  addNeighbors(neighbors, distance, landingNode) {
    const config = this.config;
    const manager = this.manager;
    const name = this.name;

    const standingNode = this.down(1, landingNode);

    let shouldJump = true;
    let shouldJump2 = true;

    if (manager.isNodeBroken(this.origin)) return;
    if (manager.isNodeBroken(standingNode)) return;

    for (let i = 1; i < distance; i++) {
      const forward = this.forward(i);
      const gapAbove = this.up(1, forward);
      const below = this.down(1, forward);

      if (this.isSolid(forward)) return;
      if (!this.isAir(below) && !this.isWater(below)) shouldJump = false;
      if (!this.isWalkable(gapAbove)) shouldJump2 = false;
    }

    if (!shouldJump || !shouldJump2) return;
    if (manager.isNodeBroken(standingNode)) return;

    if (distance < 2) return; // skip 1-block jumps

    if (this.isStandable(landingNode)) {
      landingNode.attributes["name"] = name;
      const cost = this.COST_PARKOUR * distance;
      landingNode.attributes["cost"] = cost;

      landingNode.attributes["sJump"] = true;

      landingNode.attributes["dist"] = distance; // Store distance for potential use
      neighbors.push(this.makeMovement(landingNode, cost));
    }
  }
}

class MoveForwardParkourDown extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (!this.config.parkour) return;

    for (const dir of cardinalDirections) {
      this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, dir);

      // Only check parkour jumps for gaps of 2-4 blocks
      for (let distance = 2; distance <= 4; distance++) {
        const landingNode = this.forward(distance).down(1);
        this.addNeighbors(neighbors, distance, landingNode);
      }
    }
  }

  addNeighbors(neighbors, distance, landingNode) {
    const manager = this.manager;

    const standingNode = this.forward(distance).down(2);

    // Don’t parkour into a node queued to break
    if (manager.isNodeBroken(this.origin) || manager.isNodeBroken(standingNode))
      return;

    // Must be able to stand where we land
    if (!this.isStandable(landingNode)) return;

    // ✅ Ensure this is an actual gap, not a small drop
    const belowLanding = landingNode.down(1);
    let fallDistance = 0;
    while (
      fallDistance <= (this.config.maxFallDist ?? 3) &&
      this.isAir(belowLanding)
    ) {
      fallDistance++;
      belowLanding.y -= 1;
    }
    if (fallDistance <= 1) return; // skip small drops, let MoveForwardDown handle them

    // Check mid-air path is actually clear for the jump
    for (let i = 2; i < distance; i++) {
      const fwd = this.forward(i);
      const feet = this.down(1, fwd);
      const head = fwd; // jump arc
      const under = this.down(2, fwd);

      if (!this.isWalkable(feet) || !this.isWalkable(head)) return;
      if (!(this.isAir(under) || this.isWater(under))) return;
    }

    landingNode.attributes = {
      name: this.name,
      cost: this.COST_PARKOUR * (distance - 1),
      dist: distance,
      ...(distance === 2 ? { nJump: true } : { sJump: true }),
    };

    neighbors.push(this.makeMovement(landingNode, landingNode.attributes.cost));
  }
}

class MoveForwardParkourDownExt extends Move {
  generate(cardinalDirections, origin, neighbors) {
    for (const dir of cardinalDirections) {
      this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, dir);

      this.addNeighbors(neighbors);
    }
  }

  addNeighbors(neighbors) {
    const config = this.config;
    const manager = this.manager;
    const name = this.name;

    if (!config.parkour) return;

    let jumpNode = this.up(2);

    let walkableNode = this.forward(2).down(1);
    let landingNode = walkableNode;
    let gapNode1 = this.forward(1).down(1);
    let gapNode2 = this.forward(1);

    let spaceNode1 = this.forward(1).down(2);

    let shouldJump =
      this.isWalkable(gapNode1) &&
      this.isWalkable(gapNode2) &&
      (this.isAir(spaceNode1) || this.isWater(spaceNode1));

    if (!shouldJump) return;

    let standingNode = this.forward(2).down(2);
    if (manager.isNodeBroken(standingNode)) return;

    let isSafe = false;
    let cost = 0;
    for (let i = 0; i < config.maxFallDist; i++) {
      landingNode = walkableNode.down(1);
      cost += 1;

      if (this.isStandable(landingNode)) {
        isSafe = true;
        break;
      }
    }

    if (
      this.isStandable(landingNode) &&
      this.isWalkable(gapNode1) &&
      this.isWalkable(gapNode2) &&
      isSafe
    ) {
      landingNode.attributes["name"] = name;
      landingNode.attributes["cost"] = this.COST_PARKOUR * cost;
      neighbors.push(this.makeMovement(landingNode, this.COST_PARKOUR * cost));
    }
  }
}

class MoveDiagonalParkour extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (!this.config.parkour) return;
    const maxDistance = 2;

    const diagonalOffsets = [
      { x: 1, z: 1 },
      { x: -1, z: 1 },
      { x: 1, z: -1 },
      { x: -1, z: -1 },
    ];

    for (const offset of diagonalOffsets) {
      for (let dist = 1; dist <= maxDistance; dist++) {
        const dir = new DirectionalVec3(offset.x, 0, offset.z, offset);
        this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, offset);
        const landingNode = this.origin.offset(
          offset.x * (dist + 1),
          0,
          offset.z * (dist + 1)
        );
        this.addNeighbors(neighbors, landingNode, offset, dist);
      }
    }
  }

  /**
   * @param {DirectionalVec3[]} neighbors
   * @param {DirectionalVec3} landingNode
   * @param {{x: number, z: number}} offset
   * @param {number} dist
   */
  addNeighbors(neighbors, landingNode, offset, dist) {
    const name = this.name;
    const config = this.config;
    const manager = this.manager;

    const standingNode = landingNode.down(1);
    if (manager.isNodeBroken(standingNode)) return;

    const spaceNodes = [];
    const gapNodes = [];
    const airNodes = [];

    let last = this.origin;
    for (let i = 1; i <= dist; i++) {
      const forward = last.offset(offset.x, 0, offset.z);
      spaceNodes.push(forward);
      gapNodes.push(forward.up(1));
      airNodes.push(forward.down(1));
      last = forward;
    }

    // Avoid corner cutting (like the diagonal walk move)
    const adj1 = this.origin.offset(offset.x, 0, 0);
    const adj2 = this.origin.offset(0, 0, offset.z);
    if (!this.isWalkable(adj1) || !this.isWalkable(adj2)) return;

    const shouldJump = airNodes.every(
      (node) => this.isAir(node) || this.isWater(node)
    );
    if (!shouldJump) return;

    const allJumpable = spaceNodes.every((node) => this.isJumpable(node));
    const allWalkable = gapNodes.every((node) => this.isWalkable(node));

    if (allJumpable && allWalkable && this.isStandable(landingNode)) {
      landingNode.attributes["name"] = name;
      const totalCost = (this.COST_PARKOUR + this.COST_DIAGONAL) * dist;
      landingNode.attributes["cost"] = totalCost;
      if (dist == 1) {
        landingNode.attributes["nJump"] = true;
      } else {
        landingNode.attributes["sJump"] = true;
      }
      neighbors.push(this.makeMovement(landingNode, totalCost));
    }
  }
}

registerMoves([
  // parkour
  new MoveForwardParkour(50),
  // // up parkour
  new MoveForwardParkourUp(55),

  // // down parkour
  new MoveForwardParkourDown(55),

  // diagonal parkour
  // new MoveDiagonalParkour(),
  // new MoveDiagonalParkour1(),
  // MoveDiagonalUpParkour,
  // MoveDiagonalDownParkour,
  // MoveSemiDiagonalParkour,

  //idk
  // new MoveForwardParkourDownExt(),
]);
