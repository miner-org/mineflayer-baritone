const { Move, registerMoves } = require("./");

class MoveForward extends Move {
  addNeighbors(neighbors, config, manager) {
    let forwardNode = this.forward(1);
    let standingNode = this.down(1).forward(1);
    this.config = config;

    // cuz its air by now
    if (manager.isNodeBroken(standingNode)) return;

    if (this.isStandable(forwardNode)) {
      neighbors.push(this.makeMovement(forwardNode, this.COST_NORMAL));
    }
  }
}

class MoveDiagonal extends Move {
  addNeighbors(neighbors, config, manager) {
    let targetNode = this.right(1).forward(1);
    let forwardNode = this.forward(1);
    let rightNode = this.right(1);

    if (!this.isWalkable(forwardNode) && !this.isWalkable(rightNode)) return;

    if (this.isStandable(targetNode)) {
      neighbors.push(this.makeMovement(targetNode, this.COST_DIAGONAL));
    }
  }
}

class MoveForwardUp extends Move {
  addNeighbors(neighbors, config, manager) {
    let standingNode = this.forward(1);
    let landingNode = this.up(1).forward(1);
    let node2 = this.up(2).forward(1);
    let upNode = this.up(2);

    this.config = config;
    this.manager = manager;
    if (manager.isNodeBroken(standingNode)) return;

    if (
      this.isAir(upNode) &&
      this.isStandable(landingNode) &&
      !this.isFence(standingNode)
    ) {
      neighbors.push(this.makeMovement(landingNode, this.COST_UP));
    }
  }
}

class MoveForwardDown extends Move {
  addNeighbors(neighbors, config) {
    let landingNode = this.down(1).forward(1);
    let walkableNode = this.forward(1);

    if (!this.isWalkable(walkableNode)) return;

    if (!this.isWalkable(landingNode)) return;

    let isSafe = false;
    let cost = 0;
    for (let i = 0; i < config.maxFallDist; i++) {
      if (this.isStandable(landingNode)) {
        isSafe = true;
        break;
      }

      cost += 1;
      landingNode = landingNode.down(1);
    }

    if (
      isSafe &&
      this.isWalkable(walkableNode) &&
      this.isStandable(landingNode)
    ) {
      neighbors.push(this.makeMovement(landingNode, this.COST_UP * cost));
      return;
    }
  }
}

class MoveForwardDownWater extends Move {
  addNeighbors(neighbors, config) {
    let forwardNode = this.forward(1);
    let forwardNode2 = this.down(1).forward(1);
    let landingNode = forwardNode;

    if (!this.isAir(forwardNode2)) return;

    if (!this.isAir(forwardNode)) return;

    let isSafe = false;
    for (let i = 0; i < config.maxWaterDist; i++) {
      if (!this.isWaterLogged(landingNode) && this.isSolid(landingNode)) break;

      if (this.isWater(landingNode) || this.isWaterLogged(landingNode)) {
        isSafe = true;
        break;
      }

      landingNode = landingNode.down(1);
    }

    if (
      isSafe &&
      (this.isWater(landingNode) || this.isWaterLogged(landingNode)) &&
      this.isWalkable(forwardNode)
    ) {
      if (this.isWater(landingNode)) {
        neighbors.push(this.makeMovement(landingNode, this.COST_UP));
      } else if (this.isWaterLogged(landingNode)) {
        neighbors.push(this.makeMovement(landingNode, this.COST_UP));
      }
    }
  }
}

registerMoves([
  MoveForward,
  MoveForwardUp,
  MoveForwardDown,
  MoveDiagonal,
  MoveForwardDownWater,
]);
