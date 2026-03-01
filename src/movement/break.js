const { Move, registerMoves, DirectionalVec3 } = require("./");

class MoveForwardDownBreak extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (!this.config.breakBlocks) return;

    for (const dir of cardinalDirections) {
      const originVec = new DirectionalVec3(origin.x, origin.y, origin.z, dir);
      const node = originVec.offset(dir.x, -1, dir.z);
      this.addNeighbors(neighbors, node, originVec);
    }
  }

  addNeighbors(neighbors, node, originVec) {
    const below = node.down(1);
    const head = node.up(1);
    const top = node.up(2);

    if (Math.floor(node.y) !== Math.floor(originVec.y) - 1) return;

    if (this.isStandable(node)) return;

    if (!this.isSolid(below)) return;

    const canBreak = this.config.breakBlocks;

    node.attributes = {
      name: this.name,
      break: [],
      down: true
    };

    const checkNodes = [node, head, top];

    if (canBreak) {
      for (const n of checkNodes) {
        if (!this.isAir(n)) {
          if (!this.isBreakable(n)) {
            if (this.config.debugMoves)
              console.debug(`[${this.name}] unbreakable: ${n.toString()}`);
            return;
          }
          node.attributes.break.push(n.clone());
        }
      }
    }

    // must actually have something to break
    if (node.attributes.break.length === 0) {
      if (this.config.debugMoves)
        console.debug(
          `[${this.name}] no blocks to break at ${node.toString()}`,
        );
      return;
    }

    // === Cost ===
    let cost = this.COST_BREAK * node.attributes.break.length + this.COST_FALL;

    node.attributes.cost = cost;
    node.attributes.fallDistance = 1;

    neighbors.push(this.makeMovement(node, cost));
  }
}

class MoveBreakDown extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (!this.config.breakBlocks) return;

    this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, {
      x: 0,
      z: 0,
    });

    const down = this.origin.offset(0, -1, 0);
    this.addNeighbors(neighbors, down);
  }

  /**
   * @param {DirectionalVec3[]} neighbors
   * @param {DirectionalVec3} node
   */
  addNeighbors(neighbors, node) {
    const footBlock = this.origin.down(1);

    if (!this.isSolid(footBlock)) return;
    if (!this.isWalkable(this.origin)) return;

    const target = node;

    if (!this.isBreakable(target, this.config)) return;

    let landing = target.down(1);

    let fallDistance = 0;

    if (!this.isSolid(landing)) {
      const maxFall = this.config.maxFallDist - 1 ?? 2;

      let below = landing;

      while (fallDistance < maxFall && this.isAir(below)) {
        fallDistance++;
        below = below.down(1);
      }

      if (!this.isSolid(below)) return;

      landing = below;
    }

    const moveNode = landing.up(1);

    moveNode.attributes = {
      name: this.name,
      break: [target.clone()],
      cost: this.COST_BREAK + (this.COST_FALL * fallDistance),
    };

    neighbors.push(this.makeMovement(moveNode, moveNode.attributes.cost));
  }
}

registerMoves([new MoveForwardDownBreak(30), new MoveBreakDown(30)]);
