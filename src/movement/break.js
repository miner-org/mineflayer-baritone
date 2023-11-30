const { Move, registerMoves } = require("./");

class MoveBreakDown extends Move {
  addNeighbors(neighbors, config, manager) {
    let landingNode = this.down(1);
    let supportNode = this.down(2);
    this.config = config;
    this.manager = manager;

    if (this.isAir(supportNode)) return [];

    // if the support node was already broken or its not air then we cant go there
    if (manager.isNodeBroken(supportNode)) return [];

    if (this.isBreakble(landingNode, config)) {
      this.break = true;
      neighbors.push(this.makeBreakable(landingNode, 3.5));
    }
  }

  addBreakNeighbors(neighbors) {
    let landingNode = this.down(1);

    neighbors.push({
      parent: landingNode,
      blocks: [landingNode],
    });
  }
}

registerMoves([MoveBreakDown]);
