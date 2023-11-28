const { Move, registerMoves } = require("./");

class MoveForward extends Move {
  addNeighbors(neighbors, config, manager) {
    let forwardNode = this.forward(1);
    let standingNode = this.forward(1).down(1);
    this.config = config;
    this.manager = manager;

    // potential blocks we have to break
    let forwardUp = this.forward(1).up(1);

    // check if we can break blocks and the nodes are breakble
    if (
      config.breakBlocks &&
      this.isBreakble(forwardNode, config) &&
      this.isBreakble(forwardUp, config)
    ) {
      // we set these nodes to broken
      manager.markNode(forwardNode, "broken");
      manager.markNode(forwardUp, "broken");
    }

    if (this.isStandable(forwardNode)) {
      neighbors.push(this.makeMovement(forwardNode, 1));
    }

    // that means we broke blocks to reach here
    else if (
      manager.isNodeMarked(forwardNode) &&
      manager.getNodeAttribute(forwardNode) === "broken"
    ) {
      this.break = true;
      neighbors.push(this.makeBreakable(forwardNode, 5));
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
    let landingNode = this.right(1).forward(1);
    let rightNode = this.right(1);
    let forwadNode = this.forward(1);
    let weGood = false;

    let isRightWalkable = this.isWalkable(rightNode);
    let isForwardWalkable = this.isWalkable(forwadNode);
    if (!isRightWalkable && !isForwardWalkable) {
      // if they arent walkable check if they are broken
      if (
        manager.isNodeMarked(forwadNode) &&
        manager.isNodeMarked(rightNode) &&
        manager.getNodeAttribute(forwadNode) === "broken" &&
        manager.getNodeAttribute(rightNode)
      ) {
        // then safe to walk apon
        weGood = true;
        return;
      }

      //other wise fuck nah
      weGood = false;
    }

    if (this.isStandable(landingNode)) {
      neighbors.push(this.makeMovement(landingNode, Math.SQRT2));
    } else if (weGood) {
      neighbors.push(this.makeMovement(landingNode, Math.SQRT2));
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

    if (config.breakBlocks) {
      // if the node above us is blocking us
      if (this.isBreakble(upNode, config) && this.isStandable(landingNode)) {
        manager.markNode(upNode, "broken");
      }
      // if the 2 nodes infront of us are blocking us
      else if (
        this.isBreakble(landingNode, config) &&
        this.isBreakble(node2, config) &&
        this.isAir(upNode)
      ) {
        manager.markNode(landingNode, "broken");
        manager.markNode(node2, "broken");
      } else if (
        this.isBreakble(upNode, config) &&
        this.isBreakble(node2, config) &&
        this.isAir(landingNode)
      ) {
        manager.markNode(upNode, "broken");
        manager.markNode(node2, "broken");
      } else if (
        this.isBreakble(upNode, config) &&
        this.isBreakble(node2, config) &&
        this.isBreakble(landingNode, config)
      ) {
        manager.markNode(upNode, "broken");
        manager.markNode(node2, "broken");
        manager.markNode(landingNode, "broken");
      } else if (
        this.isBreakble(landingNode, config) &&
        this.isAir(upNode) &&
        this.isAir(node2)
      ) {
        manager.markNode(landingNode, "broken");
      }
    }

    if (this.isAir(upNode) && this.isStandable(landingNode)) {
      neighbors.push(this.makeMovement(landingNode, 1.5));
    } else if (
      manager.isNodeBroken(landingNode) &&
      manager.isNodeBroken(upNode) &&
      manager.isNodeBroken(node2)
    ) {
      // we broke all 3 blocks to get here
      this.break = true;
      neighbors.push(this.makeBreakable(landingNode, 5.5));
    } else if (manager.isNodeBroken(upNode) && this.isStandable(landingNode)) {
      // we broke 1 blocks to get here
      this.break = true;
      neighbors.push(this.makeBreakable(landingNode, 5.5));
    } else if (
      manager.isNodeBroken(landingNode) &&
      manager.isNodeBroken(node2) &&
      this.isAir(upNode)
    ) {
      // we broke 2 blocks to get here
      this.break = true;
      neighbors.push(this.makeBreakable(landingNode, 5.5));
    } else if (
      manager.isNodeBroken(upNode) &&
      manager.isNodeBroken(node2) &&
      this.isAir(landingNode)
    ) {
      // we broke 2 blocks to get here
      this.break = true;
      neighbors.push(this.makeBreakable(landingNode, 5.5));
    } else if (
      manager.isNodeBroken(landingNode) &&
      this.isAir(upNode) &&
      this.isAir(node2)
    ) {
      this.break = true;
      neighbors.push(this.makeBreakable(landingNode, 5.5));
    }
  }

  addBreakNeighbors(neighbors) {
    let landingNode = this.forward(1).up(1);
    let upNode = this.up(2);
    let node2 = this.forward(1).up(2);

    if (this.isBreakble(upNode, this.config)) {
      neighbors.push({
        parent: landingNode,
        blocks: [upNode],
      });
    } else if (
      this.isBreakble(landingNode, this.config) &&
      this.isBreakble(node2, this.config)
    ) {
      neighbors.push({
        parent: landingNode,
        blocks: [node2, landingNode],
      });
    } else if (
      this.isBreakble(node2, this.config) &&
      this.isBreakble(upNode, this.config)
    ) {
      neighbors.push({
        parent: landingNode,
        blocks: [upNode, node2],
      });
    } else if (this.isBreakble(landingNode, this.config)) {
      neighbors.push({
        parent: landingNode,
        blocks: [landingNode],
      });
    } else if (
      this.isBreakble(upNode, this.config) &&
      this.isBreakble(landingNode, this.config) &&
      this.isBreakble(node2, this.config)
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

    if (!this.isAir(walkableNode) && this.isAir(upNode)) return [];

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
      return;
    }
  }

  addBreakNeighbors(neighbors) {
    let landingNode = this.forward(1).down(1);
    let upNode = this.forward(1).up(1);
    let node2 = this.forward(1);

    this.markNode(landingNode, "broken");
    this.markNode(upNode, "broken");
    this.markNode(node2, "broken");
    neighbors.push({
      parent: landingNode,
      blocks: [upNode, node2, landingNode],
    });
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
