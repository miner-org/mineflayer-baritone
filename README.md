# 🏃‍♂️ Mineflayer Pathfinder

## Overview

An **advanced pathfinding plugin** for [Mineflayer](https://github.com/PrismarineJS/mineflayer) that includes:

- ✅ **Smart Pathfinding** with A\* algorithm
- ✅ **Waypoint System** for long-distance navigation
- ✅ **Parkour Moves** (jumps, gaps, angled jumps)
- ✅ **Breaking Blocks** (intelligent block breaking)
- ✅ **Placing Blocks** (scaffolding and towering)
- ✅ **Swimming** (surface, underwater, entering/exiting water)
- ✅ **Ladder Climbing** (up and down)
- ✅ **Partial Path Handling** (automatic replanning)

Bot navigates efficiently with adaptive strategies for different terrain types!

---

## 📦 Installation

To install, run:

```sh
npm install @miner-org/mineflayer-baritone
```

---

## 🚀 Quick Start

```js
const mineflayer = require("mineflayer");
const pathfinder = require("@miner-org/mineflayer-baritone").loader;
const goals = require("@miner-org/mineflayer-baritone").goals;
const { Vec3 } = require("vec3");

const bot = mineflayer.createBot({ username: "PathfinderBot" });

bot.loadPlugin(pathfinder);

bot.once("spawn", async () => {
  await bot.waitForChunksToLoad();

  // Simple navigation
  const goal = new goals.GoalExact(new Vec3(100, 65, 100));
  await bot.ashfinder.goto(goal);

  console.log("Goal reached!");
});
```

---

## 🎯 Navigation Methods

### Basic Navigation

```js
// Direct pathfinding (best for short distances < 75 blocks)
await bot.ashfinder.goto(goal);
```

### Smart Navigation (Recommended)

```js
// Automatically chooses between direct pathfinding and waypoints
await bot.ashfinder.gotoSmart(goal, {
  waypointThreshold: 75, // Use waypoints for distances > 75 blocks
  forceWaypoints: false, // Force waypoint usage
  forceAdaptive: true, // Use smart waypoint system with failure handling
});
```

### Waypoint Navigation

```js
// Explicitly use waypoint system for long distances
await bot.ashfinder.gotoWithWaypoints(goal, 75);
```

---

## 🎯 Available Goals

```js
const { Vec3 } = require("vec3");
const { goals } = require("@miner-org/mineflayer-baritone");

// Go to exact coordinates
const goalExact = new goals.GoalExact(new Vec3(100, 65, 100));
await bot.ashfinder.goto(goalExact);

// Get near a position (within distance)
const goalNear = new goals.GoalNear(new Vec3(100, 65, 100), 3);
await bot.ashfinder.goto(goalNear);

// Reach a specific Y-level
const goalY = new goals.GoalYLevel(64);
await bot.ashfinder.goto(goalY);

// Enter a region (between two corners)
const region = new goals.GoalRegion(new Vec3(0, 60, 0), new Vec3(10, 70, 10));
await bot.ashfinder.goto(region);

// Stay away from a dangerous spot
const avoidCreeper = new goals.GoalAvoid(new Vec3(50, 64, 50), 10, bot);
await bot.ashfinder.goto(avoidCreeper);

// Reach any of multiple goals
const composite = new goals.GoalComposite(
  [
    new goals.GoalExact(new Vec3(100, 65, 100)),
    new goals.GoalExact(new Vec3(120, 65, 120)),
  ],
  "any"
);
await bot.ashfinder.goto(composite);

// Only XZ position matters (ignore Y)
const goalXZ = new goals.GoalXZ(new Vec3(150, 70, 150));
await bot.ashfinder.goto(goalXZ);

// Get near XZ coordinates
const nearXZ = new goals.GoalXZNear(new Vec3(180, 64, 180), 3);
await bot.ashfinder.goto(nearXZ);

// Look at a block
const lookAtBlock = new goals.GoalLookAtBlock(new Vec3(90, 65, 90), bot.world, {
  reach: 5,
});
await bot.ashfinder.goto(lookAtBlock);

// Avoid a specific goal
const notThatBlock = new goals.GoalInvert(
  new goals.GoalExact(new Vec3(200, 64, 200))
);
await bot.ashfinder.goto(notThatBlock);
```

---

## ⚙️ Configuration

```js
// Enable/disable features
bot.ashfinder.config.parkour = true; // Allow parkour jumps
bot.ashfinder.config.breakBlocks = true; // Allow breaking blocks
bot.ashfinder.config.placeBlocks = true; // Allow placing blocks
bot.ashfinder.config.swimming = true; // Allow swimming

// Set limits
bot.ashfinder.config.maxFallDist = 3; // Max safe fall distance
bot.ashfinder.config.maxWaterDist = 256; // Max water distance

// Configure blocks
bot.ashfinder.config.disposableBlocks = [
  "dirt",
  "cobblestone",
  "stone",
  "andesite",
];

bot.ashfinder.config.blocksToAvoid = ["crafting_table", "chest", "furnace"];

// Timeout settings
bot.ashfinder.config.thinkTimeout = 30000; // 30 seconds

// Enable debug mode
bot.ashfinder.debug = true;
```

---

## 🎮 Events

```js
// Path started
bot.ashfinder.on("pathStarted", ({ path, status, goal }) => {
  console.log(`Path started with ${path.length} nodes`);
});

// Goal reached
bot.ashfinder.on("goal-reach", (goal) => {
  console.log("Successfully reached goal!");
});

// Partial goal reached
bot.ashfinder.on("goal-reach-partial", (goal) => {
  console.log("Reached end of partial path, replanning...");
});

// Waypoint reached
bot.ashfinder.on("waypoint-reached", ({ waypoint, index }) => {
  console.log(`Reached waypoint ${index}`);
});

// Stopped
bot.ashfinder.on("stopped", () => {
  console.log("Pathfinding stopped");
});
```

---

## 🏊 Advanced Features

### Swimming

The bot can navigate through water with proper vertical control:

```js
// Swimming is enabled by default
bot.ashfinder.config.swimming = true;

// Navigate to underwater location
const underwaterGoal = new goals.GoalExact(new Vec3(100, 50, 100));
await bot.ashfinder.goto(underwaterGoal);
```

### Ladder Climbing

The bot can climb ladders and vines:

```js
// Ladder climbing is automatic when pathfinding
const highPlace = new goals.GoalExact(new Vec3(100, 100, 100));
await bot.ashfinder.goto(highPlace);
```

### Block Breaking & Placing

```js
// Enable both features
bot.ashfinder.enableBreaking();
bot.ashfinder.enablePlacing();

// Navigate through obstacles
const throughWall = new goals.GoalExact(new Vec3(100, 65, 100));
await bot.ashfinder.goto(throughWall);

// Disable if needed
bot.ashfinder.disableBreaking();
bot.ashfinder.disablePlacing();
```

### Stop Navigation

```js
// Stop current pathfinding
bot.ashfinder.stop();
```

---

## 🐛 Known Issues

- **Parkour**: Can occasionally get stuck on complex parkour sequences. For short distances, consider disabling parkour if issues occur.
- **Water exit**: Sometimes needs multiple attempts to climb out of water onto land.
- **Long distances**: While the waypoint system helps, very long paths (1000+ blocks) may take time to compute.

---

## 🔧 Troubleshooting

### Bot gets stuck

```js
// Enable debug mode to see what's happening
bot.ashfinder.debug = true;

// Reduce complexity
bot.ashfinder.config.parkour = false;
bot.ashfinder.config.breakBlocks = false;

// Use waypoints for long distances
await bot.ashfinder.gotoSmart(goal);
```

### Path not found

```js
// Check if blocks can be broken/placed
bot.ashfinder.config.breakBlocks = true;
bot.ashfinder.config.placeBlocks = true;

// Increase thinking timeout
bot.ashfinder.config.thinkTimeout = 60000; // 60 seconds

// Try a different goal type
const nearGoal = new goals.GoalNear(targetPos, 5);
```

---

## 📚 API Reference

### Methods

- `goto(goal)` - Navigate to a goal using direct pathfinding
- `gotoSmart(goal, options)` - Smart navigation with automatic waypoint selection
- `gotoWithWaypoints(goal, threshold)` - Explicitly use waypoint navigation
- `generatePath(goal, excludedPositions)` - Generate a path without executing it
- `stop()` - Stop current pathfinding
- `enableBreaking()` / `disableBreaking()` - Toggle block breaking
- `enablePlacing()` / `disablePlacing()` - Toggle block placing

### Properties

- `bot.ashfinder.config` - Configuration object
- `bot.ashfinder.debug` - Enable/disable debug logging
- `bot.ashfinder.stopped` - Check if pathfinding is stopped

---

## 🤝 Contributing

Pull requests are welcome! If you encounter issues or have suggestions:

1. Check existing issues on GitHub
2. Create a detailed bug report with:
   - Minecraft version
   - Bot configuration
   - Steps to reproduce
   - Expected vs actual behavior

---

## 📝 License

ISC License

---

## 🙏 Credits

Built on top of [Mineflayer](https://github.com/PrismarineJS/mineflayer) and inspired by [Baritone](https://github.com/cabaletta/baritone).
