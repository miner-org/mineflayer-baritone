const { Vec3 } = require("vec3");
const { getNeighbors2, NodeManager } = require("./movement");
const { BinarySearchTree, MinHeap } = require("./heap");

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
    this.worldPos = worldPos || null;
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
  openSet = new Map(),
  breakBlocks,
  horPlace,
  verPlace,
  closedSet,
  end,
  bestNode,
}) {
  for (const neighborData of batch) {
    if (closedSet.has(defaultHash(neighborData))) continue;

    let tempG = currentNode.gCost + neighborData.cost;
    let neighbor = openSet.get(defaultHash(neighborData));
    let update = false;

    if (neighbor === undefined) {
      neighbor = new Cell();

      openSet.set(defaultHash(neighborData), neighbor);
    } else {
      if (neighbor.gCost < tempG) {
        // skip dis one cuz we foudn btter path
        continue;
      }

      update = true;
    }

    neighbor.worldPos = new Vec3(
      neighborData.x,
      neighborData.y,
      neighborData.z
    );
    neighbor.parent = currentNode;
    neighbor.gCost = tempG;
    neighbor.hCost = combinedHeuristic(neighborData, end, 0.5);
    neighbor.fCost = neighbor.gCost + neighbor.hCost;

    // if (neighbor.hCost < bestNode.hCost) bestNode = neighbor;

    if (update) {
      openList.update(neighbor, neighbor.fCost);
    } else {
      openList.insert(neighbor);
      openSet.set(defaultHash(neighborData), neighbor);
    }

    if (neighborData.break) {
      neighbor.breakThis = true;
      neighbor.breakableNeighbors = neighborData.blocks;
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
  }
}

async function Astar(start, endPos, bot, endFunc, config) {
  let end = endPos.clone().offset(0.5, 0.5, 0.5);
  start = start.floored().offset(0.5, 0.5, 0.5);

  const openList = new MinHeap();
  const openSet = new Map();
  const closedSet = new Set();
  const backoffThreshold = 5; // Distance threshold for backoff
  let backoffIncrement = 0.1; // Increment for modifying cost heuristic
  const startNode = new Cell(start);
  startNode.gCost = 0;
  startNode.hCost = combinedHeuristic(startNode.worldPos, end, 0.5);
  startNode.fCost = startNode.gCost + startNode.hCost;

  openList.insert(startNode);
  openSet.set(defaultHash(start), startNode);

  let path = [];

  // Track the best node and associated backoff metric
  let bestNode = null;
  let bestBackoffMetric = Infinity;

  return new Promise(async (resolve) => {
    let startTime = performance.now();

    while (!openList.isEmpty()) {
      let currentNode = openList.extractMin();

      if (endFunc(currentNode.worldPos, end, true)) {
        NodeManager.dispose();
        return resolve({
          path: reconstructPath(currentNode),
          cost: currentNode.fCost,
          status: "found",
        });
      }

      openSet.delete(defaultHash(currentNode.worldPos));
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
          bestNode,
        });
      }

      let currentTime = performance.now();
      if (currentTime - startTime >= config.thinkTimeout) {
        // Time limit exceeded, return the best partial path found within the time limit
        if (bestNode) {
          NodeManager.dispose();
          return resolve({
            path: reconstructPath(bestNode),
            status: "partial",
            cost: bestNode.fCost,
          });
        } else {
          NodeManager.dispose();
          return resolve({
            path,
            status: "no path",
          });
        }
      }

      let backoffMetric = currentNode.fCost / backoffIncrement;

      if (backoffMetric < bestBackoffMetric) {
        bestNode = currentNode;
        bestBackoffMetric = backoffMetric;
        backoffIncrement += 0.1;
      }

      await new Promise((r) => setTimeout(r, 0));
    }

    if (bestNode && bestBackoffMetric < backoffThreshold) {
      console.log("i reach here");
      return resolve({
        path: reconstructPath(bestNode),
        status: "partial",
        cost: bestNode.fCost,
      });
    }

    return resolve({
      path,
      status: "no path",
    });
  });
}

function euclideanDistance(node, goal) {
  const dx = Math.abs(goal.x - node.x);
  const dy = Math.abs(goal.y - node.y);
  const dz = Math.abs(goal.z - node.z);
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
  const dx = endPos.x - node.x;
  const dy = endPos.y - node.y;
  const dz = endPos.z - node.z;
  return distanceXZ(dx, dz) + Math.abs(dy);
}

function distanceXZ(dx, dz) {
  dx = Math.abs(dx);
  dz = Math.abs(dz);
  return Math.abs(dx - dz) + Math.min(dx, dz) * Math.SQRT2;
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
    for (const obj of neighbors.breakNeighbors) {

      //If this vec is the parent then we set its blocks to the objs blocks
      if (dirVec.x === obj.parent.x && dirVec.z === obj.parent.z) {
        dirVec.blocks = obj.blocks;
      }
    }

    /**
     * Syntax
     *
     * {
     * x,
     * y,
     * z,
     * break?,
     * placeHorizontal?,
     * placeVertical?
     * cost,
     * blocks?: []
     * }
     */
    neighbor.push(dirVec);
  }

  return {
    neighbor,
    break: neighbors.breakNeighbors,
    verticalPlace: neighbors.verticalPlacaNeighbors,
    horizontalPlace: neighbors.horizontalPlaceNeighbors,
  };
}

function defaultHash(node) {
  return `${node.x}_${node.y}_${node.z}`;
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
