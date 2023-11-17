const { Move, registerMoves } = require("./");
const COST_TO_BREAK = 3;

class MoveBreakForward extends Move {
  addNeighbors(neighbors, config) {
    this.config = config;
    if (!config.breakBlocks) return [];

    let node = this.forward(1);
    let forwardUp = this.up(1).forward(1);
    let checkNode = this.forward(1).down(1);

    if (this.isNodeMarked(node) && this.getNodeAttribute(node) === "broken")
      return [];

    // we have to check to see if it is good to go to node because sometimes it can fall to its death if we dont check whats below node
    let isSafe = false;
    for (let i = 0; i < 4; i++) {
      if (this.isSolid(checkNode)) {
        isSafe = true;
        break;
      }
      checkNode = checkNode.down(1);
    }

    if (!isSafe) return [];

    if (this.isBreakble(node, config) && this.isBreakble(forwardUp, config)) {
      this.break = true;
      neighbors.push(this.makeBreakable(node, 1 + COST_TO_BREAK));
    }
  }

  addBreakNeighbors(neighbors) {
    let node = this.forward(1);
    let forwardUp = this.up(1).forward(1);

    if (
      this.isBreakble(node, this.config) &&
      this.isBreakble(forwardUp, this.config)
    ) {
      this.markNode(node, "broken");
      this.markNode(forwardUp, "broken");
      neighbors.push({ parent: node, blocks: [node, forwardUp] });
    }
  }
}

class MoveBreakSemiForwardUp extends Move {
  addNeighbors(neighbors, config) {
    this.config = config;

    if (!config.breakBlocks) return [];

    let targetNode = this.up(1).forward(1);
    let standingNode = this.forward(1);
    let node2 = this.up(2).forward(1);

    // if this is air then this is a valid neighbor
    let upNode = this.up(2);

    if (
      this.isNodeMarked(targetNode) &&
      this.getNodeAttribute(targetNode) === "broken"
    )
      return [];

    if (!this.isSolid(standingNode)) return [];


    if (this.isBreakble(targetNode, config) && this.isAir(node2) && this.isAir(upNode)) {
      this.break = true;
      neighbors.push(this.makeBreakable(targetNode, 1.5 + COST_TO_BREAK));
    }
  }

  addBreakNeighbors(neighbors) {
    let targetNode = this.up(1).forward(1);

    if (this.isBreakble(targetNode, this.config)) {
      this.markNode(targetNode, "broken");
      neighbors.push({
        parent: targetNode,
        blocks: [targetNode],
      });
    }
  }
}

class MoveBreakForwardUp extends Move {
  addNeighbors(neighbors, config) {
    this.config = config;

    if (!config.breakBlocks) return [];

    let targetNode = this.forward(1).up(1);
    let upNode = this.up(2);
    let target2 = this.forward(1).up(2);
    let standingNode = this.forward(1);

    if (!this.isAir(upNode)) return [];

    if (!this.isSolid(standingNode)) return [];

    if (
      this.isNodeMarked(targetNode) &&
      this.getNodeAttribute(targetNode) === "broken"
    )
      return [];

    if (
      this.isBreakble(target2, config) &&
      this.isBreakble(targetNode, config)
    ) {
      this.break = true;
      neighbors.push(this.makeBreakable(targetNode, 2.5 + COST_TO_BREAK));
    }
  }

  addBreakNeighbors(neighbors) {
    let targetNode = this.forward(1).up(1);
    let target2 = this.forward(1).up(2);

    if (
      this.isBreakble(target2, this.config) &&
      this.isBreakble(targetNode, this.config)
    ) {
      this.markNode(targetNode, "broken");
      this.markNode(target2, "broken");
      neighbors.push({
        parent: targetNode,
        blocks: [targetNode, target2],
      });
    }
  }
}

class MoveBreakForwardDown extends Move {
  addNeighbors(neighbors, config) {}

  addBreakNeighbors(neighbors) {}
}

class MoveBreakUp extends Move {
  addNeighbors(neighbors, config) {
    this.config = config;

    if (!config.breakBlocks) return [];

    let targetNode = this.up(2);
    let landingNode = this.forward(1).up(1);

    if (
      this.isNodeMarked(landingNode) &&
      this.getNodeAttribute(landingNode) === "broken"
    )
      return [];

    if (this.isBreakble(targetNode, config) && this.isStandable(landingNode)) {
      this.break = true;
      neighbors.push(this.makeBreakable(landingNode, 1.5 + COST_TO_BREAK));
    }
  }

  addBreakNeighbors(neighbors) {
    let targetNode = this.up(2);
    let landingNode = this.forward(1).up(1);

    if (this.isBreakble(targetNode, this.config) && this.isStandable(landingNode)) {
      this.markNode(targetNode, "broken");
      neighbors.push({ parent: landingNode, blocks: [targetNode] });
    }
  }
}

registerMoves([
  MoveBreakForward,
  MoveBreakSemiForwardUp,
  MoveBreakForwardUp,
  MoveBreakUp,
  // MoveBreakForwardDown,
]);
