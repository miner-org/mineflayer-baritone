const { Move, registerMoves } = require("./");

class MoveForward extends Move {
  addNeighbors(neighbors, config, manager) {
    let forwardNode = this.forward(1);
    let standingNode = this.down(1, forwardNode);
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
    let forwardNode = this.forward(1);
    let rightNode = this.right(1);
    let targetNode = this.right(1, forwardNode);

    if (!this.isStandable(forwardNode) && !this.isStandable(rightNode)) return;

    if (this.isStandable(targetNode)) {
      neighbors.push(this.makeMovement(targetNode, this.COST_DIAGONAL));
    }
  }
}

class MoveForwardUp extends Move {
  addNeighbors(neighbors, config, manager) {
    let landingNode = this.up(1).forward(1);
    let standingNode = this.down(1, landingNode);
    let upNode = this.up(1);

    this.config = config;
    this.manager = manager;
    if (manager.isNodeBroken(standingNode)) return;

    if (
      this.isWalkable(upNode) &&
      this.isStandable(landingNode) &&
      !this.isFence(standingNode)
    ) {
      neighbors.push(this.makeMovement(landingNode, this.COST_UP));
    }
  }
}

class MoveForwardDown extends Move {
  addNeighbors(neighbors, config) {
    let walkableNode = this.forward(1);
    let landingNode = walkableNode;

    if (!this.isWalkable(walkableNode)) return;

    let isSafe = false;
    let cost = 0;
    for (let i = 0; i < config.maxFallDist; i++) {
      landingNode = walkableNode.down(1);
      cost += 1;

      if (this.isStandable(landingNode)) {
        isSafe = true;
        break;
      }
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
    let forwardNode2 = this.down(1, forwardNode);
    let landingNode = forwardNode;

    if (!this.isWalkable(forwardNode)) return;

    let isSafe = false;
    let cost = 0;
    for (let i = 0; i < config.maxWaterDist; i++) {
      if (!this.isWaterLogged(landingNode) && this.isSolid(landingNode)) break;

      landingNode = forwardNode.down(1);

      if (this.isWater(landingNode) || this.isWaterLogged(landingNode)) {
        isSafe = true;
        break;
      }
      cost += 1;
    }

    if (
      isSafe &&
      (this.isWater(landingNode) || this.isWaterLogged(landingNode)) &&
      this.isWalkable(forwardNode)
    ) {
      if (this.isWater(landingNode)) {
        neighbors.push(this.makeMovement(landingNode, this.COST_UP * cost));
      } else if (this.isWaterLogged(landingNode)) {
        neighbors.push(this.makeMovement(landingNode, this.COST_UP * cost));
      }
    }
  }
}

class MoveDiagonalUp extends Move {
  addNeighbors(neighbors) {
    let fowardUpNode = this.forward(1).up(1);
    let rightUpNode = this.right(1).up(1);
    let landingNode = this.right(1, fowardUpNode);

    if (!this.isStandable(fowardUpNode) && !this.isStandable(rightUpNode)) return;

    if (this.isStandable(landingNode)) {
      neighbors.push(
        this.makeMovement(landingNode, this.COST_DIAGONAL * this.COST_UP)
      );
    }
  }
}

registerMoves([
  MoveForward,
  MoveForwardUp,
  MoveForwardDown,
  MoveDiagonal,
  MoveForwardDownWater,
  MoveDiagonalUp,
]);
