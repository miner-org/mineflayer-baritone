const { Move, registerMoves, DirectionalVec3 } = require("./");

class MoveForwardParkour extends Move {
  generate(cardinalDirections, origin, neighbors) {
    const maxDistance = 3;
    if (!this.config.parkour) return;

    for (const dir of cardinalDirections) {
      for (let dist = 1; dist <= maxDistance; dist++) {
        this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, dir);
        const landingNode = this.origin.forward(dist + 1);
        this.addNeighbors(neighbors, landingNode, dist);
      }
    }
  }

  /**
   * @param {DirectionalVec3[]} neighbors
   * @param {DirectionalVec3} landingNode
   * @param {number} dist
   */
  addNeighbors(neighbors, landingNode, dist) {
    const config = this.config;
    const manager = this.manager;
    const name = this.name;

    const standingNode = landingNode.down(1);
    if (manager.isNodeBroken(this.origin)) return;
    if (manager.isNodeBroken(standingNode)) return;

    const spaceNodes = [];
    const gapNodes = [];
    const airNodes = [];

    let last = this.origin;
    for (let i = 1; i <= dist; i++) {
      const forward = last.forward(1);
      spaceNodes.push(forward);
      gapNodes.push(forward.up(1));
      airNodes.push(forward.down(1));
      last = forward;
    }

    const shouldJump = airNodes.every(
      (node) => this.isAir(node) || this.isWater(node)
    );
    if (!shouldJump) return;

    const allJumpable = spaceNodes.every((node) => this.isJumpable(node));
    const allWalkable = gapNodes.every((node) => this.isWalkable(node));

    if (allJumpable && allWalkable && this.isStandable(landingNode)) {
      landingNode.attributes["name"] = name;
      const totalCost = this.COST_PARKOUR * dist;
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

class MoveForwardParkourUp extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (!this.config.parkour) return;

    for (const dir of cardinalDirections) {
      this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, dir);

      for (let distance = 2; distance <= 3; distance++) {
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

    if (this.isStandable(landingNode)) {
      landingNode.attributes["name"] = name;
      const cost = this.COST_PARKOUR * distance;
      landingNode.attributes["cost"] = cost;
      if (distance == 1) {
        landingNode.attributes["nJump"] = true;
      } else {
        landingNode.attributes["sJump"] = true;
      }
      neighbors.push(this.makeMovement(landingNode, cost));
    }
  }
}

class MoveForwardParkourDown extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (!this.config.parkour) return;

    for (const dir of cardinalDirections) {
      this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, dir);

      for (let distance = 2; distance <= 4; distance++) {
        const landingNode = this.forward(distance).down(1);
        this.addNeighbors(neighbors, distance, landingNode);
      }
    }
  }

  addNeighbors(neighbors, distance, landingNode) {
    const config = this.config;
    const manager = this.manager;
    const name = this.name;

    const standingNode = this.forward(distance).down(2);
    if (manager.isNodeBroken(this.origin) || manager.isNodeBroken(standingNode))
      return;
    if (!this.isStandable(landingNode)) return;

    // Check gaps and space for jumping
    for (let i = 1; i < distance; i++) {
      const fwd = this.forward(i);
      const gap1 = this.down(1, fwd);
      const gap2 = fwd;
      const space = this.down(2, fwd);

      if (!this.isWalkable(gap1) || !this.isWalkable(gap2)) return;
      if (!(this.isAir(space) || this.isWater(space))) return;
    }

    landingNode.attributes["name"] = name;
    landingNode.attributes["cost"] = this.COST_PARKOUR * (distance - 1); // Cost scales with jump length
    if (distance == 1) {
      landingNode.attributes["nJump"] = true;
    } else {
      landingNode.attributes["sJump"] = true;
    }
    neighbors.push(
      this.makeMovement(landingNode, landingNode.attributes["cost"])
    );
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
  new MoveForwardParkour(),
  // // up parkour
  new MoveForwardParkourUp(),

  // // down parkour
  new MoveForwardParkourDown(),

  // diagonal parkour
  // new MoveDiagonalParkour(),
  // new MoveDiagonalParkour1(),
  // MoveDiagonalUpParkour,
  // MoveDiagonalDownParkour,
  // MoveSemiDiagonalParkour,

  //idk
  // new MoveForwardParkourDownExt(),
]);
