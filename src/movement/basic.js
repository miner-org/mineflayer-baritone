const { Move, registerMoves } = require("./");

class MoveForward extends Move {
  addNeighbors(neighbors) {
    let forwardNode = this.forward(1);
    if (
      this.isNodeMarked(forwardNode) &&
      this.getNodeAttribute(forwardNode) === "broken"
    ) {
      return [];
    }

    if (this.isStandable(forwardNode)) {
      neighbors.push(this.makeMovement(forwardNode, 1));
    }
  }
}

class MoveDiagonal extends Move {
  addNeighbors(neighbors) {
    let landingNode = this.right(1).forward(1);
    if (
      this.isNodeMarked(landingNode) &&
      this.getNodeAttribute(landingNode) === "broken"
    ) {
      return [];
    }

    let isRightWalkable =
      this.isWalkable(this.right(1).up(1)) && this.isWalkable(this.right(1));
    let isForwardWalkable =
      this.isWalkable(this.forward(1).up(1)) &&
      this.isWalkable(this.forward(1));
    if (!isRightWalkable && !isForwardWalkable) return [];

    if (this.isStandable(landingNode)) {
      neighbors.push(this.makeMovement(landingNode, Math.SQRT2));
    }
  }
}

class MoveForwardUp extends Move {
  addNeighbors(neighbors) {
    let landingNode = this.forward(1).up(1);
    let upNode = this.up(2);
    let upNodePartial = this.up(1);
    let spaceNode = this.forward(1).up(2);

    if (
      this.isNodeMarked(landingNode) &&
      this.getNodeAttribute(landingNode) === "broken" &&
      this.isNodeMarked(upNode) &&
      this.getNodeAttribute(upNode) === "broken" &&
      this.isNodeMarked(spaceNode) &&
      this.getNodeAttribute(spaceNode) === "broken" &&
      this.isNodeMarked(upNodePartial) &&
      this.getNodeAttribute(upNodePartial) === "broken"
    ) {
      // console.log("Marked")
      return [];
    }

    if (
      !this.isWalkable(upNode) &&
      !this.isWalkable(spaceNode) &&
      !this.isWalkable(upNodePartial)
    )
      return [];

    if (this.isWalkable(upNode) && this.isStandable(landingNode)) {
      neighbors.push(this.makeMovement(landingNode, 1.5));
    }
  }
}

class MoveForwardDown extends Move {
  addNeighbors(neighbors, config) {
    let landingNode = this.forward(1).down(1);
    let walkableNode = this.forward(1);

    if (
      this.isNodeMarked(landingNode) &&
      this.getNodeAttribute(landingNode) === "broken" &&
      this.isNodeMarked(walkableNode) &&
      this.getNodeAttribute(walkableNode) === "broken"
    ) {
      return [];
    }

    if (!this.isWalkable(walkableNode)) return [];

    if (this.isSolid(landingNode)) return [];

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
      neighbors.push(this.makeMovement(landingNode, 1.5 + cost));
    }
  }
}

class MoveForwardDownWater extends Move {
  addNeighbors(neighbors, config) {
    let forwardNode = this.forward(1);
    let forwardNode2 = this.forward(1).down(1);
    let landingNode = forwardNode;

    if (!this.isAir(forwardNode2)) return [];

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
        neighbors.push(this.makeMovement(landingNode, 1.5));
      } else if (this.isWaterLogged(landingNode)) {
        neighbors.push(this.makeMovement(landingNode, 1.5));
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
