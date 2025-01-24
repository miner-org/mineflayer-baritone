const { Move, registerMoves } = require("./");

class MoveBreakParkour1 extends Move {
  addNeighbors(neighbors, config, manager) {
    if (!config.parkour) return;

    this.config = config;
    this.manager = manager;

    // only used if config.proParkour is false
    let jumpNode = this.up(2);

    let landingNode = this.forward(2);
    let spaceNode1 = this.forward(1);
    let spaceNode2 = this.up(1, spaceNode1);

    let airNode = this.forward(1).down(1);

    let breakNode1 = this.up(1, landingNode);
    let breakNode2 = this.up(2, landingNode);

    if (!this.isAir(airNode)) return;

    let standingNode = this.down(1, landingNode);
    if (manager.isNodeBroken(standingNode)) return;

    if (
      this.isWalkable(spaceNode1) &&
      this.isWalkable(spaceNode2) &&
      this.isBreakble(breakNode1, config) &&
      !this.isSolid(breakNode2) &&
      this.isStandable(landingNode)
    ) {
      this.break = true;
      const digTime = this.getNodeDigTime(breakNode1);
      neighbors.push(
        this.makeBreakable(landingNode, this.COST_BREAK * digTime)
      );
    }

    if (
      this.isWalkable(spaceNode1) &&
      this.isWalkable(spaceNode2) &&
      this.isBreakble(breakNode1, config) &&
      this.isBreakble(breakNode2, config) &&
      this.isStandable(landingNode)
    ) {
      this.break = true;
      const digTime1 = this.getNodeDigTime(breakNode1);
      const digTime2 = this.getNodeDigTime(breakNode2);
      const digTime = digTime1 + digTime2;
      neighbors.push(
        this.makeBreakable(landingNode, this.COST_BREAK * digTime)
      );
    }
  }

  addBreakNeighbors(neighbors) {
    let landingNode = this.forward(2);
    let breakNode1 = this.up(1, landingNode);
    let breakNode2 = this.up(2, landingNode);

    if (this.isBreakble(breakNode1, this.config)) {
      neighbors.push({
        parent: landingNode,
        blocks: [breakNode1],
      });
    }

    if (
      this.isBreakble(breakNode1, this.config) &&
      this.isBreakble(breakNode2, this.config)
    ) {
      neighbors.push({
        parent: landingNode,
        blocks: [breakNode1, breakNode2],
      });
    }
  }
}

// registerMoves([MoveBreakParkour1]);