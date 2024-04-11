const { Vec3 } = require("vec3");
const { getNeighbors2 } = require("./movement");
const { BinarySearchTree, MinHeap, BinaryHeapOpenSet } = require("./heap");
const blockMapCost = require("./blockmap");

// const sleep = (ms = 2000) => {
//   return new Promise((r) => {
//     setTimeout(r, ms);
//   });
// };

function defaultHash(node) {
  return `${node.x}_${node.y}_${node.z}`;
}

class NodeManager {
  constructor() {
    this.markedNodes = new Map();
  }

  markNode(node, attribute) {
    this.markedNodes.set(defaultHash(node), attribute);
  }

  markNodes(nodes, attribute) {
    for (const node of nodes) {
      this.markNode(node, attribute);
    }
  }

  unmarkNode(node) {
    this.markedNodes.delete(defaultHash(node));
  }

  isNodeMarked(node) {
    return this.markedNodes.has(defaultHash(node));
  }

  getNodeAttribute(node) {
    return this.markedNodes.get(defaultHash(node));
  }

  isNodeBroken(node) {
    const attribute = this.getNodeAttribute(node);

    if (!attribute) return false;

    return attribute === "broken";
  }
}

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
  openSet,
  breakBlocks,
  horPlace,
  verPlace,
  closedSet,
  end,
  bestNode,
  manager,
  world,
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

    const blockID = world.getBlock(neighborData).name;

    neighbor.hCost = euclideanDistance(neighborData, end, blockID);
    neighbor.fCost = neighbor.gCost + neighbor.hCost;

    if (neighbor.hCost < bestNode.hCost) {
      console.log("Setting neighbor to best node");
      bestNode = neighbor;
    }

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

    // if (neighbor.placeHere) {
    //   for (const dirVec of horPlace) {
    //     if (
    //       neighbor.worldPos.x === dirVec.parent.x &&
    //       neighbor.worldPos.z === dirVec.parent.z
    //     ) {
    //       neighbor.horizontalPlacable = dirVec.blocks;
    //     }
    //   }

    //   for (const dirVec of verPlace) {
    //     if (
    //       neighbor.worldPos.x === dirVec.parent.x &&
    //       neighbor.worldPos.z === dirVec.parent.z
    //     ) {
    //       neighbor.verticalPlacable = dirVec.blocks;
    //     }
    //   }
    // }
  }
}

async function Astar(start, endPos, bot, endFunc, config) {
  let end = endPos.clone().offset(0.5, 0.5, 0.5);
  start = start.floored().offset(0.5, 0.5, 0.5);

  const openList = new BinaryHeapOpenSet();
  const openSet = new Map();
  const closedSet = new Set();
  const nodemanager = new NodeManager();
  const startNode = new Cell(start);

  const world = bot.world;
  const blockID = world.getBlock(start).name;

  startNode.gCost = 0;
  startNode.hCost = euclideanDistance(startNode.worldPos, end, blockID);
  startNode.fCost = startNode.gCost + startNode.hCost;

  openList.push(startNode);
  openSet.set(defaultHash(start), startNode);

  let path = [];
  let bestNode = startNode;

  return new Promise(async (resolve) => {
    let startTime = performance.now();

    while (!openList.isEmpty()) {
      let currentNode = openList.pop();

      if (endFunc(currentNode.worldPos, end, true)) {
        return resolve({
          path: reconstructPath(currentNode),
          cost: currentNode.fCost,
          status: "found",
          openMap: openSet,
        });
      }

      // bot.chat(
      //   `/particle dust 1 0.51 0.93 1 ${currentNode.worldPos.x} ${currentNode.worldPos.y} ${currentNode.worldPos.z} 0.1 0.1 0.1 1 5 force`
      // );

      openSet.delete(defaultHash(currentNode.worldPos));
      closedSet.add(defaultHash(currentNode.worldPos));

      const {
        break: breakBlocks,
        horizontalPlace: horPlace,
        verticalPlace: verPlace,
        neighbor: neighbors,
      } = getNeighbors(currentNode, bot, config, nodemanager);

      for (const neighborData of neighbors) {
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

        const blockID = world.getBlock(neighborData).name;

        neighbor.hCost = euclideanDistance(neighborData, end, blockID);
        neighbor.fCost = neighbor.gCost + neighbor.hCost;

        if (neighbor.hCost < bestNode.hCost) {
          // console.log("Setting neighbor to best node");
          bestNode = neighbor;
        }

        if (update) {
          openList.update(neighbor, neighbor.fCost);
        } else {
          openList.push(neighbor);
          openSet.set(defaultHash(neighborData), neighbor);
        }

        if (neighborData.break) {
          neighbor.breakThis = true;
          neighbor.breakableNeighbors = neighborData.blocks;
          nodemanager.markNodes(neighborData.blocks, "broken");
        }

        if (neighborData.placeHorizontal) {
          neighbor.placeHere = true;
          neighbor.horizontalPlacable = neighborData.blocks;
          nodemanager.markNodes(neighborData.blocks, "placeHorizontal");
        }
      }

      let currentTime = performance.now();
      if (currentTime - startTime >= config.thinkTimeout) {
        // Time limit exceeded, return the best partial path found within the time limit

        if (bestNode) {
          return resolve({
            path: reconstructPath(bestNode),
            status: "partial",
            cost: bestNode.fCost,
            openMap: openSet,
          });
        } else {
          return resolve({
            path,
            status: "no path",
          });
        }
      }

      await new Promise((r) => setTimeout(r, 0));
    }

    return resolve({
      path,
      status: "no path",
    });
  });
}

function euclideanDistance(node, goal, blockID) {
  const dx = Math.abs(goal.x - node.x);
  const dy = Math.abs(goal.y - node.y);
  const dz = Math.abs(goal.z - node.z);

  const cost = blockMapCost.get(blockID) ?? 1;
  // console.log(`Block: ${blockID}, Cost: ${cost}`)

  return Math.sqrt(dx * dx + dy * dy + dz * dz) * cost;
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

function getNeighbors(node, bot, config, manager) {
  let neighbor = [];
  const neighbors = getNeighbors2(bot.world, node, config, manager, bot);
  for (const dirVec of neighbors.neighbors) {
    for (const obj of neighbors.breakNeighbors) {
      //If this vec is the parent then we set its blocks to the objs blocks
      if (dirVec.x === obj.parent.x && dirVec.z === obj.parent.z) {
        dirVec.blocks = obj.blocks;
      }
    }

    for (const obj of neighbors.horizontalPlaceNeighbors) {
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

module.exports = {
  Astar,
  Cell,
  getNeighbors,
  defaultHash,
  reconstructPath,
  manhattanDistance,
  euclideanDistance,
};
