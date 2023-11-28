const fullBlockDim = {
  width: 1,
  height: 1,
  depth: 1,
};

const halfBlockDim = {
  width: 1,
  height: 0.5,
  depth: 1,
};

class AABB {
  constructor(minX, minY, minZ, type) {
    this.minX = minX;
    this.minY = minY;
    this.minZ = minZ;
    if (type === "full") {
      this.maxX = this.minX + fullBlockDim.width;
      this.maxY = this.minY + fullBlockDim.height;
      this.maxZ = this.minZ + fullBlockDim.depth;
    } else if (type === "half") {
      // for slabs and shit
      this.maxX = this.minX + halfBlockDim.width;
      this.maxY = this.minY + halfBlockDim.height;
      this.maxZ = this.minZ + halfBlockDim.depth;
    }
  }

  isAtEdge(x, y, z) {
    return (
      x === this.minX ||
      x === this.maxX ||
      y === this.minY ||
      y === this.maxY ||
      z === this.minZ ||
      z === this.maxZ
    );
  }
}

module.exports = AABB;
