const { Move, registerMoves, DirectionalVec3 } = require("./");
class MovePlaceUp extends Move {
  generate(cardinalDirections, origin, neighborArray) {
    if (!this.config.placeBlocks) return;

    const originVec = new DirectionalVec3(origin.x, origin.y, origin.z, {
      x: 0,
      z: 0,
    });

    this.addNeighbors(neighborArray, originVec, originVec.up(1));
  }

  /**
   *
   * @param {DirectionalVec3[]} neighbors
   * @param {DirectionalVec3} originVec
   * @param {DirectionalVec3} node
   */
  addNeighbors(neighbors, originVec, node) {
    if (!this.isAir(node)) return;

    if (!this.isSolid(originVec.down(1))) return;

    const canPlace = this.config.placeBlocks && this.hasScaffoldingBlocks();

    if (!canPlace) return;

    if (!this.canPlaceBlock(originVec)) return;
    this.log("can place at", node.toString());

    if (!this.isWalkable(originVec)) return;

    if (!this.isWalkable(node)) return;

    const cost = this.COST_PLACE + this.COST_UP;

    node.attributes["name"] = this.name;
    node.attributes["place"] = [];
    node.attributes["place"].push(originVec.clone());
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
