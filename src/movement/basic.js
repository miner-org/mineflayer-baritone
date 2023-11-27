const { Move, registerMoves } = require("./");

class MoveForward extends Move {
  addNeighbors(neighbors, config, manager) {
    let forwardNode = this.forward(1);
    let standingNode = this.forward(1).down(1);
    this.config = config;
    this.manager = manager;

    // potential blocks we have to break
    let forwardUp = this.forward(1).up(1);

    if (
      manager.isNodeMarked(standingNode) &&
      manager.getNodeAttribute(standingNode) === "broken"
    )
      return;

    if (this.isStandable(forwardNode)) {
      neighbors.push(this.makeMovement(forwardNode, 1));
      return;
    }

    // otherwise we do more checks

    if (
      config.breakBlocks &&
      this.isBreakble(forwardNode, config) &&
      this.isBreakble(forwardUp, config)
    ) {
      this.break = true;
      neighbors.push(this.makeBreakable(forwardNode, 1));
    }
  }

  addBreakNeighbors(neighbors) {
    let node = this.forward(1);
    let forwardUp = this.up(1).forward(1);

    if (
      this.isBreakble(node, this.config) &&
      this.isBreakble(forwardUp, this.config)
    ) {
      // console.log("manager", this.manager)
      this.manager.markNode(node, "broken");
      this.manager.markNode(forwardUp, "broken");
      neighbors.push({ parent: node, blocks: [node, forwardUp] });
    }
  }
}

class MoveDiagonal extends Move {
  addNeighbors(neighbors) {
    let landingNode = this.right(1).forward(1);

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
  addNeighbors(neighbors, config, manager) {
    let landingNode = this.forward(1).up(1);
    let standingNode = this.forward(1);
    let node2 = this.forward(1).up(2);
    let upNode = this.up(2);

    this.config = config;
    this.manager = manager;

    // basically if the standing is broken/air then this is an invalid move
    if (
      manager.isNodeMarked(standingNode) &&
      manager.getNodeAttribute(standingNode) === "broken"
    )
      return;

    if (this.isAir(upNode) && this.isStandable(landingNode)) {
      neighbors.push(this.makeMovement(landingNode, 1.5));
      return;
    }

    // if the node above us is solid
    if (config.breakBlocks && this.isBreakble(upNode, config)) {
      this.break = true;
      neighbors.push(
        this.makeBreakable(
          landingNode,
          10 * this.getNodeDigTime(landingNode) + this.getNodeDigTime(upNode)
        )
      );
      return;
    }

    // if the landing node and the node above it are solid
    if (
      config.breakBlocks &&
      this.isBreakble(landingNode, config) &&
      this.isBreakble(node2, config)
    ) {
      this.break = true;
      neighbors.push(
        this.makeBreakable(
          landingNode,
          10 * this.getNodeDigTime(landingNode) + this.getNodeDigTime(node2)
        )
      );
      return;
    }

    // if all three are solid
    if (
      config.breakBlocks &&
      this.isBreakble(upNode, config) &&
      this.isBreakble(landingNode, config) &&
      this.isBreakble(node2, config)
    ) {
      this.break = true;
      neighbors.push(
        this.makeBreakable(
          landingNode,
          10 * this.getNodeDigTime(landingNode) +
            this.getNodeDigTime(upNode) +
            this.getNodeDigTime(node2)
        )
      );
    }
  }

  addBreakNeighbors(neighbors) {
    let landingNode = this.forward(1).up(1);
    let upNode = this.up(2);
    let node2 = this.forward(1).up(2);

    if (this.isBreakble(upNode, this.config)) {
      this.manager.markNode(upNode, "broken");
      neighbors.push({
        parent: landingNode,
        blocks: [upNode],
      });
      return;
    }

    if (
      this.isBreakble(landingNode, this.config) &&
      this.isBreakble(node2, this.config)
    ) {
      this.manager.markNode(landingNode, "broken");
      this.manager.markNode(node2, "broken");
      neighbors.push({
        parent: landingNode,
        blocks: [node2, landingNode],
      });
      return;
    }

    if (
      this.isBreakble(upNode, this.config) &&
      this.isBreakble(landingNode, this.config) &&
      this.isBreakble(node2, this.config)
    ) {
      this.manager.markNode(landingNode, "broken");
      this.manager.markNode(upNode, "broken");
      this.manager.markNode(node2, "broken");
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
