const blockCostMap = new Map();

blockCostMap.set("cobweb", 4);
blockCostMap.set("fire", 4);
blockCostMap.set("lava", Infinity);
blockCostMap.set("vine", 4);

blockCostMap.set("gravel", 10);
blockCostMap.set("cactus", 10);

module.exports = blockCostMap


