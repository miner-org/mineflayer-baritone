const { Move, registerMoves } = require("./");

class MovePlaceForward extends Move {
  addNeighbors(neighbors, config) {
    if (!config.placeBlocks) return [];
    let landingNode = this.forward(1);
    let placeNode = this.down(1).forward(1);
    let ofNode = this.down(1);

    if (!this.isWalkable(landingNode)) return [];

    

    if (this.isNodeMarked(ofNode) && this.getNodeAttribute(ofNode) !== "place")
      return [];

    if (this.isAir(placeNode)) {
      this.placeHorizontal = true;
      neighbors.push(this.makeHorizontalPlace(landingNode, 5));
    }
  }

  addPlaceNeighbors(neighbors) {
    let landingNode = this.forward(1);
    let placeNode = this.down(1).forward(1);
    let ofNode = this.down(1);

    this.markNode(landingNode, "place");

    neighbors.push({
      parent: landingNode,
      blocks: [placeNode],
    });
  }
}

class MovePlaceUp extends Move {
  addNeighbors(neighbors, config) {
    if (!config.placeBlocks) return [];
    let landingNode = this.up(1);
    let placeNode = this.down(1)

    if (!this.isWalkable(landingNode)) return [];

    if (this.isNodeMarked(placeNode) && this.getNodeAttribute(placeNode) !== "place")
      return [];

    if (this.isSolid(placeNode)) {
      this.placeVertical = true;
      neighbors.push(this.makeVerticalPlace(landingNode, 5));
    }
  }

  addPlaceNeighbors(neighbors) {
    let landingNode = this.up(1);
    let placeNode = this.down(1)

    this.markNode(landingNode, "place");

    neighbors.push({
      parent: landingNode,
      blocks: [placeNode],
    });
  }
}

registerMoves([MovePlaceForward]);
