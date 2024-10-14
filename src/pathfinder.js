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

  add(offset) {
    return new Cell(this.worldPos.add(offset), this.cost);
  }
}

class Goal {
  constructor(worldPos) {
    this.worldPos = worldPos;
    this.x = worldPos.x;
    this.y = worldPos.y;
    this.z = worldPos.z;
  }

  equals(goal) {
    return (
      this.x === goal.x &&
      this.y === goal.y &&
      this.z === goal.z
    );
  }

  clone() {
    return new Goal(this.worldPos);
  }

  reached(position) {
    return (
      position.x === this.x &&
      position.y === this.y &&
      position.z === this.z
    );
  }
}

class GoalNear extends Goal {
  constructor(x, y, z, range) {
    super(new Vec3(x, y, z));
    this.range = range;
  }

  clone() {
    return new GoalNear(this.x, this.y, this.z, this.range);
  }

  reached(position) {
    return (
      position.x >= this.x - this.range &&
      position.x <= this.x + this.range &&
      position.y >= this.y - this.range &&
      position.y <= this.y + this.range &&
      position.z >= this.z - this.range &&
      position.z <= this.z + this.range
    );
  }
}

class GoalXZ extends Goal {
  constructor(x, z) {
    super(new Vec3(x, 0, z));
    this.x = x;
    this.z = z;
  }  

  reached(position) {
    return (
      position.x === this.x &&
      position.z === this.z
    );
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
    let lastSleep = performance.now()

    while (!openList.isEmpty()) {
      if (performance.now() - lastSleep >= 50) {
				// need to do this so the bot doesnt lag
				await new Promise(r => setTimeout(r, 0))
				lastSleep = performance.now()
			}


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

  return Math.sqrt(dx * dx + dy * dy + dz * dz) * cost * 1.2;
}

function manhattanDistance(node, goal) {
  return (
    Math.abs(goal.x - node.x) +
    Math.abs(goal.y - node.y) +
    Math.abs(goal.z - node.z)
  );
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
