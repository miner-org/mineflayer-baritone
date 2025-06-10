class Move {
  constructor(name, cost = 1) {
    this.name = name;
    this.cost = cost;
  }

  isAvailable(bot, from) {
    return true;
  }

  /**
   *
   * @param {import("mineflayer").Bot} bot
   * @param {import("vec3").Vec3} from
   * @returns
   */
  generateMoves(bot, from) {
    return [];
  }
}

module.exports = Move;
