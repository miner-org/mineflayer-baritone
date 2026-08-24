const { Vec3 } = require("vec3");

const DEFAULT_GRID_SIZE = 2; // blocks per cache cell (larger = more reuse, less precision)
const DEFAULT_TTL_MS = 30_000; // safety-net expiry even without invalidation

/**
 * @param {Vec3} pos
 * @param {number} gridSize
 * @returns {string}
 */
function snapKey(pos, gridSize) {
  const x = Math.round(pos.x / gridSize) * gridSize;
  const y = Math.round(pos.y / gridSize) * gridSize;
  const z = Math.round(pos.z / gridSize) * gridSize;
  return `${x},${y},${z}`;
}

class PathCache {
  /**
   * @param {{ gridSize?: number, ttlMs?: number, maxEntries?: number }} [opts]
   */
  constructor(opts = {}) {
    this.gridSize = opts.gridSize ?? DEFAULT_GRID_SIZE;
    this.ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
    this.maxEntries = opts.maxEntries ?? 500;

    /** @type {Map<string, { path: any[], cost: number, status: string, chunks: Set<string>, expiresAt: number }>} */
    this.entries = new Map();

    /** @type {Map<string, Set<string>>} chunkKey -> Set of cache keys that pass through it */
    this.chunkIndex = new Map();
  }

  /**
   * @param {Vec3} start
   * @param {Vec3} end
   * @returns {string}
   */
  _key(start, end) {
    return `${snapKey(start, this.gridSize)}|${snapKey(end, this.gridSize)}`;
  }

  /**
   * @param {Vec3} start
   * @param {Vec3} end
   * @returns {{ path: any[], cost: number, status: string } | null}
   */
  get(start, end) {
    const key = this._key(start, end);
    const entry = this.entries.get(key);
    if (!entry) return null;

    if (entry.expiresAt < Date.now()) {
      this._evict(key);
      return null;
    }

    return { path: entry.path, cost: entry.cost, status: entry.status };
  }

  /**
   * @param {Vec3} start
   * @param {Vec3} end
   * @param {{ path: any[], cost: number, status: string, visitedChunks?: Set<string> }} result
   */
  set(start, end, result) {
    // Only cache clean complete results
    if (result.status !== "found") return;

    const key = this._key(start, end);
    const chunks = new Set(result.visitedChunks ?? []);

    if (this.entries.size >= this.maxEntries) {
      this._evictOldest();
    }

    this.entries.set(key, {
      path: result.path,
      cost: result.cost,
      status: result.status,
      chunks,
      expiresAt: Date.now() + this.ttlMs,
    });

    for (const chunkKey of chunks) {
      if (!this.chunkIndex.has(chunkKey))
        this.chunkIndex.set(chunkKey, new Set());
      this.chunkIndex.get(chunkKey).add(key);
    }
  }

  /**
   * @param {Vec3} blockPos
   */
  invalidateNear(blockPos) {
    const chunkKey = `${blockPos.x >> 4},${blockPos.z >> 4}`;
    const affected = this.chunkIndex.get(chunkKey);
    if (!affected) return;

    for (const key of [...affected]) {
      this._evict(key);
    }
  }

  /** @param {string} key */
  _evict(key) {
    const entry = this.entries.get(key);
    if (!entry) return;
    for (const chunkKey of entry.chunks) {
      const set = this.chunkIndex.get(chunkKey);
      if (!set) continue;
      set.delete(key);
      if (set.size === 0) this.chunkIndex.delete(chunkKey);
    }
    this.entries.delete(key);
  }

  _evictOldest() {
    let oldestKey = null;
    let oldestExpiry = Infinity;
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt < oldestExpiry) {
        oldestExpiry = entry.expiresAt;
        oldestKey = key;
      }
    }
    if (oldestKey) this._evict(oldestKey);
  }

  clear() {
    this.entries.clear();
    this.chunkIndex.clear();
  }
}

module.exports = { PathCache, snapKey };
