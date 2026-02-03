const { Vec3 } = require("vec3");
const { getNeighbors2, DirectionalVec3, Vec3WithAttr } = require("./movement");
const { BinarySearchTree, MinHeap, BinaryHeapOpenSet } = require("./heap");
const blockMapCost = require("./blockmap");

const PUSH_FACTOR = 0.5;

// const sleep = (ms = 2000) => {
//   return new Promise((r) => {
//     setTimeout(r, ms);
//   });
// };

const compare = (a, b) => {
  let aPriority = a.fCost;
  let bPriority = b.fCost;

  // Tie-breaker toward goal progress
  if (Math.abs(aPriority - bPriority) < 0.01) {
    return a.hCost - b.hCost; // Prefer closer to goal
  }

  return aPriority - bPriority;
};

function posHash(node) {
  const x = Math.round(node.x * 2) / 2;
  const y = Math.round(node.y);
  const z = Math.round(node.z * 2) / 2;
  return `${x},${y},${z}`;
}

/**
 * Generates a unique number-based hash for a Vec3WithAttr.
 * @param {Vec3WithAttr} node
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
    this.markedNodes = new Map(); // posHash -> attribute
  }

  markNode(node, attribute) {
    this.markedNodes.set(posHash(node), attribute);
  }

  markNodes(nodes, attribute) {
    for (const node of nodes) {
      this.markNode(node, attribute);
    }
  }

  unmarkNode(node) {
    this.markedNodes.delete(posHash(node));
  }

  isNodeMarked(node) {
    return this.markedNodes.has(posHash(node));
  }

  getNodeAttribute(node) {
    return this.markedNodes.get(posHash(node));
  }

  isNodeBroken(node) {
    return this.getNodeAttribute(node) === "broken";
  }

  isNodePlaced(node) {
    return this.getNodeAttribute(node) === "placed";
  }

  isAreaMarkedNode(node) {
    return this.getNodeAttribute(node) === "areaMarked";
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
  goal,
  bot,
  endFunc,
  config,
  options = {},
  debug = false,
  searchController = null,
) {
  const getEnd = () => goal.getPosition();

  let startPos = start.floored().offset(0.5, 0, 0.5);

  if (
    bot.blockAt(startPos).name === "farmland" ||
    bot.blockAt(startPos).name.includes("chest")
  )
    startPos = startPos.offset(0, 1, 0);

  let excludedPositions =
    options && options.excludedPositions !== null
      ? options.excludedPositions.map((pos) =>
          pos.floored().offset(0.5, 0, 0.5),
        )
      : [];

  const openMap = new Map(); // posHash -> Cell
  const closedSet = new Set(); // posHash
  const nodemanager = new NodeManager();

  // Mark excluded positions early
  nodemanager.markNodes(excludedPositions, "areaMarked");

  const startNode = new Cell(startPos);
  startNode.gCost = 0;
  startNode.hCost = hCost1(startPos, getEnd());
  startNode.fCost = startNode.gCost + startNode.hCost;
  startNode.virtualBlocks = new Map();
  startNode.scaffoldingUsed = 0;

  openMap.set(posHash(startPos), startNode);

  const openHeap = new MinHeap(compare);
  openHeap.push(startNode);

  let bestNode = null;
  let bestScore = Infinity;
  let iteration = 0;
  const visitedChunks = new Set(); // "cx,cz" of every chunk expanded

  if (searchController) {
    searchController.openMap = openMap;
    searchController.nodemanager = nodemanager;
    searchController.active = true;

    searchController.applyVirtual = (posKey, state) => {
      for (const cell of openMap.values()) {
        cell.virtualBlocks = cell.virtualBlocks || new Map();
        cell.virtualBlocks.set(posKey, state);
      }
    };

    searchController.prunedHashes = new Set();
    searchController.prune = (positions) => {
      for (const pos of positions) {
        searchController.prunedHashes.add(posHash(pos));
      }
    };
  }

  const end = getEnd();

  return new Promise(async (resolve) => {
    let startTime = performance.now();
    let lastSleep = performance.now();

    while (openHeap.size() > 0) {
      iteration++;

      if (performance.now() - lastSleep >= 30) {
        await new Promise((r) => setTimeout(r, 0));
        lastSleep = performance.now();
      }

      let currentNode = null;
      while (true) {
        const popped = openHeap.pop();
        if (!popped) break;
        const poppedHash = posHash(popped.worldPos);
        // If the popped node is still present in openMap and matches the same object,
        // it's valid. Otherwise it's stale (either already processed or replaced).
        const mapNode = openMap.get(poppedHash);
        if (mapNode && mapNode === popped) {
          currentNode = popped;
          break;
        }
        // else, stale entry — continue popping
      }

      if (!currentNode) break;

      // console.log(currentNode);

      const currentHash = posHash(currentNode.worldPos);
      // remove from open set and move to closed
      openMap.delete(currentHash);
      closedSet.add(currentHash);
      visitedChunks.add(
        `${currentNode.worldPos.x >> 4},${currentNode.worldPos.z >> 4}`,
      );

      if (debug) {
        const distToGoal = currentNode.worldPos.distanceTo(endPos);
        const focusPhase = Math.min(1, Math.max(0, 1 - distToGoal / 15));

        const color =
          focusPhase < 0.5
            ? "0.0,0.6,1.0" // blue = exploring
            : "0.6,1.0,0.0"; // green = focusing

        bot.chat(
          `/particle dust{color:[${color}],scale:1} ` +
            `${currentNode.worldPos.x} ${currentNode.worldPos.y} ${currentNode.worldPos.z} 0.1 0.1 0.1 1 4 force`,
        );
      }

      // Check if reached destination
      if (endFunc(currentNode.worldPos)) {
        if (searchController) {
          searchController.active = false;
        }

        return resolve({
          path: reconstructPath(currentNode),
          cost: currentNode.fCost,
          status: "found",
          openMap: openMap,
          visitedChunks,
          iterations: iteration,
        });
      }

      let neighbors = getNeighbors2(
        currentNode,
        config,
        nodemanager,
        bot,
        getEnd(),
      );

      // console.log(neighbors)
      const distFromStart = currentNode.worldPos.distanceTo(startPos);

      const h = hCost1(currentNode.worldPos, getEnd());
      if (
        h < bestScore ||
        (h === bestScore &&
          distFromStart > bestNode?.worldPos.distanceTo(startPos))
      ) {
        bestNode = currentNode;
        bestScore = h;
      }

      if (debug)
        bot.chat(
          `/particle dust{color:[0.38,0.21,0.51],scale:1} ${currentNode.worldPos.x} ${currentNode.worldPos.y} ${currentNode.worldPos.z} 0.1 0.1 0.1 1 4 force`,
        );

      for (const n of neighbors) {
        const nHash = posHash(n);

        if (closedSet.has(nHash)) {
          continue;
        }
        processNeighbor(currentNode, n);
      }

      let currentTime = performance.now();
      if (currentTime - startTime >= config.thinkTimeout) {
        if (bestNode) {
          if (searchController) {
            searchController.active = false;
          }
          return resolve({
            path: reconstructPath(bestNode),
            status: "partial",
            cost: bestNode.fCost,
            bestNode: bestNode,
            exploredNodes: closedSet.size,
            remainingNodes: openMap.size,
            openMap: openMap,
            visitedChunks,
            iterations: iteration,
          });
        } else {
          if (searchController) {
            searchController.active = false;
          }
          return resolve({
            path: [],
            status: "no path",
            exploredNodes: closedSet.size,
            remainingNodes: openMap.size,
            visitedChunks,
            iterations: iteration,
          });
        }
      }
    }

    if (searchController) {
      searchController.active = false;
    }

    // No path found
    return resolve({
      path: bestNode !== null ? reconstructPath(bestNode) : [],
      status: "no path",
      exploredNodes: closedSet.size,
      remainingNodes: openMap.size,
      visitedChunks,
      iterations: iteration,
    });
  });

  function processNeighbor(currentNode, neighborData) {
    const hash = posHash(neighborData);

    const placesInMove = neighborData.attributes?.place?.length || 0;
    const totalScaffoldingUsed = currentNode.scaffoldingUsed + placesInMove;

    let neighborCost = neighborData.cost;

    // const distToGoal = neighborData.worldPos
    //   ? neighborData.worldPos.distanceTo(end)
    //   : new Vec3(neighborData.x, neighborData.y, neighborData.z).distanceTo(
    //       end
    //     );

    // const BIAS_RADIUS = 10;
    // if (distToGoal < BIAS_RADIUS) {
    //   const t = distToGoal / BIAS_RADIUS;
    //   const biasMultiplier = 0.5 + 0.5 * t; // ranges [0.5 .. 1]
    //   neighborCost *= biasMultiplier;
    // }

    const tempG = currentNode.gCost + neighborCost;

    let neighbor = openMap.get(hash);

    if (!neighbor) {
      neighbor = new Cell();
      neighbor.worldPos = new Vec3(
        neighborData.x,
        neighborData.y,
        neighborData.z,
      );
      neighbor.direction = neighborData.dir;
      neighbor.gCost = tempG;
      neighbor.hCost = hCost1(neighbor.worldPos, end);
      neighbor.fCost = computeScore(neighbor, end, startPos);
      neighbor.parent = currentNode;
      neighbor.moveName = neighborData.attributes.name;
      neighbor.attributes = neighborData.attributes;
      neighbor.virtualBlocks = neighborData.virtualBlocks;
      neighbor.scaffoldingUsed = totalScaffoldingUsed;

      openMap.set(hash, neighbor);
      openHeap.push(neighbor);
    } else if (tempG < neighbor.gCost) {
      neighbor.gCost = tempG;
      neighbor.hCost = hCost1(neighbor.worldPos, end);
      neighbor.fCost = computeScore(neighbor, end, startPos);
      neighbor.parent = currentNode;
      neighbor.moveName = neighborData.attributes.name;
      neighbor.attributes = neighborData.attributes;
      neighbor.virtualBlocks = neighborData.virtualBlocks;
      neighbor.scaffoldingUsed = totalScaffoldingUsed;

      openHeap.push(neighbor);
    }
  }
}

/**
 *
 * @param {Cell} node
 * @param {Vec3} goal
 * @param {Vec3} startPos
 * @returns
 */
function computeScore(node, goal, startPos) {
  const g = node.gCost;
  const h = node.hCost;

  return g + h;
}

function hCost1(a, b) {
  // const dx = Math.abs(b.x - a.x);
  // const dz = Math.abs(b.z - a.z);
  // const dy = Math.abs(b.y - a.y);

  // const diag = Math.min(dx, dz);
  // const straight = Math.max(dx, dz) - diag;
  // const horizontalCost = diag * Math.SQRT2 + straight;

  // const base = horizontalCost + dy;

  return manhattanDistance(a, b);
}

function chebyshev(a, b) {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  const dz = Math.abs(b.z - a.z);

  // sort differences to easily pick min/mid/max
  const [dmin, dmid, dmax] = [dx, dy, dz].sort((x, y) => x - y);

  const cost1 = 1; // straight move
  const cost2 = Math.SQRT2; // 2-axis diagonal
  const cost3 = Math.sqrt(3); // 3-axis diagonal

  return (
    cost3 * dmin + // moves that go diagonally in x,y,z
    cost2 * (dmid - dmin) + // moves that go diagonally in 2 axes
    cost1 * (dmax - dmid) // moves that go straight
  );
}

function manhattanDistance(node, goal) {
  const dx = Math.abs(node.x - goal.x);
  const dy = Math.abs(node.y - goal.y);
  const dz = Math.abs(node.z - goal.z);
  return dx + dz + dy * 0.95;
}

function octileDistance(node, goal) {
  const dx = Math.abs(goal.x - node.x);
  const dy = Math.abs(goal.y - node.y);
  const dz = Math.abs(goal.z - node.z);

  const sorted = [dx, dy, dz].sort((a, b) => a - b);
  const min = sorted[0];
  const mid = sorted[1];
  const max = sorted[2];

  return 1.41 * min + 1.41 * (mid - min) + (max - mid);
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function euclideanDistance(node, goal) {
  const dx = Math.abs(goal.x - node.x);
  const dy = Math.abs(goal.y - node.y);
  const dz = Math.abs(goal.z - node.z);

  const horizontalDistance = Math.sqrt(dx * dx + dz * dz);
  const verticalDistance = dy;

  return horizontalDistance + verticalDistance;
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
module.exports = {
  Astar,
  Cell,
  defaultHash,
  reconstructPath,
  manhattanDistance,
  euclideanDistance,
};
