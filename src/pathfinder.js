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

/**
 * Generates a unique number-based hash for a DirectionalVec3.
 * Safe for use as Map/Set keys in A*.
 * @param {DirectionalVec3} node
 * @returns {string} Hash key (as string)
 */
function defaultHash(node) {
  const x = node.x | 0;
  const y = node.y | 0;
  const z = node.z | 0;
  const dx = node.dir?.x ?? 0;
  const dz = node.dir?.z ?? 0;

  // dir component mapped to 0..8
  const dirKey = (dx + 1) * 3 + (dz + 1); // -1,-1 → 0 | 0,0 → 4 | 1,1 → 8

  // Combine into a string key: "x,y,z,d"
  return `${x},${y},${z},${dirKey}`;
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
    this.direction = { x: 0, z: 0 };
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
  excludedPositions = [],
  debug = false
) {
  let end = endPos.clone();
  let startPos = start.floored().offset(0.5, 0, 0.5);

  excludedPositions = excludedPositions.map((pos) =>
    pos.floored().offset(0.5, 0, 0.5)
  );
  // console.log(start)

  const openList = new BinaryHeapOpenSet(compare);
  /**'
   * @type {Map<string, Cell>}
   */
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

  let processedAny = false;

  let iteration = 0;

  return new Promise(async (resolve) => {
    let startTime = performance.now();
    let lastSleep = performance.now();

    while (!openList.isEmpty()) {
      processedAny = false;
      iteration++;

      if (performance.now() - lastSleep >= 30) {
        // need to do this so the bot doesnt lag
        await new Promise((r) => setTimeout(r, 0));
        lastSleep = performance.now();
      }

      let currentNode = openList.pop();

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
          iterations: iteration,
        });
      }

      if (debug)
        bot.chat(
          `/particle dust{color:[0.38,0.21,0.51],scale:1} ${currentNode.worldPos.x} ${currentNode.worldPos.y} ${currentNode.worldPos.z} 0.1 0.1 0.1 1 4 force`
        );

      // bot.chat(
      //   `/particle dust 0.38 0.21 0.51 1 ${currentNode.worldPos.x} ${currentNode.worldPos.y} ${currentNode.worldPos.z} 0.1 0.1 0.1 1 10 force`
      // );

      openSet.delete(defaultHash(currentNode.worldPos));
      openList.remove(currentNode);
      closedSet.add(defaultHash(currentNode.worldPos));

      const neighbors = getNeighbors(currentNode, bot, config, nodemanager);

      let safeNeighbors = [];
      let riskyNeighbors = [];

      for (const neighborData of neighbors) {
        if (closedSet.has(defaultHash(neighborData))) {
          continue;
        }

        const distToGoal = neighborData.distanceTo(end);
        const nearGoal = distToGoal < 4;
        const isRisky = nearGoal && neighborData.cost > 5;

        if (isRisky) {
          riskyNeighbors.push(neighborData);
        } else {
          safeNeighbors.push(neighborData);
        }
      }

      for (const n of safeNeighbors) {
        // bot.chat(
        //   `/particle dust{color:[0.10,0.80,0.40],scale:1} ${n.x} ${n.y} ${n.z} 0.1 0.1 0.1 1 4 force`
        // );
        processNeighbor(currentNode, n);
      }

      // If we didn’t process anything, consider risky moves as fallback
      if (!processedAny) {
        for (const n of riskyNeighbors) {
          // Lower cost penalty to allow block placement as last resort
          if (n.place?.length) n.cost *= 0.6; // encourage fallback
          // bot.chat(
          //   `/particle dust{color:[0.53,0.15,0.10],scale:1} ${n.x} ${n.y} ${n.z} 0.1 0.1 0.1 1 4 force`
          // );
          processNeighbor(currentNode, n);
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
            bestNode: bestNode,
            exploredNodes: closedSet.size,
            remainingNodes: openList.size(),
            openMap: openSet,
            iterations: iteration,
          });
        } else {
          return resolve({
            path,
            status: "no path",
            exploredNodes: closedSet.size,
            remainingNodes: openList.size(),
            iterations: iteration,
          });
        }
      }
    }

    return resolve({
      path,
      status: "no path",
      exploredNodes: closedSet.size,
      remainingNodes: openList.size(),
      iterations: iteration,
    });
  });

  /**
   *
   * @param {Cell} currentNode
   * @param {DirectionalVec3} neighborData
   */
  function processNeighbor(currentNode, neighborData) {
    const tempG = currentNode.gCost + neighborData.cost;
    const hash = defaultHash(neighborData);
    let neighbor = openSet.get(hash);

    if (!neighbor) {
      neighbor = new Cell();
      neighbor.worldPos = new Vec3(
        neighborData.x,
        neighborData.y,
        neighborData.z
      );
      neighbor.direction = neighborData.dir;
      neighbor.gCost = tempG;
      neighbor.hCost = averageDist(neighborData, end);
      neighbor.fCost = computeScore(neighbor, end);
      neighbor.parent = currentNode;
      neighbor.moveName = neighborData.attributes.name;
      neighbor.attributes = neighborData.attributes;

      openSet.set(hash, neighbor);
      openList.push(neighbor);
      processedAny = true;
    } else if (tempG < neighbor.gCost) {
      neighbor.gCost = tempG;
      neighbor.hCost = averageDist(neighborData, end);
      neighbor.fCost = computeScore(neighbor, end);
      neighbor.parent = currentNode;
      neighbor.attributes = neighborData.attributes;
      openList.update(neighbor);
      processedAny = true;
    }
  }
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

  const distToGoal = node.worldPos.distanceTo(goal);
  const w = clamp(0.6 + distToGoal / 30, 0.6, 1.3);

  const directionPenalty = distToGoal > 2 ? (1 - dot) * 0.4 : 0;

  const riskyMovePenalty = distToGoal < 4 && node.attributes?.cost > 5 ? 3 : 0;
  const placedBlocks = node.attributes?.place?.length || 0;
  const scaffoldingPenalty = placedBlocks * 20;

  const maxFallBonus = -2;
  const fallingBonus =
    node.parent &&
    node.worldPos.y < node.parent.worldPos.y &&
    !node.attributes?.place?.length
      ? Math.max(
          maxFallBonus,
          -0.5 * (node.parent.worldPos.y - node.worldPos.y)
        )
      : 0;

  const explorationBonus = Math.sqrt(g) * 0.8;

  // Slight directional preference
  const dirBias = node.direction
    ? (node.direction.x * 17 + node.direction.z * 37) * 0.01
    : 0;

  // Randomness when far from goal
  const randomness = distToGoal > 6 ? (Math.random() - 0.5) * 0.4 : 0;

  // Optional: scale g cost weight down near goal
  const gWeight = distToGoal > 10 ? 1 : 0.7;

  let score = g * gWeight + w * h;
  score += directionPenalty;
  score += explorationBonus * 0.6;
  score += riskyMovePenalty;
  score += scaffoldingPenalty;
  score += fallingBonus;
  score += dirBias;
  score += randomness;

  return score;
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
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
