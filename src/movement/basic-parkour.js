const { Move, registerMoves, DirectionalVec3 } = require("./");

class MoveForwardParkour extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (!this.config.parkour) return;

    for (const dir of cardinalDirections) {
      const originVec = new DirectionalVec3(origin.x, origin.y, origin.z, dir);
      // console.log(originVec);

      if (this.isWater(originVec)) return;

      // console.log("d")

      this.addNeighbors(neighbors, originVec);
    }
  }

  /**
   *
   * @param {DirectionalVec3[]} neighbors
   * @param {DirectionalVec3} originVec
   */
  addNeighbors(neighbors, originVec) {
    const maxDistance = 3;
    let count = 0;

    for (let distance = count; distance <= maxDistance; distance++) {
      const landingNode = originVec.forward(distance + 1);
      const standingNode = landingNode.down(1);

      // Must land exactly same height
      if (landingNode.y !== originVec.y) continue;
      if (standingNode.y !== originVec.y - 1) continue;

      // Broken or unsafe landing
      if (!this.isStandable(landingNode)) continue;

      // Check gap clearance
      const bodyClear = [];
      const feetGap = [];

      let last = originVec;

      for (let i = 1; i <= distance; i++) {
        const forward = last.forward(1);

        if (forward.y !== originVec.y) break;

        bodyClear.push(forward.up(1));
        feetGap.push(forward.down(1));

        last = forward;
      }

      // Must be actual gap (air/water only)
      if (!feetGap.every((node) => this.isAir(node) || this.isWater(node)))
        continue;

      // Body clearance must be fully walkable
      if (!bodyClear.every((node) => this.isWalkable(node))) continue;

      // console.log("Parkour")

      // Valid Parkour
      const parkourNode = landingNode.clone();
      parkourNode.attributes = {
        name: this.name,
        cost: this.COST_PARKOUR * distance,
        nJump: distance === 1,
        sJump: distance >= 2,
        dist: distance,
        parkour: true,
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

      if (this.isWater(originVec)) return;
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

      for (let i = 1; i <= distance; i++) {
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
        parkour: true, // mark as parkour
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

      if (this.isWater(originVec)) return;
      this.addNeighbors(neighbors, originVec);
    }
  }

  addNeighbors(neighbors, originVec) {
    const minDistance = 1;
    const maxDistance = 3; // small parkour forward

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
        parkour: true, // mark as parkour
      };

      neighbors.push(
        this.makeMovement(parkourNode, parkourNode.attributes.cost)
      );
      break; // only add shortest valid jump
    }
  }
}

class MoveAngledParkour extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (!this.config.parkour) return;

    const diagonalDirections = [
      { x: 1, z: 1 },
      { x: 1, z: -1 },
      { x: -1, z: 1 },
      { x: -1, z: -1 },
    ];

    // Loop over all possible diagonal-ish offsets
    const maxDist = 3;

    for (const dir of diagonalDirections) {
      for (let fx = 1; fx <= maxDist; fx++) {
        for (let rz = 1; rz <= maxDist; rz++) {
          // Skip pure straight lines (those are handled by forward parkour)
          if (fx === 0 || rz === 0) continue;
          // Skip perfect diagonals if you already handle them
          // if (fx === rz) continue;

          const originVec = new DirectionalVec3(
            origin.x,
            origin.y,
            origin.z,
            dir
          );

          if (this.isWater(originVec)) return;
          this.addNeighbors(neighbors, originVec, fx, rz);
        }
      }
    }
  }

  /**
   * @param {Array} neighbors
   * @param {DirectionalVec3} originVec
   * @param {number} fx - forward steps
   * @param {number} rz - right steps
   */
  addNeighbors(neighbors, originVec, fx, rz) {
    const landingNode = originVec.forward(fx).right(rz);
    const standingNode = landingNode.down(1);

    // Must land at same height
    if (landingNode.y !== originVec.y) return;
    if (standingNode.y !== originVec.y - 1) return;

    if (!this.isStandable(landingNode)) return;

    // --- Collect gap + clearance along the jump path ---
    const pathNodes = this.interpolatePath(originVec, fx, rz);

    const feetGap = pathNodes.map((p) => p.down(1));
    const bodyClear = pathNodes.map((p) => p.up(1));

    if (!feetGap.every((n) => this.isAir(n) || this.isWater(n))) return;
    if (!bodyClear.every((n) => this.isWalkable(n))) return;

    // --- Valid angled parkour ---
    const dist = Math.max(fx, rz);
    landingNode.attributes = {
      name: this.name,
      cost: this.COST_PARKOUR * dist,
      nJump: dist === 1,
      sJump: dist >= 2,
      parkour: true, // mark as parkour
      dist,
    };

    neighbors.push(this.makeMovement(landingNode, landingNode.attributes.cost));
  }

  /**
   * Bresenham-style interpolation from (0,0) to (fx,rz)
   */
  interpolatePath(originVec, fx, rz) {
    const nodes = [];
    let x = 0,
      z = 0;
    let dx = Math.abs(fx),
      dz = Math.abs(rz);
    let sx = Math.sign(fx),
      sz = Math.sign(rz);
    let err = dx - dz;

    while (x !== fx || z !== rz) {
      const pos = originVec.forward(x).right(z);
      nodes.push(pos);

      const e2 = 2 * err;
      if (e2 > -dz) {
        err -= dz;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        z += sz;
      }
    }

    return nodes;
  }
}

class MoveDiagonalParkour extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (!this.config.parkour) return;

    const diagonalDirections = [
      { x: 1, z: 1 },
      { x: 1, z: -1 },
      { x: -1, z: 1 },
      { x: -1, z: -1 },
    ];

    for (const dir of diagonalDirections) {
      const originVec = new DirectionalVec3(origin.x, origin.y, origin.z, dir);

      if (this.isWater(originVec)) return;
      this.addNeighbors(neighbors, originVec);
    }
  }

  /**
   * @param {Array} neighbors
   * @param {DirectionalVec3} originVec
   */
  addNeighbors(neighbors, originVec) {
    const minDist = 1;
    const maxDist = 3;

    for (let distance = minDist; distance <= maxDist; distance++) {
      // diagonal landing (distance steps forward + sideways)
      const landingNode = originVec.forward(distance);
      const standingNode = landingNode.down(1);

      // must land at same Y level
      if (landingNode.y !== originVec.y) continue;
      if (standingNode.y !== originVec.y - 1) continue;

      // landing must be standable
      if (!this.isStandable(landingNode)) continue;

      // collect clearance + gap nodes
      const bodyClear = [];
      const feetGap = [];

      let last = originVec;
      for (let i = 1; i <= distance; i++) {
        const forward = originVec.forward(i).right(i);
        if (forward.y !== originVec.y) break;

        bodyClear.push(forward.up(1)); // body clearance
        feetGap.push(forward.down(1)); // gap should be air/water
        last = forward;
      }

      // gap must be fully air/water
      if (!feetGap.every((node) => this.isAir(node) || this.isWater(node)))
        continue;

      // clearance must be walkable
      if (!bodyClear.every((node) => this.isWalkable(node))) continue;

      // ✅ valid diagonal parkour move
      landingNode.attributes = {
        name: this.name,
        cost: this.COST_PARKOUR * distance,
        nJump: distance === 1,
        sJump: distance >= 2,
        parkour: true, // mark as parkour
        dist: distance,
      };

      neighbors.push(
        this.makeMovement(landingNode, landingNode.attributes.cost)
      );
      break; // only shortest valid jump
    }
  }
}

// Change the priorities at the bottom from 50-60 to 15-25 (higher than basic, but still considered)
registerMoves([
  new MoveForwardParkour(15, {
    // Was 50
    category: "parkour",
    tags: ["horizontal", "jumping", "gap"],
    description: "Forward parkour jumping across gaps",
    testConfig: { parkour: true, breakBlocks: false, placeBlocks: false },
  }),
  new MoveForwardParkourUp(18, {
    // Was 55
    category: "parkour",
    tags: ["vertical", "up", "jumping", "gap"],
    description: "Forward parkour jumping up across gaps",
    testConfig: { parkour: true, breakBlocks: false, placeBlocks: false },
  }),
  new MoveForwardParkourDown(18, {
    // Was 55
    category: "parkour",
    tags: ["vertical", "down", "jumping", "gap"],
    description: "Forward parkour jumping down across gaps",
    testConfig: { parkour: true, breakBlocks: false, placeBlocks: false },
  }),
  // new MoveAngledParkour(25, {
  //   // Was 60
  //   category: "parkour",
  //   tags: ["diagonal", "jumping", "gap", "angled"],
  //   description: "Angled parkour jumping at various angles",
  //   testConfig: { parkour: true, breakBlocks: false, placeBlocks: false },
  // }),
  // new MoveDiagonalParkour(25, {
  //   // Was 60
  //   category: "parkour",
  //   tags: ["diagonal", "jumping", "gap"],
  //   description: "Diagonal parkour jumping across gaps",
  //   testConfig: { parkour: true, breakBlocks: false, placeBlocks: false },
  // }),
]);
