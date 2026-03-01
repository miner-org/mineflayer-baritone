const { Move, registerMoves, DirectionalVec3 } = require("./");

class MoveForwardParkour extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (!this.config.parkour) return;
    if (this.config.fly) return;

    for (const dir of cardinalDirections) {
      const originVec = new DirectionalVec3(origin.x, origin.y, origin.z, dir);
      // console.log(originVec);

      if (this.isWater(originVec)) continue;

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
    if (!this.isStandable(originVec)) return;

    const maxDistance = 3;
    const minDistance = 1;

    const start = originVec.forward(1);

    for (let distance = minDistance; distance <= maxDistance; distance++) {
      const landingNode = start.forward(distance);
      const standingNode = landingNode.down(1);

      // Must land exactly same height
      if (landingNode.y !== originVec.y) continue;
      if (standingNode.y !== originVec.y - 1) continue;

      // Broken or unsafe landing
      if (!this.isStandable(landingNode)) {
        const canPlace = this.config.placeBlocks && this.hasScaffoldingBlocks();

        const down = landingNode.down(1);

        const canScaffold =
          this.isAir(down) &&
          this.isAir(down.down(1)) &&
          canPlace &&
          this.canPlaceBlock(down) &&
          !this.manager.isAreaMarkedNode(down) &&
          this.canAffordPlacement(1) &&
          distance > 2;

        if (!canScaffold) continue;
      }

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

      // console.log("Parkour", distance);

      // Valid Parkour
      const parkourNode = landingNode.clone();
      parkourNode.attributes = {
        name: this.name,
        cost: this.COST_PARKOUR * distance,
        nJump: distance === 1,
        sJump: distance >= 2,
        dist: distance,
        parkour: true,
        originVec,
      };

      if (this.isAir(landingNode.down(1))) {
        parkourNode.attributes.place = [landingNode.clone().down(1)];
        parkourNode.attributes.cost *= 2;
      }
      neighbors.push(
        this.makeMovement(parkourNode, parkourNode.attributes.cost),
      );

      break; // only add the shortest valid parkour move
    }
  }
}

class MoveForwardParkourUp extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (!this.config.parkour) return;
    if (this.config.fly) return;

    for (const dir of cardinalDirections) {
      const originVec = new DirectionalVec3(origin.x, origin.y, origin.z, dir);

      if (!this.isWalkable(originVec)) continue; //dont fucknig know hwy this happens

      if (this.isWater(originVec)) continue;
      this.addNeighbors(neighbors, originVec);
    }
  }

  addNeighbors(neighbors, originVec) {
    if (!this.isStandable(originVec)) return;
    const minDistance = 1;
    const maxDistance = 2; // small parkour forward
    const start = originVec.forward(1);

    for (let distance = minDistance; distance <= maxDistance; distance++) {
      const landingNode = start.forward(distance).up(1); // step up 1
      const standingNode = landingNode.down(1); // block under feet

      if (!this.isStandable(landingNode)  ) {
        if(!this.isWalkable(landingNode))continue;
        const canPlace =
          this.config.placeBlocks &&
          this.hasScaffoldingBlocks() &&
          this.canAffordPlacement(1);

        const down = landingNode.down(1);

        const canScaffold =
          this.isAir(down) &&
          canPlace &&
          this.canPlaceBlock(down) &&
          !this.manager.isAreaMarkedNode(down);

        if (!canScaffold) continue;
      }

      const bodyClear = [];
      const feetGap = [];
      let last = originVec;

      for (let i = 1; i <= distance; i++) {
        const forward = last.forward(1);

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
        cost: this.COST_PARKOUR * distance + this.COST_UP,
        nJump: distance === 1,
        sJump: distance >= 2,
        dist: distance,
        up: true, // mark as upward jump
        parkour: true, // mark as parkour
        originVec,
      };

      if (!this.isStandable(landingNode)) {
        parkourNode.attributes.place = [landingNode.clone().down(1)];
        parkourNode.attributes.cost += this.COST_PLACE;
        parkourNode.attributes.cost *= 0.8;
      }

      neighbors.push(
        this.makeMovement(parkourNode, parkourNode.attributes.cost),
      );
      break; // only add shortest valid jump
    }
  }
}

class MoveForwardParkourDown extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (!this.config.parkour) return;
    if (this.config.fly) return;

    for (const dir of cardinalDirections) {
      const originVec = new DirectionalVec3(origin.x, origin.y, origin.z, dir);

      if (this.isWater(originVec)) continue;
      this.addNeighbors(neighbors, originVec);
    }
  }

  addNeighbors(neighbors, originVec) {
    if (!this.isStandable(originVec)) return;
    const minDistance = 1;
    const maxDistance = 2; // small parkour forward

    const start = originVec.forward(1);

    for (let distance = minDistance; distance <= maxDistance; distance++) {
      const landingNode = start.forward(distance).down(1); // step down 1
      const standingNode = landingNode.down(1); // block under feet

      if (!this.isStandable(landingNode)) continue;

      const bodyClear = [];
      const feetGap = [];
      let last = originVec;

      for (let i = 1; i <= distance; i++) {
        const forward = last.forward(1);
        if (forward.y !== originVec.y) break; // must stay flat until final drop

        bodyClear.push(forward.up(1)); // head/body space
        feetGap.push(forward.down(2)); // gap under feet
        last = forward;
      }

      // must have actual gap (air/water)
      if (!feetGap.every((n) => this.isWalkable(n) || this.isWater(n)))
        continue;
      if (!bodyClear.every((n) => this.isWalkable(n))) continue;

      const parkourNode = landingNode.clone();
      parkourNode.attributes = {
        name: this.name,
        cost: this.COST_PARKOUR * distance + this.COST_FALL,
        nJump: true,
        dist: distance,
        down: true, // mark as downward jump
        parkour: true, // mark as parkour
        originVec,
      };

      neighbors.push(
        this.makeMovement(parkourNode, parkourNode.attributes.cost),
      );
      break; // only add shortest valid jump
    }
  }
}

class MoveDiagonalParkour extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (!this.config.parkour) return;
    if (this.config.fly) return;

    const diagonalDirections = [
      { x: 1, z: 1 },
      { x: 1, z: -1 },
      { x: -1, z: 1 },
      { x: -1, z: -1 },
    ];

    for (const dir of diagonalDirections) {
      const originVec = new DirectionalVec3(origin.x, origin.y, origin.z, dir);

      if (!this.isWalkable(originVec)) continue;
      if (this.isWater(originVec)) continue;

      this.addNeighbors(neighbors, originVec);
    }
  }

  addNeighbors(neighbors, originVec) {
    if (!this.isStandable(originVec)) return;

    const distance = 1;
    const start = originVec.forward(1);
    const landingNode = start.forward(distance);

    if (!this.isStandable(landingNode)) return;

    // Validate full diagonal sweep (same logic as ParkourUp)
    for (let i = 1; i <= distance; i++) {
      const t = i / distance;

      const x = originVec.x + landingNode.dir.x * t;
      const z = originVec.z + landingNode.dir.z * t;

      const base = new DirectionalVec3(
        Math.floor(x),
        originVec.y,
        Math.floor(z),
        landingNode.dir,
      );

      const feet = base;
      const feet2 = base.down(1);
      const head = base.up(1);
      const aboveHead = base.up(2);

      // Feet must be air/water (must jump over gap)
      if (!this.isAir(feet) && !this.isWater(feet)) return;

      if (!this.isAir(feet2) && !this.isWater(feet2)) return;

      // Full 2-block clearance
      if (!this.isWalkable(head) || !this.isWalkable(aboveHead)) return;

      // Strict diagonal corner prevention
      const sideA = base.offset(landingNode.dir.x, 0, 0);
      const sideB = base.offset(0, 0, landingNode.dir.z);

      if (!this.isWalkable(sideA) && !this.isWalkable(sideB)) return;
    }

    const parkourNode = landingNode.clone();
    parkourNode.attributes = {
      name: this.name,
      cost: this.COST_PARKOUR * distance + this.COST_DIAGONAL,
      sJump: true,
      diagonal: true,
      parkour: true,
      dist: distance,
      originVec,
    };

    neighbors.push(this.makeMovement(parkourNode, parkourNode.attributes.cost));
  }
}

class MoveDiagonalParkourUp extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (!this.config.parkour) return;
    if (this.config.fly) return;

    const diagonalDirections = [
      { x: 1, z: 1 },
      { x: 1, z: -1 },
      { x: -1, z: 1 },
      { x: -1, z: -1 },
    ];

    for (const dir of diagonalDirections) {
      const originVec = new DirectionalVec3(origin.x, origin.y, origin.z, dir);

      if (!this.isWalkable(originVec)) continue;
      if (this.isWater(originVec)) continue;

      this.addNeighbors(neighbors, originVec);
    }
  }

  addNeighbors(neighbors, originVec) {
    if (!this.isStandable(originVec)) return;

    const minDistance = 1;
    const maxDistance = 1; // allow small diagonal parkour
    const start = originVec.forward(1);

    for (let distance = minDistance; distance <= maxDistance; distance++) {
      const landingNode = start.forward(distance).up(1);

      if (!this.isStandable(landingNode)) continue;

      const sideA = landingNode.offset(landingNode.dir.x, 0, 0);
      const sideB = landingNode.offset(0, 0, landingNode.dir.z);

      if (!this.isWalkable(sideA) && !this.isWalkable(sideB)) continue;

      const bodyClear = [];
      const feetGap = [];
      let last = originVec;

      // Validate full diagonal sweep
      for (let i = 1; i <= distance; i++) {
        const t = i / distance;

        // True diagonal interpolation
        const x = originVec.x + landingNode.dir.x * t;
        const z = originVec.z + landingNode.dir.z * t;

        const base = new DirectionalVec3(
          Math.floor(x),
          originVec.y,
          Math.floor(z),
          landingNode.dir,
        );

        const feet = base;
        const head = base.up(1);
        const aboveHead = base.up(2);

        // Feet must not collide with solid block
        if (!this.isAir(feet) && !this.isWater(feet)) {
          return; // blocked path
        }

        // Body clearance (2 block tall entity)
        if (!this.isWalkable(head) || !this.isWalkable(aboveHead)) {
          return; // blocked head
        }

        // Prevent diagonal corner clipping strictly
        const sideA = base.offset(landingNode.dir.x, 0, 0);
        const sideB = base.offset(0, 0, landingNode.dir.z);

        if (!this.isWalkable(sideA) && !this.isWalkable(sideB)) {
          return; // hard blocked corner
        }
      }

      // Must actually jump over air
      if (!feetGap.every((n) => this.isAir(n) || this.isWater(n))) continue;

      // Must have head clearance
      if (!bodyClear.every((n) => this.isWalkable(n))) continue;

      // Valid diagonal parkour up
      const parkourNode = landingNode.clone();
      parkourNode.attributes = {
        name: this.name,
        cost: this.COST_PARKOUR * distance + this.COST_UP + this.COST_DIAGONAL,
        sJump: true,
        diagonal: true,
        up: true,
        parkour: true,
        dist: distance,
        originVec,
      };

      neighbors.push(
        this.makeMovement(parkourNode, parkourNode.attributes.cost),
      );

      break; // shortest valid only
    }
  }
}

class MoveDiagonalParkourDown extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (!this.config.parkour) return;
    if (this.config.fly) return;

    const diagonalDirections = [
      { x: 1, z: 1 },
      { x: 1, z: -1 },
      { x: -1, z: 1 },
      { x: -1, z: -1 },
    ];

    for (const dir of diagonalDirections) {
      const originVec = new DirectionalVec3(origin.x, origin.y, origin.z, dir);

      if (!this.isWalkable(originVec)) continue;
      if (this.isWater(originVec)) continue;

      this.addNeighbors(neighbors, originVec);
    }
  }

  addNeighbors(neighbors, originVec) {
    if (!this.isStandable(originVec)) return;

    const distance = 1;
    const start = originVec.forward(1);
    const landingNode = start.forward(distance).down(1);

    if (!this.isStandable(landingNode)) return;

    // Validate full diagonal sweep BEFORE drop
    for (let i = 1; i <= distance; i++) {
      const t = i / distance;

      const x = originVec.x + landingNode.dir.x * t;
      const z = originVec.z + landingNode.dir.z * t;

      const base = new DirectionalVec3(
        Math.floor(x),
        originVec.y,
        Math.floor(z),
        landingNode.dir,
      );

      const feet = base;
      const head = base.up(1);
      const aboveHead = base.up(2);

      // Must jump over air before falling
      if (!this.isAir(feet) && !this.isWater(feet)) return;

      // Full body clearance
      if (!this.isWalkable(head) || !this.isWalkable(aboveHead)) return;

      // Strict diagonal corner prevention
      const sideA = base.offset(landingNode.dir.x, 0, 0);
      const sideB = base.offset(0, 0, landingNode.dir.z);

      if (!this.isWalkable(sideA) && !this.isWalkable(sideB)) return;
    }

    const parkourNode = landingNode.clone();
    parkourNode.attributes = {
      name: this.name,
      cost: this.COST_PARKOUR * distance + this.COST_FALL + this.COST_DIAGONAL,
      nJump: true,
      diagonal: true,
      down: true,
      parkour: true,
      dist: distance,
      originVec,
    };

    neighbors.push(this.makeMovement(parkourNode, parkourNode.attributes.cost));
  }
}

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
  new MoveDiagonalParkour(25, {
    // Was 60
    category: "parkour",
    tags: ["diagonal", "jumping", "gap"],
    description: "Diagonal parkour jumping across gaps",
    testConfig: { parkour: true, breakBlocks: false, placeBlocks: false },
  }),
  new MoveDiagonalParkourUp(25),
  new MoveDiagonalParkourDown(25),
]);
