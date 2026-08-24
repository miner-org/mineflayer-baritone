const { AshFinderPlugin } = require("./AshFinder.js");
const physicsLoader = require("@miner-org/mineflayer-physics-reworked");
const ashDig = require("./utils/ashDig.js")

function inject(bot, { useCustomPhysics = false }) {
  //load custom utils that replace mineflayer's default poopy stuff
  ashDig(bot)

  bot.ashfinder = new AshFinderPlugin(bot);
  if (useCustomPhysics) {
    physicsLoader(bot);
    bot.ashfinder.config.usingCustomPhysics = true;
  }
}

module.exports = inject;
