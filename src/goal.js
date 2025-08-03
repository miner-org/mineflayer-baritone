const Vec3 = require("vec3").Vec3;

/**
 * @typedef {"top" | "bottom" | "north" | "south" | "east" | "west"} FaceDirection
 */

class Goal {
  constructor(position) {
    /**
     * @type {Vec3}
     */
    this.position = position.floored(); // Already floored
    this.x = this.position.x + 0.5;
    this.y = this.position.y;
    this.z = this.position.z + 0.5;
  }

  isReached(otherPosition) {
    return false;
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

    const dx = Math.abs(this.x - otherPosition.x);
    const dy = Math.abs(this.y - otherPosition.y);
    const dz = Math.abs(this.z - otherPosition.z);

    return dx <= this.distance && dz <= this.distance && dy <= 1;
  }
}

class GoalExact extends Goal {
  /***
   * @param {Vec3} otherPosition
   */
  isReached(otherPosition) {
    if (!otherPosition) return false;
    const floored = otherPosition.floored();
    this.x = Math.floor(this.position.x);
    this.z = Math.floor(this.position.z);

    // console.log(floored, "current");
    // console.log(this.x, this.z, "goal");
    // console.log(this.y, "goaly")

    return this.x === floored.x && this.y === floored.y && this.z === floored.z;
  }
}
/**
 * This goal is used to reach a specific Y level
 */

class GoalYLevel extends Goal {
  isReached(otherPosition) {
    if (!otherPosition) return false;
    return this.y === otherPosition.y;
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
  constructor(position, minDistance) {
    super(position);
    this.minDistance = minDistance;
  }

  isReached(otherPosition) {
    if (!otherPosition) return false;

    const xDistance = Math.abs(this.x - otherPosition.x);
    const yDistance = Math.abs(this.y - otherPosition.y);
    const zDistance = Math.abs(this.z - otherPosition.z);

    return (
      Math.sqrt(xDistance ** 2 + yDistance ** 2 + zDistance ** 2) >
      this.minDistance
    );
  }
}

/**
 * This goal is used to combine multiple goals
 */
class GoalComposite extends Goal {
  constructor(goals, mode = "all") {
    super(goals[0].position); // Default position from the first goal
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
    return this.x === otherPosition.x && this.z === otherPosition.z;
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

    const dx = Math.abs(this.x - otherPosition.x);
    const dz = Math.abs(this.z - otherPosition.z);
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
    const node = nodePos.offset(0.5, this.entityHeight, 0.5);
    if (
      node.distanceTo(this.position.offset(0.5, this.entityHeight, 0.5)) >
      this.reach
    )
      return false;

    const dx = node.x - (this.position.x + 0.5);
    const dy = node.y - (this.position.y + 0.5);
    const dz = node.z - (this.position.z + 0.5);

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

      const target = this.position.offset(0.5, 0.5, 0.5).plus(faceOffset);
      const dir = target.minus(node).normalize();

      const hit = this.world.raycast(node, dir, this.reach);
      if (hit?.position.equals(this.position)) {
        return true;
      }
    }

    return false;
  }
}

class GoalLookAtBlockWithFace extends Goal {
  /**
   * @param {Vec3} position - The block position to look at
   * @param {import('mineflayer').World} world - The bot's world object
   * @param {{
   *   reach?: number,
   *   entityHeight?: number,
   *   face?: FaceDirection
   * }} options
   */
  constructor(position, world, options = {}) {
    super(position);
    this.world = world;
    this.reach = options.reach ?? 4.5;
    this.entityHeight = options.entityHeight ?? 1.6;
    this.face = options.face;
  }

  isReached(nodePos) {
    const eye = nodePos.offset(0.5, this.entityHeight, 0.5);
    const blockCenter = this.position.offset(0.5, 0.5, 0.5);
    if (eye.distanceTo(blockCenter) > this.reach) return false;

    let target = blockCenter;
    if (this.face) {
      const offset = {
        top: new Vec3(0, 0.5, 0),
        bottom: new Vec3(0, -0.5, 0),
        north: new Vec3(0, 0, -0.5),
        south: new Vec3(0, 0, 0.5),
        west: new Vec3(-0.5, 0, 0),
        east: new Vec3(0.5, 0, 0),
      }[this.face];
      if (offset) target = target.plus(offset);
    }

    const dir = target.minus(eye).normalize();
    const hit = this.world.raycast(eye, dir, this.reach);

    return hit?.position?.equals(this.position) ?? false;
  }
}

function getShapeFaceCenters(shapes, face, half) {
  return [
    new Vec3(0.5, half === "top" ? 0.875 : 0.125, 0.5).plus(face.scaled(0.5)),
  ];
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
  GoalLookAtBlockWithFace,
};
