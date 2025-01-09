class Goal {
  constructor(position) {
    this.position = position;
    this.x = Math.floor(position.x);
    this.y = Math.floor(position.y);
    this.z = Math.floor(position.z);
  }

  isReached(otherPosition) {
    return false;
  }
}

class GoalNear extends Goal {
  constructor(position, distance) {
    super(position);
    this.distance = distance;
  }

  isReached(otherPosition) {
    if (!otherPosition) return false;

    const xDistance = Math.abs(this.x - otherPosition.x);
    const yDistance = Math.abs(this.y - otherPosition.y);
    const zDistance = Math.abs(this.z - otherPosition.z);

    return xDistance <= this.distance && yDistance <= this.distance && zDistance <= this.distance;
  }

}

class GoalExact extends Goal {
  isReached(otherPosition) {
    if (!otherPosition) return false;
    return this.x === otherPosition.x && this.y === otherPosition.y && this.z === otherPosition.z;
  }
}

class GoalYLevel extends Goal {
  isReached(otherPosition) {
    if (!otherPosition) return false;
    return this.y === otherPosition.y;
  }
}

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
      Math.sqrt(xDistance ** 2 + yDistance ** 2 + zDistance ** 2) > this.minDistance
    );
  }
}

class GoalComposite extends Goal {
  constructor(goals, mode = 'all') {
    super(goals[0].position); // Default position from the first goal
    this.goals = goals;
    this.mode = mode; // 'all' or 'any'
  }

  isReached(otherPosition) {
    if (this.mode === 'all') {
      return this.goals.every(goal => goal.isReached(otherPosition));
    }
    return this.goals.some(goal => goal.isReached(otherPosition));
  }
}

class GoalInvert extends Goal {
  constructor(goal) {
    super(goal.position);
    this.goal = goal;
  }

  isReached(otherPosition) {
    return !this.goal.isReached(otherPosition);
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
  GoalInvert
};

