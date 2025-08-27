const { Move, registerMoves, DirectionalVec3 } = require("./");

class MoveForwardParkour extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (!this.config.parkour) return;

    const minDistance = 2; // leave 1-block hops to MoveForward/Up
    const maxDistance = 3;

    for (const dir of cardinalDirections) {
      this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, dir);

      // ✅ Require stable starting surface (no falling / stepping down)
      const standNode = this.origin.down(1);
      if (!this.isSolid(standNode) || this.isFence(standNode)) continue;

      // ✅ Don’t start parkour in water or above water
      if (this.isWater(this.origin) || this.isWater(standNode)) continue;

      for (let dist = minDistance; dist <= maxDistance; dist++) {
        const landingNode = this.origin.forward(dist + 1);
        this.addNeighbors(neighbors, landingNode, dist);
      }
    }
  }

  addNeighbors(neighbors, landingNode, dist) {
    const standingNode = landingNode.down(1);

    // ❌ Must be horizontal jump, no vertical drift
    if (landingNode.y !== this.origin.y) return;
    if (standingNode.y !== this.origin.y - 1) return;

    // ❌ Landing must be standable and not broken
    if (
      !this.isStandable(landingNode) ||
      this.manager.isNodeBroken(standingNode)
    )
      return;

    // ✅ Check gap nodes (body clearance + feet space)
    const gapNodes = [];
    const airNodes = [];

    let last = this.origin;
    for (let i = 1; i <= dist; i++) {
      const forward = last.forward(1);

      if (forward.y !== this.origin.y) return; // no weird vertical drift

      gapNodes.push(forward.up(1)); // body space
      airNodes.push(forward.down(1)); // feet space
      last = forward;
    }

    // ❌ Must be a clean gap (air or water only)
    if (!airNodes.every((node) => this.isAir(node) || this.isWater(node)))
      return;

    // ❌ Body path must be walkable (headroom)
    if (!gapNodes.every((node) => this.isWalkable(node))) return;

    // ✅ All good: mark as Parkour jump
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

      // ✅ Must start grounded (no floating or stepping down)
      const standNode = this.origin.down(1);
      if (!this.isSolid(standNode) || this.isFence(standNode)) continue;
      if (this.isWater(this.origin) || this.isWater(standNode)) continue;

      for (let distance = 2; distance <= 3; distance++) {
        // Parkour-Up is for 2+ blocks, not 1-block normal steps
        const landingNode = this.origin.forward(distance).up(1);
        this.addNeighbors(neighbors, distance, landingNode);
      }
    }
  }

  addNeighbors(neighbors, distance, landingNode) {
    const manager = this.manager;
    const standingNode = landingNode.down(1);

    // ❌ Must land exactly 1 block higher
    if (landingNode.y !== this.origin.y + 1) return;
    if (standingNode.y !== this.origin.y) return;

    // ❌ Broken or unsafe landing
    if (!this.isStandable(landingNode) || manager.isNodeBroken(standingNode))
      return;

    // ✅ Check gap clearance
    const bodyClear = [];
    const feetGap = [];

    let last = this.origin;
    for (let i = 1; i <= distance; i++) {
      const forward = last.forward(1);

      // Parkour-Up assumes flat until the final step up
      if (forward.y !== this.origin.y) return;

      bodyClear.push(forward.up(1)); // body space
      feetGap.push(forward.down(1)); // must be air/water
      last = forward;
    }

    // ❌ Must be actual gap (air/water only)
    if (!feetGap.every((node) => this.isAir(node) || this.isWater(node)))
      return;

    // ❌ Body clearance must be fully walkable
    if (!bodyClear.every((node) => this.isWalkable(node))) return;

    // ✅ Valid Parkour-Up
    landingNode.attributes = {
      name: this.name,
      cost: this.COST_PARKOUR * distance,
      sJump: true,
      dist: distance,
    };

    neighbors.push(this.makeMovement(landingNode, landingNode.attributes.cost));
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
  // new MoveForwardParkourUp(55),

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
