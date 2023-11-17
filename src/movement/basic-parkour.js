const { Move, registerMoves } = require("./");

class MoveParkour1 extends Move {
  addNeighbors(neighbors, config) {
    if (!config.parkour) return [];

    let landingNode = this.forward(2);
    let spaceNode1 = this.forward(1);
    let spaceNode2 = this.forward(1).up(1);

    let airNode = this.forward(1).down(1);

    if (
      this.isNodeMarked(landingNode) &&
      this.getNodeAttribute(landingNode) === "broken" &&
      this.isNodeMarked(spaceNode1) &&
      this.getNodeAttribute(spaceNode1) === "broken" &&
      this.isNodeMarked(spaceNode2) &&
      this.getNodeAttribute(spaceNode2) === "broken"
    ) {
      return [];
    }

    if (!this.isAir(airNode)) return [];

    if (
      this.isWalkable(spaceNode1) &&
      this.isWalkable(spaceNode2) &&
      this.isStandable(landingNode)
    ) {
      neighbors.push(this.makeMovement(landingNode, 2));
    }
  }
}

class MoveForwardParkour2 extends Move {
  // 2 block jump
  addNeighbors(neighbors, config) {
    if (!config.parkour) return [];

    /**
     * X
     * -
     * -
     * x
     * (X target, - space node, x we are here)
     *
     */
    let landingNode = this.forward(3); // X

    let spaceNode1 = this.forward(1); // -
    let spaceNode2 = this.forward(2); // -
    let spaceNode3 = this.forward(1).up(1); // -
    let spaceNode4 = this.forward(2).up(1); // -

    let airNode = this.forward(1).down(1);
    let airNode2 = this.forward(2).down(1);

    if (
      this.isNodeMarked(landingNode) &&
      this.getNodeAttribute(landingNode) === "broken" &&
      this.isNodeMarked(spaceNode1) &&
      this.getNodeAttribute(spaceNode1) === "broken" &&
      this.isNodeMarked(spaceNode2) &&
      this.getNodeAttribute(spaceNode2) === "broken" &&
      this.isNodeMarked(spaceNode3) &&
      this.getNodeAttribute(spaceNode3) === "broken" &&
      this.isNodeMarked(spaceNode4) &&
      this.getNodeAttribute(spaceNode4) === "broken"
    ) {
      return [];
    }

    if (!this.isAir(airNode) && !this.isAir(airNode2)) return [];

    if (
      this.isJumpable(spaceNode1) &&
      this.isJumpable(spaceNode2) &&
      this.isWalkable(spaceNode3) &&
      this.isWalkable(spaceNode4) &&
      this.isStandable(landingNode)
    )
      neighbors.push(this.makeMovement(landingNode, 3));
  }
}

class MoveForwardParkour3 extends Move {
  addNeighbors(neighbors, config) {
    if (!config.parkour) return [];

    // 3 block distance from current node
    let landingNode = this.forward(4);
    let spaceNode1 = this.forward(1);
    let spaceNode2 = this.forward(2);
    let spaceNode3 = this.forward(3);

    // gaps above
    let gapNode1 = this.up(1, spaceNode1);
    let gapNode2 = this.up(1, spaceNode2);
    let gapNode3 = this.up(1, spaceNode3);

    // air nodes to prevent it from randomly sprint jumping
    let airNode1 = this.down(1, spaceNode1);
    let airNode2 = this.down(1, spaceNode2);
    let airNode3 = this.down(1, spaceNode3);

    if (
      this.isNodeMarked(landingNode) &&
      this.getNodeAttribute(landingNode) === "broken" &&
      this.isNodeMarked(spaceNode1) &&
      this.getNodeAttribute(spaceNode1) === "broken" &&
      this.isNodeMarked(spaceNode2) &&
      this.getNodeAttribute(spaceNode2) === "broken" &&
      this.isNodeMarked(spaceNode3) &&
      this.getNodeAttribute(spaceNode3) === "broken"
    ) {
      return [];
    }

    if (
      this.isNodeMarked(landingNode) &&
      this.getNodeAttribute(landingNode) === "broken"
    ) {
      return [];
    }

    if (!this.isAir(airNode1) && !this.isAir(airNode2) && !this.isAir(airNode3))
      return [];

    if (
      this.isJumpable(spaceNode1) &&
      this.isJumpable(spaceNode2) &&
      this.isJumpable(spaceNode3) &&
      this.isWalkable(gapNode1) &&
      this.isWalkable(gapNode2) &&
      this.isWalkable(gapNode3) &&
      this.isStandable(landingNode)
    )
      neighbors.push(this.makeMovement(landingNode, 4));
  }
}

class MoveForwardParkourUp1 extends Move {
  addNeighbors(neighbors, config) {
    if (!config.parkour) return [];

    let landingNode = this.forward(2).up(1);
    let gapNode1 = this.forward(1);

    let shouldJump = this.isAir(this.down(1).forward(1));

    if (
      this.isNodeMarked(landingNode) &&
      this.getNodeAttribute(landingNode) === "broken" &&
      this.isNodeMarked(gapNode1) &&
      this.getNodeAttribute(gapNode1) === "broken"
    ) {
      return [];
    }

    // if not air return
    if (!shouldJump) return [];

    if (this.isJumpable(gapNode1) && this.isStandable(landingNode)) {
      neighbors.push(this.makeMovement(landingNode, 2.5));
    }
  }
}

class MoveForwardParkourUp2 extends Move {
  addNeighbors(neighbors, config) {
    if (!config.parkour) return [];

    let landingNode = this.forward(3).up(1);
    let gapNode1 = this.forward(1);
    let gapNode2 = this.forward(2);

    if (
      this.isNodeMarked(landingNode) &&
      this.getNodeAttribute(landingNode) === "broken" &&
      this.isNodeMarked(gapNode1) &&
      this.getNodeAttribute(gapNode1) === "broken" &&
      this.isNodeMarked(gapNode2) &&
      this.getNodeAttribute(gapNode2) === "broken"
    ) {
      return [];
    }

    let shouldJump =
      this.isAir(this.down(1).forward(1)) &&
      this.isAir(this.down(1).forward(2));

    if (!shouldJump) return [];

    if (
      this.isNodeMarked(landingNode) &&
      this.getNodeAttribute(landingNode) === "broken"
    ) {
      return [];
    }

    if (
      this.isJumpable(gapNode1) &&
      this.isJumpable(gapNode2) &&
      this.isStandable(landingNode)
    ) {
      neighbors.push(this.makeMovement(landingNode, 3.5));
    }
  }
}

class MoveForwardParkourUp3 extends Move {
  addNeighbors(neighbors, config) {
    if (!config.parkour) return [];

    let landingNode = this.forward(4).up(1);
    let gapNode1 = this.forward(1);
    let gapNode2 = this.forward(2);
    let gapNode3 = this.forward(3);

    if (
      this.isNodeMarked(landingNode) &&
      this.getNodeAttribute(landingNode) === "broken" &&
      this.isNodeMarked(gapNode1) &&
      this.getNodeAttribute(gapNode1) === "broken" &&
      this.isNodeMarked(gapNode2) &&
      this.getNodeAttribute(gapNode2) === "broken" &&
      this.isNodeMarked(gapNode3) &&
      this.getNodeAttribute(gapNode3) === "broken"
    ) {
      return [];
    }

    let shouldJump =
      this.isAir(this.down(1).forward(1)) &&
      this.isAir(this.down(1).forward(2)) &&
      this.isAir(this.down(1).forward(3));
    if (!shouldJump) return [];

    if (
      this.isNodeMarked(landingNode) &&
      this.getNodeAttribute(landingNode) === "broken"
    ) {
      return [];
    }

    if (
      this.isJumpable(gapNode1) &&
      this.isJumpable(gapNode2) &&
      this.isJumpable(gapNode3) &&
      this.isStandable(landingNode)
    ) {
      neighbors.push(this.makeMovement(landingNode, 4.5));
    }
  }
}

class MoveForwardParkourDown1 extends Move {
  addNeighbors(neighbors, config) {
    if (!config.parkour) return [];

    let landingNode = this.forward(2).down(1);
    let gapNode1 = this.forward(1).down(1);
    let gapNode2 = this.forward(1);

    let spaceNode1 = this.forward(1).down(2);

    let shouldJump =
      this.isWalkable(gapNode1) &&
      this.isWalkable(gapNode2) &&
      this.isAir(spaceNode1);

    if (!shouldJump) return [];

    if (
      this.isStandable(landingNode) &&
      this.isWalkable(gapNode1) &&
      this.isWalkable(gapNode2)
    ) {
      neighbors.push(this.makeMovement(landingNode, 2.5));
    }
  }
}

class MoveForwardParkourDown2 extends Move {
  addNeighbors(neighbors, config) {
    if (!config.parkour) return [];

    let landingNode = this.forward(3).down(1);
    let gapNode1 = this.forward(1).down(1);
    let gapNode2 = this.forward(1);
    let gapNode3 = this.down(1).forward(2);

    let spaceNode1 = this.down(2).forward(1);
    let spaceNode2 = this.down(2).forward(2);

    let shouldJump =
      this.isWalkable(gapNode1) &&
      this.isWalkable(gapNode2) &&
      this.isWalkable(gapNode3) &&
      this.isAir(spaceNode1) &&
      this.isAir(spaceNode2);

    if (!shouldJump) return [];

    if (
      this.isNodeMarked(landingNode) &&
      this.getNodeAttribute(landingNode) === "broken"
    ) {
      return [];
    }

    if (
      this.isStandable(landingNode) &&
      this.isWalkable(gapNode1) &&
      this.isWalkable(gapNode2) &&
      this.isWalkable(gapNode3)
    ) {
      neighbors.push(this.makeMovement(landingNode, 3.5));
    }
  }
}

class MoveForwardParkourDown3 extends Move {
  addNeighbors(neighbors, config) {
    if (!config.parkour) return [];

    let landingNode = this.down(1).forward(4);
    let gapNode1 = this.down(1).forward(1);
    let gapNode2 = this.forward(1);
    let gapNode3 = this.down(1).forward(2);
    let gapNode4 = this.down(1).forward(3);

    let spaceNode1 = this.down(2).forward(1);
    let spaceNode2 = this.down(2).forward(2);
    let spaceNode3 = this.down(2).forward(3);

    let shouldJump =
      this.isWalkable(gapNode1) &&
      this.isWalkable(gapNode2) &&
      this.isWalkable(gapNode3) &&
      this.isWalkable(gapNode4) &&
      this.isAir(spaceNode1) &&
      this.isAir(spaceNode2) &&
      this.isAir(spaceNode3);
    if (!shouldJump) return [];

    if (
      this.isNodeMarked(landingNode) &&
      this.getNodeAttribute(landingNode) === "broken"
    ) {
      return [];
    }

    if (
      this.isStandable(landingNode) &&
      this.isWalkable(gapNode1) &&
      this.isWalkable(gapNode2) &&
      this.isWalkable(gapNode3) &&
      this.isWalkable(gapNode4)
    ) {
      neighbors.push(this.makeMovement(landingNode, 4.5));
    }
  }
}

registerMoves([
  // parkour
  MoveParkour1,
  MoveForwardParkour2,
  MoveForwardParkour3,

  // up parkour
  MoveForwardParkourUp1,
  MoveForwardParkourUp2,
  MoveForwardParkourUp3,

  // down parkour
  MoveForwardParkourDown1,
  MoveForwardParkourDown2,
  MoveForwardParkourDown3,
]);
