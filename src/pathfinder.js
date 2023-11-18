const { Vec3 } = require("vec3");
const { getNeighbors2, NodeManager } = require("./movement");
const { BinarySearchTree } = require("./heap");

// const sleep = (ms = 2000) => {
//   return new Promise((r) => {
//     setTimeout(r, ms);
//   });
// };

class Cell {
  constructor(worldPos, cost) {
    /**
     * @type {Vec3}
     */
    this.worldPos = worldPos;
    this.gCost = 0;
    this.hCost = 0;
    this.fCost = 0;
    this.cost = cost || 0;
    this.parent = null;
    this.breakableNeighbors = [];
    this.verticalPlacable = [];
    this.horizontalPlacable = [];

    // to break or place blocks later
    this.placeHere = false;
    this.breakThis = false;
  }
}

function processBatch({
  batch,
  currentNode,
  openList,
  openSet,
  breakBlocks,
  horPlace,
  verPlace,
  closedSet,
  end,
}) {
  for (const neighbor of batch) {
    if (closedSet.has(defaultHash(neighbor.worldPos))) {
      continue;
    }

    let tempG = currentNode.gCost + neighbor.cost;

    if (neighbor.breakThis) {
      for (const dirVec of breakBlocks) {
        if (
          neighbor.worldPos.x === dirVec.parent.x &&
          neighbor.worldPos.z === dirVec.parent.z
        ) {
          neighbor.breakableNeighbors = dirVec.blocks;
        }
      }
    }

    if (neighbor.placeHere) {
      for (const dirVec of horPlace) {
        if (
          neighbor.worldPos.x === dirVec.parent.x &&
          neighbor.worldPos.z === dirVec.parent.z
        ) {
          neighbor.horizontalPlacable = dirVec.blocks;
        }
      }

      for (const dirVec of verPlace) {
        if (
          neighbor.worldPos.x === dirVec.parent.x &&
          neighbor.worldPos.z === dirVec.parent.z
        ) {
          neighbor.verticalPlacable = dirVec.blocks;
        }
      }
    }

    if (
      tempG < neighbor.gCost ||
      !openSet.has(defaultHash(neighbor.worldPos))
    ) {
      neighbor.parent = currentNode;
      neighbor.gCost = tempG;
      neighbor.hCost = octileHeuristic3D(neighbor.worldPos, end, neighbor.cost);
      neighbor.fCost = neighbor.gCost + neighbor.hCost;

      if (!openSet.has(defaultHash(neighbor.worldPos))) {
        openList.insert(neighbor);
        openSet.add(defaultHash(neighbor.worldPos));
      } else {
        openList.update(neighbor);
        openSet.add(defaultHash(neighbor.worldPos));
      }
    }
  }
}

async function Astar(start, endPos, bot, endFunc, config) {
  let end = endPos.clone().offset(0.5, 0.5, 0.5);
  start = start.floored().offset(0.5, 0.5, 0.5);

  const openList = new BinarySearchTree();
  const openSet = new Set();
  const closedSet = new Set();

  openList.insert(new Cell(start));
  openSet.add(defaultHash(start));

  let path = [];

  return new Promise(async (resolve) => {
    let lastSleep = performance.now();

    while (!openList.isEmpty()) {
      if (performance.now() - lastSleep >= 50) {
        await new Promise((r) => setTimeout(r, 0));
        lastSleep = performance.now();
      }

      let currentNode = openList.getMin();

      if (endFunc(currentNode.worldPos, end, true)) {
        NodeManager.dispose();
        return resolve({
          path: reconstructPath(currentNode),
          cost: currentNode.fCost,
          status: "found",
        });
      }

      openSet.delete(defaultHash(currentNode.worldPos));
      openList.remove(currentNode);
      closedSet.add(defaultHash(currentNode.worldPos));

      const {
        break: breakBlocks,
        horizontalPlace: horPlace,
        verticalPlace: verPlace,
        neighbor: neighbors,
      } = getNeighbors(currentNode, bot, config);

      const batchSize = 10;
      for (let i = 0; i < neighbors.length; i += batchSize) {
        const batch = neighbors.slice(i, i + batchSize);
        processBatch({
          batch,
          breakBlocks,
          closedSet,
          currentNode,
          end,
          horPlace,
          openList,
          openSet,
          verPlace,
        });
      }
    }

    return resolve({
      path,
      status: "no path",
    });
  });
}

function euclideanDistance(node, goal) {
  const dx = goal.x - node.x;
  const dy = goal.y - node.y;
  const dz = goal.z - node.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function manhattanDistance(node, goal) {
  return (
    Math.abs(goal.x - node.x) +
    Math.abs(goal.y - node.y) +
    Math.abs(goal.z - node.z)
  );
}

function combinedHeuristic(node, goal, weight) {
  const euclidean = euclideanDistance(node, goal);
  const manhattan = manhattanDistance(node, goal);
  return weight * euclidean + (1 - weight) * manhattan;
}

function octileHeuristic3D(node, goal, cost) {
  const dx = Math.abs(node.x - goal.x);
  const dy = Math.abs(node.y - goal.y);
  const dz = Math.abs(node.z - goal.z);

  const minDeltaXY = Math.min(dx, dy);
  const maxDeltaXY = Math.max(dx, dy);

  // Octile Heuristic formula considering 3D distance
  return (
    cost * (maxDeltaXY + Math.sqrt(2) - 1) + dz + (minDeltaXY - maxDeltaXY)
  );
}

function yoinkedHeuristic(node, endPos) {
  const dx = node.x - endPos.x;
  const dy = node.y - endPos.y;
  const dz = node.z - endPos.z;
  return distanceXZ(dx, dz) + Math.abs(dy);
}

function distanceXZ(dx, dz) {
  dx = Math.abs(dx);
  dz = Math.abs(dz);
  return Math.sqrt(dx * dx + dz * dz);
}

function reconstructPath(node) {
  const path = [];

  // Traverse back to the starting node using parent pointers
  while (node) {
    path.push(node);
    node = node.parent;
  }

  // The path is currently in reverse order, so reverse it to get the correct order
  path.reverse();

  return path;
}

function getNeighbors(node, bot, config) {
  let neighbor = [];
  const neighbors = getNeighbors2(bot.world, node, config);
  for (const dirVec of neighbors.neighbors) {
    const cell = new Cell(new Vec3(dirVec.x, dirVec.y, dirVec.z), dirVec.cost);
    if (dirVec.break && dirVec.break === true) {
      cell.breakThis = true;
    }

    if (dirVec.placeHorizontal && dirVec.placeHorizontal === true) {
      cell.placeHere = true;
    }

    if (dirVec.placeVertical && dirVec.placeVertical === true) {
      cell.placeHere = true;
    }

    neighbor.push(cell);
  }

  return {
    neighbor,
    break: neighbors.breakNeighbors,
    verticalPlace: neighbors.verticalPlacaNeighbors,
    horizontalPlace: neighbors.horizontalPlaceNeighbors,
  };
}

function defaultHash(node) {
  return node.toString();
}

module.exports = {
  Astar,
  Cell,
  getNeighbors,
  defaultHash,
  reconstructPath,
  manhattanDistance,
  euclideanDistance,
};
