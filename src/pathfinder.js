const { Vec3 } = require("vec3");
const { getNeighbors2, DirectionalVec3 } = require("./movement");
const { BinarySearchTree, MinHeap, BinaryHeapOpenSet } = require("./heap");
const blockMapCost = require("./blockmap");

// const sleep = (ms = 2000) => {
//   return new Promise((r) => {
//     setTimeout(r, ms);
//   });
// };

const compare = (a, b) => {
  if (a.fCost !== b.fCost) {
    return a.fCost - b.fCost; // Prioritize lower fCost
  }
  return a.hCost - b.hCost; // Break ties by lower hCost
};

function defaultHash(node) {
  const prime = 31; // A prime number to help distribute the values
  return node.x * prime * prime + node.y * prime + node.z;
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

  isNodePlaced(node) {
    const attribute = this.getNodeAttribute(node);

    if (!attribute) return false;

    return attribute === "placed";
  }

  isAreaMarkedNode(node) {
    const attribute = this.getNodeAttribute(node);

    if (!attribute) return false;

    return attribute === "areaMarked";
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
    /**
     * @type {number}
     */
    this.cost = cost || 0;
    /**
     * @type {Cell}
     */
    this.parent = null;
    /**
     * @type {DirectionalVec3[]}
     */
    this.breakableNeighbors = [];
    /**
     * @type {DirectionalVec3[]}
     */
    this.verticalPlacable = [];
    /**
     * @type {DirectionalVec3[]}
     */
    this.horizontalPlacable = [];
    /**
     * @type {DirectionalVec3[]}
     */
    this.placeBlocks = [];

    // to break or place blocks later
    this.placeHere = false;
    this.breakThis = false;

    /**
     * @type {string}
     * The name of the move class that is node is associdiated with
     */
    this.moveName = "";
  }

  add(offset) {
    return new Cell(this.worldPos.add(offset), this.cost);
  }
}

async function Astar(
  start,
  endPos,
  bot,
  endFunc,
  config,
  excludedPositions = []
) {
  let end = endPos.clone().floored().offset(0.5, 0, 0.5);
  let startPos = start.floored().offset(0.5, 0, 0.5);
  // console.log(start)

  const openList = new BinaryHeapOpenSet();
  const openSet = new Map();
  const closedSet = new Set();
  const nodemanager = new NodeManager();
  nodemanager.markNodes(excludedPositions, "areaMarked");
  const startNode = new Cell(startPos);

  const world = bot.world;

  const blockID = world.getBlock(startNode.worldPos).name;

  startNode.gCost = 0;
  startNode.hCost = manhattanDistance(startNode.worldPos, end, blockID);
  startNode.fCost = startNode.gCost + startNode.hCost;

  openList.push(startNode);
  openSet.set(defaultHash(startPos), startNode);

  let path = [];
  let bestNode = startNode;

  return new Promise(async (resolve) => {
    let startTime = performance.now();
    let lastSleep = performance.now();

    while (!openList.isEmpty()) {
      if (performance.now() - lastSleep >= 40) {
        // need to do this so the bot doesnt lag
        await new Promise((r) => setTimeout(r, 0));
        lastSleep = performance.now();
      }

      let currentNode = openList.pop();
      if (currentNode.hCost < bestNode.hCost) {
        bestNode = currentNode;
      }

      if (endFunc(currentNode.worldPos)) {
        // console.log("current",currentNode.worldPos);
        // console.log("end", end);

        return resolve({
          path: reconstructPath(currentNode),
          cost: currentNode.fCost,
          status: "found",
          openMap: openSet,
        });
      }

      // bot.chat(
      //   `/particle dust{color:[0.38,0.21,0.51],scale:1} ${currentNode.worldPos.x} ${currentNode.worldPos.y} ${currentNode.worldPos.z} 0.1 0.1 0.1 1 4 force`
      // );

      // bot.chat(
      //   `/particle dust 0.38 0.21 0.51 1 ${currentNode.worldPos.x} ${currentNode.worldPos.y} ${currentNode.worldPos.z} 0.1 0.1 0.1 1 10 force`
      // );

      openSet.delete(defaultHash(currentNode.worldPos));
      closedSet.add(defaultHash(currentNode.worldPos));

      const neighbors = getNeighbors(currentNode, bot, config, nodemanager);

      for (const neighborData of neighbors) {
        if (closedSet.has(defaultHash(neighborData))) continue;

        //if da cost to get to this node is greater than the cost to get to the current node
        if (neighborData.cost > 200) {
          // console.log("cost too high")
          continue;
        }

        let tempG = currentNode.gCost + neighborData.cost;
        let neighbor = openSet.get(defaultHash(neighborData));

        if (!neighbor) {
          neighbor = new Cell();
          neighbor.worldPos = new Vec3(
            neighborData.x,
            neighborData.y,
            neighborData.z
          );

          const blockID = world.getBlock(neighbor.worldPos).name;

          neighbor.gCost = tempG;
          neighbor.hCost = manhattanDistance(neighborData, end, blockID);
          neighbor.fCost = neighbor.gCost + neighbor.hCost;
          neighbor.parent = currentNode;
          neighbor.moveName = neighborData.attributes.name;

          openSet.set(defaultHash(neighborData), neighbor);
          openList.push(neighbor);
        } else if (tempG < neighbor.gCost) {
          neighbor.gCost = tempG;
          neighbor.fCost = neighbor.gCost + neighbor.hCost;
          neighbor.parent = currentNode;

          if (neighbor.fCost <= 200) {
            openList.update(neighbor);
          }
        }

        if (neighborData.fly) {
          neighbor.fly = true;
        }

        if (neighborData.break) {
          neighbor.breakThis = true;
          neighbor.breakableNeighbors = neighborData.blocks;
          nodemanager.markNodes(neighborData.blocks, "broken");
        }

        if (neighbor.hCost < bestNode.hCost) {
          bestNode = neighbor;
        }

        if (neighborData.place) {
          neighbor.placeHere = true;
          neighbor.placeBlocks = neighborData.blocks;
          nodemanager.markNodes(neighborData.blocks, "placed");
        }

        if (neighborData.placeHorizontal) {
          // console.log("guh")
          neighbor.placeHere = true;
          neighbor.horizontalPlacable = neighborData.blocks;
          nodemanager.markNodes(neighborData.blocks, "placeHorizontal");
        }

        if (neighborData.placeVertical) {
          // console.log("guh")
          neighbor.placeHere = true;
          neighbor.verticalPlacable = neighborData.blocks;
          nodemanager.markNodes(neighborData.blocks, "placeVertical");
        }

        // bot.chat(
        //   `/particle dust{color:[0.11,0.75,0.31],scale:1} ${neighbor.worldPos.x} ${neighbor.worldPos.y} ${neighbor.worldPos.z} 0.1 0.1 0.1 1 4 force`
        // );

        // bot.chat(
        //   `/particle dust 0.11 0.75 0.31 1 ${neighbor.worldPos.x} ${neighbor.worldPos.y} ${neighbor.worldPos.z} 0.1 0.1 0.1 2 10 force`
        // );
      }

      let currentTime = performance.now();
      if (currentTime - startTime >= config.thinkTimeout) {
        // Time limit exceeded, return the best partial path found within the time limit

        if (bestNode) {
          return resolve({
            path: reconstructPath(bestNode),
            status: "partial",
            cost: bestNode.fCost,
            exploredNodes: closedSet.size,
            remainingNodes: openList.size(),
            openMap: openSet,
          });
        } else {
          return resolve({
            path,
            status: "no path",
          });
        }
      }
    }

    return resolve({
      path,
      status: "no path",
    });
  });
}

function customDistance(node, goal, blockID = null) {
  const dx = Math.abs(goal.x - node.x);
  const dy = Math.abs(goal.y - node.y);
  const dz = Math.abs(goal.z - node.z);

  const cost = blockMapCost.get(blockID) ?? 1;

  return (dx + dz + Math.min(dx, dz) * Math.SQRT2 + dy) * cost;
}

function euclideanDistance(node, goal, blockID = null) {
  const verticalCostMultiplier = 1.5;
  const dx = Math.abs(goal.x - node.x);
  const dy = Math.abs(goal.y - node.y);
  const dz = Math.abs(goal.z - node.z);

  const horizontalDistance = Math.sqrt(dx * dx + dz * dz);
  const verticalDistance = dy * verticalCostMultiplier;

  const cost = blockMapCost.get(blockID) ?? 1;

  return (horizontalDistance + verticalDistance) * cost;
}

function manhattanDistance(node, goal, blockID = null) {
  const dx = Math.abs(node.x - goal.x);
  const dy = Math.abs(node.y - goal.y);
  const dz = Math.abs(node.z - goal.z);

  const horizontalDistance = dx + dz;
  const verticalDistance = dy;

  return (horizontalDistance + verticalDistance) * 1.5;
}

function octileDistance(node, goal, blockID = null) {
  const dx = Math.abs(goal.x - node.x);
  const dy = Math.abs(goal.y - node.y);
  const dz = Math.abs(goal.z - node.z);

  const sqrt2 = Math.sqrt(2); // The cost of diagonal movement
  return Math.max(dx, dy, dz) + (sqrt2 - 1) * Math.min(dx, dy, dz);
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

  for (const dirVec of neighbors) {
    neighbor.push(dirVec);
  }

  // console.log("===*===");
  // console.log(neighbor);
  // console.log("===*===");

  return neighbor;
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
