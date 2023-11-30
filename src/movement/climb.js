const { Move, registerMoves } = require("./");

class MoveClimbUp extends Move {
  addNeighbors(neighbors) {
    let upNode = this.up(1);

    if (this.isClimbable(upNode))
      neighbors.push(this.makeMovement(upNode, this.COST_UP));
  }
}

// this will help climb up
class MoveClimbForward extends Move {
  addNeighbors(neighbors) {
    let forwardNode = this.forward(1);

    if (this.isClimbable(forwardNode))
      neighbors.push(this.makeMovement(forwardNode, this.COST_NORMAL));
  }
}

registerMoves([MoveClimbUp, MoveClimbForward]);
