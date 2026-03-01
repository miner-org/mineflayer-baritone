const { Move, registerMoves, DirectionalVec3 } = require("./");

class MoveCrawlStart extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (!this.config.experimentalMoves) return;

    for (const dir of cardinalDirections) {
      const originVec = new DirectionalVec3(origin.x, origin.y, origin.z, dir);
      const node = originVec.offset(dir.x, 0, dir.z);
      const nodeAbove = node.up(1); // for bottom trapdoors;

      if (this.isTopTrapdoor(node))
        this.addNeighbors(neighbors, node, nodeAbove);
      else if (this.isBottomTrapdoor(nodeAbove)) {
        this.addNeighbors(neighbors, node, nodeAbove);
      }
    }
  }

  /**
   *
   * @param {DirectionalVec3} node
   * @param {DirectionalVec3} nodeAbove
   * @param {DirectionalVec3[]} neighbors
   */
  addNeighbors(neighbors, node, nodeAbove) {
    let toInteract = null;

    if (this.isTopTrapdoor(node) && !this.isSolid(node.up(1))) {
      toInteract = node;
    } else if (this.isBottomTrapdoor(nodeAbove)) {
      toInteract = nodeAbove;
    }

    node.attributes = {
      name: this.name,
      cost: this.COST_NORMAL,
      isCrawling: true,
      interact: true,
      interactBlock: toInteract.clone(),
    };

    neighbors.push(this.makeMovement(node, this.COST_CRAWL));
  }
}

class MoveCrawlForward extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (!this.config.experimentalMoves) return;
    if (!this.node.attributes?.isCrawling) return;

    for (const dir of cardinalDirections) {
      const originVec = new DirectionalVec3(origin.x, origin.y, origin.z, dir);
      const node = originVec.offset(dir.x, 0, dir.z);

      const above = node.up(1);

      if (!this.isSolid(above)) continue;

      if (!this.isAir(node)) continue;

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
    node.attributes = {
      name: this.name,
      cost: this.COST_NORMAL,
      isCrawling: true,
    };

    neighbors.push(this.makeMovement(node, this.COST_CRAWL));
  }
}

registerMoves([new MoveCrawlStart(18), new MoveCrawlForward(18)]);
