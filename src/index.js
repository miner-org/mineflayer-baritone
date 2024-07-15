const mineflayer = require("mineflayer");
const inject = require("./loader");
const Vec3 = require("vec3").Vec3;
const { argv } = require("process");

const bot = mineflayer.createBot({
  host: argv[2] || "localhost",
  username: "Chisomo",
  port: parseInt(argv[3]) || 25565,
  viewDistance: "tiny",
  version: "1.20.1"
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

    if (command === "f!test") {
      const x = parseInt(args[0]);
      const y = parseInt(args[1]);
      const z = parseInt(args[2]);
      endPos = new Vec3(x, y, z);

      await bot.ashfinder.goto(endPos);
    }

    if (command === "f!find") {
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

    if (command === "f!binfo") {
      const eyePos = bot.blockAtEntityCursor(bot.players[username].entity);

      if (eyePos) {
        console.log(eyePos);
      } else bot.chat("too far");
    }

    if (command === "f!pos") {
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

    if (command === "f!random") {
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

        console.log("block", block.name);
        console.log("block below", blockBelow.name);
        console.log("block aboove", blockAbove.name);
        if (
          block.boundingBox === "empty" &&
          block.name !== "water" &&
          blockAbove.boundingBox === "empty" &&
          blockAbove.name !== "water"
        )
          return true;

        return false;
      };

      const location = bot.entity.position
        .clone()
        .offset(
          Math.floor(Math.random() * (50 - 20) + 20),
          1,
          Math.floor(Math.random() * (50 - 20) + 20)
        );

      if (!isGood(location)) {
        console.log("not good");
        return;
      }

      await bot.ashfinder.goto(location);
    }

    if (command === "f!sugar") {
      const sugarcanePositions = bot.findBlocks({
        matching: (block) => block.name === "sugar_cane",
        count: 6,
        maxDistance: 6,
        useExtraInfo: false,
      });

      if (sugarcanePositions.length === 0) return console.log("nah im good");
      let uniquePositions = new Map();
      const hash = (pos) => {
        return `${pos.x}-${pos.y}-${pos.z}`;
      };

      for (const pos of sugarcanePositions) {
        const blockAt = bot.blockAt(pos);

        if (!blockAt) continue;

        for (let i = 0; i < 3; i++) {
          const block = bot.blockAt(blockAt.position.offset(0, i, 0));

          // then we found a 2 tall sugarcane block
          if (block.name === "air") {
            // Get the block below the air block which will probably be the sugarcane idk
            const sugarcaneBelowAir = bot.blockAt(
              block.position.offset(0, -1, 0)
            );

            // store the position in the map if it isnt already there
            if (!uniquePositions.has(hash(sugarcaneBelowAir.position))) {
              uniquePositions.set(
                hash(sugarcaneBelowAir.position),
                sugarcaneBelowAir
              );
            }
            break;
          }
        }
      }

      if (uniquePositions.size === 0)
        return console.log("didnt not find any bruh");

      const uniqueBlocks = Array.from(uniquePositions.values());

      console.log(`i found ${uniqueBlocks.length} sugarcane blocks!`);
      console.log(uniqueBlocks);
    }
  });

  bot.on("messagestr", (msg, pos) => {
    // console.log(msg, pos);

    if (pos === "game_info") {
      const regex = /Register with \/register <password>/;
      const regex2 = /Log in with \/login <password>/;

      if (regex.test(msg)) {
        bot.chat("/register gayman1");
      }

      if (regex2.test(msg)) {
        bot.chat("/login gayman1");
        bot.chat("/login gayman1");
      }
    }
  });
});

bot.on("error", console.log);
bot.on("kicked", console.log);
