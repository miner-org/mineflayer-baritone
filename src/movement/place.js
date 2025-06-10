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

//for 1x1 towering
class MovePlaceUp extends Move {
  addNeighbors(neighbors, config, manager, name) {
    if (!config.placeBlocks) return;

    if (!this.hasScaffoldingBlocks()) return;

    let target = this.up(1);
    let current = this.up(0);

    if (!this.isWalkable(target)) return;

    if (!this.isAir(current)) return;

    target.attributes["name"] = name;
    target.blocks.push(current);
    neighbors.push(this.makePlace(target, this.COST_PLACE));
  }
}
// registerMoves([MovePlaceUp]);
