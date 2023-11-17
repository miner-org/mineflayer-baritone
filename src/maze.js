const mineflayer = require("mineflayer");
const { Vec3 } = require("vec3");

const bot = mineflayer.createBot({
  host: "2.tcp.eu.ngrok.io",
  username: "Frisk",
  port: 13080,
  viewDistance: "tiny",
  version: "1.18.2",
});

const mazeWidth = 32; // Width of the maze in blocks
const mazeHeight = 32; // Height of the maze in blocks

bot.on("spawn", async () => {
  console.log("Bot has logged in");
  await bot.waitForChunksToLoad();
  bot.on("chat", async (username, message) => {
    if (username === bot.username) return;

    if (username !== "AshLikesFood") return;

    const args = message.split(" ");
    const command = args.shift();

    if (command.toLowerCase() === "s!test") {
      if (args.length >= 2) {
        const x = parseInt(args[0]);
        const y = parseInt(args[1]);
        const z = parseInt(args[2]);
        console.log(x, y, z);
        const maze = generateMaze();
        renderMazeInMinecraft(maze, x, y, z);
      }
    }
  });
});

function generateMaze() {
  const maze = createEmptyMaze();
  recursiveBacktracking(maze, 1, 1);
  return maze;
}

function createEmptyMaze() {
  const maze = [];
  for (let i = 0; i < mazeWidth; i++) {
    maze[i] = [];
    for (let j = 0; j < mazeHeight; j++) {
      maze[i][j] = 0; // 0 represents walls, and 1 represents paths
    }
  }
  return maze;
}

function recursiveBacktracking(maze, x, y) {
  const directions = ["north", "east", "south", "west"];
  directions.sort(() => Math.random() - 0.5);

  for (const dir of directions) {
    const dx = (dir === "north") - (dir === "south");
    const dy = (dir === "west") - (dir === "east");

    const nx = x + dx * 2;
    const ny = y + dy * 2;

    if (
      nx >= 1 &&
      nx < mazeWidth - 1 &&
      ny >= 1 &&
      ny < mazeHeight - 1 &&
      maze[nx][ny] === 0
    ) {
      maze[x + dx][y + dy] = 1;
      maze[nx][ny] = 1;
      recursiveBacktracking(maze, nx, ny);
    }
  }
}

async function renderMazeInMinecraft(maze, offsetX, offsetY, offsetZ) {
  for (let x = 0; x < mazeWidth; x++) {
    for (let y = 0; y < mazeHeight; y++) {
      if (maze[x][y] === 0) {
        const blockPosition = new Vec3(offsetX + x, offsetY, offsetZ + y);

        bot.chat(
          `/fill ~ ~1 ~${blockPosition.x} ${blockPosition.y} ${blockPosition.z} air`
        );

        bot.chat(
          `/setblock ${blockPosition.x} ${blockPosition.y} ${blockPosition.z} black_wool`
        );
        bot.chat(
          `/setblock ${blockPosition.x} ${blockPosition.y + 1} ${
            blockPosition.z
          } black_wool`
        );

        bot.chat(
          `/setblock ${blockPosition.x} ${blockPosition.y + 2} ${
            blockPosition.z
          } black_wool`
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

bot.on("end", () => {
  console.log("Bot has disconnected");
});
