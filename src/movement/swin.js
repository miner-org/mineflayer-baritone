const { Move, registerMoves, DirectionalVec3 } = require("./");

class MoveSwimForward extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (!this.config.swimming) return;
    if (this.config.fly) return;

    for (const dir of cardinalDirections) {
      const originVec = new DirectionalVec3(origin.x, origin.y, origin.z, dir);
      const node = originVec.offset(dir.x, 0, dir.z);
      this.addNeighbors(neighbors, node, originVec);
    }
  }

  addNeighbors(neighbors, node, originVec) {
    const below = node.down(1);
    const head = node.up(1);

    // console.log("Swim orgin vec", originVec.toString());

    // Must be in water to swim horizontally
    if (!this.isWater(originVec)) return;

    // console.log("We swim s");

    // Target must be water or air (surface swimming)
    const nodeIsSwimmable =
      this.isWater(node) || (this.isAir(node) && this.isWater(below));
    if (!nodeIsSwimmable) return;

    // console.log("We swim fr");

    // Head must be clear or water
    if (!this.isAir(head) && !this.isWater(head)) return;

    node.attributes = {
      name: this.name,
      swim: true,
      cost: this.COST_SWIM ?? this.COST_NORMAL + 1.2,
    };

    neighbors.push(this.makeMovement(node, node.attributes.cost));
  }
}

class MoveSwimStart extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (!this.config.swimming) return;
    if (this.config.fly) return;
    for (const dir of cardinalDirections) {
      const originVec = new DirectionalVec3(origin.x, origin.y, origin.z, dir);
      const node = originVec.offset(dir.x, 0, dir.z);
      this.addNeighbors(neighbors, node, originVec);
    }
  }

  addNeighbors(neighbors, node, originVec) {
    const originBelow = originVec.down(1);
    const steppingFromSolid = this.isSolid(originBelow);

    // Can't start swimming if not on solid ground
    if (!steppingFromSolid) return;

    // Already in water? Use regular swim moves
    if (this.isWater(originVec)) return;

    const head = node.up(1);
    const nodeBelow = node.down(1);

    // ═══════════════════════════
    // CASE 1: Step into shallow water (feet in water, head in air)
    // ═══════════════════════════
    if (this.isAir(node) && this.isWater(nodeBelow) && this.isAir(head)) {
      const trueNode = nodeBelow;
      trueNode.attributes = {
        name: this.name + "_step",
        swim: true,
        cost: this.COST_SWIM_START ?? this.COST_NORMAL + 1.5,
        enterTarget: node,
      };
      neighbors.push(this.makeMovement(trueNode, trueNode.attributes.cost));
      // console.log("Swin step")
      return;
    }

    // ═══════════════════════════
    // CASE 2: Step into deep water (body submerged)
    // ═══════════════════════════
    if (this.isWater(node) && this.isWater(nodeBelow)) {
      const trueNode = nodeBelow;
      trueNode.attributes = {
        name: this.name + "_deep",
        swim: true,
        enterTarget: node,
        cost: this.COST_SWIM_START ?? this.COST_NORMAL + 1.5,
      };
      neighbors.push(this.makeMovement(trueNode, trueNode.attributes.cost));
      return;
    }

    // console.log("here")

    // ═══════════════════════════
    // CASE 3: Dive into water from height
    // ═══════════════════════════
    const maxDive = Math.max(this.config.maxWaterDist ?? 10, 15);
    let diveDistance = 0;
    let below = node.down(1);

    // Fall through air until we hit water
    while (diveDistance < maxDive && this.isAir(below)) {
      diveDistance++;
      below = below.down(1);
    }

    // console.log(this.getBlock(below))
    // console.log(this.config.maxWaterDist)
    // console.log(diveDistance)

    // console.log("not air")

    // Need to land in water with at least 2 blocks depth to be safe
    if (diveDistance > 0 && this.isWater(below)) {
      this.log("Can dive at: ", below.toString());
      const targetNode = below.clone();
      targetNode.attributes = {
        name: this.name + "_dive",
        swim: true,
        dive: true,
        fallDistance: diveDistance,
        cost: this.COST_SWIM_START + diveDistance * 0.3,
      };
      neighbors.push(this.makeMovement(targetNode, targetNode.attributes.cost));
    }
  }

  // Helper to check water depth
  getWaterDepth(startPos) {
    let depth = 0;
    let pos = startPos.clone();

    while (depth < 10 && this.isWater(pos)) {
      depth++;
      pos = pos.down(1);
    }

    return depth;
  }
}

class MoveSwimExit extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (!this.config.swimming) return;
    if (this.config.fly) return;
    const originVec = new DirectionalVec3(origin.x, origin.y, origin.z, {
      x: 0,
      z: 0,
    });

    // Must be in water to exit
    if (!this.isWater(originVec)) return;

    for (const dir of cardinalDirections) {
      // Try exiting at same level and one block up
      const sameLevel = originVec.offset(dir.x, 0, dir.z);
      const upOne = originVec.offset(dir.x, 1, dir.z);

      this.addNeighbors(neighbors, sameLevel, originVec, false);
      this.addNeighbors(neighbors, upOne, originVec, true);
    }
  }

  addNeighbors(neighbors, node, originVec, isClimbingOut) {
    const head = node.up(1);
    const nodeBelow = node.down(1);
    // console.log("===========");
    // console.log(node);
    // console.log(this.getBlock(node));
    // console.log("===========");
    // Target must be air (or allow stepping on lily pads/etc)
    if (!this.isAir(node) && !this.getBlock(node)?.name.includes("lily"))
      return;

    // Must have solid ground to step onto
    if (!this.isSolid(nodeBelow)) return;

    // Head must be clear
    if (!this.isAir(head) && !this.isWater(head)) return;

    // Can't exit onto farmland or other special blocks
    const belowBlock = this.getBlock(nodeBelow);
    if (
      belowBlock.name.includes("farmland") ||
      belowBlock.name.includes("soul_sand")
    )
      return;

    const cost = isClimbingOut
      ? (this.COST_SWIM_EXIT ?? this.COST_NORMAL + 2.5) + this.COST_UP
      : this.COST_SWIM_EXIT ?? this.COST_NORMAL + 2;

    node.attributes = {
      name: this.name,
      exitWater: true,
      climbOut: isClimbingOut,
      cost,
    };

    neighbors.push(this.makeMovement(node, cost));
  }
}

class MoveSwimUp extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (!this.config.swimming) return;
    if (this.config.fly) return;
    const originVec = new DirectionalVec3(origin.x, origin.y, origin.z, {
      x: 0,
      z: 0,
    });

    // Must be in water to swim up
    if (!this.isWater(originVec)) return;

    const node = originVec.up(1);
    this.addNeighbors(neighbors, node, originVec);
  }

  addNeighbors(neighbors, node, originVec) {
    const below = node.down(1);
    const head = node.up(1);

    // Target must be water or air at surface
    const validTarget =
      this.isWater(node) || (this.isAir(node) && this.isWater(below));

    if (!validTarget) return;

    // Head must be clear
    if (this.isWalkable(head)) return;

    const cost = (this.COST_SWIM ?? this.COST_NORMAL + 1.2);

    node.attributes = {
      name: this.name,
      swim: true,
      up: true,
      cost,
    };

    neighbors.push(this.makeMovement(node, cost));
  }
}

class MoveSwimDown extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (!this.config.swimming) return;
    if (this.config.fly) return;
    const originVec = new DirectionalVec3(origin.x, origin.y, origin.z, {
      x: 0,
      z: 0,
    });

    // Must be in water to swim down
    if (!this.isWater(originVec)) return;

    // Try swimming down 1-3 blocks
    for (let depth = 1; depth <= 3; depth++) {
      const node = originVec.down(depth);
      this.addNeighbors(neighbors, node, originVec, depth);
    }
  }

  addNeighbors(neighbors, node, originVec, depth) {
    // Must still be in water
    if (!this.isWater(node)) return;

    // Below must be water or we hit bottom
    const below = node.down(1);
    if (!this.isWater(below) && !this.isSolid(below)) return;

    const cost = (this.COST_SWIM ?? this.COST_NORMAL + 1.2) * depth * 0.8; // Slightly cheaper to go down

    node.attributes = {
      name: this.name,
      swim: true,
      down: true,
      depth,
      cost,
    };

    neighbors.push(this.makeMovement(node, cost));
  }
}

class MoveSwimDiagonal extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (!this.config.swimming) return;
    if (this.config.fly) return;
    const diagonals = [
      { x: 1, z: 1 },
      { x: -1, z: 1 },
      { x: 1, z: -1 },
      { x: -1, z: -1 },
    ];

    for (const dir of diagonals) {
      const originVec = new DirectionalVec3(origin.x, origin.y, origin.z, dir);

      // Must be in water
      if (!this.isWater(originVec)) continue;

      const node = originVec.offset(dir.x, 0, dir.z);
      this.addNeighbors(neighbors, node, originVec);
    }
  }

  addNeighbors(neighbors, node, originVec) {
    const below = node.down(1);
    const head = node.up(1);

    // Target must be water or air at surface
    const nodeIsSwimmable =
      this.isWater(node) || (this.isAir(node) && this.isWater(below));
    if (!nodeIsSwimmable) return;

    // Head clear or water
    if (!this.isAir(head) && !this.isWater(head)) return;

    node.attributes = {
      name: this.name,
      swim: true,
      cost: this.COST_DIAGONAL * (this.COST_SWIM ?? 1.2),
    };

    neighbors.push(this.makeMovement(node, node.attributes.cost));
  }
}

registerMoves([
  new MoveSwimForward(8, {
    category: "water",
    tags: ["swimming", "horizontal"],
    description: "Swim forward in water",
  }),
  new MoveSwimStart(8, {
    category: "water",
    tags: ["swimming", "entering"],
    description: "Enter water from land",
  }),
  new MoveSwimExit(8, {
    category: "water",
    tags: ["swimming", "exiting"],
    description: "Exit water to land",
  }),
  new MoveSwimUp(9, {
    category: "water",
    tags: ["swimming", "vertical"],
    description: "Swim upward in water",
  }),
  new MoveSwimDown(9, {
    category: "water",
    tags: ["swimming", "vertical"],
    description: "Swim downward in water",
  }),
  new MoveSwimDiagonal(10, {
    category: "water",
    tags: ["swimming", "diagonal"],
    description: "Swim diagonally in water",
  }),
]);
