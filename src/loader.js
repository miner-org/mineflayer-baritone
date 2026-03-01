const { AshFinderPlugin } = require("./AshFinder.js");
const physicsLoader = require("@miner-org/mineflayer-physics-reworked");

function inject(bot, { useCustomPhysics = false }) {
  bot.ashfinder = new AshFinderPlugin(bot);
  if (useCustomPhysics) {
    physicsLoader(bot);
    bot.ashfinder.config.usingCustomPhysics = true;
  }
}

module.exports = inject;
