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
  let aPriority = a.fCost;
  let bPriority = b.fCost;

  // slight tie-breaker toward goal progress
  aPriority += a.hCost * 0.001;
  bPriority += b.hCost * 0.001;

  // small penalties (keep them tiny so they don’t overpower distance)
  const aBreaks = a.attributes?.break?.length || 0;
  const bBreaks = b.attributes?.break?.length || 0;
  const aPlaces = a.attributes?.place?.length || 0;
  const bPlaces = b.attributes?.place?.length || 0;

  aPriority += aBreaks * 0.5 + aPlaces * 0.5;
  bPriority += bBreaks * 0.5 + bPlaces * 0.5;

  // optional: small parkour bonus if it moves closer
  const aIsParkour =
    !!a.attributes?.parkour && a.parent && a.hCost < a.parent.hCost;
  const bIsParkour =
    !!b.attributes?.parkour && b.parent && b.hCost < b.parent.hCost;
  if (aIsParkour) aPriority -= 0.2;
  if (bIsParkour) bPriority -= 0.2;

  if (aPriority !== bPriority) return aPriority - bPriority;

  // tie-break on hCost (closer to goal wins)
  return a.hCost - b.hCost;
};

function posHash(node) {
  const x = node.x | 0;
  const y = node.y | 0;
  const z = node.z | 0;
  return `${x},${y},${z}`;
}

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
  excludedPositions = [],
  debug = false,
  searchController = null
) {
  const getEnd = () => goal.getPosition();

  let startPos = start.floored().offset(0.5, 0, 0.5);

  if (bot.blockAt(startPos).name === "farmland")
    startPos = startPos.offset(0, 1, 0);

  excludedPositions = excludedPositions.map((pos) =>
    pos.floored().offset(0.5, 0, 0.5)
  );

  const openList = new BinaryHeapOpenSet(compare);
  const openSet = new Map();
  const closedSet = new Set();
  const nodemanager = new NodeManager();

  // Mark excluded positions early
  nodemanager.markNodes(excludedPositions, "areaMarked");

  const startNode = new Cell(startPos);
  startNode.gCost = 0;
  startNode.hCost = hCost1(startPos, getEnd());
  startNode.fCost = startNode.gCost + startNode.hCost;
  startNode.virtualBlocks = new Map([]);

  openList.push(startNode);
  openSet.set(defaultHash(startPos), startNode);

  let bestNode = null;
  let bestScore = Infinity;
  let processedAny = false;
  let iteration = 0;

  if (searchController) {
    searchController.openSet = openSet;
    searchController.openList = openList;
    searchController.nodemanager = nodemanager;
    searchController.active = true;

    // apply a virtual state to all current cells in openSet
    searchController.applyVirtual = (posKey, state) => {
      for (const cell of openSet.values()) {
        cell.virtualBlocks = cell.virtualBlocks || new Map();
        cell.virtualBlocks.set(posKey, state);
      }
    };

    // prune function (calls pruneOpenSet defined below)
    searchController.prunedHashes = new Set();

    searchController.prune = (positions) => {
      // positions is array of Vec3
      for (const pos of positions) {
        searchController.prunedHashes.add(defaultHash(pos));
      }
    };
  }

  return new Promise(async (resolve) => {
    let startTime = performance.now();
    let lastSleep = performance.now();

    while (!openList.isEmpty()) {
      processedAny = false;
      iteration++;

      if (performance.now() - lastSleep >= 30) {
        await new Promise((r) => setTimeout(r, 0));
        lastSleep = performance.now();
      }

      let currentNode;
      do {
        currentNode = openList.pop();
      } while (
        currentNode &&
        searchController?.prunedHashes.has(defaultHash(currentNode.worldPos))
      );

      if (!currentNode) break; // heap empty after pruning skips

      // MARK broken and placed nodes ASAP before neighbor gen
      // if (currentNode.attributes.break?.length) {
      //   nodemanager.markNodes(currentNode.attributes.break, "broken");
      //   if (debug)
      //     console.log(
      //       "Marked broken nodes:",
      //       currentNode.attributes.break.map((n) => n.toString())
      //     );
      // }

      // if (currentNode.attributes.place?.length) {
      //   nodemanager.markNodes(currentNode.attributes.place, "placed");
      //   if (debug)
      //     console.log(
      //       "Marked placed nodes:",
      //       currentNode.attributes.place.map((n) => n.toString())
      //     );
      // }

      if (debug) {
        const distToGoal = currentNode.worldPos.distanceTo(endPos);
        const focusPhase = Math.min(1, Math.max(0, 1 - distToGoal / 15));

        // Log the key factors for the node being processed
        // console.log(
        //   `Node: ${currentNode.worldPos.toString()} | ` +
        //     `Dist: ${distToGoal.toFixed(1)} | ` +
        //     `Focus: ${focusPhase.toFixed(2)}`
        // );

        // Optional: show exploration vs focus with colored particles
        const color =
          focusPhase < 0.5
            ? "0.0,0.6,1.0" // blue = exploring
            : "0.6,1.0,0.0"; // green = focusing

        bot.chat(
          `/particle dust{color:[${color}],scale:1} ` +
            `${currentNode.worldPos.x} ${currentNode.worldPos.y} ${currentNode.worldPos.z} 0.1 0.1 0.1 1 4 force`
        );
      }

      // Now neighbors get generated with fresh nodemanager state
      let neighbors = getNeighbors2(currentNode, config, nodemanager, bot);

      openSet.delete(defaultHash(currentNode.worldPos));
      openList.remove(currentNode);

      closedSet.add(defaultHash(currentNode.worldPos));

      // Track best node for partial path returns
      const h = hCost1(currentNode.worldPos, getEnd());
      const fromStart = currentNode.worldPos.distanceTo(startPos);
      if (
        h < bestScore ||
        (h === bestScore && fromStart > bestNode?.worldPos.distanceTo(startPos))
      ) {
        bestNode = currentNode;
        bestScore = h;
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
          openMap: openSet,
          iterations: iteration,
        });
      }

      if (debug)
        bot.chat(
          `/particle dust{color:[0.38,0.21,0.51],scale:1} ${currentNode.worldPos.x} ${currentNode.worldPos.y} ${currentNode.worldPos.z} 0.1 0.1 0.1 1 4 force`
        );

      for (const n of neighbors) {
        if (closedSet.has(defaultHash(n))) continue;

        processNeighbor(currentNode, n);
      }

      let currentTime = performance.now();
      if (currentTime - startTime >= config.thinkTimeout) {
        // Timeout: return partial path
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
            remainingNodes: openList.size(),
            openMap: openSet,
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
            remainingNodes: openList.size(),
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
      path: [],
      status: "no path",
      exploredNodes: closedSet.size,
      remainingNodes: openList.size(),
      iterations: iteration,
    });
  });

  function processNeighbor(currentNode, neighborData) {
    // Always clone parent's overlay for safety
    const overlay = new Map(currentNode.virtualBlocks || []);

    // Apply this neighbor's planned changes
    for (const b of neighborData.attributes.break || []) {
      overlay.set(b.toString(), "air");
    }
    for (const p of neighborData.attributes.place || []) {
      overlay.set(p.toString(), "placed");
    }

    if (neighborData.attributes && neighborData.attributes.name) {
      const feet = new Vec3(neighborData.x, neighborData.y, neighborData.z);
      const below = feet.offset(0, -1, 0);
      if (overlay.get(below.toString()) === "air") {
        // force it to stay "air" instead of real block
        overlay.set(below.toString(), "air");
      }
    }

    neighborData.virtualBlocks = overlay;

    let tempG = currentNode.gCost + neighborData.cost;
    applyHazardPenalty(neighborData, bot);
    tempG = currentNode.gCost + neighborData.cost;

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
      neighbor.hCost = hCost1(neighborData, getEnd());
      neighbor.fCost = computeScore(neighbor, getEnd(), startPos);
      neighbor.parent = currentNode;
      neighbor.moveName = neighborData.attributes.name;
      neighbor.attributes = neighborData.attributes;
      neighbor.virtualBlocks = neighborData.virtualBlocks;

      openSet.set(hash, neighbor);
      openList.push(neighbor);
      processedAny = true;
    } else if (tempG < neighbor.gCost) {
      neighbor.gCost = tempG;
      neighbor.hCost = hCost1(neighborData, getEnd());
      neighbor.fCost = computeScore(neighbor, getEnd(), startPos);
      neighbor.parent = currentNode;
      neighbor.virtualBlocks = neighborData.virtualBlocks;
      openList.update(neighbor);
      processedAny = true;
    }
  }
}

function getProximityPenalty(pos, bot, blockName, maxRadius, maxPenalty) {
  // Scan within radius and return the highest penalty based on distance
  let highestPenalty = 0;
  for (let dx = -maxRadius; dx <= maxRadius; dx++) {
    for (let dy = -maxRadius; dy <= maxRadius; dy++) {
      for (let dz = -maxRadius; dz <= maxRadius; dz++) {
        const checkPos = pos.offset(dx, dy, dz);
        const block = bot.blockAt(checkPos);
        if (!block || block.name !== blockName) continue;

        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const penalty = Math.max(0, maxPenalty * (1 - distance / maxRadius));
        if (penalty > highestPenalty) highestPenalty = penalty;
      }
    }
  }
  return highestPenalty;
}

/**
 *
 * @param {DirectionalVec3} neighborData
 * @param {import("mineflayer").Bot} bot
 */
function applyHazardPenalty(neighborData, bot) {
  const pos = new Vec3(neighborData.x, neighborData.y, neighborData.z);

  // Lava penalty: stronger when closer
  const lavaPenalty = getProximityPenalty(pos, bot, "lava", 2, 8);
  neighborData.cost += lavaPenalty;

  // Cactus penalty: stronger when closer
  const cactusPenalty = getProximityPenalty(pos, bot, "cactus", 2, 4);
  neighborData.cost += cactusPenalty;
}

/**
 *
 * @param {Cell} node
 * @param {Vec3} goal
 * @param {Vec3} startPos
 * @returns
 */
function computeScore(node, goal) {
  const g = node.gCost;
  const h = hCost1(node.worldPos, goal);

  // Add small directional bias (toward goal)
  const toGoal = goal.minus(node.worldPos).normalize();
  const parentDir = node.parent
    ? node.worldPos.minus(node.parent.worldPos).normalize()
    : toGoal;
  const alignment = toGoal.dot(parentDir);

  // Mild directional bonus
  const dirBonus = 1 - alignment * 0.1;

  // Block break penalty (keep it simple)
  const breakCount = node.attributes?.break?.length || 0;
  const breakPenalty = breakCount * 1.5;

  // Final score
  return g + h * dirBonus + breakPenalty;
}

function hCost1(node, goal) {
  const dx = Math.abs(goal.x - node.x);
  const dy = Math.abs(goal.y - node.y);
  const dz = Math.abs(goal.z - node.z);

  const [min, mid, max] = [dx, dy, dz].sort((a, b) => a - b);

  const diag3Cost = Math.sqrt(3);
  const diag2Cost = Math.SQRT2;

  let h = diag3Cost * min + diag2Cost * (mid - min) + (max - mid);

  // tiny bias: prefer nodes that aren’t “directly under” the goal
  // h += (dx + dz) * 0.05;

  return h;
}

function averageDistance(node, goal) {
  const verticalGap = Math.abs(goal.y - node.y);
  const PUSH_FACTOR = verticalGap > 4 ? 1.8 : 1.3;

  const m = manhattanDistance(node, goal, PUSH_FACTOR);
  const o = octileDistance(node, goal, PUSH_FACTOR);

  const verticalReward =
    verticalGap > 1 ? Math.max(0, 6 - verticalGap) * 0.1 : 0;

  const distXZ = node.offset(0, -Math.abs(node.y - goal.y), 0).distanceTo(goal);
  const climbingPenalty =
    node.y > goal.y && node.y - goal.y > 2 && distXZ < 4 ? 0.4 : 0;

  const steepPenalty = goal.y < node.y && node.y - goal.y > 3 ? 0.5 : 0;

  return (m + o) / 2 + verticalReward + climbingPenalty + steepPenalty;
}

function manhattanDistance(node, goal, push = 1.3) {
  const dx = Math.abs(node.x - goal.x);
  const dy = Math.abs(node.y - goal.y);
  const dz = Math.abs(node.z - goal.z);
  return dx + dz + dy * push;
}

function octileDistance(node, goal, push = 1.3) {
  const dx = Math.abs(goal.x - node.x);
  const dy = Math.abs(goal.y - node.y) * push;
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
