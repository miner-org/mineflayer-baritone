const { Move, registerMoves } = require("./");

class MoveParkour1 extends Move {
  addNeighbors(neighbors, config, manager) {
    if (!config.parkour) return [];

    // only used if config.proParkour is false
    let jumpNode = this.up(2);

    let landingNode = this.forward(2);
    let spaceNode1 = this.forward(1);
    let spaceNode2 = this.forward(1).up(1);

    let airNode = this.forward(1).down(1);

    if (!this.isAir(airNode) || !this.isWater(airNode)) return [];

    let standingNode = this.forward(2).down(1);
    if (manager.isNodeBroken(standingNode)) return [];

    // if its false then we have to check if the node above the bot is air
    if (!config.proParkour) {
      if (
        this.isAir(jumpNode) &&
        this.isWalkable(spaceNode1) &&
        this.isWalkable(spaceNode2) &&
        this.isStandable(landingNode)
      ) {
        neighbors.push(this.makeMovement(landingNode, 2));
      }
    } else {
      if (
        this.isWalkable(spaceNode1) &&
        this.isWalkable(spaceNode2) &&
        this.isStandable(landingNode)
      ) {
        neighbors.push(this.makeMovement(landingNode, 2));
      }
    }
  }
}

class MoveForwardParkour2 extends Move {
  // 2 block jump
  addNeighbors(neighbors, config, manager) {
    if (!config.parkour) return [];

    let jumpNode = this.up(2);

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
      (!this.isAir(airNode) && !this.isAir(airNode2)) ||
      (!this.isWater(airNode) && !this.isWater(airNode))
    )
      return [];

    let standingNode = this.forward(3).down(1);
    if (manager.isNodeBroken(standingNode)) return [];

    if (!config.proParkour) {
      if (
        this.isAir(jumpNode) &&
        this.isJumpable(spaceNode1) &&
        this.isJumpable(spaceNode2) &&
        this.isWalkable(spaceNode3) &&
        this.isWalkable(spaceNode4) &&
        this.isStandable(landingNode)
      )
        neighbors.push(this.makeMovement(landingNode, 3));
    } else {
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
}

class MoveForwardParkour3 extends Move {
  addNeighbors(neighbors, config, manager) {
    if (!config.parkour) return [];

    let jumpNode = this.up(2);

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
      (!this.isAir(airNode1) &&
        !this.isAir(airNode2) &&
        !this.isAir(airNode3)) ||
      (!this.isWater(airNode1) &&
        !this.isWater(airNode2) &&
        !this.isWater(airNode3))
    )
      return [];

    let standingNode = this.forward(4).down(1);
    if (manager.isNodeBroken(standingNode)) return [];

    if (!config.proParkour) {
      if (
        this.isAir(jumpNode) &&
        this.isJumpable(spaceNode1) &&
        this.isJumpable(spaceNode2) &&
        this.isJumpable(spaceNode3) &&
        this.isWalkable(gapNode1) &&
        this.isWalkable(gapNode2) &&
        this.isWalkable(gapNode3) &&
        this.isStandable(landingNode)
      )
        neighbors.push(this.makeMovement(landingNode, 4));
    } else {
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
  addNeighbors(neighbors, config, manager) {
    if (!config.parkour) return [];

    let jumpNode = this.up(2);

    let landingNode = this.forward(2).up(1);
    let gapNode1 = this.forward(1);

    let shouldJump = this.isAir(this.down(1).forward(1));

    // if not air return
    if (!shouldJump) return [];

    let standingNode = this.forward(2);
    if (manager.isNodeBroken(standingNode)) return [];

    if (!config.proParkour) {
      if (
        this.isAir(jumpNode) &&
        this.isJumpable(gapNode1) &&
        this.isStandable(landingNode)
      ) {
        neighbors.push(this.makeMovement(landingNode, 2.5));
      }
    } else {
      if (this.isJumpable(gapNode1) && this.isStandable(landingNode)) {
        neighbors.push(this.makeMovement(landingNode, 2.5));
      }
    }
  }
}

class MoveForwardParkourUp2 extends Move {
  addNeighbors(neighbors, config, manager) {
    if (!config.parkour) return [];

    let jumpNode = this.up(2);

    let landingNode = this.forward(3).up(1);
    let gapNode1 = this.forward(1);
    let gapNode2 = this.forward(2);

    let shouldJump =
      this.isAir(this.down(1).forward(1)) &&
      this.isAir(this.down(1).forward(2));

    if (!shouldJump) return [];

    let standingNode = this.forward(3);
    if (manager.isNodeBroken(standingNode)) return [];

    if (!config.proParkour) {
      if (
        this.isAir(jumpNode) &&
        this.isJumpable(gapNode1) &&
        this.isJumpable(gapNode2) &&
        this.isStandable(landingNode)
      ) {
        neighbors.push(this.makeMovement(landingNode, 3.5));
      }
    } else {
      if (
        this.isJumpable(gapNode1) &&
        this.isJumpable(gapNode2) &&
        this.isStandable(landingNode)
      ) {
        neighbors.push(this.makeMovement(landingNode, 3.5));
      }
    }
  }
}

class MoveForwardParkourUp3 extends Move {
  addNeighbors(neighbors, config, manager) {
    if (!config.parkour) return [];

    let jumpNode = this.up(2);

    let landingNode = this.forward(4).up(1);
    let gapNode1 = this.forward(1);
    let gapNode2 = this.forward(2);
    let gapNode3 = this.forward(3);

    let shouldJump =
      this.isAir(this.down(1).forward(1)) &&
      this.isAir(this.down(1).forward(2)) &&
      this.isAir(this.down(1).forward(3));
    if (!shouldJump) return [];

    let standingNode = this.forward(4);
    if (manager.isNodeBroken(standingNode)) return [];
    if (!config.proParkour) {
      if (
        this.isAir(jumpNode) &&
        this.isJumpable(gapNode1) &&
        this.isJumpable(gapNode2) &&
        this.isJumpable(gapNode3) &&
        this.isStandable(landingNode)
      ) {
        neighbors.push(this.makeMovement(landingNode, 4.5));
      }
    } else {
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
}

class MoveForwardParkourDown1 extends Move {
  addNeighbors(neighbors, config, manager) {
    if (!config.parkour) return [];

    let jumpNode = this.up(2);

    let landingNode = this.forward(2).down(1);
    let gapNode1 = this.forward(1).down(1);
    let gapNode2 = this.forward(1);

    let spaceNode1 = this.forward(1).down(2);

    let shouldJump =
      this.isWalkable(gapNode1) &&
      this.isWalkable(gapNode2) &&
      this.isAir(spaceNode1);

    if (!shouldJump) return [];

    let standingNode = this.forward(2).down(2);
    if (manager.isNodeBroken(standingNode)) return [];

    if (!config.proParkour) {
      if (
        this.isAir(jumpNode) &&
        this.isStandable(landingNode) &&
        this.isWalkable(gapNode1) &&
        this.isWalkable(gapNode2)
      ) {
        neighbors.push(this.makeMovement(landingNode, 2.5));
      }
    } else {
      if (
        this.isStandable(landingNode) &&
        this.isWalkable(gapNode1) &&
        this.isWalkable(gapNode2)
      ) {
        neighbors.push(this.makeMovement(landingNode, 2.5));
      }
    }
  }
}

class MoveForwardParkourDown2 extends Move {
  addNeighbors(neighbors, config, manager) {
    if (!config.parkour) return [];

    let jumpNode = this.up(2);

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

    let standingNode = this.forward(3).down(2);
    if (manager.isNodeBroken(standingNode)) return [];

    if (!config.proParkour) {
      if (
        this.isAir(jumpNode) &&
        this.isStandable(landingNode) &&
        this.isWalkable(gapNode1) &&
        this.isWalkable(gapNode2) &&
        this.isWalkable(gapNode3)
      ) {
        neighbors.push(this.makeMovement(landingNode, 3.5));
      }
    } else {
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
}

class MoveForwardParkourDown3 extends Move {
  addNeighbors(neighbors, config, manager) {
    if (!config.parkour) return [];

    let jumpNode = this.up(2);

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

    let standingNode = this.forward(4).down(2);
    if (manager.isNodeBroken(standingNode)) return [];

    if (!config.proParkour) {
      if (
        this.isAir(jumpNode) &&
        this.isStandable(landingNode) &&
        this.isWalkable(gapNode1) &&
        this.isWalkable(gapNode2) &&
        this.isWalkable(gapNode3) &&
        this.isWalkable(gapNode4)
      ) {
        neighbors.push(this.makeMovement(landingNode, 4.5));
      }
    } else {
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
