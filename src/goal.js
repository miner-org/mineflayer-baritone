const Vec3 = require("vec3").Vec3;

/**
 * @typedef {"top" | "bottom" | "north" | "south" | "east" | "west"} FaceDirection
 */

class Goal {
  constructor(position) {
    this._position = new Vec3(position.x, position.y, position.z).floor();
  }

  getPosition() {
    return this._position;
  }

  isReached(otherPosition) {
    return false;
  }
}

class GoalDynamic extends Goal {
  constructor(getTargetFn) {
    super(new Vec3(0, 0, 0)); // dummy init
    this.getTargetFn = getTargetFn;
  }

  getPosition() {
    return this.getTargetFn().floored().offset(0.5, 0, 0.5);
  }

  isReached(otherPosition) {
    // by default, reached if within 1 block
    return otherPosition.distanceTo(this.getPosition()) < 1.5;
  }
}

/**
 * This goal is used to reach a position within a certain distance, considering Y.
 */
class GoalNear extends Goal {
  constructor(position, distance) {
    super(position);
    this.distance = distance;
  }

  isReached(otherPosition) {
    if (!otherPosition) return false;

    const position = this.getPosition().offset(0.5, 0, 0.5);

    const dx = Math.abs(position.x - otherPosition.x);
    const dy = Math.abs(position.y - otherPosition.y);
    const dz = Math.abs(position.z - otherPosition.z);

    return dx <= this.distance && dz <= this.distance && dy <= this.distance;
  }
}

class GoalFollowEntity extends Goal {
  constructor(entity, distance = 2) {
    super(entity.position);
    this.entity = entity;
    this.distance = distance;
  }

  getPosition() {
    return this.entity.position.floored().offset(0.5, 0, 0.5);
  }

  isReached(otherPosition) {
    if (!otherPosition || !this.entity) return false;
    const dist = otherPosition.distanceTo(this.entity.position);
    return dist <= this.distance;
  }
}

class GoalExact extends Goal {
  /***
   * @param {Vec3} otherPosition
   */
  isReached(otherPosition) {
    if (!otherPosition) return false;
    const floored = otherPosition.floored();
    const position = this.getPosition();

    return (
      position.x === floored.x &&
      position.y === floored.y &&
      position.z === floored.z
    );
  }
}
/**
 * This goal is used to reach a specific Y level
 */

class GoalYLevel extends Goal {
  isReached(otherPosition) {
    if (!otherPosition) return false;
    return this.getPosition().y === otherPosition.y;
  }
}

/**
 * This goal is used to reach a region
 */
class GoalRegion extends Goal {
  constructor(position1, position2) {
    super(position1);
    this.minX = Math.min(position1.x, position2.x);
    this.maxX = Math.max(position1.x, position2.x);
    this.minY = Math.min(position1.y, position2.y);
    this.maxY = Math.max(position1.y, position2.y);
    this.minZ = Math.min(position1.z, position2.z);
    this.maxZ = Math.max(position1.z, position2.z);
  }

  isReached(otherPosition) {
    if (!otherPosition) return false;

    return (
      otherPosition.x >= this.minX &&
      otherPosition.x <= this.maxX &&
      otherPosition.y >= this.minY &&
      otherPosition.y <= this.maxY &&
      otherPosition.z >= this.minZ &&
      otherPosition.z <= this.maxZ
    );
  }
}

/**
 * This goal is used to avoid a position
 */
class GoalAvoid extends Goal {
  /**
   * @param {Vec3} avoidPos - position to avoid
   * @param {number} minDistance - how far to stay away
   * @param {Bot} bot - so we can calculate a safe target away from avoidPos
   */
  constructor(avoidPos, minDistance, bot) {
    super(avoidPos);
    this.avoidPos = avoidPos;
    this.minDistance = minDistance;

    // sample multiple directions & pick best
    this.safeTarget = this.findBestSafeTarget(bot);
  }

  vecLength(v) {
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  }

  normalize(v) {
    const len = this.vecLength(v);
    if (len === 0) return new Vec3(1, 0, 0); // fallback
    return new Vec3(v.x / len, v.y / len, v.z / len);
  }

  // sample safe spots around the danger zone
  findBestSafeTarget(bot) {
    const playerPos = bot.entity.position.floored();

    // try 8 directions (N, NE, E, SE, S, SW, W, NW)
    const directions = [
      new Vec3(1, 0, 0),
      new Vec3(-1, 0, 0),
      new Vec3(0, 0, 1),
      new Vec3(0, 0, -1),
      new Vec3(1, 0, 1),
      new Vec3(1, 0, -1),
      new Vec3(-1, 0, 1),
      new Vec3(-1, 0, -1),
    ];

    let bestTarget = null;
    let bestScore = -Infinity;

    for (const dir of directions) {
      const norm = this.normalize(dir);
      const candidate = this.avoidPos.plus(norm.scaled(this.minDistance + 2));

      // scoring system: prefer points further from danger & closer to player
      const distFromDanger = candidate.distanceTo(this.avoidPos);
      const distFromPlayer = -candidate.distanceTo(playerPos); // closer is better

      const score = distFromDanger + distFromPlayer * 0.5;

      if (score > bestScore) {
        bestScore = score;
        bestTarget = candidate;
      }
    }

    return bestTarget.floored().offset(0.5, 0, 0.5);
  }

  getPosition() {
    return this.safeTarget;
  }

  isReached(otherPosition) {
    if (!otherPosition) return false;
    const dist = otherPosition.distanceTo(this.avoidPos);
    return dist > this.minDistance;
  }
}

class GoalAvoidXZ extends Goal {
  /**
   * @param {Vec3} avoidPos - position to avoid
   * @param {number} minDistance - how far to stay away
   * @param {Bot} bot - so we can calculate a safe target away from avoidPos
   */
  constructor(avoidPos, minDistance, bot) {
    super(avoidPos);
    this.avoidPos = avoidPos;
    this.minDistance = minDistance;

    // sample multiple directions & pick best
    this.safeTarget = this.findBestSafeTarget(bot);
  }

  vecLength(v) {
    return Math.sqrt(v.x * v.x + v.z * v.z);
  }

  normalize(v) {
    const len = this.vecLength(v);
    if (len === 0) return new Vec3(1, 0, 0); // fallback
    return new Vec3(v.x / len, 0, v.z / len);
  }

  // sample safe spots around the danger zone
  findBestSafeTarget(bot) {
    const playerPos = bot.entity.position.floored();

    // try 8 directions (N, NE, E, SE, S, SW, W, NW)
    const directions = [
      new Vec3(1, 0, 0),
      new Vec3(-1, 0, 0),
      new Vec3(0, 0, 1),
      new Vec3(0, 0, -1),
      new Vec3(1, 0, 1),
      new Vec3(1, 0, -1),
      new Vec3(-1, 0, 1),
      new Vec3(-1, 0, -1),
    ];

    let bestTarget = null;
    let bestScore = -Infinity;

    for (const dir of directions) {
      const norm = this.normalize(dir);
      const candidate = this.avoidPos.plus(norm.scaled(this.minDistance + 2));

      // scoring system: prefer points further from danger & closer to player
      const distFromDanger = candidate.xzDistanceTo(this.avoidPos);
      const distFromPlayer = -candidate.xzDistanceTo(playerPos); // closer is better

      const score = distFromDanger + distFromPlayer * 0.5;

      if (score > bestScore) {
        bestScore = score;
        bestTarget = candidate;
      }
    }

    return bestTarget.floored().offset(0.5, 0, 0.5);
  }

  getPosition() {
    return this.safeTarget;
  }

  isReached(otherPosition) {
    if (!otherPosition) return false;
    const dist = otherPosition.xzDistanceTo(this.avoidPos);
    return dist > this.minDistance;
  }
}

/**
 * This goal is used to combine multiple goals
 */
class GoalComposite extends Goal {
  constructor(goals, mode = "all") {
    super(goals[0].getPosition()); // Default position from the first goal
    this.goals = goals;
    this.mode = mode; // 'all' or 'any'
  }

  isReached(otherPosition) {
    if (this.mode === "all") {
      return this.goals.every((goal) => goal.isReached(otherPosition));
    }
    return this.goals.some((goal) => goal.isReached(otherPosition));
  }
}

/**
 * This goal is used to compare the inverse of another goal
 */
class GoalInvert extends Goal {
  constructor(goal) {
    super(goal.position);
    this.goal = goal;
  }

  isReached(otherPosition) {
    return !this.goal.isReached(otherPosition);
  }
}

/**
 * This goal is used to compare only the X and Z coordinates
 */
class GoalXZ extends Goal {
  constructor(position) {
    super(position);
  }

  isReached(otherPosition) {
    if (!otherPosition) return false;
    const position = this.getPosition().offset(0.5, 0, 0.5);

    return position.x === otherPosition.x && position.z === otherPosition.z;
  }
}

/**
 * This goal is used to reach a position within a certain distance on the XZ plane.
 */
class GoalXZNear extends Goal {
  constructor(position, distance) {
    super(position);
    this.distance = distance;
  }

  isReached(otherPosition) {
    if (!otherPosition) return false;

    const position = this.getPosition().offset(0.5, 0, 0.5);

    const dx = Math.abs(position.x - otherPosition.x);
    const dz = Math.abs(position.z - otherPosition.z);

    return dx <= this.distance && dz <= this.distance;
  }
}

class GoalLookAtBlock extends Goal {
  constructor(position, world, options = {}) {
    super(position);
    this.world = world;
    this.reach = options.reach ?? 4.5;
    this.entityHeight = options.entityHeight ?? 1.6;
  }

  isReached(nodePos) {
    const node = nodePos.offset(0, this.entityHeight, 0);
    const position = this.getPosition().offset(0.5, 0.5, 0.5);

    if (node.distanceTo(position.offset(0, this.entityHeight, 0)) > this.reach)
      return false;

    const dx = node.x - (position.x + 0.5);
    const dy = node.y - (position.y + 0.5);
    const dz = node.z - (position.z + 0.5);

    const visible = {
      y: Math.sign(Math.abs(dy) > 0.5 ? dy : 0),
      x: Math.sign(Math.abs(dx) > 0.5 ? dx : 0),
      z: Math.sign(Math.abs(dz) > 0.5 ? dz : 0),
    };

    for (const axis in visible) {
      if (visible[axis] === 0) continue;

      const faceOffset = new Vec3(
        axis === "x" ? visible[axis] * 0.5 : 0,
        axis === "y" ? visible[axis] * 0.5 : 0,
        axis === "z" ? visible[axis] * 0.5 : 0
      );

      const target = position.offset(0, 0.5, 0).plus(faceOffset);
      const dir = target.minus(node).normalize();

      const hit = this.world.raycast(node, dir, this.reach);
      if (hit?.position.equals(position)) {
        return true;
      }
    }

    return false;
  }
}

module.exports = {
  Goal,
  GoalNear,
  GoalExact,
  GoalYLevel,
  GoalRegion,
  GoalAvoid,
  GoalComposite,
  GoalInvert,
  GoalXZ,
  GoalXZNear,
  GoalLookAtBlock,
  GoalFollowEntity,
  GoalAvoidXZ,
};
