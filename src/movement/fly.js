const { Move, registerMoves } = require("./");

class MoveFlyForward extends Move {
  addNeighbors(neighbors, config, manager) {
    if (!config.fly) return;

    let targetNode = this.forward(1);
    let node = this.down(1);

    if (!this.isAir(node)) return;

    if (this.isWalkable(targetNode)) {
      neighbors.push(this.makeFlyMovement(targetNode, this.COST_NORMAL));
    }
  }
}

class MoveFlyUp extends Move {
  addNeighbors(neighbors, config, manager) {
    if (!config.fly) return;

    let targetNode = this.up(1);

    if (this.isWalkable(targetNode)) {
      neighbors.push(this.makeFlyMovement(targetNode, this.COST_UP));
    }
  }
}

class MoveFlyDown extends Move {
  addNeighbors(neighbors, config, manager) {
    if (!config.fly) return;

    let targetNode = this.down(1);

    if (this.isWalkable(targetNode)) {
      neighbors.push(this.makeFlyMovement(targetNode, this.COST_FALL));
    }
  }
}

// registerMoves([MoveFlyForward, MoveFlyUp, MoveFlyDown]);
