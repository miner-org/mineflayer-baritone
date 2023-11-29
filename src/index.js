const mineflayer = require("mineflayer");
const inject = require("./loader");
const Vec3 = require("vec3").Vec3;
const { argv } = require("process");

const bot = mineflayer.createBot({
  host: argv[2],
  username: "Frisk",
  port: parseInt(argv[3]),
  viewDistance: "tiny",
  version: "1.18.2",
});

bot.loadPlugin(inject);

let endPos;
bot.once("spawn", async () => {
  await bot.waitForChunksToLoad();
  bot.chat("hi");

  bot.on("chat", async (username, message) => {
    if (username === bot.username) return;

    const args = message.split(" ");
    const command = args.shift();

    if (command === "s!test") {
      const x = parseInt(args[0]);
      const y = parseInt(args[1]);
      const z = parseInt(args[2]);
      endPos = new Vec3(x, y, z);

      await bot.ashfinder.goto(endPos);
    }

    if (command === "s!find") {
      const blockName = args[0];

      if (!blockName) return bot.chat("No");

      const block = bot.findBlock({
        matching: (block) => block.name === blockName,
        maxDistance: 64,
      });

      if (!block) return bot.chat(`no ${blockName} in 64 block radius`);

      const pos = block.position.clone();

      await bot.ashfinder.goto(pos);
    }

    if (command === "s!binfo") {
      const eyePos = bot.blockAtEntityCursor(bot.players[username].entity);

      if (eyePos) {
        console.log(eyePos);
      } else bot.chat("too far");
    }

    if (command === "s!pos") {
      const currentPos = bot.entity.position;
      const block = bot.blockAt(currentPos.floored());

      console.log("Current pos", currentPos);
      console.log("Block", block);
    }
    if (command === "s!follow") {
      const targetPlayer = bot.players[username];
      const target = targetPlayer?.entity;

      if (!target) return bot.chat("I cannot see you");

      await bot.ashfinder.follow(target);
    }

    if (command === "s!random") {
      // Make bot pathfind to random ass locations ig?

      const isGood = (location) => {
        const block = bot.blockAt(location, false);

        if (!block) return false;

        const blockBelow = bot.blockAt(block.position.offset(0, -1, 0), false);
        const blockAbove = bot.blockAt(block.position.offset(0, 1, 0), false);

        if (!blockBelow && !blockAbove) return false;

        // we hate water!!
        if (blockBelow.boundingBox !== "block" || blockBelow.name === "water")
          return false;
        

          console.log("block", block.name)
          console.log("block below", blockBelow.name)
          console.log("block aboove", blockAbove.name)
        if (
          block.boundingBox === "empty" &&
          block.name !== "water" &&
          blockAbove.boundingBox === "empty" &&
          blockAbove.name !== "water"
        )
          return true;

        return false;
      };

      const location = 
        bot.entity.position
          .clone()
          .offset(
            Math.floor(Math.random() * (50 - 20) + 20),
            0.5,
            Math.floor(Math.random() * (50 - 20) + 20)
          )
      
      if (!isGood(location)) {
        console.log("not good")
        return
      };

      await bot.ashfinder.goto(location);
    }
  });
});

bot.on("error", console.log);
bot.on("kicked", console.log);
