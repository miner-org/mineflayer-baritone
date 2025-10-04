# 🏃‍♂️ Mineflayer Pathfinder (WIP)

## ⚠️ DISCLAIMER: DOES NOT WORK WELL FOR LONG DISTANCES, PLEASE USE FOR GENERAL THINGS ⚠️

## Overview

This is a **basic pathfinder** for [Mineflayer](https://github.com/PrismarineJS/mineflayer) that includes:

* ✅ **Basic Pathfinding**
* ✅ **Parkour Moves**
* ✅ **Breaking Blocks**
* 🚧 **Placing Blocks (Work in Progress)**

Bot goes **brrr** and sometimes does things **correctly**. Sometimes.

---

## ⚠️ Warning: Very Buggy!

This is still in **active development**. Expect weird movement, unintended falls, and occasional bot existential crises.

---

## 📦 Installation

To install, run:

```sh
npm install @miner-org/mineflayer-baritone
```

---

## Example

```js
const mineflayer = require("mineflayer");
const pathfinder = require("@miner-org/mineflayer-baritone").loader;
const goals = require("@miner-org/mineflayer-baritone").goals;
const { Vec3 } = require("vec3");

const bot = mineflayer.createBot({ username: "PathfinderBot" });

bot.loadPlugin(pathfinder);

bot.once("spawn", async () => {
  await bot.waitForChunks()
  const goal = new goals.GoalExact(new Vec3(100, 65, 100));

  await bot.ashfinder.goto(goal);
});
```

(Yes, it might fail, but that’s part of the experience.)

---

## 🎯 Example Goals

Besides `GoalExact`, you can use other goals to customize bot movement:

```js
const { Vec3 } = require("vec3");
const { goals } = require("@miner-org/mineflayer-baritone");

// Go to a specific Y-level
const goalY = new goals.GoalYLevel(64);
await bot.ashfinder.goto(goalY);

// Enter a region (between two corners)
const region = new goals.GoalRegion(new Vec3(0, 60, 0), new Vec3(10, 70, 10));
await bot.ashfinder.goto(region);

// Stay away from a dangerous spot
const avoidCreeper = new goals.GoalAvoid(new Vec3(50, 64, 50), 10, bot);
await bot.ashfinder.goto(avoidCreeper);

// Reach either of two possible goals
const composite = new goals.GoalComposite([
  new goals.GoalExact(new Vec3(100, 65, 100)),
  new goals.GoalExact(new Vec3(120, 65, 120))
], "any");
await bot.ashfinder.goto(composite);

// Reach everywhere EXCEPT a specific block
const notThatBlock = new goals.GoalInvert(
  new goals.GoalExact(new Vec3(200, 64, 200))
);
await bot.ashfinder.goto(notThatBlock);

// Only care about XZ position (ignore Y)
const goalXZ = new goals.GoalXZ(new Vec3(150, 70, 150));
await bot.ashfinder.goto(goalXZ);

// Get near a point (within distance)
const near = new goals.GoalXZNear(new Vec3(180, 64, 180), 3);
await bot.ashfinder.goto(near);

// Look at a block (for mining/placing)
const lookAtBlock = new goals.GoalLookAtBlock(new Vec3(90, 65, 90), bot.world, {
  reach: 5,
});
await bot.ashfinder.goto(lookAtBlock);
```

---

## Known issues

* Tends to get stuck when doing parkour so if you're using this for short distance stuff disable parkour.

---

## Contributing

Pull requests are welcome! If you encounter issues, feel free to report them.
