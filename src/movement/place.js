const { Move, registerMoves, DirectionalVec3 } = require("./");
class MovePlaceUp extends Move {
  generate(cardinalDirections, origin, neighborArray) {
    if (!this.config.placeBlocks) return;

    this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, {
      x: 0,
      z: 0,
    });
    const up = this.origin.offset(0, 1, 0);
    this.addNeighbors(neighborArray, up);
  }

  /**
   *
   * @param {DirectionalVec3[]} neighbors
   * @param {DirectionalVec3} node
   */
  addNeighbors(neighbors, node) {
    if (!this.isAir(node)) return;

    node.attributes["name"] = this.name;
    node.attributes["place"] = [];
    const belowNode = node.down(1); // Standing support

    if (!this.isSolid(belowNode)) return;

    const canPlace = this.config.placeBlocks && this.hasScaffoldingBlocks();

    if (!canPlace) return;

    if (!this.canPlaceBlock(belowNode)) return;

    if (!this.isWalkable(node.up(1))) return;

    const cost = this.COST_PLACE + this.COST_UP;

    node.attributes["place"].push(node.clone());
    node.attributes["cost"] = cost;
    node.attributes["ascend"] = true;
    neighbors.push(this.makeMovement(node, cost));
  }

  canPlaceBlock(pos) {
    const offsets = [
      [0, -1, 0],
      [1, 0, 0],
      [-1, 0, 0],
      [0, 0, 1],
      [0, 0, -1],
    ];

    return offsets.some(([dx, dy, dz]) => {
      const neighbor = pos.offset(dx, dy, dz);
      return this.isSolid(neighbor);
    });
  }
}
// registerMoves([MovePlaceUp]);
registerMoves([new MovePlaceUp(20)]);
