const Vec3 = require("vec3").Vec3;

function createFlightPath(
  startPos,
  targetPos,
  stepSize = 10,
  maxAltitude = 200
) {
  const waypoints = [];

  // Calculate the difference between the start and target position
  const deltaX = targetPos.x - startPos.x;
  const deltaY = targetPos.y - startPos.y;
  const deltaZ = targetPos.z - startPos.z;

  // Calculate the total distance between the two points
  const distance = Math.sqrt(deltaX ** 2 + deltaY ** 2 + deltaZ ** 2);

  // Number of steps based on distance and step size
  const steps = Math.ceil(distance / stepSize);

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;

    // Linear interpolation between start and target positions
    const x = startPos.x + t * deltaX;
    const y = Math.min(startPos.y + t * deltaY, maxAltitude); // Control altitude
    const z = startPos.z + t * deltaZ;

    const point = new Vec3(x, y, z);

    // Append this waypoint to the list
    waypoints.push(point);
  }

  const data = {
    positions: waypoints,
    lookVectors: [],
  };

  // Convert positions to yaw and pitch values
  for (let i = 0; i < waypoints.length; i++) {
    const yaw =
      (Math.atan2(waypoints[i].x - startPos.x, waypoints[i].z - startPos.z) *
        180) /
      Math.PI;
    const pitch =
      (Math.atan2(
        waypoints[i].y - startPos.y,
        Math.sqrt(
          (waypoints[i].x - startPos.x) ** 2 +
            (waypoints[i].z - startPos.z) ** 2
        )
      ) *
        180) /
      Math.PI;

    // Wrap yaw between -180 and 180 degrees
    const yawWrapped = (yaw + 360) % 360;

    data.lookVectors.push({ yaw: yawWrapped, pitch });
  }


  data.lookVectors.shift()

  return data;
}

module.exports = createFlightPath;
