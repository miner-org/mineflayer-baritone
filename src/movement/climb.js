const { Move, registerMoves, DirectionalVec3 } = require("./");

class MoveLadderEnter extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (this.config.fly) return;
    for (const dir of cardinalDirections) {
      const originVec = new DirectionalVec3(origin.x, origin.y, origin.z, dir);
      const node = originVec.offset(dir.x, 0, dir.z);
      this.addNeighbors(neighbors, node);
    }
  }

  addNeighbors(neighbors, node) {
    const below = node.down(1);
    const head = node.up(1);

    const isFromSolid = this.isSolid(below);
    const isLadder = this.isClimbable(node);
    const headClear = this.isAir(head) || this.isClimbable(head);

    if (isFromSolid && isLadder && headClear) {
      node.attributes["name"] = this.name;
      node.attributes["ladder"] = true;
      node.attributes["enter"] = true;
      // console.log("Adding ladder enter movement", node);
      node.attributes["cost"] = this.COST_LADDER ?? this.COST_NORMAL + 1;
      neighbors.push(
        this.makeMovement(node, this.COST_LADDER ?? this.COST_NORMAL + 1)
      );
    }
  }
}

class MoveLadderExit extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (this.config.fly) return;
    for (const dir of cardinalDirections) {
      const originVec = new DirectionalVec3(origin.x, origin.y, origin.z, dir);
      if (!this.isClimbable(originVec)) continue;

      const node = originVec.offset(dir.x, 1, dir.z);
      if (this.isStandable(node)) {
        node.attributes["name"] = this.name + "_up";
        node.attributes["cost"] =
          (this.COST_LADDER_EXIT ?? this.COST_NORMAL + 1) + 0.5;
        neighbors.push(this.makeMovement(node, node.attributes["cost"]));
        break;
      }
    }

    // --- Check lateral exits ---
    for (const dir of cardinalDirections) {
      const originVec = new DirectionalVec3(origin.x, origin.y, origin.z, dir);
      const node = originVec.offset(dir.x, 0, dir.z);
      this.addNeighbors(neighbors, node);
    }
  }

  addNeighbors(neighbors, node) {
    const below = node.down(1);
    const head = node.up(1);

    const fromLadder = this.isClimbable(node);
    const toStandable = this.isStandable(node);
    const blockBelow = this.isSolid(below);
    const headClear = this.isAir(head);

    if (fromLadder && toStandable && blockBelow && headClear) {
      node.attributes["name"] = this.name;
      node.attributes["ladder"] = false;
      node.attributes["cost"] = this.COST_LADDER_EXIT ?? this.COST_NORMAL + 1;
      neighbors.push(this.makeMovement(node, node.attributes["cost"]));
    }
  }
}

class MoveLadderClimb extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (this.config.fly) return;
    // For each cardinal direction, check if ladder climb is possible at origin
    // for (const dir of cardinalDirections) {
    const originVec = new DirectionalVec3(origin.x, origin.y, origin.z, {
      x: 0,
      z: 0,
    });

    const node = originVec.clone();
    const nodeBelow = node.down(1);

    // if (!this.isClimbable(nodeBelow)) return;

    // We only consider climbing if the bot is currently on a ladder block or next to one
    if (!this.isClimbable(node)) return;

    // console.log("Seeyuh");

    // From the origin, climb upwards along the ladder stack
    let climbPos = node.clone();

    let lastValid = climbPos.clone(); // Start with origin

    while (true) {
      if (!this.isClimbable(climbPos)) break;
      const headPos = climbPos.up(1);
      if (!(this.isAir(headPos) || this.isClimbable(headPos))) break;

      lastValid = climbPos.clone();

      climbPos = climbPos.up(1);
    }

    lastValid.attributes = lastValid.attributes || {};
    lastValid.attributes["name"] = this.name;
    lastValid.attributes["ladder"] = true;
    lastValid.attributes["cost"] = this.COST_LADDER;
    neighbors.push(
      this.makeMovement(lastValid, this.COST_LADDER ?? this.COST_NORMAL + 1)
    );
  }
  // }
}

class MoveLadderDescend extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (this.config.fly) return;
    const originVec = new DirectionalVec3(origin.x, origin.y, origin.z, {
      x: 0,
      z: 0,
    });

    //we are most likely coming from MoveLadderEnterDescend
    const node = originVec.down(1);

    // We only consider climbing if the bot is currently on a ladder block or next to one
    if (!this.isClimbable(node)) return;

    // From the origin, climb downwards along the ladder stack
    let climbPos = node.clone();

    let lastValid = climbPos.clone(); // Start with origin

    while (true) {
      if (!this.isClimbable(climbPos)) break;
      const belowPos = climbPos.down(1);
      if (!(this.isAir(belowPos) || this.isClimbable(belowPos))) break;

      lastValid = climbPos.clone();

      climbPos = climbPos.down(1);
    }

    lastValid.attributes = lastValid.attributes || {};
    lastValid.attributes["name"] = this.name;
    lastValid.attributes["ladder"] = true;
    lastValid.attributes["descend"] = true;
    lastValid.attributes["cost"] = this.COST_LADDER;
    neighbors.push(
      this.makeMovement(lastValid, this.COST_LADDER ?? this.COST_NORMAL + 1)
    );
  }
}

class MoveLadderEnterDescend extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (this.config.fly) return;
    for (const dir of cardinalDirections) {
      const originVec = new DirectionalVec3(origin.x, origin.y, origin.z, dir);
      const node = originVec.offset(dir.x, 0, dir.z);
      this.addNeighbors(neighbors, node);
    }
  }

  /**
   *
   * @param {DirectionalVec3[]} neighbors
   * @param {DirectionalVec3} node
   */
  addNeighbors(neighbors, node) {
    const below = node.down(1);

    if (!this.isWalkable(node)) return;
    if (!this.isClimbable(below)) return;

    const target = node.clone();

    target.attributes["name"] = this.name;
    target.attributes["ladder"] = true;
    target.attributes["descend"] = true;
    target.attributes["enterTarget"] = node.clone();
    target.attributes["cost"] = this.COST_LADDER ?? this.COST_NORMAL + 1;
    neighbors.push(
      this.makeMovement(target, this.COST_LADDER ?? this.COST_NORMAL + 1)
    );
  }
}

registerMoves([
  new MoveLadderEnter(10),
  new MoveLadderExit(10),
  new MoveLadderClimb(15),
  new MoveLadderDescend(15),
  new MoveLadderEnterDescend(10),
]);
