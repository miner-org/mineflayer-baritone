const Vec3 = require("vec3").Vec3;

/**
 * @typedef {"top" | "bottom" | "north" | "south" | "east" | "west"} FaceDirection
 */

class Goal {
  /**
   * @param {Vec3} position
   */
  constructor(position) {
    this._position = new Vec3(position.x, position.y, position.z).floor();
  }

  /** @returns {Vec3} */
  getPosition() {
    return this._position;
  }

  /**
   * @param {Vec3} _otherPosition
   * @returns {boolean}
   */
  isReached(_otherPosition) {
    return false;
  }
}

class GoalDynamic extends Goal {
  /**
   * @param {() => Vec3} getTargetFn - Function returning the current target
   */
  constructor(getTargetFn) {
    super(new Vec3(0, 0, 0));
    this.getTargetFn = getTargetFn;
  }

  getPosition() {
    return this.getTargetFn().floored().offset(0.5, 0, 0.5);
  }

  isReached(otherPosition) {
    return otherPosition.distanceTo(this.getPosition()) < 1.5;
  }
}

class GoalNear extends Goal {
  /**
   * @param {Vec3} position
   * @param {number} distance
   */
  constructor(position, distance) {
    super(position);
    this.distance = distance;
  }

  isReached(otherPosition) {
    if (!otherPosition) return false;

    const position = this.getPosition().offset(0.5, 0, 0.5);
    const dx = position.x - otherPosition.x;
    const dy = position.y - otherPosition.y;
    const dz = position.z - otherPosition.z;

    return dx * dx + dy * dy + dz * dz <= this.distance * this.distance;
  }
}

class GoalNearXZ extends Goal {
  /**
   * @param {Vec3} position
   * @param {number} distance
   */
  constructor(position, distance) {
    super(position);
    this.distance = distance;
  }

  isReached(otherPosition) {
    if (!otherPosition) return false;

    const position = this.getPosition().offset(0.5, 0, 0.5);
    const dx = position.x - otherPosition.x;
    const dz = position.z - otherPosition.z;

    return dx * dx + dz * dz <= this.distance * this.distance;
  }
}

class GoalFollowEntity extends Goal {
  /**
   * @param {{ position: Vec3 }} entity
   * @param {number} [distance=2]
   */
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
    return otherPosition.distanceTo(this.entity.position) <= this.distance;
  }
}

class GoalExact extends Goal {
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

class GoalYLevel extends Goal {
  isReached(otherPosition) {
    if (!otherPosition) return false;
    return this.getPosition().y === Math.floor(otherPosition.y);
  }
}

class GoalRegion extends Goal {
  /**
   * @param {Vec3} position1
   * @param {Vec3} position2
   */
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

/** @param {Vec3} v @returns {number} */
function vecLen3D(v) {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

/** @param {Vec3} v @returns {number} */
function vecLenXZ(v) {
  return Math.sqrt(v.x * v.x + v.z * v.z);
}

const CARDINAL_8 = [
  new Vec3(1, 0, 0),
  new Vec3(-1, 0, 0),
  new Vec3(0, 0, 1),
  new Vec3(0, 0, -1),
  new Vec3(1, 0, 1),
  new Vec3(1, 0, -1),
  new Vec3(-1, 0, 1),
  new Vec3(-1, 0, -1),
];

class GoalAvoid extends Goal {
  /**
   * @param {Vec3} avoidPos
   * @param {number} minDistance
   * @param {{ entity: { position: Vec3 } }} bot
   */
  constructor(avoidPos, minDistance, bot) {
    super(avoidPos);
    this.avoidPos = avoidPos;
    this.minDistance = minDistance;
    this._safeTarget = GoalAvoid._findSafeTarget(
      avoidPos,
      minDistance,
      bot.entity.position.floored(),
      /* xzOnly */ false,
    );
  }

  /**
   * Shared safe-target finder.
   * @param {Vec3} avoidPos
   * @param {number} minDistance
   * @param {Vec3} playerPos
   * @param {boolean} xzOnly
   * @returns {Vec3}
   */
  static _findSafeTarget(avoidPos, minDistance, playerPos, xzOnly) {
    let bestTarget = null;
    let bestScore = -Infinity;

    for (const dir of CARDINAL_8) {
      const len = xzOnly ? vecLenXZ(dir) : vecLen3D(dir);
      const norm =
        len === 0
          ? new Vec3(1, 0, 0)
          : new Vec3(dir.x / len, xzOnly ? 0 : dir.y / len, dir.z / len);

      const candidate = avoidPos.plus(norm.scaled(minDistance + 2));

      const distFromDanger = xzOnly
        ? candidate.xzDistanceTo(avoidPos)
        : candidate.distanceTo(avoidPos);
      const distFromPlayer = xzOnly
        ? candidate.xzDistanceTo(playerPos)
        : candidate.distanceTo(playerPos);

      const score = distFromDanger - distFromPlayer * 0.5;

      if (score > bestScore) {
        bestScore = score;
        bestTarget = candidate;
      }
    }

    return bestTarget.floored().offset(0.5, 0, 0.5);
  }

  getPosition() {
    return this._safeTarget;
  }

  isReached(otherPosition) {
    if (!otherPosition) return false;
    return otherPosition.distanceTo(this.avoidPos) > this.minDistance;
  }
}

class GoalAvoidXZ extends Goal {
  /**
   * @param {Vec3} avoidPos
   * @param {number} minDistance
   * @param {{ entity: { position: Vec3 } }} bot
   */
  constructor(avoidPos, minDistance, bot) {
    super(avoidPos);
    this.avoidPos = avoidPos;
    this.minDistance = minDistance;
    this._safeTarget = GoalAvoid._findSafeTarget(
      avoidPos,
      minDistance,
      bot.entity.position.floored(),
      /* xzOnly */ true,
    );
  }

  getPosition() {
    return this._safeTarget;
  }

  isReached(otherPosition) {
    if (!otherPosition) return false;
    return otherPosition.xzDistanceTo(this.avoidPos) > this.minDistance;
  }
}
class GoalComposite extends Goal {
  /**
   * @param {Goal[]} goals
   * @param {"all" | "any"} [mode="all"]
   */
  constructor(goals, mode = "all") {
    super(goals[0].getPosition());
    this.goals = goals;
    this.mode = mode;
  }

  isReached(otherPosition) {
    if (this.mode === "all") {
      return this.goals.every((goal) => goal.isReached(otherPosition));
    }
    return this.goals.some((goal) => goal.isReached(otherPosition));
  }
}

class GoalInvert extends Goal {
  /**
   * @param {Goal} goal
   */
  constructor(goal) {
    super(goal.getPosition());
    this.goal = goal;
  }

  getPosition() {
    return this.goal.getPosition();
  }

  isReached(otherPosition) {
    return !this.goal.isReached(otherPosition);
  }
}

class GoalXZ extends Goal {
  /** @param {Vec3} position */
  constructor(position) {
    super(position);
  }

  isReached(otherPosition) {
    if (!otherPosition) return false;
    const position = this.getPosition().offset(0.5, 0, 0.5);
    // Use floor comparison to avoid floating-point drift
    return (
      Math.floor(position.x) === Math.floor(otherPosition.x) &&
      Math.floor(position.z) === Math.floor(otherPosition.z)
    );
  }
}
class GoalXZNear extends Goal {
  /**
   * @param {Vec3} position
   * @param {number} distance
   */
  constructor(position, distance) {
    super(position);
    this.distance = distance;
  }

  isReached(otherPosition) {
    if (!otherPosition) return false;

    const position = this.getPosition().offset(0.5, 0, 0.5);
    const dx = Math.abs(position.x - otherPosition.x);
    const dz = Math.abs(position.z - otherPosition.z);

    // Use circular (Euclidean) distance, not square — more intuitive
    return dx * dx + dz * dz <= this.distance * this.distance;
  }
}

class GoalLookAtBlock extends Goal {
  /**
   * @param {Vec3} position
   * @param {object} world
   * @param {{ reach?: number, entityHeight?: number }} [options={}]
   */
  constructor(position, world, options = {}) {
    super(position);
    this.world = world;
    this.reach = options.reach ?? 4.5;
    this.entityHeight = options.entityHeight ?? 1.6;
  }

  isReached(nodePos) {
    const node = nodePos.offset(0, this.entityHeight, 0);
    const position = this.getPosition().offset(0.5, 0.5, 0.5);

    if (node.distanceTo(position) > this.reach) return false;

    const dx = node.x - position.x;
    const dy = node.y - position.y;
    const dz = node.z - position.z;

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
        axis === "z" ? visible[axis] * 0.5 : 0,
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

const FACE_DIRS = {
  down: new Vec3(0, -1, 0),
  up: new Vec3(0, 1, 0),
  north: new Vec3(0, 0, -1),
  south: new Vec3(0, 0, 1),
  west: new Vec3(-1, 0, 0),
  east: new Vec3(1, 0, 0),
};

const FACE_NUM_TO_DIR = {
  0: FACE_DIRS.down,
  1: FACE_DIRS.up,
  2: FACE_DIRS.north,
  3: FACE_DIRS.south,
  4: FACE_DIRS.west,
  5: FACE_DIRS.east,
};

function normalizeVertical(face) {
  if (face === "top") {
    return "up";
  } else if (face === "bottom") return "down";
  return face;
}

class GoalLookAtBlockFace extends Goal {
  /**
   * @param {Vec3} position
   * @param {object} world
   * @param {{ reach?: number, entityHeight?: number, face?: FaceDirection }} [options={}]
   */
  constructor(position, world, options = {}) {
    super(position);
    this.world = world;
    this.reach = options.reach ?? 4.5;
    this.entityHeight = options.entityHeight ?? 1.6;
    this.face = normalizeVertical(options.face);
  }

  isReached(nodePos) {
    const dir = FACE_DIRS[this.face];
    if (!dir) return false;

    const node = nodePos.offset(0, this.entityHeight, 0);
    const blockCenter = this.getPosition().offset(0.5, 0.5, 0.5);

    if (node.distanceTo(blockCenter) > this.reach) return false;

    const faceTarget = blockCenter.plus(dir.scaled(0.5));
    const rayDir = faceTarget.minus(node).normalize();

    const hit = this.world.raycast(node, rayDir, this.reach);
    if (!hit) return false;

    const blockPos = this.getPosition();
    const sameBlock =
      hit.position.x === blockPos.x &&
      hit.position.y === blockPos.y &&
      hit.position.z === blockPos.z;

    const hitFaceDir = FACE_NUM_TO_DIR[hit.face];
    if (!hitFaceDir) return false;

    const sameFace =
      hitFaceDir.x === dir.x &&
      hitFaceDir.y === dir.y &&
      hitFaceDir.z === dir.z;

    return sameBlock && sameFace;
  }
}

module.exports = {
  Goal,
  GoalDynamic,
  GoalNear,
  GoalNearXZ,
  GoalExact,
  GoalYLevel,
  GoalRegion,
  GoalAvoid,
  GoalAvoidXZ,
  GoalComposite,
  GoalInvert,
  GoalXZ,
  GoalXZNear,
  GoalLookAtBlock,
  GoalLookAtBlockFace,
  GoalFollowEntity,
};
