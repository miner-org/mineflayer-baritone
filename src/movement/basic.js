const { Move, registerMoves } = require("./");

class MoveForward extends Move {
  addNeighbors(neighbors, config, manager) {
    let forwardNode = this.forward(1);
    let standingNode = this.forward(1).down(1);
    this.config = config;
    this.manager = manager;

    // potential blocks we have to break
    let forwardUp = this.forward(1).up(1);

    // cuz its air by now
    if (manager.isNodeBroken(standingNode)) return [];

    if (this.isStandable(forwardNode)) {
      neighbors.push(this.makeMovement(forwardNode, 1));
    }

    // that means we broke blocks to reach here
    else if (
      !manager.isNodeBroken(standingNode) &&
      this.isSolid(standingNode) &&
      this.isBreakble(forwardNode, config) &&
      this.isBreakble(forwardUp, config)
    ) {
      this.break = true;
      neighbors.push(this.makeBreakable(forwardNode, 3));
    }
  }

  addBreakNeighbors(neighbors) {
    let node = this.forward(1);
    let forwardUp = this.up(1).forward(1);

    // console.log("getting called")
    neighbors.push({ parent: node, blocks: [node, forwardUp] });
  }
}

class MoveDiagonal extends Move {
  addNeighbors(neighbors, config, manager) {
    let targetNode = this.right(1).forward(1);
    let forwardNode = this.forward(1);
    let rightNode = this.right(1);

    if (!this.isWalkable(forwardNode) && !this.isWalkable(rightNode)) return [];

    if (this.isStandable(targetNode)) {
      neighbors.push(this.makeMovement(targetNode, 1.4))
    }
  }
}

class MoveForwardUp extends Move {
  addNeighbors(neighbors, config, manager) {
    let standingNode = this.forward(1);
    let landingNode = this.forward(1).up(1);
    let node2 = this.forward(1).up(2);
    let upNode = this.up(2);

    this.config = config;
    this.manager = manager;
    if (manager.isNodeBroken(standingNode)) return [];

    if (this.isAir(upNode) && this.isStandable(landingNode)) {
      neighbors.push(this.makeMovement(landingNode, 1.5));
    } else if (
      !manager.isNodeBroken(standingNode) &&
      this.isSolid(standingNode) &&
      this.isBreakble(upNode, config) &&
      this.isBreakble(landingNode, config) &&
      this.isBreakble(node2, config)
    ) {
      this.break = true;
      neighbors.push(this.makeBreakable(landingNode, 3.5));
    }
  }

  addBreakNeighbors(neighbors) {
    let landingNode = this.forward(1).up(1);
    let upNode = this.up(2);
    let node2 = this.forward(1).up(2);
    let standingNode = this.forward(1);
    const manager = this.manager;
    const config = this.config;

    if (
      this.isBreakble(upNode, config) &&
      this.isBreakble(landingNode, config) &&
      this.isBreakble(node2, config)
    ) {
      neighbors.push({
        parent: landingNode,
        blocks: [upNode, node2, landingNode],
      });
    }
  }
}

class MoveForwardDown extends Move {
  addNeighbors(neighbors, config) {
    let landingNode = this.forward(1).down(1);
    let walkableNode = this.forward(1);
    let upNode = this.forward(1).up(1);

    if (!this.isWalkable(walkableNode)) return [];

    if (!this.isWalkable(landingNode)) return [];

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
      return;
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
