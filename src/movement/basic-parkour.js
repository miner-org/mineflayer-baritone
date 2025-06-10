const { Move, registerMoves, DirectionalVec3 } = require("./");

class MoveParkour1 extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (!this.config.parkour) return;

    for (const dir of cardinalDirections) {
      this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, dir);

      const landingNode = this.origin.forward(2);
      this.addNeighbors(neighbors, landingNode);
    }
  }

  addNeighbors(neighbors, landingNode) {
    const name = this.name;
    const config = this.config;
    const manager = this.manager;

    const spaceNode1 = this.origin.forward(1);
    const spaceNode2 = spaceNode1.up(1);
    const airNodeBelow = spaceNode1.down(1);
    const standingNode = landingNode.down(1);

    const shouldJump = this.isAir(airNodeBelow) || this.isWater(airNodeBelow);
    if (!shouldJump) return;

    if (manager.isNodeBroken(standingNode)) return;

    if (
      this.isWalkable(spaceNode1) &&
      this.isWalkable(spaceNode2) &&
      this.isStandable(landingNode)
    ) {
      landingNode.attributes["name"] = name;
      neighbors.push(this.makeMovement(landingNode, this.COST_PARKOUR));
    }
  }
}

class MoveDiagonalParkour1 extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (!this.config.parkour) return;

    // Diagonal directions
    const diagonalDirections = [
      { x: 1, z: 1 },
      { x: -1, z: 1 },
      { x: 1, z: -1 },
      { x: -1, z: -1 },
    ];

    for (const dir of diagonalDirections) {
      this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, dir);

      const landingNode = this.origin.offset(dir.x * 2, 0, dir.z * 2);
      this.addNeighbors(neighbors, landingNode, dir);
    }
  }

  addNeighbors(neighbors, landingNode, dir) {
    const name = this.name;
    const config = this.config;
    const manager = this.manager;

    const spaceNode1 = this.origin.offset(dir.x, 0, dir.z);
    const spaceNode2 = spaceNode1.up(1);
    const airNodeBelow = spaceNode1.down(1);
    const standingNode = landingNode.down(1);

    const shouldJump = this.isAir(airNodeBelow) || this.isWater(airNodeBelow);
    if (!shouldJump) return;

    if (manager.isNodeBroken(standingNode)) return;

    if (
      this.isWalkable(spaceNode1) &&
      this.isWalkable(spaceNode2) &&
      this.isStandable(landingNode)
    ) {
      landingNode.attributes["name"] = name;
      neighbors.push(this.makeMovement(landingNode, this.COST_PARKOUR));
    }
  }
}

class MoveForwardParkour extends Move {
  generate(cardinalDirections, origin, neighbors) {
    const maxDistance = this.config.proParkour ? 4 : 3;
    if (!this.config.parkour) return;

    for (const dir of cardinalDirections) {
      for (let dist = 2; dist <= maxDistance; dist++) {
        this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, dir);
        const landingNode = this.origin.forward(dist + 1);
        this.addNeighbors(neighbors, landingNode, dist);
      }
    }
  }

  /**
   * @param {DirectionalVec3[]} neighbors
   * @param {DirectionalVec3} landingNode
   * @param {number} dist
   */
  addNeighbors(neighbors, landingNode, dist) {
    const config = this.config;
    const manager = this.manager;
    const name = this.name;

    const standingNode = landingNode.down(1);
    if (manager.isNodeBroken(standingNode)) return;

    const spaceNodes = [];
    const gapNodes = [];
    const airNodes = [];

    let last = this.origin;
    for (let i = 1; i <= dist; i++) {
      const forward = last.forward(1);
      spaceNodes.push(forward);
      gapNodes.push(forward.up(1));
      airNodes.push(forward.down(1));
      last = forward;
    }

    const shouldJump = airNodes.every(
      (node) => this.isAir(node) || this.isWater(node)
    );
    if (!shouldJump) return;

    const allJumpable = spaceNodes.every((node) => this.isJumpable(node));
    const allWalkable = gapNodes.every((node) => this.isWalkable(node));

    if (allJumpable && allWalkable && this.isStandable(landingNode)) {
      landingNode.attributes["name"] = name;
      neighbors.push(this.makeMovement(landingNode, this.COST_PARKOUR));
    }
  }
}

class MoveForwardParkourUp extends Move {
  generate(cardinalDirections, origin, neighbors) {
    if (!this.config.parkour) return;

    for (const dir of cardinalDirections) {
      this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, dir);

      for (let distance = 2; distance <= 3; distance++) {
        const landingNode = this.forward(distance).up(1);
        this.addNeighbors(neighbors, distance, landingNode);
      }
    }
  }

  addNeighbors(neighbors, distance, landingNode) {
    const config = this.config;
    const manager = this.manager;
    const name = this.name;

    const standingNode = this.down(1, landingNode);

    let shouldJump = true;
    let shouldJump2 = true;

    for (let i = 1; i < distance; i++) {
      const forward = this.forward(i);
      const gapAbove = this.up(1, forward);
      const below = this.down(1, forward);

      if (this.isSolid(forward)) return;
      if (!this.isAir(below) && !this.isWater(below)) shouldJump = false;
      if (!this.isWalkable(gapAbove)) shouldJump2 = false;
    }

    if (!shouldJump || !shouldJump2) return;
    if (manager.isNodeBroken(standingNode)) return;

    if (this.isStandable(landingNode)) {
      landingNode.attributes["name"] = name;
      neighbors.push(this.makeMovement(landingNode, this.COST_PARKOUR));
    }
  }
}

class MoveForwardParkourDown1 extends Move {
  generate(cardinalDirections, origin, neighbors) {
    for (const dir of cardinalDirections) {
      this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, dir);

      this.addNeighbors(neighbors);
    }
  }

  addNeighbors(neighbors) {
    const config = this.config;
    const manager = this.manager;
    const name = this.name;

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
  generate(cardinalDirections, origin, neighbors) {
    for (const dir of cardinalDirections) {
      this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, dir);

      this.addNeighbors(neighbors);
    }
  }

  addNeighbors(neighbors) {
    const config = this.config;
    const manager = this.manager;
    const name = this.name;

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
  generate(cardinalDirections, origin, neighbors) {
    for (const dir of cardinalDirections) {
      this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, dir);

      this.addNeighbors(neighbors);
    }
  }

  addNeighbors(neighbors) {
    const config = this.config;
    const manager = this.manager;
    const name = this.name;

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
  generate(cardinalDirections, origin, neighbors) {
    for (const dir of cardinalDirections) {
      this.origin = new DirectionalVec3(origin.x, origin.y, origin.z, dir);

      this.addNeighbors(neighbors);
    }
  }

  addNeighbors(neighbors) {
    const config = this.config;
    const manager = this.manager;
    const name = this.name;

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

    if (!this.isSolid(standingNode)) return;

    let spaceNode1 = this.right(1).forward(1);

    if (!this.isWalkable(spaceNode1)) return;

    let isRightWalkable1 = this.isWalkable(this.right(1).up(1));

    let isForwardWalkable1 = this.isWalkable(this.forward(1).up(1));

    let isRightWalkable2 = this.isWalkable(this.right(2).forward(1).up(1));

    let isForwardWalkable2 = this.isWalkable(this.right(1).forward(2).up(1));

    let airNode = this.forward(1).down(1).right(1);

    if (!(this.isAir(airNode) || this.isWater(airNode))) return;

    if (
      this.isWalkable(spaceNode1) &&
      (isRightWalkable1 || isForwardWalkable1) &&
      (isRightWalkable2 || isForwardWalkable2) &&
      this.isStandable(landingNode)
    ) {
      neighbors.push(this.makeMovement(landingNode, this.COST_PARKOUR));
    }
  }
}

class MoveDiagonalUpParkour extends Move {
  addNeighbors(neighbors, config, manager) {
    if (!config.parkour) return;
    let landingNode = this.right(2).forward(2).up(1);
    let standingNode = this.down(1, landingNode);

    if (manager.isNodeBroken(standingNode)) return;

    if (!this.isSolid(standingNode)) return;

    let spaceNode1 = this.right(1).forward(1);

    if (!this.isWalkable(spaceNode1)) return;

    let isRightWalkable1 = this.isWalkable(this.right(1));
    let isRightWalkable2 = this.isWalkable(this.right(1).up(1));

    let isForwardWalkable1 = this.isWalkable(this.forward(1));
    let isForwardWalkable2 = this.isWalkable(this.forward(1).up(1));

    let isRightForwardWalkable1 = this.isWalkable(this.right(2).forward(1));
    let isRightForwardWalkable2 = this.isWalkable(
      this.right(2).forward(1).up(1)
    );

    let isForwardWalkable3 = this.isWalkable(this.forward(2).right(1));
    let isForwardWalkable4 = this.isWalkable(this.forward(2).right(1).up(1));

    let airNode = this.forward(1).right(1);

    if (!(this.isAir(airNode) || this.isWater(airNode))) return;

    if (
      this.isWalkable(spaceNode1) &&
      isRightWalkable1 &&
      isRightWalkable2 &&
      isForwardWalkable1 &&
      isForwardWalkable2 &&
      isRightForwardWalkable1 &&
      isRightForwardWalkable2 &&
      isForwardWalkable3 &&
      isForwardWalkable4 &&
      this.isStandable(landingNode)
    ) {
      neighbors.push(this.makeMovement(landingNode, this.COST_PARKOUR));
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

    if (!this.isSolid(standingNode)) return;

    let spaceNode1 = this.right(1).forward(1);

    if (!this.isWalkable(spaceNode1)) return;

    let isRightWalkable = this.isWalkable(this.right(1).up(1));
    let isForwardWalkable = this.isWalkable(this.forward(1).up(1));
    let isRightWalkable2 = this.isWalkable(this.right(1).forward(1).up(1));
    let isForwardWalkable2 = this.isWalkable(this.right(1).forward(1).up(1));

    let airNode = this.forward(1).down(1).right(1);
    let airNode2 = this.forward(1).down(1);
    let airNode3 = this.forward(2).down(1);

    if (!(this.isAir(airNode) || this.isWater(airNode))) return;
    if (!(this.isAir(airNode2) || this.isWater(airNode2))) return;
    if (!(this.isAir(airNode3) || this.isWater(airNode3))) return;

    if (
      this.isWalkable(spaceNode1) &&
      (isRightWalkable || isForwardWalkable) &&
      (isRightWalkable2 || isForwardWalkable2) &&
      this.isStandable(landingNode)
    ) {
      neighbors.push(this.makeMovement(landingNode, this.COST_PARKOUR));
    }
  }
}

registerMoves([
  // parkour
  new MoveParkour1(),
  new MoveForwardParkour(),
  // // up parkour
  new MoveForwardParkourUp(),

  // // down parkour
  new MoveForwardParkourDown1(),
  new MoveForwardParkourDown2(),
  new MoveForwardParkourDown3(),

  // diagonal parkour
  new MoveDiagonalParkour1(),
  // MoveDiagonalUpParkour,
  // MoveDiagonalDownParkour,
  // MoveSemiDiagonalParkour,

  //idk
  new MoveForwardParkourDownExt(),
]);
