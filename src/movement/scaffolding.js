const { Move, registerMoves, DirectionalVec3 } = require("./");

class MoveScaffoldingEnter extends Move {
  generate(cardinalDirections, origin, neighbors, end) {
    for (const dir of cardinalDirections) {
      const originVec = new DirectionalVec3(origin.x, origin.y, origin.z, dir);
      const node = originVec.forward(1);

      if (!this.isScaffolding(node)) continue;

      this.addNeighbors(neighbors, node, originVec);
    }
  }

  /**
   *
   * @param {DirectionalVec3[]} neighbors
   * @param {DirectionalVec3} node
   * @param {DirectionalVec3} originVec
   */
  addNeighbors(neighbors, node, originVec) {
    const above = node.up(1);

    node.attributes = {
      name: this.name,
      cost: this.COST_NORMAL,
    };

    neighbors.push(this.makeMovement(node, node.attributes.cost));
  }
}

class MoveScaffoldingForward extends Move {
  generate(cardinalDirections, origin, neighbors, end) {
    for (const dir of cardinalDirections) {
      const originVec = new DirectionalVec3(origin.x, origin.y, origin.z, dir);
      const node = originVec.forward(1);

      if (!this.isScaffolding(originVec)) continue;
      if (!this.isScaffolding(node)) continue;

      this.addNeighbors(neighbors, node, originVec);
    }
  }

  /**
   *
   * @param {DirectionalVec3[]} neighbors
   * @param {DirectionalVec3} node
   * @param {DirectionalVec3} originVec
   */
  addNeighbors(neighbors, node, originVec) {
    const above = node.up(1);

    if (!this.isAir(node) || !this.isScaffolding(above)) return;

    node.attributes = {
      name: this.name,
      cost: this.COST_NORMAL,
      scaffolding: true,
    };

    neighbors.push(this.makeMovement(node, node.attributes.cost));
  }
}

class MoveScaffoldingUp extends Move {
  generate(cardinalDirections, origin, neighbors, end) {
    const originVec = new DirectionalVec3(origin.x, origin.y, origin.z, {
      x: 0,
      z: 0,
    });

    if (!this.isScaffolding(originVec)) return;

    const node = originVec.up(1);

    this.addNeighbors(neighbors, node, originVec);
  }

  /**
   *
   * @param {DirectionalVec3[]} neighbors
   * @param {DirectionalVec3} node
   * @param {DirectionalVec3} originVec
   */
  addNeighbors(neighbors, node, originVec) {
    const above = node.up(1);

    node.attributes = {
      name: this.name,
      cost: this.COST_UP,
      scaffoldingUp: true,
      scaffolding: true,
    };

    neighbors.push(this.makeMovement(node, node.attributes.cost));
  }
}

class MoveScaffoldingDown extends Move {
  generate(cardinalDirections, origin, neighbors, end) {
    const originVec = new DirectionalVec3(origin.x, origin.y, origin.z, {
      x: 0,
      z: 0,
    });
    const node = originVec.down(1);

    if (!this.isScaffolding(originVec)) return;
    if (!this.isScaffolding(node)) return;

    this.addNeighbors(neighbors, node, originVec);
  }

  /**
   *
   * @param {DirectionalVec3[]} neighbors
   * @param {DirectionalVec3} node
   * @param {DirectionalVec3} originVec
   */
  addNeighbors(neighbors, node, originVec) {
    node.attributes = {
      name: this.name,
      cost: this.COST_UP,
      scaffoldingDown: true,
      scaffolding: true,
    };

    neighbors.push(this.makeMovement(node, node.attributes.cost));
  }
}

// registerMoves([
//   new MoveScaffoldingEnter(10),
//   new MoveScaffoldingForward(10),
//   new MoveScaffoldingUp(10),
//   new MoveScaffoldingDown(10),
// ]);
