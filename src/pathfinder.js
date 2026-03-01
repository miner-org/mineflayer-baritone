const { Vec3 } = require("vec3");
const { getNeighbors2 } = require("./movement");
const { MinHeap } = require("./heap");

const H_TIE_EPSILON = 0.1;

/**
 * @param {{ x: number, y: number, z: number }} node
 * @returns {string}
 */
function posHash(node) {
  const x = Math.round(node.x * 2);
  const y = Math.round(node.y);
  const z = Math.round(node.z * 2);
  return `${x},${y},${z}`;
}
/**
 * @param {{ x: number, y: number, z: number, dir?: { x: number, z: number } }} node
 * @returns {string}
 */
function defaultHash(node) {
  const x = node.x | 0;
  const y = node.y | 0;
  const z = node.z | 0;
  const dx = node.dir?.x ?? 0;
  const dz = node.dir?.z ?? 0;
  // Map dir component (-1..1) to 0..2, then encode as a single digit 0..8
  const dirKey = (dx + 1) * 3 + (dz + 1);
  return `${x},${y},${z},${dirKey}`;
}

class NodeManager {
  constructor() {
    /** @type {Map<string, string>} posHash → attribute */
    this.markedNodes = new Map();
  }

  /** @param {{ x:number, y:number, z:number }} node @param {string} attribute */
  markNode(node, attribute) {
    this.markedNodes.set(posHash(node), attribute);
  }

  /** @param {Array<{ x:number, y:number, z:number }>} nodes @param {string} attribute */
  markNodes(nodes, attribute) {
    for (const node of nodes) this.markNode(node, attribute);
  }

  /** @param {{ x:number, y:number, z:number }} node */
  unmarkNode(node) {
    this.markedNodes.delete(posHash(node));
  }

  /** @param {{ x:number, y:number, z:number }} node @returns {boolean} */
  isNodeMarked(node) {
    return this.markedNodes.has(posHash(node));
  }

  /** @param {{ x:number, y:number, z:number }} node @returns {string | undefined} */
  getNodeAttribute(node) {
    return this.markedNodes.get(posHash(node));
  }

  /** @param {{ x:number, y:number, z:number }} node @returns {boolean} */
  isNodeBroken(node) {
    return this.getNodeAttribute(node) === "broken";
  }

  /** @param {{ x:number, y:number, z:number }} node @returns {boolean} */
  isNodePlaced(node) {
    return this.getNodeAttribute(node) === "placed";
  }

  /** @param {{ x:number, y:number, z:number }} node @returns {boolean} */
  isAreaMarkedNode(node) {
    return this.getNodeAttribute(node) === "areaMarked";
  }
}

class Cell {
  /**
   * @param {Vec3 | null} [worldPos]
   * @param {number} [cost=0]
   */
  constructor(worldPos, cost = 0) {
    /** @type {Vec3 | null} */
    this.worldPos = worldPos ?? null;
    this.direction = { x: 0, z: 0 };
    this.gCost = 0;
    this.hCost = 0;
    this.fCost = 0;
    /** @type {number} */
    this.cost = cost;
    /** @type {Cell | null} */
    this.parent = null;
    /** @type {Object} */
    this.attributes = {};
    /**
     * Name of the move class that produced this node.
     * @type {string}
     */
    this.moveName = "";
  }

  /**
   * @param {Vec3} offset
   * @returns {Cell}
   */
  add(offset) {
    return new Cell(this.worldPos.add(offset), this.cost);
  }

  /**
   * @param {Cell} other
   * @returns {boolean}
   */
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

/**
 * @param {{ x:number, y:number, z:number }} a
 * @param {{ x:number, y:number, z:number }} b
 * @returns {number}
 */
function manhattanDistance(a, b) {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  const dz = Math.abs(a.z - b.z);
  return dx + dz + dy * 0.95;
}

/**
 * @param {{ x:number, y:number, z:number }} a
 * @param {{ x:number, y:number, z:number }} b
 * @returns {number}
 */
function euclideanDistance(a, b) {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  const dz = Math.abs(a.z - b.z);
  return Math.sqrt(dx * dx + dz * dz) + 1.5 * dy;
}

function someHcost(a, b) {
  const dx = Math.abs(a.x - b.x);
  const dv = Math.abs(a.y - b.y);
  const dz = Math.abs(a.z - b.z);

  const costXYZ = Math.sqrt(1 + 1 + 1.5 ** 2);
  const costXZ = Math.SQRT2;
  const costV = 1.5;

  const flatDiag = Math.min(dx, dz);
  const flatRem = Math.max(dx, dz) - flatDiag;

  const combined = Math.min(flatDiag, dv);
  const diagOnly = flatDiag - combined;
  const vertRem = dv - combined;

  return combined * costXYZ + diagOnly * costXZ + flatRem * 1 + vertRem * costV;
}

/**
 * @param {{ x:number, y:number, z:number }} a
 * @param {{ x:number, y:number, z:number }} b
 * @returns {number}
 */
function hCost(a, b) {
  // return manhattanDistance(a, b);
  return someHcost(a, b);
  // return manhattanDistance(a, b) * 1.5;
}

/**
 * @param {Cell} a
 * @param {Cell} b
 * @returns {number}
 */
function compare(a, b) {
  if (Math.abs(a.fCost - b.fCost) <= H_TIE_EPSILON) {
    return a.hCost - b.hCost;
  }
  return a.fCost - b.fCost;
}

/**
 * @param {Cell} node
 * @returns {Cell[]}
 */
function reconstructPath(node) {
  const path = [];
  while (node) {
    path.push(node);
    node = node.parent;
  }
  path.reverse();
  return path;
}

/**
 * @param {Vec3} start - Bot's current world position
 * @param {Vec3} endPos - Resolved goal position (used for heuristic)
 * @param {import("./goal").Goal} goal - Goal object
 * @param {import("mineflayer").Bot} bot
 * @param {(pos: Vec3) => boolean} endFunc - Returns true when a position satisfies the goal
 * @param {object} config - AshFinderConfig instance
 * @param {{ excludedPositions?: Vec3[] }} [options={}]
 * @param {boolean} [debug=false]
 * @param {object | null} [searchController=null]
 * @returns {Promise<{
 *   path: Cell[],
 *   status: "found" | "partial" | "no path",
 *   cost: number,
 *   visitedChunks: Set<string>,
 *   iterations: number,
 *   exploredNodes?: number,
 *   remainingNodes?: number,
 * }>}
 */
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
  let startPos = start.floored().offset(0.5, 0, 0.5);

  const startBlock = bot.blockAt(startPos);
  if (
    startBlock?.name === "farmland" ||
    startBlock?.name.includes("chest") ||
    startBlock?.name.includes("slab")
  ) {
    startPos = startPos.offset(0, 1, 0);
  }

  const excludedPositions = (options?.excludedPositions ?? []).map((pos) =>
    pos.floored().offset(0.5, 0, 0.5),
  );

  /** @type {Map<string, Cell>} posHash → Cell */
  const openMap = new Map();
  /** @type {Set<string>} */
  const closedSet = new Set();
  const closedNodes = new Map();
  const nodemanager = new NodeManager();

  nodemanager.markNodes(excludedPositions, "areaMarked");

  const startNode = new Cell(startPos);
  startNode.gCost = 0;
  startNode.hCost = hCost(startPos, endPos);
  startNode.fCost = startNode.gCost + startNode.hCost;
  startNode.virtualBlocks = new Map();
  startNode.scaffoldingUsed = 0;

  const startHash = posHash(startPos);
  openMap.set(startHash, startNode);

  const openHeap = new MinHeap(compare);
  openHeap.push(startNode);

  /** Best node encountered so far (smallest hCost), used for partial paths. */
  let bestNode = null;
  let bestScore = Infinity;

  let iteration = 0;
  /** "cx,cz" keys for every chunk that was expanded during this search. */
  const visitedChunks = new Set();

  if (searchController) {
    searchController.openMap = openMap;
    searchController.nodemanager = nodemanager;
    searchController.active = true;
    searchController.prunedHashes = new Set();

    searchController.applyVirtual = (posKey, state) => {
      for (const cell of openMap.values()) {
        cell.virtualBlocks = cell.virtualBlocks || new Map();
        cell.virtualBlocks.set(posKey, state);
      }
    };

    searchController.prune = (positions) => {
      for (const pos of positions) {
        searchController.prunedHashes.add(posHash(pos));
      }
    };
  }

  // if (options.warmNodes) {
  //   for (const [hash, nodeData] of options.warmNodes) {
  //     if (!closedSet.has(hash)) {
  //       const cell = new Cell(nodeData.worldPos, nodeData.cost);
  //       cell.gCost = nodeData.gCost;
  //       cell.hCost = hCost(nodeData.worldPos, endPos);
  //       cell.fCost = cell.gCost + cell.hCost;
  //       openMap.set(hash, cell);
  //       openHeap.push(cell);
  //     }
  //   }
  // }

  const startTime = performance.now();
  let lastYield = performance.now();

  return new Promise(async (resolve) => {
    while (openHeap.size() > 0) {
      iteration++;

      if (performance.now() - lastYield >= 5) {
        await new Promise((r) => setTimeout(r, 0));
        lastYield = performance.now();
      }

      // Pop the lowest-f node, discarding stale heap entries.
      let currentNode = null;
      while (true) {
        const popped = openHeap.pop();
        if (!popped) break;
        const poppedHash = posHash(popped.worldPos);
        if (openMap.get(poppedHash) === popped) {
          currentNode = popped;
          break;
        }
        // Stale entry — skip.
      }

      if (!currentNode) break;

      const currentHash = posHash(currentNode.worldPos);
      openMap.delete(currentHash);
      closedSet.add(currentHash);
      closedNodes.set(currentHash, currentNode);
      visitedChunks.add(
        `${currentNode.worldPos.x >> 4},${currentNode.worldPos.z >> 4}`,
      );

      if (debug) {
        const distToGoal = currentNode.worldPos.distanceTo(endPos);
        const focusPhase = Math.min(1, Math.max(0, 1 - distToGoal / 15));
        const color = focusPhase < 0.5 ? "0.0,0.6,1.0" : "0.6,1.0,0.0";

        bot.chat(
          `/particle dust{color:[${color}],scale:1} ` +
            `${currentNode.worldPos.x} ${currentNode.worldPos.y} ${currentNode.worldPos.z} 0.1 0.1 0.1 1 4 force`,
        );
      }

      if (endFunc(currentNode.worldPos)) {
        if (searchController) searchController.active = false;
        return resolve({
          path: reconstructPath(currentNode),
          cost: currentNode.fCost,
          status: "found",
          openMap,
          visitedChunks,
          closedNodes,
          iterations: iteration,
        });
      }

      // Track best partial candidate.
      const h = hCost(currentNode.worldPos, endPos);
      if (h < bestScore) {
        bestNode = currentNode;
        bestScore = h;
      }

      const neighbors = getNeighbors2(
        currentNode,
        config,
        nodemanager,
        bot,
        endPos,
      );

      for (const n of neighbors) {
        const nHash = posHash(n);
        if (closedSet.has(nHash)) continue;
        _processNeighbor(currentNode, n, openMap, openHeap, endPos, startPos);
      }

      if (performance.now() - startTime >= config.thinkTimeout) {
        if (searchController) searchController.active = false;

        if (bestNode) {
          return resolve({
            path: reconstructPath(bestNode),
            status: "partial",
            cost: bestNode.fCost,
            bestNode,
            exploredNodes: closedSet.size,
            remainingNodes: openMap.size,
            openMap,
            visitedChunks,
            iterations: iteration,
          });
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

    if (searchController) searchController.active = false;

    return resolve({
      path: bestNode ? reconstructPath(bestNode) : [],
      status: "no path",
      exploredNodes: closedSet.size,
      remainingNodes: openMap.size,
      visitedChunks,
      iterations: iteration,
    });
  });
}

/**
 * @param {Cell} currentNode
 * @param {object} neighborData - Raw neighbour data from getNeighbors2
 * @param {Map<string, Cell>} openMap
 * @param {MinHeap} openHeap
 * @param {Vec3} end - Goal position (for heuristic)
 * @param {Vec3} startPos
 */
function _processNeighbor(
  currentNode,
  neighborData,
  openMap,
  openHeap,
  end,
  startPos,
) {
  const hash = posHash(neighborData);

  const placesInMove = neighborData.attributes?.place?.length ?? 0;
  const totalScaffoldingUsed = currentNode.scaffoldingUsed + placesInMove;

  const baseMoveCost = neighborData.cost;

  // const currentH = currentNode.hCost;
  // const nextH = hCost(
  //   { x: neighborData.x, y: neighborData.y, z: neighborData.z },
  //   end,
  // );

  // const lambda = 0.15;

  // const awayPenalty = Math.max(0, nextH - currentH) * lambda;

  // const tempG = currentNode.gCost + baseMoveCost + awayPenalty;
  const tempG = currentNode.gCost + baseMoveCost;

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
    neighbor.hCost = hCost(neighbor.worldPos, end);
    neighbor.fCost = neighbor.gCost + neighbor.hCost;
    neighbor.parent = currentNode;
    neighbor.moveName = neighborData.attributes.name;
    neighbor.attributes = neighborData.attributes;
    neighbor.virtualBlocks = neighborData.virtualBlocks;
    neighbor.scaffoldingUsed = totalScaffoldingUsed;

    openMap.set(hash, neighbor);
    openHeap.push(neighbor);
  } else if (tempG < neighbor.gCost) {
    // Cheaper route found
    neighbor.gCost = tempG;
    neighbor.hCost = hCost(neighbor.worldPos, end);
    neighbor.fCost = neighbor.gCost + neighbor.hCost;
    neighbor.parent = currentNode;
    neighbor.moveName = neighborData.attributes.name;
    neighbor.attributes = neighborData.attributes;
    neighbor.virtualBlocks = neighborData.virtualBlocks;
    neighbor.scaffoldingUsed = totalScaffoldingUsed;

    openHeap.push(neighbor);
  }
}

module.exports = {
  Astar,
  Cell,
  NodeManager,
  defaultHash,
  posHash,
  reconstructPath,
  manhattanDistance,
  euclideanDistance,
  hCost,
};
