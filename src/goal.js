const Vec3 = require("vec3").Vec3;

class Goal {
  constructor(position) {
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

    const xDistance = Math.abs(this.x - otherPosition.x);
    const zDistance = Math.abs(this.z - otherPosition.z);

    return xDistance <= this.distance && zDistance <= this.distance;
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
};
