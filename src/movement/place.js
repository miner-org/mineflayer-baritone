const { Move, registerMoves } = require("./");

class MovePlaceForward extends Move {
  addNeighbors(neighbors, config) {
    if (!config.placeBlocks) return [];
    let landingNode = this.forward(1);
    // the node to place the block on
    let ofNode = this.down(1);

    if (this.isSolid(landingNode)) return [];

    // we cant place on air thats just dumb :men:
    if (this.isAir(ofNode)) return [];

    this.placeHorizontal = true;
    neighbors.push(this.makeHorizontalPlace(landingNode, 3));
  }

  addPlaceNeighbors(neighbors) {
    let landingNode = this.forward(1);

    neighbors.push({
      parent: landingNode,
      blocks: [landingNode],
    });
  }
}

registerMoves([MovePlaceForward]);
