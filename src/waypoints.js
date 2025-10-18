const Vec3 = require("vec3").Vec3;

class WaypointPlanner {
  constructor(bot, ashfinder) {
    this.bot = bot;
    this.ashfinder = ashfinder;

    // Configuration
    this.WAYPOINT_DISTANCE = 50; // Distance between waypoints
    this.MIN_WAYPOINT_DISTANCE = 30; // Don't create waypoint if closer than this
    this.MAX_WAYPOINT_ATTEMPTS = 3; // Retry failed waypoints
    this.WAYPOINT_SEARCH_RADIUS = 20; // How far to search for valid waypoint position
  }

  /**
   * Generate waypoints from start to goal
   * @param {Vec3} start - Starting position
   * @param {Vec3} goal - Goal position
   * @returns {Vec3[]} Array of waypoint positions
   */
  generateWaypoints(start, goal) {
    const waypoints = [];
    const totalDistance = start.distanceTo(goal);

    // If close enough, no waypoints needed
    if (totalDistance <= this.MIN_WAYPOINT_DISTANCE) {
      return [goal];
    }

    // Calculate number of waypoints needed
    const numWaypoints = Math.ceil(totalDistance / this.WAYPOINT_DISTANCE);

    // Generate evenly spaced waypoints
    for (let i = 1; i <= numWaypoints; i++) {
      const t = i / numWaypoints;
      const waypoint = start
        .clone()
        .scaled(1 - t)
        .plus(goal.clone().scaled(t));

      // Adjust waypoint to be valid (on ground, not in walls)
      const validWaypoint = this.findValidWaypointNear(waypoint);

      if (validWaypoint) {
        waypoints.push(validWaypoint);
      } else {
        // If we can't find valid waypoint, try direct path
        console.warn(
          `Could not find valid waypoint at ${waypoint}, attempting direct path`
        );
        waypoints.push(goal);
        break;
      }
    }

    // Ensure final waypoint is the actual goal
    if (!waypoints[waypoints.length - 1].equals(goal)) {
      waypoints.push(goal);
    }

    return waypoints;
  }

  /**
   * Find a valid waypoint position near the target
   * @param {Vec3} target - Ideal waypoint position
   * @returns {Vec3|null} Valid waypoint or null if none found
   */
  findValidWaypointNear(target) {
    const bot = this.bot;

    // First try: snap to ground at target XZ
    const groundLevel = this.findGroundLevel(target);
    if (groundLevel !== null) {
      const candidate = new Vec3(target.x, groundLevel, target.z);
      if (this.isValidWaypoint(candidate)) {
        return candidate.floored().offset(0.5, 0, 0.5);
      }
    }

    // Second try: spiral search around target
    for (let radius = 1; radius <= this.WAYPOINT_SEARCH_RADIUS; radius += 2) {
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          // Only check perimeter of current radius
          if (Math.abs(dx) !== radius && Math.abs(dz) !== radius) continue;

          const searchPos = target.offset(dx, 0, dz);
          const groundY = this.findGroundLevel(searchPos);

          if (groundY !== null) {
            const candidate = new Vec3(searchPos.x, groundY, searchPos.z);
            if (this.isValidWaypoint(candidate)) {
              return candidate.floored().offset(0.5, 0, 0.5);
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * Find ground level at XZ position
   * @param {Vec3} pos - Position to search
   * @returns {number|null} Y level of ground or null
   */
  findGroundLevel(pos) {
    const bot = this.bot;
    const startY = Math.floor(pos.y);

    // Search down first
    for (let y = startY; y >= startY - 20; y--) {
      const checkPos = new Vec3(Math.floor(pos.x), y, Math.floor(pos.z));
      const block = bot.blockAt(checkPos);
      const above = bot.blockAt(checkPos.offset(0, 1, 0));
      const above2 = bot.blockAt(checkPos.offset(0, 2, 0));

      if (
        block &&
        block.boundingBox === "block" &&
        above &&
        above.boundingBox === "empty" &&
        above2 &&
        above2.boundingBox === "empty"
      ) {
        return y + 1; // Stand on top of block
      }
    }

    // Search up if nothing found below
    for (let y = startY + 1; y <= startY + 20; y++) {
      const checkPos = new Vec3(Math.floor(pos.x), y, Math.floor(pos.z));
      const block = bot.blockAt(checkPos);
      const above = bot.blockAt(checkPos.offset(0, 1, 0));
      const above2 = bot.blockAt(checkPos.offset(0, 2, 0));

      if (
        block &&
        block.boundingBox === "block" &&
        above &&
        above.boundingBox === "empty" &&
        above2 &&
        above2.boundingBox === "empty"
      ) {
        return y + 1;
      }
    }

    return null;
  }

  /**
   * Check if a position is valid for a waypoint
   * @param {Vec3} pos - Position to check
   * @returns {boolean}
   */
  isValidWaypoint(pos) {
    const bot = this.bot;

    const feet = bot.blockAt(pos);
    const head = bot.blockAt(pos.offset(0, 1, 0));
    const below = bot.blockAt(pos.offset(0, -1, 0));

    if (!feet || !head || !below) return false;

    // Must have solid ground below
    if (below.boundingBox !== "block") return false;

    // Must have clearance for body
    if (feet.boundingBox !== "empty") return false;
    if (head.boundingBox !== "empty") return false;

    // Avoid dangerous blocks
    const dangerBlocks = ["lava", "cactus", "magma_block", "fire"];
    if (
      dangerBlocks.some(
        (name) =>
          below.name.includes(name) ||
          feet.name.includes(name) ||
          head.name.includes(name)
      )
    ) {
      return false;
    }

    return true;
  }

  /**
   * Navigate through waypoints to reach goal
   * @param {Goal} finalGoal - Ultimate destination
   * @returns {Promise<{status: string}>}
   */
  async navigateWithWaypoints(finalGoal) {
    const bot = this.bot;
    const start = bot.entity.position.clone();
    const goalPos = finalGoal.getPosition();

    // Generate waypoints
    const waypoints = this.generateWaypoints(start, goalPos);

    console.log(
      `Generated ${waypoints.length} waypoints for ${start
        .distanceTo(goalPos)
        .toFixed(1)} block journey`
    );

    // Navigate to each waypoint
    for (let i = 0; i < waypoints.length; i++) {
      const waypoint = waypoints[i];
      const isLastWaypoint = i === waypoints.length - 1;

      console.log(
        `Navigating to waypoint ${i + 1}/${waypoints.length} at ${waypoint}`
      );

      // Create goal for this waypoint
      const { GoalNear } = require("./goal");
      const waypointGoal = isLastWaypoint
        ? finalGoal
        : new GoalNear(waypoint, 2); // 2 block tolerance for intermediate waypoints

      let attempts = 0;
      let success = false;

      while (attempts < this.MAX_WAYPOINT_ATTEMPTS && !success) {
        attempts++;

        try {
          // Navigate to waypoint
          const result = await this.ashfinder.goto(waypointGoal);

          if (result.status === "success") {
            success = true;
            console.log(`Reached waypoint ${i + 1}`);
          } else {
            console.warn(
              `Failed to reach waypoint ${i + 1}, attempt ${attempts}`
            );
          }
        } catch (error) {
          console.error(
            `Error navigating to waypoint ${i + 1}:`,
            error.message
          );

          if (attempts >= this.MAX_WAYPOINT_ATTEMPTS) {
            // Try to find alternate waypoint
            const currentPos = bot.entity.position.clone();
            const alternateWaypoint = this.findValidWaypointNear(waypoint);

            if (alternateWaypoint && !alternateWaypoint.equals(waypoint)) {
              console.log(`Trying alternate waypoint near ${waypoint}`);
              waypoints[i] = alternateWaypoint;
              attempts = 0; // Reset attempts for new waypoint
            } else {
              throw new Error(
                `Failed to reach waypoint ${i + 1} after ${
                  this.MAX_WAYPOINT_ATTEMPTS
                } attempts`
              );
            }
          }
        }
      }
    }

    return { status: "success" };
  }
}

/**
 * Enhanced waypoint planner that works with partial paths
 */
class SmartWaypointPlanner extends WaypointPlanner {
  constructor(bot, ashfinder) {
    super(bot, ashfinder);

    // Track waypoint performance
    this.waypointCache = new Map(); // key: "x,y,z->x,y,z" -> {success: bool, attempts: num}
    this.failedWaypoints = new Set(); // Positions that consistently fail
    this.maxCacheSize = 1000;
  }

  /**
   * Navigate with intelligent partial path handling
   * @param {Goal} finalGoal - Ultimate destination
   * @returns {Promise<{status: string, waypointsReached: number}>}
   */
  async navigateWithSmartWaypoints(finalGoal) {
    const bot = this.bot;
    const start = bot.entity.position.clone();
    const goalPos = finalGoal.getPosition();

    // Generate waypoints
    let waypoints = this.generateWaypoints(start, goalPos);

    // Filter out known bad waypoints
    waypoints = waypoints.filter((wp) => !this.isKnownBadWaypoint(wp));

    console.log(
      `Generated ${waypoints.length} waypoints (${start
        .distanceTo(goalPos)
        .toFixed(1)} blocks)`
    );

    let waypointsReached = 0;
    let consecutiveFailures = 0;
    const MAX_CONSECUTIVE_FAILURES = 2;

    for (let i = 0; i < waypoints.length; i++) {
      let waypoint = waypoints[i];
      const isLastWaypoint = i === waypoints.length - 1;

      console.log(
        `→ Waypoint ${i + 1}/${waypoints.length}: ${waypoint.toString()}`
      );

      // Create goal for this waypoint
      const { GoalNear } = require("./goal");
      const waypointGoal = isLastWaypoint
        ? finalGoal
        : new GoalNear(waypoint, 2);

      let result;

      try {
        // Use goto which already handles partial paths
        result = await this.ashfinder.goto(waypointGoal);

        if (result.status === "success") {
          waypointsReached++;
          consecutiveFailures = 0;
          this.recordWaypointSuccess(start, waypoint);
          console.log(`✓ Reached waypoint ${i + 1}`);
          continue;
        }

        // If we got a failure, handle it intelligently
        console.warn(
          `✗ Failed waypoint ${i + 1}: ${result.error?.message || "unknown"}`
        );
        consecutiveFailures++;
      } catch (error) {
        console.error(`✗ Error at waypoint ${i + 1}:`, error.message);
        consecutiveFailures++;
        this.recordWaypointFailure(start, waypoint);
      }

      // If we hit multiple failures, try adaptive strategies
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.log(
          `⚠ ${consecutiveFailures} consecutive failures, adapting strategy...`
        );

        const currentPos = bot.entity.position.clone();
        const remainingDistance = currentPos.distanceTo(goalPos);

        // Strategy 1: Try to find intermediate waypoint closer to current position
        if (remainingDistance > 30) {
          console.log(`  Strategy: Adding intermediate waypoint`);
          const intermediateWaypoint = this.findValidWaypointBetween(
            currentPos,
            waypoint,
            20 // 20 blocks away
          );

          if (intermediateWaypoint) {
            // Insert new waypoint before current failed one
            waypoints.splice(i, 0, intermediateWaypoint);
            consecutiveFailures = 0;
            console.log(
              `  ✓ Added intermediate waypoint at ${intermediateWaypoint}`
            );
            continue;
          }
        }

        // Strategy 2: Skip this waypoint and try next one
        if (i < waypoints.length - 1) {
          console.log(`  Strategy: Skipping to next waypoint`);
          this.markWaypointAsBad(waypoint);
          consecutiveFailures = 0;
          continue;
        }

        // Strategy 3: Regenerate waypoints from current position
        console.log(`  Strategy: Regenerating waypoints from current position`);
        const newWaypoints = this.generateWaypoints(currentPos, goalPos);
        waypoints = waypoints.slice(0, i).concat(newWaypoints);
        consecutiveFailures = 0;
        i--; // Retry current index with new waypoints
        continue;
      }
    }

    // Check if we reached the final goal
    const finalDistance = bot.entity.position.distanceTo(goalPos);
    const reachedGoal = finalGoal.isReached(bot.entity.position);

    if (reachedGoal) {
      console.log(
        `✓ Successfully reached final goal! (${waypointsReached}/${waypoints.length} waypoints)`
      );
      return { status: "success", waypointsReached };
    } else if (finalDistance < 10) {
      console.log(
        `⚠ Close to goal (${finalDistance.toFixed(
          1
        )} blocks), attempting final approach...`
      );

      // One last attempt with direct pathfinding
      try {
        const result = await this.ashfinder.goto(finalGoal);
        if (result.status === "success") {
          return { status: "success", waypointsReached: waypointsReached + 1 };
        }
      } catch (error) {
        console.error("Final approach failed:", error.message);
      }

      return {
        status: "partial",
        waypointsReached,
        remainingDistance: finalDistance,
      };
    } else {
      return {
        status: "failed",
        waypointsReached,
        remainingDistance: finalDistance,
      };
    }
  }

  /**
   * Find a valid waypoint between two positions
   * @param {Vec3} from - Start position
   * @param {Vec3} to - End position
   * @param {number} distance - Desired distance from 'from'
   * @returns {Vec3|null}
   */
  findValidWaypointBetween(from, to, distance) {
    const totalDist = from.distanceTo(to);
    if (totalDist <= distance) return null;

    const t = distance / totalDist;
    const candidate = from
      .clone()
      .scaled(1 - t)
      .plus(to.clone().scaled(t));

    return this.findValidWaypointNear(candidate);
  }

  /**
   * Record successful waypoint navigation
   */
  recordWaypointSuccess(from, to) {
    const key = this.waypointKey(from, to);
    const record = this.waypointCache.get(key) || { attempts: 0, successes: 0 };
    record.attempts++;
    record.successes++;
    this.waypointCache.set(key, record);

    this.pruneCache();
  }

  /**
   * Record failed waypoint navigation
   */
  recordWaypointFailure(from, to) {
    const key = this.waypointKey(from, to);
    const record = this.waypointCache.get(key) || { attempts: 0, successes: 0 };
    record.attempts++;
    this.waypointCache.set(key, record);

    // If consistently failing, mark as bad
    if (record.attempts >= 3 && record.successes === 0) {
      this.markWaypointAsBad(to);
    }

    this.pruneCache();
  }

  /**
   * Mark a waypoint as consistently problematic
   */
  markWaypointAsBad(waypoint) {
    const key = `${Math.floor(waypoint.x)},${Math.floor(
      waypoint.y
    )},${Math.floor(waypoint.z)}`;
    this.failedWaypoints.add(key);
    console.log(`⚠ Marked waypoint as bad: ${key}`);
  }

  /**
   * Check if waypoint is known to be problematic
   */
  isKnownBadWaypoint(waypoint) {
    const key = `${Math.floor(waypoint.x)},${Math.floor(
      waypoint.y
    )},${Math.floor(waypoint.z)}`;
    return this.failedWaypoints.has(key);
  }

  waypointKey(from, to) {
    return `${Math.floor(from.x)},${Math.floor(from.y)},${Math.floor(
      from.z
    )}->${Math.floor(to.x)},${Math.floor(to.y)},${Math.floor(to.z)}`;
  }

  pruneCache() {
    if (this.waypointCache.size > this.maxCacheSize) {
      // Remove oldest entries (first 20%)
      const entries = Array.from(this.waypointCache.entries());
      const toRemove = Math.floor(this.maxCacheSize * 0.2);

      for (let i = 0; i < toRemove; i++) {
        this.waypointCache.delete(entries[i][0]);
      }
    }
  }
}

module.exports = { WaypointPlanner, SmartWaypointPlanner };
