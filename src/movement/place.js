const { Move, registerMoves, DirectionalVec3 } = require("./");
class MovePlaceUp extends Move {
  generate(cardinalDirections, origin, neighborArray) {
    if (!this.config.placeBlocks && !this.config.breakBlocks) return;

    const originVec = new DirectionalVec3(origin.x, origin.y, origin.z, {
      x: 0,
      z: 0,
    });
    const nodeAbove = originVec.up(1);

    this.addNeighbors(neighborArray, originVec, nodeAbove);
  }

  /**
   * @param {DirectionalVec3[]} neighbors
   * @param {DirectionalVec3} originVec
   * @param {DirectionalVec3} node
   */
  addNeighbors(neighbors, originVec, node) {
    // must have solid block below to stand on
    if (!this.isSolid(originVec.down(1))) return;

    const breakChain = [];

    // handle breaking if node is not air
    if (!this.isAir(node) && this.config.breakBlocks) {
      if (this.isBreakable(node, this.config)) breakChain.push(node.clone());
      const above = node.up(1);
      if (
        this.isBreakable(node, this.config) &&
        this.isBreakable(above, this.config)
      )
        breakChain.push(above.clone());

      if (breakChain.length === 0) return; // nothing breakable
    }

    // handle placing at originVec
    const canPlace =
      this.config.placeBlocks &&
      this.hasScaffoldingBlocks() &&
      this.canAffordPlacement(1);
    if (!canPlace) return;
    if (!this.canPlaceBlock(originVec)) return;
    if (!this.isWalkable(originVec) || !this.isWalkable(node)) return;

    const moveNode = node.clone();
    moveNode.attributes = {
      name: this.name,
      break: breakChain.length > 0 ? breakChain : undefined,
      place: [originVec.clone()],
      cost:
        (breakChain.length * this.COST_BREAK + this.COST_PLACE + this.COST_UP) * 0.8,
      ascend: true,
      originVec,
    };

    neighbors.push(this.makeMovement(moveNode, moveNode.attributes.cost));
  }

  canPlaceBlock(pos) {
    const offsets = [
      [0, -1, 0],
      [1, 0, 0],
      [-1, 0, 0],
      [0, 0, 1],
      [0, 0, -1],
    ];

    return offsets.some(([dx, dy, dz]) => this.isSolid(pos.offset(dx, dy, dz)));
  }
}

// registerMoves([MovePlaceUp]);
registerMoves([new MovePlaceUp(20)]);
