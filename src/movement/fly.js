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
      neighbors.push(this.makeMovement(targetNode, this.COST_NORMAL));
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
      targetNode.attributes.name = this.name;
      neighbors.push(this.makeMovement(targetNode, this.COST_UP));
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
      targetNode.attributes.name = this.name;
      neighbors.push(this.makeMovement(targetNode, this.COST_FALL));
    }
  }
}

registerMoves([new MoveFlyForward(50), new MoveFlyUp(50), new MoveFlyDown(50)]);
