const { Move, registerMoves } = require("./");

class MoveInteractForward extends Move {
  addNeighbors(neighbors, config) {
    let node = this.forward(1);
    let nodeUp = this.forward(1).up(1);

    if (this.isInteractable(node, config) || this.isInteractable(nodeUp, config)) {
      if (this.isInteractable(node, config)) {
        neighbors.push(this.makeMovement(node, 1));
      }
      if (this.isInteractable(nodeUp, config)) {
        neighbors.push(this.makeMovement(nodeUp, 1));
      }
    }
  }
}


// registerMoves([MoveInteractForward]);
