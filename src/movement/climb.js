const { Move, registerMoves, DirectionalVec3 } = require("./");

class MoveLadderEnter extends Move {
  generate(cardinalDirections, origin, neighbors) {
    for (const dir of cardinalDirections) {
      this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, dir);

      const node = new DirectionalVec3(
        this.origin.x + dir.x,
        this.origin.y,
        this.origin.z + dir.z,
        dir
      );

      this.addNeighbors(neighbors, node);
    }
  }

  addNeighbors(neighbors, node) {
    const below = this.origin.down(1);
    const head = node.up(1);

    const isFromSolid = this.isSolid(below);
    const isLadder = this.isClimbable(node);
    const headClear = this.isAir(head) || this.isClimbable(head);

    if (isFromSolid && isLadder && headClear) {
      node.attributes["name"] = this.name;
      node.attributes["ladder"] = true;
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
    if (!this.config.ladders) return;

    for (const dir of cardinalDirections) {
      this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, dir);

      const exitNode = this.origin.offset(dir.x, 0, dir.z);
      this.addNeighbors(neighbors, exitNode);
    }
  }

  addNeighbors(neighbors, node) {
    const below = node.down(1);
    const head = node.up(1);

    const fromLadder = this.isClimbable(this.origin);
    const toStandable = this.isStandable(node);
    const blockBelow = this.isSolid(below);
    const headClear = this.isAir(head);

    if (fromLadder && toStandable && blockBelow && headClear) {
      node.attributes["name"] = this.name;
      node.attributes["ladder"] = false;
      node.attributes["cost"] = this.COST_LADDER_EXIT ?? this.COST_NORMAL + 1;
      neighbors.push(
        this.makeMovement(node, this.COST_LADDER_EXIT ?? this.COST_NORMAL + 1)
      );
    }
  }
}

class MoveLadderClimb extends Move {
  generate(cardinalDirections, origin, neighbors) {
    // For each cardinal direction, check if ladder climb is possible at origin
    for (const dir of cardinalDirections) {
      this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, dir);

      // We only consider climbing if the bot is currently on a ladder block or next to one
      if (!this.isClimbable(this.origin)) continue;

      // From the origin, climb upwards along the ladder stack
      let climbPos = this.origin.clone();

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
  }
}

registerMoves([
  new MoveLadderEnter(),
  new MoveLadderExit(),
  new MoveLadderClimb(),
]);
