const { Move, registerMoves, DirectionalVec3 } = require("./");

class MoveLadderUp extends Move {
  generate(cardinalDirections, origin, neighbors) {
    for (const dir of cardinalDirections) {
      this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, dir);
      const node = this.origin.up(1);
      this.addNeighbors(neighbors, node);
    }
  }

  addNeighbors(neighbors, node) {
    const below = node.down(1);
    const head = node.up(1);

    // Only allow if currently standing in ladder and going to another ladder
    if (
      this.isClimbable(below) &&
      this.isClimbable(node) &&
      (this.isAir(head) || this.isClimbable(head))
    ) {
      node.attributes["name"] = this.name;
      node.attributes["ladder"] = true;
      neighbors.push(
        this.makeMovement(node, this.COST_CLIMB ?? this.COST_NORMAL + 1)
      );
    }
  }
}

class MoveLadderDown extends Move {
  generate(cardinalDirections, origin, neighbors) {
    for (const dir of cardinalDirections) {
      this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, dir);
      const node = this.origin.down(1);
      this.addNeighbors(neighbors, node);
    }
  }

  addNeighbors(neighbors, node) {
    const head = node.up(1);
    const bottom = node.down(1);

    if (
      this.isClimbable(node) &&
      (this.isAir(head) || this.isClimbable(head))
    ) {
      node.attributes["name"] = this.name;
      node.attributes["ladder"] = true;
      neighbors.push(
        this.makeMovement(node, this.COST_LADDER ?? this.COST_NORMAL + 1)
      );
    }
  }
}

class MoveLadderEnter extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (!this.config.ladders) return;

    for (const dir of cardinalDirections) {
      this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, dir);

      const forward = this.origin.offset(dir.x, 0, dir.z);
      this.addNeighbors(neighbors, forward);
    }
  }

  addNeighbors(neighbors, node) {
    const below = this.origin.down(1);
    const head = node.up(1);

    const isFromSolid = this.isSolid(below);
    const isLadder = this.isLadder(node);
    const headClear = this.isAir(head) || this.isLadder(head);

    if (isFromSolid && isLadder && headClear) {
      node.attributes["name"] = this.name;
      node.attributes["ladder"] = true;
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

    const fromLadder = this.isLadder(this.origin);
    const toStandable = this.isStandable(node);
    const blockBelow = this.isSolid(below);
    const headClear = this.isAir(head);

    if (fromLadder && toStandable && blockBelow && headClear) {
      node.attributes["name"] = this.name;
      node.attributes["ladder"] = false;
      neighbors.push(
        this.makeMovement(node, this.COST_LADDER_EXIT ?? this.COST_NORMAL + 1)
      );
    }
  }
}

registerMoves([
  new MoveLadderEnter(),
  new MoveLadderUp(),
  new MoveLadderDown(),
  new MoveLadderExit(),
]);
