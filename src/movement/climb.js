const { Move, registerMoves } = require("./");

class MoveClimbUp extends Move {
  addNeighbors(neighbors) {
    let upNode = this.up(1);

    if (this.isClimbable(upNode)) neighbors.push(upNode)
  }
}


// this will help climb up
class MoveClimbForward extends Move {
  addNeighbors(neighbors) {
    let forwardNode = this.forward(1);

    if (this.isClimbable(forwardNode)) neighbors.push(forwardNode)
  }
}


registerMoves([MoveClimbUp, MoveClimbForward]);
