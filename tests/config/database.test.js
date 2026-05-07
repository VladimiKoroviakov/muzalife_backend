/**
 * @file Unit tests for the database configuration module.
 *
 * Tests `config/database.js`: pool creation, event handlers, query export.
 * Mocks `pg` to avoid requiring a real PostgreSQL server.
 * @module tests/config/database
 */

import { describe, it, expect, vi } from 'vitest';

// Capture pool event listeners so they can be triggered in tests
const { poolEventListeners, mockPool } = vi.hoisted(() => {
  const poolEventListeners = {};
  const mockPool = {
    query: vi.fn(),
    connect: vi.fn(),
    on: vi.fn((event, handler) => {
      poolEventListeners[event] = handler;
    }),
  };
  return { poolEventListeners, mockPool };
});

vi.mock('pg', () => ({
  default: {
    Pool: vi.fn(() => mockPool),
  },
}));

vi.mock('../../utils/logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    critical: vi.fn(),
  },
}));

import logger from '../../utils/logger.js';

// ─────────────────────────────────────────────────────────────────────────────
// Module-level pool creation
// ─────────────────────────────────────────────────────────────────────────────
describe('database module', () => {
  it('exports a query function', async () => {
    const { query } = await import('../../config/database.js');
    expect(typeof query).toBe('function');
  });

  it('exports pool as default', async () => {
    const { default: pool } = await import('../../config/database.js');
    expect(pool).toBe(mockPool);
  });

  it('query() delegates to pool.query with text and params', async () => {
    const { query } = await import('../../config/database.js');
    mockPool.query.mockResolvedValue({ rows: [{ id: 1 }] });

    const result = await query('SELECT 1', []);
    expect(mockPool.query).toHaveBeenCalledWith('SELECT 1', []);
    expect(result.rows[0].id).toBe(1);
  });

  it('query() works without params', async () => {
    const { query } = await import('../../config/database.js');
    mockPool.query.mockResolvedValue({ rows: [] });

    await query('SELECT NOW()');
    expect(mockPool.query).toHaveBeenCalledWith('SELECT NOW()', undefined);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Pool event handlers
// ─────────────────────────────────────────────────────────────────────────────
describe('pool event handlers', () => {
  it('registers connect and error handlers (captured in poolEventListeners)', async () => {
    await import('../../config/database.js');
    expect(typeof poolEventListeners.connect).toBe('function');
    expect(typeof poolEventListeners.error).toBe('function');
  });

  it('connect handler calls logger.debug', async () => {
    await import('../../config/database.js');
    vi.clearAllMocks(); // clear any startup calls

    if (typeof poolEventListeners.connect === 'function') {
      poolEventListeners.connect();
      expect(logger.debug).toHaveBeenCalledWith(
        'New PostgreSQL connection acquired from pool',
        expect.objectContaining({ module: 'config/database' }),
      );
    }
  });

  it('error handler calls logger.error with error info', async () => {
    await import('../../config/database.js');
    vi.clearAllMocks();

    if (typeof poolEventListeners.error === 'function') {
      const testError = new Error('connection reset');
      poolEventListeners.error(testError);
      expect(logger.error).toHaveBeenCalledWith(
        'Unexpected error on idle PostgreSQL client',
        expect.objectContaining({
          module: 'config/database',
          error: 'connection reset',
        }),
      );
    }
  });
});
