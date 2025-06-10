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
      isWater(node) &&
      isWater(nodeBelow) &&
      (this.isAir(head) || isWater(head));

    if (stepInValid) {
      node.attributes["name"] = this.name;
      node.attributes["swimming"] = true;
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
    const underWater = waterTarget.down(1);
    const diveOk =
      isWater(waterTarget) &&
      isWater(underWater) &&
      (this.isAir(waterTarget.up(1)) || isWater(waterTarget.up(1)));

    if (diveOk) {
      const finalNode = waterTarget.clone();
      finalNode.attributes["name"] = this.name;
      finalNode.attributes["swimming"] = true;
      finalNode.attributes["fallDistance"] = diveDistance;

      const cost =
        this.COST_SWIM_START + diveDistance * (this.COST_FALL_PER_BLOCK ?? 1);

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
    const below = node.down(1); // The landing block
    const belowBelow = below.down(1); // Should be water
    const head = node.up(1); // Make sure headroom is clear

    const canStepOut = this.isStandable(node) && this.isSolid(below);
    const waterUnder = this.isWater(belowBelow);
    const headClear = this.isAir(head) || this.isWater(head);

    if (canStepOut && waterUnder && headClear) {
      node.attributes["name"] = this.name;
      node.attributes["exitWater"] = true;
      neighbors.push(
        this.makeMovement(node, this.COST_SWIM_EXIT ?? this.COST_NORMAL + 3)
      );
    }
  }
}

// registerMoves([new MoveSwimForward(), new MoveSwimStart(), new MoveSwimExit()]);
