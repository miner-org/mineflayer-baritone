const { Vec3 } = require("vec3");
const { getNeighbors2, DirectionalVec3 } = require("./movement");
const { BinarySearchTree, MinHeap, BinaryHeapOpenSet } = require("./heap");
const blockMapCost = require("./blockmap");

const PUSH_FACTOR = 0.5;

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
     * @type {Object}
     */
    this.attributes = {};
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

  equals(other) {
    if (!(other instanceof Cell)) return false;
    if (!this.worldPos || !other.worldPos) return false;
    return (
      this.worldPos.x === other.worldPos.x &&
      this.worldPos.y === other.worldPos.y &&
      this.worldPos.z === other.worldPos.z
    );
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
  let end = endPos.clone();
  let startPos = start.floored().offset(0.5, 0, 0.5);
  // console.log(start)

  const openList = new BinaryHeapOpenSet(compare);
  const openSet = new Map();
  const closedSet = new Set();
  const nodemanager = new NodeManager();
  nodemanager.markNodes(excludedPositions, "areaMarked");
  const startNode = new Cell(startPos);

  // console.log(startNode)

  const world = bot.world;

  const blockID = world.getBlock(startNode.worldPos).name;

  startNode.gCost = 0;
  startNode.hCost = averageDist(startPos, end, blockID);
  startNode.fCost = startNode.gCost + startNode.hCost;

  openList.push(startNode);
  openSet.set(defaultHash(startPos), startNode);

  let path = [];
  let bestNode = null;
  let bestScore = Infinity;

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

      // At the top of the loop, after popping currentNode
      if (currentNode.attributes?.break) {
        nodemanager.markNodes(currentNode.attributes.break, "broken");
      }
      if (currentNode.attributes?.place) {
        nodemanager.markNodes(currentNode.attributes.place, "placed");
      }
      if (currentNode.placeHere && currentNode.horizontalPlacable) {
        nodemanager.markNodes(
          currentNode.horizontalPlacable,
          "placeHorizontal"
        );
      }
      if (currentNode.placeHere && currentNode.verticalPlacable) {
        nodemanager.markNodes(currentNode.verticalPlacable, "placeVertical");
      }

      // console.log(
      //   "Popped node:",
      //   currentNode.worldPos.toString(),
      //   "fCost:",
      //   currentNode.fCost
      // );
      const h = averageDist(currentNode.worldPos, end);
      const fromStart = currentNode.worldPos.distanceTo(startPos);
      if (
        h < bestScore ||
        (h === bestScore && fromStart > bestNode.worldPos.distanceTo(startPos))
      ) {
        bestNode = currentNode;
        bestScore = h;
      }

      if (endFunc(currentNode.worldPos)) {
        // console.log("current", currentNode.worldPos);
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
        // if (neighborData.cost > 100) {
        //   // console.log("cost too high");
        //   continue;
        // }

        let tempG = currentNode.gCost + neighborData.cost;

        let neighbor = openSet.get(defaultHash(neighborData));
        const noise = Math.random() * 0.5;

        if (!neighbor) {
          neighbor = new Cell();
          neighbor.worldPos = new Vec3(
            neighborData.x,
            neighborData.y,
            neighborData.z
          );

          const blockID = world.getBlock(neighbor.worldPos).name;

          neighbor.gCost = tempG;
          neighbor.hCost = averageDist(neighborData, end, blockID);
          neighbor.fCost = computeScore(neighbor, end);
          // neighbor.fCost = neighbor.gCost + neighbor.hCost;
          neighbor.parent = currentNode;
          neighbor.moveName = neighborData.attributes.name;
          neighbor.attributes = neighborData.attributes;

          openSet.set(defaultHash(neighborData), neighbor);
          openList.push(neighbor);
          // console.log("Pushing neighbor:", neighbor.worldPos.toString(), "fCost:", neighbor.fCost);
        } else if (tempG < neighbor.gCost) {
          neighbor.gCost = tempG;
          neighbor.hCost = averageDist(neighborData, end, blockID);
          neighbor.fCost = computeScore(neighbor, end);
          // neighbor.fCost = neighbor.gCost + neighbor.hCost;
          neighbor.parent = currentNode;
          neighbor.attributes = neighborData.attributes;

          if (neighbor.fCost <= 100) {
            // console.log("gay")
            openList.update(neighbor);
          }
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
/**
 *
 * @param {Cell} node
 * @param {Vec3} goal
 * @returns
 */
function computeScore(node, goal) {
  const g = node.gCost;
  const h = averageDist(node.worldPos, goal);

  const toGoal = goal.minus(node.worldPos).normalize();
  const moveDir = node.velocity?.normalize() ?? toGoal;
  const dot = toGoal.dot(moveDir);

  const directionPenalty = (1 - dot) * 0.4; // softer penalty
  const jitter = Math.random() * 0.2;
  const explorationBonus = Math.sqrt(g) * 0.8;

  const w = 0.8; // static weight for now
  return g + w * h + directionPenalty + jitter - explorationBonus;
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

function averageDist(node, goal) {
  const m = manhattanDistance(node, goal);
  const o = octileDistance(node, goal);

  const verticalCuriosity = Math.abs(goal.y - node.y) > 0 ? -0.3 : 0;

  return (m + o) / 2 + verticalCuriosity;
}

function manhattanDistance(node, goal, blockID = null) {
  const dx = Math.abs(node.x - goal.x);
  const dy = Math.abs(node.y - goal.y);
  const dz = Math.abs(node.z - goal.z);

  const horizontalDistance = dx + dz;
  const verticalDistance = dy;

  return horizontalDistance + verticalDistance * PUSH_FACTOR;
}

function octileDistance(node, goal) {
  const dx = Math.abs(goal.x - node.x);
  const dy = Math.abs(goal.y - node.y) * PUSH_FACTOR;
  const dz = Math.abs(goal.z - node.z);

  const sorted = [dx, dy, dz].sort((a, b) => a - b);
  const min = sorted[0];
  const mid = sorted[1];
  const max = sorted[2];

  return 1.41 * min + 1.41 * (mid - min) + (max - mid);
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
  return getNeighbors2(bot.world, node, config, manager, bot);
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
