const { Move, registerMoves } = require("./");

class MovePlaceForward extends Move {
  addNeighbors(neighbors, config) {
    if (!config.placeBlocks) return [];
    let landingNode = this.forward(1);

    let placeNode = this.forward(1).down(1)

    // the node to place the block on
    let ofNode = this.down(1);

    if (this.isSolid(landingNode)) return [];


    if (this.isAir(placeNode)) {
      this.placeHorizontal = true;
      neighbors.push(this.makeHorizontalPlace(landingNode, 3));
    }
  }

  addPlaceNeighbors(neighbors) {
    let landingNode = this.forward(1);
    let placeNode = this.forward(1).down(1)

    neighbors.push({
      parent: landingNode,
      blocks: [placeNode],
    });
  }
}

registerMoves([MovePlaceForward]);
