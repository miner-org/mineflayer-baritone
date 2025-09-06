const { Move, registerMoves, DirectionalVec3 } = require("./");

class MoveForwardParkour extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (!this.config.parkour) return;

    for (const dir of cardinalDirections) {
      const originVec = new DirectionalVec3(origin.x, origin.y, origin.z, dir);
      // console.log(originVec);

      this.addNeighbors(neighbors, originVec);
    }
  }

  /**
   *
   * @param {DirectionalVec3[]} neighbors
   * @param {DirectionalVec3} originVec
   */
  addNeighbors(neighbors, originVec) {
    // const minDistance = 1;
    const maxDistance = 3;
    let count = 0;

    for (let distance = count; distance <= maxDistance; distance++) {
      const landingNode = originVec.forward(distance + 1);
      const standingNode = landingNode.down(1);

      // ❌ Must land exactly same height
      if (landingNode.y !== originVec.y) continue;
      if (standingNode.y !== originVec.y - 1) continue;

      // ❌ Broken or unsafe landing
      if (!this.isStandable(landingNode)) continue;

      // ✅ Check gap clearance
      const bodyClear = [];
      const feetGap = [];

      let last = originVec;
      for (let i = 1; i <= distance; i++) {
        const forward = last.forward(1);

        // Parkour assumes flat until the final step up
        if (forward.y !== originVec.y) break;

        bodyClear.push(forward.up(1)); // body space
        feetGap.push(forward.down(1)); // must be air/water
        last = forward;
      }

      // console.log(`Feet gap for distance ${distance}:`, feetGap);

      // ❌ Must be actual gap (air/water only)
      if (!feetGap.every((node) => this.isAir(node) || this.isWater(node)))
        continue;

      // ❌ Body clearance must be fully walkable
      if (!bodyClear.every((node) => this.isWalkable(node))) continue;

      // ✅ Valid Parkour
      const parkourNode = landingNode.clone();
      parkourNode.attributes = {
        name: this.name,
        cost: this.COST_PARKOUR * distance,
        nJump: distance === 1,
        sJump: distance >= 2,
        dist: distance,
      };
      neighbors.push(
        this.makeMovement(parkourNode, parkourNode.attributes.cost)
      );

      break; // only add the shortest valid parkour move
    }
  }
}

class MoveForwardParkourUp extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (!this.config.parkour) return;

    for (const dir of cardinalDirections) {
      const originVec = new DirectionalVec3(origin.x, origin.y, origin.z, dir);
      this.addNeighbors(neighbors, originVec);
    }
  }

  addNeighbors(neighbors, originVec) {
    const minDistance = 1;
    const maxDistance = 3; // small parkour forward

    for (let distance = minDistance; distance <= maxDistance; distance++) {
      const landingNode = originVec.forward(distance).up(1); // step up 1
      const standingNode = landingNode.down(1); // block under feet

      // ❌ Must land exactly 1 block higher
      if (landingNode.y !== originVec.y + 1) continue;
      if (standingNode.y !== originVec.y) continue;

      // ❌ Landing must be standable
      if (!this.isStandable(landingNode)) continue;

      // ❌ Check gap clearance along path
      const bodyClear = [];
      const feetGap = [];
      let last = originVec;

      for (let i = 1; i < distance; i++) {
        const forward = last.forward(1);
        if (forward.y !== originVec.y) break; // must stay flat until final jump

        bodyClear.push(forward.up(1)); // head/body space
        feetGap.push(forward.down(1)); // gap under feet
        last = forward;
      }

      // must have actual gap
      if (!feetGap.every((n) => this.isAir(n) || this.isWater(n))) continue;
      if (!bodyClear.every((n) => this.isWalkable(n))) continue;

      // ✅ Valid parkour up move
      const parkourNode = landingNode.clone();
      parkourNode.attributes = {
        name: this.name,
        cost: this.COST_PARKOUR * distance,
        nJump: distance === 2 || 1,
        sJump: distance > 2,
        dist: distance,
        up: true, // mark as upward jump
      };

      neighbors.push(
        this.makeMovement(parkourNode, parkourNode.attributes.cost)
      );
      break; // only add shortest valid jump
    }
  }
}

class MoveForwardParkourDown extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (!this.config.parkour) return;

    for (const dir of cardinalDirections) {
      const originVec = new DirectionalVec3(origin.x, origin.y, origin.z, dir);
      this.addNeighbors(neighbors, originVec);
    }
  }

  addNeighbors(neighbors, originVec) {
    const minDistance = 1;
    const maxDistance = 2; // small parkour forward

    for (let distance = minDistance; distance <= maxDistance; distance++) {
      const landingNode = originVec.forward(distance).down(1); // step down 1
      const standingNode = landingNode.down(1); // block under feet

      // ❌ Must land exactly 1 block lower
      if (landingNode.y !== originVec.y - 1) continue;
      if (standingNode.y !== originVec.y - 2) continue; // floor under feet

      // ❌ Landing must be standable
      if (!this.isStandable(landingNode)) continue;

      // ❌ Check gap clearance along path
      const bodyClear = [];
      const feetGap = [];
      let last = originVec;

      for (let i = 1; i <= distance; i++) {
        const forward = last.forward(1);
        if (forward.y !== originVec.y) break; // must stay flat until final drop

        bodyClear.push(forward.up(1)); // head/body space
        feetGap.push(forward.down(1)); // gap under feet
        last = forward;
      }

      // must have actual gap (air/water)
      if (!feetGap.every((n) => this.isAir(n) || this.isWater(n))) continue;
      if (!bodyClear.every((n) => this.isWalkable(n))) continue;

      // ✅ Valid parkour down move
      const parkourNode = landingNode.clone();
      parkourNode.attributes = {
        name: this.name,
        cost: this.COST_PARKOUR * distance,
        nJump: distance === 2 || 1,
        sJump: distance > 2,
        dist: distance,
        down: true, // mark as downward jump
      };

      neighbors.push(
        this.makeMovement(parkourNode, parkourNode.attributes.cost)
      );
      break; // only add shortest valid jump
    }
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
