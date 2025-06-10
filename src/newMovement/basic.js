const { Vec3 } = require("vec3");
const Move = require("./move");

class MoveBasic extends Move {
  generate(origin, neighbors) {
    for (const dir of DIRECTIONS) {
      const neighborPos = new DirectionalVec3(
        origin.x + dir.x,
        origin.y,
        origin.z + dir.z,
        dir
      );

      // Check if the move to neighborPos is valid:
      // 1. The block below neighborPos must be solid (so you can stand)
      const belowNeighbor = neighborPos.down(1);
      if (!this.isSolid(belowNeighbor)) continue;

      // 2. The neighborPos block and the block above (head space) must be air or breakable
      const headNode = neighborPos.up(1);

      if (!this.isAir(neighborPos)) {
        if (this.isBreakble(neighborPos) && this.config.breakBlocks) {
          neighborPos.attributes = neighborPos.attributes || {};
          neighborPos.attributes.break = [neighborPos.clone()];
        } else {
          continue; // blocked by unbreakable block
        }
      }

      if (!this.isAir(headNode)) {
        if (this.isBreakble(headNode) && this.config.breakBlocks) {
          neighborPos.attributes = neighborPos.attributes || {};
          neighborPos.attributes.break = neighborPos.attributes.break || [];
          neighborPos.attributes.break.push(headNode.clone());
        } else {
          continue; // head blocked
        }
      }

      // Cost calculation (just flat cost here, add break cost if breaking)
      const cost =
        1 + (neighborPos.attributes?.break?.length || 0) * this.COST_BREAK;

      neighbors.push(this.makeMovement(neighborPos, cost));
    }
  }
}

module.exports = Walk;
