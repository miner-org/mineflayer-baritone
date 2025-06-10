# 🏃‍♂️ Mineflayer Pathfinder (WIP)

## Overview

This is a **basic pathfinder** for [Mineflayer](https://github.com/PrismarineJS/mineflayer) that includes:

- ✅ **Basic Pathfinding**
- ✅ **Parkour Moves**
- ✅ **Breaking Blocks**
- 🚧 **Placing Blocks (Work in Progress)**

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

Example:

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

# Known issues

- Tends to get stuck when parkouring so if your are using this for short distance stuff disable parkour.

# Contributing

Pull requests are welcome! If you encounter issues, feel free to report them.
