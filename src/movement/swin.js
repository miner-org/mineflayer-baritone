const { Move, registerMoves, DirectionalVec3 } = require("./");

class MoveSwimForward extends Move {
  generate(cardinalDirections, origin, neighbors) {
    for (const dir of cardinalDirections) {
      this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, dir);

      const node = this.origin.offset(dir.x, 0, dir.z);
      this.addNeighbors(neighbors, node);
    }
  }

  addNeighbors(neighbors, node) {
    const below = node.down(1);
    const head = node.up(1);

    if (
      this.isWater(node) &&
      (this.isAir(head) || this.isWater(head)) &&
      this.isWater(below)
    ) {
      node.attributes["name"] = this.name;
      node.attributes["swimming"] = true;

      const cost = this.COST_SWIM ?? this.COST_NORMAL + 1;
      node.attributes["cost"] = cost;
      neighbors.push(this.makeMovement(node, cost));
    }
  }
}

class MoveSwimStart extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (!this.config.swimming) return;

    for (const dir of cardinalDirections) {
      this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, dir);

      const node = this.origin.offset(dir.x, 0, dir.z);
      this.addStepOrDive(neighbors, node);
    }
  }

  addStepOrDive(neighbors, node) {
    const head = node.up(1);
    const originBelow = this.origin.down(1);
    const steppingFromSolid = this.isSolid(originBelow);

    const isWater = (n) => this.isWater(n) || this.isFlowingWater?.(n);

    // ——————————————
    // NORMAL STEP-INTO-WATER
    // ——————————————
    const nodeBelow = node.down(1);
    const stepInValid =
      steppingFromSolid &&
      this.isWalkable(node) &&
      isWater(nodeBelow) &&
      this.isAir(head);

    if (stepInValid) {
      node.attributes["name"] = this.name;
      node.attributes["swimming"] = true;
      node.attributes["cost"] = this.COST_SWIM_START ?? this.COST_NORMAL + 2; // Cost to start swimming
      neighbors.push(
        this.makeMovement(node, this.COST_SWIM_START ?? this.COST_NORMAL + 2)
      );
      return;
    }

    // ——————————————
    // DIVE-INTO-WATER
    // ——————————————
    let diveDistance = 0;
    const maxDive = this.config.maxWaterDist ?? 10;
    let below = node.down(1);

    // Simulate falling until we hit water or maxDive
    while (diveDistance < maxDive && this.isAir(below)) {
      diveDistance++;
      below = below.down(1);
    }

    // Need at least 2 water blocks to break the fall safely
    const waterTarget = below;
    const diveOk =
      isWater(waterTarget) &&
      (this.isAir(waterTarget.up(1)));

    if (diveOk) {
      const finalNode = waterTarget.clone();
      finalNode.attributes["name"] = this.name;
      finalNode.attributes["swimming"] = true;
      finalNode.attributes["fallDistance"] = diveDistance;

      const cost =
        this.COST_SWIM_START + diveDistance * (this.COST_FALL_PER_BLOCK ?? 1);
      finalNode.attributes["cost"] = cost;

      neighbors.push(this.makeMovement(finalNode, cost));
    }
  }
}

class MoveSwimExit extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (!this.config.swimming) return;

    for (const dir of cardinalDirections) {
      this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, dir);

      const node = this.origin.offset(dir.x, 1, dir.z); // Going UP
      this.addNeighbors(neighbors, node);
    }
  }

  addNeighbors(neighbors, node) {
    if (!this.isWater(this.origin)) return;

    const head = node.up(1); // Make sure headroom is clear

    const canStepOut = this.isStandable(node);
    const headClear = this.isWalkable(head);

    if (canStepOut && headClear) {
      node.attributes["name"] = this.name;
      node.attributes["exitWater"] = true;
      node.attributes["cost"] = this.COST_SWIM_EXIT ?? this.COST_NORMAL + 2; // Cost to exit water]
      neighbors.push(
        this.makeMovement(node, this.COST_SWIM_EXIT ?? this.COST_NORMAL + 3)
      );
    }
  }
}

class MoveSwimUp extends Move {
  generate(cardinalDirections, origin, neighbors) {
    this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, {
      x: 0,
      z: 0,
    });

    const node = this.origin.up(1);
    this.addNeighbors(neighbors, node);
  }

  addNeighbors(neighbors, node) {
    const below = node.down(1);
    const head = node.up(1);

    if (
      this.isWater(node) &&
      (this.isAir(head) || this.isWater(head)) &&
      this.isWater(below)
    ) {
      node.attributes["name"] = this.name;
      node.attributes["swimming"] = true;
      node.attributes["up"] = true; // Indicate upward swim

      const cost = this.COST_SWIM_VERTICAL ?? this.COST_NORMAL + 1.5;
      node.attributes["cost"] = cost;
      neighbors.push(this.makeMovement(node, cost));
    }
  }
}

class MoveSwimDown extends Move {
  generate(cardinalDirections, origin, neighbors) {
    this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, {
      x: 0,
      z: 0,
    });

    const node = this.origin.down(1);
    this.addNeighbors(neighbors, node);
  }

  addNeighbors(neighbors, node) {
    const below = node.down(1);
    const head = node.up(1);

    if (
      this.isWater(node) &&
      (this.isAir(head) || this.isWater(head)) &&
      this.isWater(below)
    ) {
      node.attributes["name"] = this.name;
      node.attributes["swimming"] = true;
      node.attributes["down"] = true; // Indicate downward swim

      const cost = this.COST_SWIM_VERTICAL ?? this.COST_NORMAL + 1.5;
      node.attributes["cost"] = cost;
      neighbors.push(this.makeMovement(node, cost));
    }
  }
}

class MoveSwimDiagonal extends Move {
  generate(cardinalDirections, origin, neighbors) {
    const diagonals = [
      { x: 1, z: 1 },
      { x: -1, z: 1 },
      { x: 1, z: -1 },
      { x: -1, z: -1 },
    ];

    for (const dir of diagonals) {
      this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, dir);

      const node = this.origin.offset(dir.x, 0, dir.z);
      this.addNeighbors(neighbors, node);
    }
  }

  addNeighbors(neighbors, node) {
    const below = node.down(1);
    const head = node.up(1);

    if (
      this.isWater(node) &&
      (this.isAir(head) || this.isWater(head)) &&
      this.isWater(below)
    ) {
      node.attributes["name"] = this.name;
      node.attributes["swimming"] = true;

      const cost = this.COST_SWIM_DIAGONAL ?? this.COST_NORMAL + 2;
      node.attributes["cost"] = cost;
      neighbors.push(this.makeMovement(node, cost));
    }
  }
}

registerMoves([
  new MoveSwimForward(10),
  new MoveSwimStart(10),
  new MoveSwimExit(10),
  new MoveSwimUp(10),
  new MoveSwimDown(10),
  new MoveSwimDiagonal(10),
]);
