const { Move, registerMoves, DirectionalVec3 } = require("./");

class MoveCrawlStart extends Move {
  generate(cardinalDirections, origin, neighbors) {
    for (const dir of cardinalDirections) {
      const originVec = new DirectionalVec3(origin.x, origin.y, origin.z, dir);
      const node = originVec.offset(dir.x, 0, dir.z);

      // this.log(this.getBlock(node));

      if (!this.isTopTrapdoor(node)) continue;

      this.addNeighbors(neighbors, node, originVec);
    }
  }

  /**
   *
   * @param {DirectionalVec3} node
   * @param {DirectionalVec3} originVec
   * @param {DirectionalVec3[]} neighbors
   */
  addNeighbors(neighbors, node, originVec) {
    const above = node.up(1);

    if (this.isSolid(above)) return;

    node.attributes = {
      name: this.name,
      cost: this.COST_NORMAL,
      interact: true,
      interactBlock: node.clone(),
    };

    neighbors.push(this.makeMovement(node, this.COST_NORMAL));
  }
}

class MoveCrawlForward extends Move {
  generate(cardinalDirections, origin, neighbors) {
    for (const dir of cardinalDirections) {
      const originVec = new DirectionalVec3(origin.x, origin.y, origin.z, dir);
      const node = originVec.offset(dir.x, 0, dir.z);

      const above = node.up(1);

      if (!this.isSolid(above)) continue;

      this.addNeighbors(neighbors, node, originVec);
    }
  }

  /**
   *
   * @param {DirectionalVec3} node
   * @param {DirectionalVec3} originVec
   * @param {DirectionalVec3[]} neighbors
   */
  addNeighbors(neighbors, node, originVec) {
    const above = node.up(1);

    node.attributes = {
      name: this.name,
      cost: this.COST_NORMAL,
    };

    neighbors.push(this.makeMovement(node, this.COST_NORMAL));
  }
}


//not gonna use these cuz mineflayer is fucking butt cheecks
// registerMoves([new MoveCrawlStart(18), new MoveCrawlForward(18)]);
