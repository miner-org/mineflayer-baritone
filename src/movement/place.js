const { Move, registerMoves } = require("./");

class MovePlaceForward extends Move {
  addNeighbors(neighbors, config) {
    if (!config.placeBlocks) return;
    let landingNode = this.forward(1);

    let placeNode = this.forward(1).down(1);

    if (this.isSolid(landingNode)) return;

    if (this.isAir(placeNode) && this.isWalkable(landingNode)) {
      this.placeHorizontal = true;
      landingNode.blocks.push(placeNode);
      neighbors.push(this.makeHorizontalPlace(landingNode, this.COST_PLACE));
    }
  }
}

class MovePlaceForward1 extends Move {
  addNeighbors(neighbors, config) {
    if (!config.placeBlocks) return;

    if (!this.hasScaffoldingBlocks()) return;
    let target = this.forward(1).up(1);
    let place = this.forward(1);
    let up = this.up(1);

    if (!this.isWalkable(target)) return;

    if (!this.isWalkable(up)) return;

    if (this.isSolid(place)) return;

    target.blocks.push(place);
    target.attributes["name"] = this.name;
    neighbors.push(this.makePlace(target, this.COST_PLACE));
  }
}
registerMoves([]);
