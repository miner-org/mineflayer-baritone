const { Move, registerMoves, DirectionalVec3 } = require("./");

class MoveFlyForward extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (!this.config.fly) return;

    for (const dir of cardinalDirections) {
      this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, dir);
      const node = this.origin.forward(1);
      this.addNeighbors(neighbors, node);
    }
  }

  addNeighbors(neighbors, targetNode) {
    let node = this.down(1);

    if (!this.isAir(node)) return;

    if (this.isWalkable(targetNode)) {
      targetNode.attributes.isFlying = true;
      targetNode.attributes.name = this.name;
      targetNode.attributes.canStandOnTop = false;
      neighbors.push(this.makeMovement(targetNode, this.COST_FLY));
    }
  }
}

class MoveFlyUp extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (!this.config.fly) return;
    this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, {
      x: 0,
      z: 0,
    });
    const up = this.origin.offset(0, 1, 0); // drop one

    this.addNeighbors(neighbors, up);
  }

  addNeighbors(neighbors, targetNode) {
    if (this.isWalkable(targetNode)) {
      targetNode.attributes.isFlying = true;
      targetNode.attributes.flyDirection = "up";
      targetNode.attributes.canStandOnTop = false;
      targetNode.attributes.name = this.name;
      neighbors.push(
        this.makeMovement(targetNode, this.COST_UP + this.COST_FLY),
      );
    }
  }
}

class MoveFlyDown extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (!this.config.fly) return;
    this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, {
      x: 0,
      z: 0,
    });
    const down = this.origin.offset(0, -1, 0); // drop one
    this.addNeighbors(neighbors, down);
  }

  addNeighbors(neighbors, targetNode) {
    if (this.isWalkable(targetNode)) {
      targetNode.attributes.isFlying = true;
      targetNode.attributes.flyDirection = "down";
      targetNode.attributes.canStandOnTop = false;
      targetNode.attributes.name = this.name;
      neighbors.push(
        this.makeMovement(targetNode, this.COST_FALL + this.COST_FLY),
      );
    }
  }
}

class MoveFlyLand extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (!this.config.fly) return;

    this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, {
      x: 0,
      z: 0,
    });
    const down = this.origin.offset(0, -1, 0);
    this.addNeighbors(neighbors, down, true);

    for (const dir of cardinalDirections) {
      this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, dir);
      const node = this.origin.forward(1);
      this.addNeighbors(neighbors, node, false);
    }
  }

  addNeighbors(neighbors, targetNode, isStraightDown) {
    if (this.isStandable(targetNode)) {
      targetNode.attributes.isFlying = true;
      targetNode.attributes.name = this.name;
      targetNode.attributes.canStandOnTop = true;
      if (isStraightDown) targetNode.attributes.flyDirection = "down";

      const cost = isStraightDown
        ? this.COST_FALL + this.COST_FLY
        : this.COST_FLY;

      neighbors.push(this.makeMovement(targetNode, cost));
    }
  }
}

registerMoves([
  new MoveFlyForward(50),
  new MoveFlyUp(50),
  new MoveFlyDown(50),
  new MoveFlyLand(50),
]);
