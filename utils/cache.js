/**
 * @file In-memory TTL cache utility for MuzaLife backend.
 *
 * Provides a lightweight, dependency-free Map-based cache with per-entry
 * time-to-live (TTL) support.  Intended for caching expensive database query
 * results (e.g. full product catalogue, FAQ list) between requests.
 *
 * **Architecture:** a single {@link Cache} class holds a `Map<string, Entry>`.
 * Each entry stores the cached value and the timestamp at which it expires.
 * Entries are lazily evicted on read; a periodic cleanup timer removes stale
 * entries every {@link CLEANUP_INTERVAL_MS} milliseconds so memory does not
 * grow unbounded.
 *
 * **Usage:**
 * ```js
 * import { appCache } from '../utils/cache.js';
 *
 * // Store a value with a 5-minute TTL
 * appCache.set('products:all', productsArray, 5 * 60 * 1000);
 *
 * // Retrieve (returns null if expired or missing)
 * const cached = appCache.get('products:all');
 * if (cached) return res.json(cached);
 * ```
 * @module utils/cache
 */

import logger from './logger.js';

/** How often the background cleanup runs (ms). */
const CLEANUP_INTERVAL_MS = 60_000; // 1 minute

/**
 * Lightweight in-memory TTL cache.
 * @template V - Type of stored values.
 */
class Cache {
  /**
   *
   */
  constructor() {
    /** @type {Map<string, {value: any, expiresAt: number}>} */
    this._store = new Map();

    // Background cleanup to evict expired entries
    this._cleanupTimer = setInterval(() => this._cleanup(), CLEANUP_INTERVAL_MS);

    // Do not block process exit for this timer
    if (this._cleanupTimer.unref) {
      this._cleanupTimer.unref();
    }
  }

  /**
   * Stores `value` under `key` with the given `ttlMs`.
   * @param {string} key    - Cache key.
   * @param {*}      value  - Value to cache (any JSON-serialisable type).
   * @param {number} ttlMs  - Time-to-live in milliseconds.
   */
  set(key, value, ttlMs) {
    this._store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
    logger.debug('Cache SET', { module: 'cache', key, ttlMs });
  }

  /**
   * Returns the cached value for `key`, or `null` if absent / expired.
   * @param {string} key - Cache key.
   * @returns {*|null}
   */
  get(key) {
    const entry = this._store.get(key);
    if (!entry) {return null;}
    if (Date.now() > entry.expiresAt) {
      this._store.delete(key);
      logger.debug('Cache MISS (expired)', { module: 'cache', key });
      return null;
    }
    logger.debug('Cache HIT', { module: 'cache', key });
    return entry.value;
  }

  /**
   * Returns `true` if `key` exists and has not expired.
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    return this.get(key) !== null;
  }

  /**
   * Removes `key` from the cache (e.g. after a mutation).
   * @param {string} key
   */
  invalidate(key) {
    this._store.delete(key);
    logger.debug('Cache INVALIDATE', { module: 'cache', key });
  }

  /**
   * Removes all entries whose keys start with `prefix`.
   * Useful for invalidating a whole namespace (e.g. `"products:"`).
   * @param {string} prefix
   */
  invalidatePrefix(prefix) {
    for (const key of this._store.keys()) {
      if (key.startsWith(prefix)) {
        this._store.delete(key);
      }
    }
    logger.debug('Cache INVALIDATE prefix', { module: 'cache', prefix });
  }

  /**
   * Clears the entire cache.
   */
  clear() {
    this._store.clear();
    logger.debug('Cache CLEAR', { module: 'cache' });
  }

  /**
   * Returns cache statistics for APM / monitoring.
   * @returns {{ size: number, keys: string[] }}
   */
  stats() {
    const now = Date.now();
    const liveKeys = [];
    for (const [key, entry] of this._store.entries()) {
      if (entry.expiresAt > now) {liveKeys.push(key);}
    }
    return { size: liveKeys.length, keys: liveKeys };
  }

  /** Evicts all expired entries (called by background timer). */
  _cleanup() {
    const now = Date.now();
    let evicted = 0;
    for (const [key, entry] of this._store.entries()) {
      if (now > entry.expiresAt) {
        this._store.delete(key);
        evicted++;
      }
    }
    if (evicted > 0) {
      logger.debug('Cache cleanup evicted stale entries', { module: 'cache', evicted });
    }
  }
}

/**
 * Shared application-wide cache instance.
 * Import this singleton wherever caching is needed.
 * @type {Cache}
 */
export const appCache = new Cache();

// ── Cache TTL constants ───────────────────────────────────────────────────────
/** TTL for the full product catalogue (5 minutes). */
export const TTL_PRODUCTS_LIST  = 5 * 60 * 1000;
/** TTL for a single product by ID (5 minutes). */
export const TTL_PRODUCT_SINGLE = 5 * 60 * 1000;
/** TTL for the FAQ list (10 minutes — changes rarely). */
export const TTL_FAQS           = 10 * 60 * 1000;
/** TTL for poll data (2 minutes — votes can come in quickly). */
export const TTL_POLLS          = 2 * 60 * 1000;
