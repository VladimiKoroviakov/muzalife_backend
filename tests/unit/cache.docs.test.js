/**
 * @file Living documentation for {@link module:utils/cache}.
 *
 * Specifies the TTL-based eviction rules, namespace invalidation, and stats
 * reporting of the in-memory `appCache` singleton used throughout the backend.
 *
 * Logger is mocked so Winston never writes to disk during tests.
 * `vi.useFakeTimers()` is used in scoped `describe` blocks to advance time
 * without sleeping, keeping the suite fast.
 * @module tests/unit/cache.docs
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../utils/logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { appCache } from '../../utils/cache.js';

// ─────────────────────────────────────────────────────────────────────────────
// set() and get() — basic read/write
// ─────────────────────────────────────────────────────────────────────────────
describe('appCache.set() and appCache.get() — basic read/write', () => {
  beforeEach(() => appCache.clear());

  it('get() returns null for a key that has never been set', () => {
    expect(appCache.get('does-not-exist')).toBeNull();
  });

  it('get() returns the stored value immediately after set()', () => {
    appCache.set('greeting', 'hello', 60_000);
    expect(appCache.get('greeting')).toBe('hello');
  });

  it('stores any JSON-serialisable value — object, array, number, boolean', () => {
    appCache.set('obj', { a: 1 }, 60_000);
    appCache.set('arr', [1, 2, 3], 60_000);
    appCache.set('num', 42, 60_000);
    appCache.set('bool', false, 60_000);

    expect(appCache.get('obj')).toEqual({ a: 1 });
    expect(appCache.get('arr')).toEqual([1, 2, 3]);
    expect(appCache.get('num')).toBe(42);
    expect(appCache.get('bool')).toBe(false);
  });

  it('overwriting an existing key replaces the value', () => {
    appCache.set('key', 'first', 60_000);
    appCache.set('key', 'second', 60_000);
    expect(appCache.get('key')).toBe('second');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TTL expiry
// ─────────────────────────────────────────────────────────────────────────────
describe('appCache — TTL expiry (fake timers)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    appCache.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('get() returns the value before TTL elapses', () => {
    appCache.set('fresh', 'data', 5_000);
    vi.advanceTimersByTime(4_999);
    expect(appCache.get('fresh')).toBe('data');
  });

  it('get() returns null after TTL elapses (lazy eviction on read)', () => {
    appCache.set('stale', 'data', 5_000);
    vi.advanceTimersByTime(5_001);
    expect(appCache.get('stale')).toBeNull();
  });

  it('has() returns false after TTL elapses', () => {
    appCache.set('item', 'v', 1_000);
    vi.advanceTimersByTime(1_001);
    expect(appCache.has('item')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// has() — key existence check
// ─────────────────────────────────────────────────────────────────────────────
describe('appCache.has() — key existence check', () => {
  beforeEach(() => appCache.clear());

  it('returns false for a missing key', () => {
    expect(appCache.has('missing')).toBe(false);
  });

  it('returns true for a live entry', () => {
    appCache.set('alive', 'yes', 60_000);
    expect(appCache.has('alive')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// invalidate() — single key removal
// ─────────────────────────────────────────────────────────────────────────────
describe('appCache.invalidate() — single key removal', () => {
  beforeEach(() => appCache.clear());

  it('removes the target key so get() returns null', () => {
    appCache.set('target', 'v', 60_000);
    appCache.invalidate('target');
    expect(appCache.get('target')).toBeNull();
  });

  it('does not affect other keys in the cache', () => {
    appCache.set('a', 1, 60_000);
    appCache.set('b', 2, 60_000);
    appCache.invalidate('a');
    expect(appCache.get('b')).toBe(2);
  });

  it('calling invalidate() on a non-existent key does not throw', () => {
    expect(() => appCache.invalidate('ghost')).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// invalidatePrefix() — namespace invalidation
// ─────────────────────────────────────────────────────────────────────────────
describe('appCache.invalidatePrefix() — namespace invalidation', () => {
  beforeEach(() => appCache.clear());

  it('removes all keys that start with the prefix', () => {
    appCache.set('products:all', [], 60_000);
    appCache.set('products:1', {}, 60_000);
    appCache.set('products:2', {}, 60_000);
    appCache.invalidatePrefix('products:');
    expect(appCache.get('products:all')).toBeNull();
    expect(appCache.get('products:1')).toBeNull();
    expect(appCache.get('products:2')).toBeNull();
  });

  it('leaves keys with a different prefix untouched', () => {
    appCache.set('faqs:all', ['faq'], 60_000);
    appCache.set('products:all', [], 60_000);
    appCache.invalidatePrefix('products:');
    expect(appCache.get('faqs:all')).toEqual(['faq']);
  });

  it('is a no-op when no key matches the prefix', () => {
    appCache.set('unrelated', 'value', 60_000);
    expect(() => appCache.invalidatePrefix('nonexistent:')).not.toThrow();
    expect(appCache.get('unrelated')).toBe('value');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// clear() — full reset
// ─────────────────────────────────────────────────────────────────────────────
describe('appCache.clear() — full reset', () => {
  it('after clear(), get() returns null for all previously stored keys', () => {
    appCache.set('x', 1, 60_000);
    appCache.set('y', 2, 60_000);
    appCache.clear();
    expect(appCache.get('x')).toBeNull();
    expect(appCache.get('y')).toBeNull();
  });

  it('stats() reports size 0 after clear()', () => {
    appCache.set('z', 3, 60_000);
    appCache.clear();
    expect(appCache.stats().size).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// stats() — live entry reporting
// ─────────────────────────────────────────────────────────────────────────────
describe('appCache.stats() — live entry reporting', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    appCache.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports size 0 and an empty keys array when the cache is empty', () => {
    const { size, keys } = appCache.stats();
    expect(size).toBe(0);
    expect(keys).toEqual([]);
  });

  it('reports only live (non-expired) keys in size and keys array', () => {
    appCache.set('live', 'v', 10_000);
    const { size, keys } = appCache.stats();
    expect(size).toBe(1);
    expect(keys).toContain('live');
  });

  it('excludes expired entries from stats even before lazy eviction', () => {
    appCache.set('soon-expired', 'v', 1_000);
    vi.advanceTimersByTime(1_001);
    const { size, keys } = appCache.stats();
    expect(size).toBe(0);
    expect(keys).not.toContain('soon-expired');
  });
});
