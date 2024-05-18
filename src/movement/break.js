const { Move, registerMoves } = require("./");

class MoveBreakForward extends Move {
  addNeighbors(neighbors, config, manager) {
    if (!config.breakBlocks) return;
    let forwardNode = this.forward(1);
    let standingNode = this.forward(1).down(1);
    this.config = config;
    this.manager = manager;

    // potential blocks we have to break
    let forwardUp = this.forward(1).up(1);

    // cuz its air by now
    if (manager.isNodeBroken(standingNode)) return;
    if (
      !manager.isNodeBroken(standingNode) &&
      this.isSolid(standingNode) &&
      this.isBreakble(forwardNode, config) &&
      this.isBreakble(forwardUp, config)
    ) {
      this.break = true;
      const digTime1 = this.getNodeDigTime(forwardUp);
      const digTime = this.getNodeDigTime(forwardNode) + digTime1;
      neighbors.push(
        this.makeBreakable(forwardNode, this.COST_BREAK * digTime)
      );
    }
  }

  addBreakNeighbors(neighbors) {
    let node = this.forward(1);
    let forwardUp = this.up(1).forward(1);

    // console.log("getting called")
    neighbors.push({ parent: node, blocks: [node, forwardUp] });
  }
}

class MoveBreakForwardUp extends Move {
  addNeighbors(neighbors, config, manager) {
    if (!config.breakBlocks) return;

    let standingNode = this.forward(1);
    let landingNode = this.forward(1).up(1);
    let node2 = this.forward(1).up(2);
    let upNode = this.up(2);

    this.config = config;
    this.manager = manager;
    if (manager.isNodeBroken(standingNode)) return;

    if (
      !manager.isNodeBroken(standingNode) &&
      this.isSolid(standingNode) &&
      this.isBreakble(upNode, config) &&
      this.isBreakble(landingNode, config) &&
      this.isBreakble(node2, config)
    ) {
      this.break = true;
      const digTime1 = this.getNodeDigTime(upNode);
      const digTime2 = this.getNodeDigTime(node2);
      const digTime = this.getNodeDigTime(landingNode) + digTime1 + digTime2;
      neighbors.push(
        this.makeBreakable(
          landingNode,
          this.COST_BREAK + this.COST_UP * digTime
        )
      );
    } else if (
      !manager.isNodeBroken(standingNode) &&
      this.isSolid(standingNode) &&
      this.isAir(upNode) &&
      this.isBreakble(landingNode, config) &&
      this.isBreakble(node2, config)
    ) {
      this.break = true;
      const digTime1 = this.getNodeDigTime(landingNode);
      const digTime = this.getNodeDigTime(node2) + digTime1;
      neighbors.push(
        this.makeBreakable(
          landingNode,
          this.COST_BREAK + this.COST_UP * digTime
        )
      );
    } else if (
      !manager.isNodeBroken(standingNode) &&
      this.isSolid(standingNode) &&
      this.isAir(upNode) &&
      this.isAir(node2) &&
      this.isBreakble(landingNode, config)
    ) {
      this.break = true;
      const digTime = this.getNodeDigTime(landingNode);
      neighbors.push(
        this.makeBreakable(
          landingNode,
          this.COST_BREAK + this.COST_UP * digTime
        )
      );
    }
  }

  addBreakNeighbors(neighbors) {
    let landingNode = this.forward(1).up(1);
    let upNode = this.up(2);
    let node2 = this.forward(1).up(2);
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
    } else if (
      this.isAir(upNode) &&
      this.isBreakble(landingNode, config) &&
      this.isBreakble(node2, config)
    ) {
      neighbors.push({
        parent: landingNode,
        blocks: [landingNode, node2],
      });
    } else if (
      this.isAir(upNode) &&
      this.isAir(node2, config) &&
      this.isBreakble(landingNode, config)
    ) {
      neighbors.push({
        parent: landingNode,
        blocks: [landingNode],
      });
    }
  }
}

class MoveBreakForwardDown extends Move {
  addNeighbors(neighbors, config, manager) {
    if (!config.breakBlocks) return;

    let downNode = this.down(1);

    this.config = config;
    this.manager = manager;

    if (manager.isNodeBroken(downNode)) return; // Check if the block is already broken

    if (this.isBreakble(downNode, config)) {
      this.break = true;

      // Mark the target block for breaking
      neighbors.push(
        this.makeBreakable(
          downNode,
          this.COST_BREAK + this.COST_NORMAL * this.getNodeDigTime(downNode)
        )
      );
    }
  }

  addBreakNeighbors(neighbors) {
    let landingNode = this.down(1).forward(1);
    let forwardNode = this.forward(1);
    let upNode = this.up(1).forward(1);

    const config = this.config;

    if (
      this.isBreakble(forwardNode, config) &&
      this.isBreakble(upNode, config) &&
      this.isBreakble(landingNode, config)
    ) {
      neighbors.push({
        parent: landingNode,
        blocks: [upNode, forwardNode, landingNode],
      });
    } else if (this.isBreakble(landingNode, config)) {
      neighbors.push({
        parent: landingNode,
        blocks: [landingNode],
      });
    } else if (
      this.isBreakble(landingNode, config) &&
      this.isBreakble(forwardNode, config)
    ) {
      neighbors.push({
        parent: landingNode,
        blocks: [forwardNode, landingNode],
      });
    }
  }
}

class MoveBreakDown extends Move {
  addNeighbors(neighbors, config, manager) {
    if (!config.breakBlocks) return;

    let downNode = this.down(1);
    let standingNode = this.down(1, downNode);

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

registerMoves([MoveBreakForward, MoveBreakForwardUp, MoveBreakDown]);
