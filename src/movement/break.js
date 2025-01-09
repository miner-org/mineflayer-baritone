const { Move, registerMoves } = require("./");

class MoveBreakForward extends Move {
  addNeighbors(neighbors, config, manager) {
    if (!config.breakBlocks) return;
    let forwardNode = this.forward(1);
    let breakNode = this.forward(1);
    let standingNode = this.down(1, forwardNode);
    this.config = config;
    this.manager = manager;

    // potential blocks we have to break
    let forwardUp = this.up(1, forwardNode);

    // cuz its air by now
    if (manager.isNodeBroken(standingNode)) return;

    if (
      !manager.isNodeBroken(standingNode) &&
      this.isBreakble(breakNode, config) &&
      !this.isSolid(forwardUp)
    ) {
      this.break = true;
      const digTime = this.getNodeDigTime(breakNode);
      neighbors.push(
        this.makeBreakable(forwardNode, this.COST_BREAK * digTime)
      );
    }

    if (
      !manager.isNodeBroken(standingNode) &&
      this.isBreakble(breakNode, config) &&
      this.isBreakble(forwardUp, config)
    ) {
      this.break = true;
      const digTime =
        this.getNodeDigTime(breakNode) + this.getNodeDigTime(forwardUp);
      neighbors.push(
        this.makeBreakable(forwardNode, this.COST_BREAK * digTime)
      );
    }
  }

  addBreakNeighbors(neighbors) {
    let node = this.forward(1);
    let forwardUp = this.up(1).forward(1);
    let breakNode = this.forward(1);

    if (this.isBreakble(node, this.config)) {
      neighbors.push({
        parent: node,
        blocks: [breakNode],
      });
    }

    if (
      this.isBreakble(node, this.config) &&
      this.isBreakble(forwardUp, this.config)
    ) {
      neighbors.push({
        parent: node,
        blocks: [breakNode, forwardUp],
      });
    }
  }
}

class MoveBreakForwardUp extends Move {
  addNeighbors(neighbors, config, manager) {
    if (!config.breakBlocks) return;

    let landingNode = this.up(1).forward(1);
    let standingNode = this.down(1, landingNode);
    let breakNode = this.up(1).forward(1);
    let node2 = this.up(1, landingNode);
    let upNode = this.up(2);

    this.config = config;
    this.manager = manager;
    if (manager.isNodeBroken(standingNode)) return;

    if (
      !manager.isNodeBroken(standingNode) &&
      this.isSolid(standingNode) &&
      this.isAir(upNode) &&
      this.isBreakble(breakNode, config) &&
      this.isBreakble(node2, config)
    ) {
      this.break = true;
      const digTime2 = this.getNodeDigTime(node2);
      const digTime = this.getNodeDigTime(breakNode) + digTime2;
      neighbors.push(
        this.makeBreakable(
          landingNode,
          this.COST_BREAK + this.COST_UP * digTime
        )
      );
    }

    if (
      !manager.isNodeBroken(standingNode) &&
      this.isSolid(standingNode) &&
      this.isBreakble(upNode, config) &&
      this.isBreakble(breakNode, config) &&
      this.isBreakble(node2, config)
    ) {
      this.break = true;
      const digTime1 = this.getNodeDigTime(breakNode);
      const digTime2 = this.getNodeDigTime(upNode);
      const digTime = this.getNodeDigTime(node2) + digTime1 + digTime2;

      neighbors.push(
        this.makeBreakable(
          landingNode,
          this.COST_BREAK + this.COST_UP * digTime
        )
      );
    }

    if (
      !manager.isNodeBroken(standingNode) &&
      this.isSolid(standingNode) &&
      this.isAir(upNode) &&
      this.isAir(node2) &&
      this.isBreakble(breakNode, config)
    ) {
      this.break = true;
      const digTime = this.getNodeDigTime(breakNode);
      neighbors.push(
        this.makeBreakable(
          landingNode,
          this.COST_BREAK + this.COST_UP * digTime
        )
      );
    }
  }

  addBreakNeighbors(neighbors) {
    let landingNode = this.up(1).forward(1);
    let breakNode = this.up(1).forward(1);
    let node2 = this.up(1, landingNode);
    let upNode = this.up(2);
    const config = this.config;

    if (
      this.isAir(upNode, config) &&
      this.isBreakble(breakNode, config) &&
      this.isBreakble(node2, config)
    ) {
      neighbors.push({
        parent: landingNode,
        blocks: [node2, breakNode],
      });
    }

    if (
      this.isBreakble(upNode, config) &&
      this.isBreakble(breakNode, config) &&
      this.isBreakble(node2, config)
    ) {
      neighbors.push({
        parent: landingNode,
        blocks: [upNode, breakNode, node2],
      });
    }
    if (
      this.isAir(upNode) &&
      this.isAir(node2) &&
      this.isBreakble(breakNode, config)
    ) {
      neighbors.push({
        parent: landingNode,
        blocks: [breakNode],
      });
    }
  }
}

class MoveBreakForwardDown extends Move {
  addNeighbors(neighbors, config, manager) {
    if (!config.breakBlocks) return;

    this.config = config;
    this.manager = manager;

    let targetNode = this.down(1).forward(1);
    let breakNode = this.down(1).forward(1);
    let forwardNode = this.up(1, targetNode);
    let headNode = this.up(2, targetNode);

    if (manager.isNodeBroken(targetNode)) return;

    let standingNode = this.down(1, targetNode);

    if (manager.isNodeBroken(standingNode)) return;

    if (
      this.isBreakble(breakNode, this.config) &&
      !this.isSolid(this.up(1, breakNode))
    ) {
      this.break = true;
      const digTime = this.getNodeDigTime(breakNode);
      neighbors.push(
        this.makeBreakable(
          targetNode,
          (this.COST_BREAK + this.COST_UP) * digTime
        )
      );
    }

    if (
      this.isBreakble(forwardNode, config) &&
      this.isBreakble(breakNode, config) &&
      !this.isSolid(headNode)
    ) {
      this.break = true;
      const digTime =
        this.getNodeDigTime(forwardNode) + this.getNodeDigTime(breakNode);
      neighbors.push(
        this.makeBreakable(
          targetNode,
          (this.COST_BREAK + this.COST_UP) * digTime
        )
      );
    }
  }

  addBreakNeighbors(neighbors) {
    let targetNode = this.down(1).forward(1);
    let forwardNode = this.up(1, targetNode);
    let headNode = this.up(2, targetNode);
    let breakNode = this.down(1).forward(1);

    if (
      this.isBreakble(targetNode, this.config) &&
      !this.isSolid(this.up(1, targetNode))
    ) {
      neighbors.push({
        parent: targetNode,
        blocks: [breakNode],
      });
    }

    if (
      this.isBreakble(forwardNode, this.config) &&
      this.isBreakble(targetNode, this.config) &&
      !this.isSolid(headNode)
    ) {
      neighbors.push({
        parent: targetNode,
        blocks: [forwardNode, breakNode],
      });
    }
  }
}

class MoveBreakDown extends Move {
  addNeighbors(neighbors, config, manager) {
    if (!config.breakBlocks) return;

    let downNode = this.down(1);
    let standingNode = this.up(1, downNode);

    this.config = config;
    this.manager = manager;

    if (manager.isNodeBroken(standingNode)) {
      return;
    }

    if (this.isBreakble(downNode, config)) {
      this.break = true;
      const digTime = this.getNodeDigTime(downNode);
      neighbors.push(
        this.makeBreakable(
          downNode,
          this.COST_BREAK + this.COST_NORMAL * digTime
        )
      );
    }
  }
  addBreakNeighbors(neighbors) {
    let downNode = this.down(1);

    const config = this.config;
    neighbors.push({
      parent: downNode,
      blocks: [downNode],
    });
  }
}

registerMoves([MoveBreakForward, MoveBreakForwardUp, MoveBreakForwardDown]);
