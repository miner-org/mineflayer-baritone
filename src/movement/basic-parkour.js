const { Move, registerMoves } = require("./");

class MoveParkour1 extends Move {
  addNeighbors(neighbors, config, manager) {
    if (!config.parkour) return;

    // only used if config.proParkour is false
    let jumpNode = this.up(2);

    let landingNode = this.forward(2);
    let spaceNode1 = this.forward(1);
    let spaceNode2 = this.forward(1).up(1);

    let airNode = this.down(1, spaceNode1);

    let shouldJump = this.isAir(airNode) || this.isWater(airNode);

    if (!shouldJump) return;

    let standingNode = this.down(1, landingNode);
    if (manager.isNodeBroken(standingNode)) return;

    if (
      this.isWalkable(spaceNode1) &&
      this.isWalkable(spaceNode2) &&
      this.isStandable(landingNode)
    ) {
      neighbors.push(this.makeMovement(landingNode, this.COST_PARKOUR));
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
    let spaceNode2 = this.forward(1, spaceNode1); // -
    let spaceNode3 = this.forward(1).up(1); // -
    let spaceNode4 = this.forward(2).up(1); // -

    let airNode = this.forward(1).down(1);
    let airNode2 = this.forward(1, airNode);

    let shouldJump =
      (this.isAir(airNode) || this.isWater(airNode)) &&
      (this.isAir(airNode2) || this.isWater(airNode2));

    if (!shouldJump) return;

    let standingNode = this.forward(3).down(1);
    if (manager.isNodeBroken(standingNode)) return;

    if (
      this.isJumpable(spaceNode1) &&
      this.isJumpable(spaceNode2) &&
      this.isWalkable(spaceNode3) &&
      this.isWalkable(spaceNode4) &&
      this.isStandable(landingNode)
    )
      neighbors.push(this.makeMovement(landingNode, this.COST_PARKOUR));
  }
}

class MoveForwardParkour3 extends Move {
  addNeighbors(neighbors, config, manager) {
    if (!config.parkour) return;

    let jumpNode = this.up(2);

    // 3 block distance from current node
    let landingNode = this.forward(4);
    let spaceNode1 = this.forward(1);
    let spaceNode2 = this.forward(1, spaceNode1);
    let spaceNode3 = this.forward(1, spaceNode2);

    // gaps above
    let gapNode1 = this.up(1, spaceNode1);
    let gapNode2 = this.up(1, spaceNode2);
    let gapNode3 = this.up(1, spaceNode3);

    // air nodes to prevent it from randomly sprint jumping
    let airNode1 = this.down(1, spaceNode1);
    let airNode2 = this.down(1, spaceNode2);
    let airNode3 = this.down(1, spaceNode3);

    let shouldJump =
      (this.isAir(airNode1) || this.isWater(airNode1)) &&
      (this.isAir(airNode2) || this.isWater(airNode2)) &&
      (this.isAir(airNode3) || this.isWater(airNode3));

    if (!shouldJump) return;

    let standingNode = this.forward(4).down(1);
    if (manager.isNodeBroken(standingNode)) return;

    if (
      this.isJumpable(spaceNode1) &&
      this.isJumpable(spaceNode2) &&
      this.isJumpable(spaceNode3) &&
      this.isWalkable(gapNode1) &&
      this.isWalkable(gapNode2) &&
      this.isWalkable(gapNode3) &&
      this.isStandable(landingNode)
    )
      neighbors.push(this.makeMovement(landingNode, this.COST_PARKOUR));
  }
}

class MoveForwardParkourUp1 extends Move {
  addNeighbors(neighbors, config, manager) {
    if (!config.parkour) return;

    let jumpNode = this.up(2);

    let landingNode = this.forward(2).up(1);
    let gapNode1 = this.forward(1);

    let shouldJump =
      this.isAir(this.down(1).forward(1)) ||
      this.isWater(this.down(1).forward(1));
    let shouldJump2 = this.isWalkable(this.up(1, gapNode1));

    // if not air return
    if (!shouldJump) return;
    if (!shouldJump2) return;

    let standingNode = this.down(1, landingNode);
    if (manager.isNodeBroken(standingNode)) return;

    if (this.isWalkable(gapNode1) && this.isStandable(landingNode)) {
      neighbors.push(this.makeMovement(landingNode, this.COST_PARKOUR));
    }
  }
}

class MoveForwardParkourUp2 extends Move {
  addNeighbors(neighbors, config, manager) {
    if (!config.parkour) return;

    let jumpNode = this.up(2);

    let landingNode = this.forward(3).up(1);
    let gapNode1 = this.forward(1);
    let gapNode2 = this.forward(2);

    let shouldJump =
      (this.isAir(this.down(1).forward(1)) ||
        this.isWater(this.down(1).forward(1))) &&
      (this.isAir(this.down(1).forward(2)) ||
        this.isWater(this.down(1).forward(2)));

    let shouldJump2 =
      this.isWalkable(this.up(1, gapNode1)) &&
      this.isWalkable(this.up(1, gapNode2));

    if (!shouldJump) return;

    if (!shouldJump2) return;

    let standingNode = this.forward(3);
    if (manager.isNodeBroken(standingNode)) return;

    if (
      this.isWalkable(gapNode1) &&
      this.isWalkable(gapNode2) &&
      this.isStandable(landingNode)
    ) {
      neighbors.push(this.makeMovement(landingNode, this.COST_PARKOUR));
    }
  }
}

class MoveForwardParkourUp3 extends Move {
  addNeighbors(neighbors, config, manager) {
    if (!config.parkour) return;

    let jumpNode = this.up(2);

    let landingNode = this.forward(4).up(1);
    let gapNode1 = this.forward(1);
    let gapNode2 = this.forward(2);
    let gapNode3 = this.forward(3);

    let shouldJump =
      (this.isAir(this.down(1).forward(1)) ||
        this.isWater(this.down(1).forward(1))) &&
      (this.isAir(this.down(1).forward(2)) ||
        this.isWater(this.down(1).forward(2))) &&
      (this.isAir(this.down(1).forward(3)) ||
        this.isWater(this.down(1).forward(3)));

    let shouldJump2 =
      this.isWalkable(this.up(1, gapNode1)) &&
      this.isWalkable(this.up(1, gapNode2)) &&
      this.isWalkable(this.up(1, gapNode3));

    if (!shouldJump) return;
    if (!shouldJump2) return;

    let standingNode = this.forward(4);
    if (manager.isNodeBroken(standingNode)) return;

    if (
      this.isWalkable(gapNode1) &&
      this.isWalkable(gapNode2) &&
      this.isWalkable(gapNode3) &&
      this.isStandable(landingNode)
    ) {
      neighbors.push(this.makeMovement(landingNode, this.COST_PARKOUR));
    }
  }
}

class MoveForwardParkourDown1 extends Move {
  addNeighbors(neighbors, config, manager) {
    if (!config.parkour) return;

    let jumpNode = this.up(2);

    let landingNode = this.forward(2).down(1);
    let gapNode1 = this.forward(1).down(1);
    let gapNode2 = this.forward(1);

    let spaceNode1 = this.forward(1).down(2);

    let shouldJump =
      this.isWalkable(gapNode1) &&
      this.isWalkable(gapNode2) &&
      (this.isAir(spaceNode1) || this.isWater(spaceNode1));

    if (!shouldJump) return;

    let standingNode = this.forward(2).down(2);
    if (manager.isNodeBroken(standingNode)) return;

    if (
      this.isStandable(landingNode) &&
      this.isWalkable(gapNode1) &&
      this.isWalkable(gapNode2)
    ) {
      neighbors.push(this.makeMovement(landingNode, this.COST_PARKOUR));
    }
  }
}

class MoveForwardParkourDown2 extends Move {
  addNeighbors(neighbors, config, manager) {
    if (!config.parkour) return;

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
      (this.isAir(spaceNode1) || this.isWater(spaceNode1)) &&
      (this.isAir(spaceNode2) || this.isWater(spaceNode2));

    if (!shouldJump) return;

    let standingNode = this.forward(3).down(2);
    if (manager.isNodeBroken(standingNode)) return;

    if (
      this.isStandable(landingNode) &&
      this.isWalkable(gapNode1) &&
      this.isWalkable(gapNode2) &&
      this.isWalkable(gapNode3)
    ) {
      neighbors.push(this.makeMovement(landingNode, this.COST_PARKOUR));
    }
  }
}

class MoveForwardParkourDown3 extends Move {
  addNeighbors(neighbors, config, manager) {
    if (!config.parkour) return;

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
      (this.isAir(spaceNode1) || this.isWater(spaceNode1)) &&
      (this.isAir(spaceNode2) || this.isWater(spaceNode2)) &&
      (this.isAir(spaceNode3) || this.isWater(spaceNode3));
    if (!shouldJump) return;

    let standingNode = this.forward(4).down(2);
    if (manager.isNodeBroken(standingNode)) return;

    if (
      this.isStandable(landingNode) &&
      this.isWalkable(gapNode1) &&
      this.isWalkable(gapNode2) &&
      this.isWalkable(gapNode3) &&
      this.isWalkable(gapNode4)
    ) {
      neighbors.push(this.makeMovement(landingNode, this.COST_PARKOUR));
    }
  }
}

class MoveForwardParkourDownExt extends Move {
  addNeighbors(neighbors, config, manager) {
    if (!config.parkour) return;

    let jumpNode = this.up(2);

    let walkableNode = this.forward(2).down(1);
    let landingNode = walkableNode;
    let gapNode1 = this.forward(1).down(1);
    let gapNode2 = this.forward(1);

    let spaceNode1 = this.forward(1).down(2);

    let shouldJump =
      this.isWalkable(gapNode1) &&
      this.isWalkable(gapNode2) &&
      (this.isAir(spaceNode1) || this.isWater(spaceNode1));

    if (!shouldJump) return;

    let standingNode = this.forward(2).down(2);
    if (manager.isNodeBroken(standingNode)) return;

    let isSafe = false;
    let cost = 0;
    for (let i = 0; i < config.maxFallDist; i++) {
      landingNode = walkableNode.down(1);
      cost += 1;

      if (this.isStandable(landingNode)) {
        isSafe = true;
        break;
      }
    }

    if (
      this.isStandable(landingNode) &&
      this.isWalkable(gapNode1) &&
      this.isWalkable(gapNode2) &&
      isSafe
    ) {
      neighbors.push(this.makeMovement(landingNode, this.COST_PARKOUR * cost));
    }
  }
}

class MoveDiagonalParkour extends Move {
  addNeighbors(neighbors, config, manager) {
    /**
     *
     * - - x
     * -
     * x
     *
     * x = solid
     * - = air
     */

    if (!config.parkour) return;
    let landingNode = this.right(2).forward(2);
    let standingNode = this.down(1, landingNode);

    if (manager.isNodeBroken(standingNode)) return;

    let shouldJump1 =
      this.isAir(this.forward(1).down(1)) &&
      this.isAir(this.forward(1).down(1).right(1));

    if (!shouldJump1) return;
    let shouldJump2 =
      this.isAir(this.forward(2).down(1)) &&
      this.isAir(this.forward(2).down(1).right(1));
    if (!shouldJump2) return;

    let shouldJump3 =
      this.isWalkable(this.up(1)) && this.isWalkable(this.forward(1).up(1));

    if (!shouldJump3) return;

    let shouldJump4 =
      this.isWalkable(this.forward(1).right(1)) &&
      this.isWalkable(this.forward(1).right(2));

    if (!shouldJump4) return;

    let shouldJump5 = this.isWalkable(this.forward(1).up(1));

    if (!shouldJump5) return;

    if (this.isStandable(landingNode)) {
      neighbors.push(
        this.makeMovement(landingNode, this.COST_PARKOUR * this.COST_DIAGONAL)
      );
    }
  }
}

class MoveDiagonalUpParkour extends Move {
  addNeighbors(neighbors, config, manager) {
    if (!config.parkour) return;
    let landingNode = this.right(2).forward(2).up(1);

    let standingNode = this.down(1, landingNode);
    if (manager.isNodeBroken(standingNode)) return;

    if (!this.isStandable(standingNode)) return;

    let spaceNode1 = this.right(1).forward(1).up(1);

    let isRightWalkable1 = this.isWalkable(this.right(1).up(1));
    let isForwardWalkable1 = this.isWalkable(this.forward(1).up(1));
    let isRightWalkable2 = this.isWalkable(this.right(2).forward(1).up(2));
    let isForwardWalkable2 = this.isWalkable(this.right(1).forward(2).up(2));

    let airNode = this.forward(1).down(1).right(1);

    if (!(this.isAir(airNode) || this.isWater(airNode))) return;

    if (
      this.isWalkable(spaceNode1) &&
      (isRightWalkable1 || isForwardWalkable1) &&
      (isRightWalkable2 || isForwardWalkable2) &&
      this.isStandable(landingNode)
    ) {
      neighbors.push(
        this.makeMovement(landingNode, this.COST_PARKOUR * this.COST_DIAGONAL)
      );
    }
  }
}

class MoveDiagonalDownParkour extends Move {
  addNeighbors(neighbors, config, manager) {
    if (!config.parkour) return;
    let landingNode = this.right(2).forward(2).down(1);

    let standingNode = this.down(1, landingNode);
    if (manager.isNodeBroken(standingNode)) return;

    let spaceNode1 = this.right(1).forward(1).down(1);

    let isRightWalkable1 = this.isWalkable(this.right(1).up(1));
    let isForwardWalkable1 = this.isWalkable(this.forward(1).up(1));
    let isRightWalkable2 = this.isJumpable(this.right(2).forward(1).down(1));
    let isForwardWalkable2 = this.isJumpable(this.right(1).forward(2).down(1));

    if (
      this.isWalkable(spaceNode1) &&
      ((isRightWalkable1 && isRightWalkable2) ||
        (isForwardWalkable1 && isForwardWalkable2)) &&
      this.isStandable(landingNode)
    ) {
      neighbors.push(
        this.makeMovement(landingNode, this.COST_PARKOUR * this.COST_DIAGONAL)
      );
    }
  }
}

class MoveSemiDiagonalParkour extends Move {
  /*
	-X
	--
	X-
	(X is a solid block, - is air)
	*/
  addNeighbors(neighbors, config, manager) {
    if (!config.parkour) return;
    let landingNode = this.right(1).forward(2);
    let standingNode = this.down(1, landingNode);
    if (manager.isNodeBroken(standingNode)) return;

    let isRightWalkable1 = this.isWalkable(this.forward(1).right(1));
    let isForwardWalkable1 = this.isWalkable(this.forward(1));
    let shouldJump =
      this.isAir(this.forward(1).right(1).down(1)) ||
      this.isWater(this.forward(1).right(1).down(1));
    let shouldJump2 =
      this.isAir(this.forward(1).down(1)) ||
      this.isWater(this.forward(1).down(1));

    if (!isRightWalkable1 && !isForwardWalkable1) return;

    if (!shouldJump && !shouldJump2) return;

    if (this.isStandable(landingNode)) {
      neighbors.push(this.makeMovement(landingNode, this.COST_PARKOUR));
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

  // diagonal parkour
  MoveDiagonalParkour,
  MoveDiagonalUpParkour,
  MoveDiagonalDownParkour,
  MoveSemiDiagonalParkour,

  //idk
  MoveForwardParkourDownExt,
]);
