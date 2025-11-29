const mineflayer = require("mineflayer");
const { Vec3 } = require("vec3");

const bot = mineflayer.createBot({
  host: "localhost",
  username: "Wayne",
  port: 46803,
  version: "1.21.1",
});

// CONFIG
// CONFIG
const MAZE_W = 32;
const MAZE_H = 32;
const WALL_HEIGHT = 3;
const WALL_BLOCK = "light_gray_concrete";
const FLOOR_BLOCK = "stone";
const ALLOWED = "AshLikesFood";

// Pathfinding obstacles
const OBSTACLE_DENSITY = 0.15; // 15% of pathways get obstacles

const sussyVersions = ["1.21", "1.21.1", "1.21.2", "1.21.3", "1.21.4"];

bot.once("spawn", async () => {
  await bot.waitForChunksToLoad();
  console.log("bot online");

  bot.on("chat", async (username, msg) => {
    if (username !== ALLOWED) return;

    const [cmd, ...args] = msg.split(/\s+/);
    if (cmd.toLowerCase() !== "s!test") return;

    if (args.length < 3) return bot.chat("yo gimme X Y Z");

    const [x, y, z] = args.map(Number);

    bot.chat("generating 3D maze…");
    const { grid: maze, obstacles } = generateMaze();

    await renderMaze3D(maze, x, y, z);
    await renderObstacles(obstacles, x, y, z);
    bot.chat("maze built 😎");
  });

  bot.on("messagestr", async (username, pos, chatMessage) => {
    if (!sussyVersions.includes(bot.version)) return;

    if (chatMessage.json.translate !== "chat.type.text") return;

    function removeBrackets(str) {
      return str.replace(/[<>]/g, "");
    }

    username = removeBrackets(username).trim();

    //MESSage in this case is the username ig rela pro pro gay men

    // console.log(message);
    // console.log(pos);
    // console.log(chatMessage.json);

    const realMessage =
      chatMessage.json.translate === "chat.type.text"
        ? `${username.trim()}:${Object.values(chatMessage.json.with[1])}`
        : "nope";

    // console.log(realMessage);

    /**
     * @type {string}
     */
    const usableMessage = Object.values(chatMessage.json.with[1])[0];

    // console.log(usableMessage);

    if (username === bot.username) return;
    const [cmd, ...args] = usableMessage.split(/\s+/);
    if (cmd.toLowerCase() !== "s!test") return;

    if (args.length < 3) return bot.chat("yo gimme X Y Z");

    const [x, y, z] = args.map(Number);

    bot.chat("generating 3D maze…");
    const { grid: maze, obstacles } = generateMaze();

    await renderMaze3D(maze, x, y, z);
    await renderObstacles(obstacles, x, y, z);
    bot.chat("maze built 😎");
  });
});

// ===== MAZE GEN =====

function generateMaze() {
  const grid = Array.from({ length: MAZE_W }, () => Array(MAZE_H).fill(0));

  carve(grid, 1, 1);

  const obstacles = addObstacles(grid);

  return { grid, obstacles };
}

function addObstacles(grid) {
  const obstacles = [];

  for (let x = 1; x < MAZE_W - 1; x++) {
    for (let z = 1; z < MAZE_H - 1; z++) {
      // Only add obstacles in open pathways
      if (grid[x][z] === 1 && Math.random() < OBSTACLE_DENSITY) {
        const obstacleType = Math.random();

        if (obstacleType < 0.3) {
          // Gap - need to jump
          obstacles.push({ x, z, type: "gap" });
        }
      }
    }
  }

  return obstacles;
}

function carve(grid, x, y) {
  grid[x][y] = 1;

  const dirs = [
    [1, 0], // east
    [-1, 0], // west
    [0, 1], // south
    [0, -1], // north
  ].sort(() => Math.random() - 0.5);

  for (const [dx, dy] of dirs) {
    const nx = x + dx * 2;
    const ny = y + dy * 2;

    if (
      nx > 0 &&
      nx < MAZE_W - 1 &&
      ny > 0 &&
      ny < MAZE_H - 1 &&
      grid[nx][ny] === 0
    ) {
      grid[x + dx][y + dy] = 1;
      carve(grid, nx, ny);
    }
  }
}

// ===== 3D RENDERING WITH FILL =====

async function renderMaze3D(grid, ox, oy, oz) {
  const floorBlock = FLOOR_BLOCK;

  // clear the whole area first
  bot.chat(
    `/fill ${ox} ${oy} ${oz} ${ox + MAZE_W} ${oy + WALL_HEIGHT} ${
      oz + MAZE_H
    } air`
  );

  // place floor
  bot.chat(
    `/fill ${ox} ${oy - 1} ${oz} ${ox + MAZE_W} ${oy - 1} ${
      oz + MAZE_H
    } ${floorBlock}`
  );

  // build walls with variety
  for (let x = 0; x < MAZE_W; x++) {
    for (let z = 0; z < MAZE_H; z++) {
      if (grid[x][z] === 0) {
        const wx1 = ox + x;
        const wz1 = oz + z;

        bot.chat(
          `/fill ${wx1} ${oy} ${wz1} ${wx1} ${
            oy + WALL_HEIGHT - 1
          } ${wz1} ${WALL_BLOCK}`
        );

        await sleep(5);
      }
    }
  }
}

async function renderObstacles(obstacles, ox, oy, oz) {
  for (const obs of obstacles) {
    const wx = ox + obs.x;
    const wz = oz + obs.z;

    switch (obs.type) {
      case "gap":
        bot.chat(`/setblock ${wx} ${oy - 1} ${wz} air`);
        break;

      case "water":
        bot.chat(`/setblock ${wx} ${oy - 1} ${wz} water`);
        break;
    }

    await sleep(5);
  }

  bot.chat(`Added ${obstacles.length} obstacles! 🧗`);
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}
