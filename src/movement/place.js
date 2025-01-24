const { Move, registerMoves } = require("./");

class MovePlaceForward extends Move {
  addNeighbors(neighbors, config) {
    if (!config.placeBlocks) return;
    let landingNode = this.forward(1);

    let placeNode = this.forward(1).down(1);

    if (this.isSolid(landingNode)) return;

    if (this.isAir(placeNode)) {
      this.placeHorizontal = true;
      landingNode.blocks.push(placeNode);
      neighbors.push(this.makeHorizontalPlace(landingNode, this.COST_PLACE));
    }
  }
}

registerMoves([MovePlaceForward]);
