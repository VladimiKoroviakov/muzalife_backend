/**
 * @file HTTP-level integration tests for the APM endpoints.
 *
 * Tests all endpoints in `routes/apm.js`:
 *   GET  /api/apm/stats
 *   GET  /api/apm/health
 *   POST /api/apm/reset
 * @module tests/routes/apm.routes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../middleware/performanceMonitor.js', () => ({
  getMetricsSummary: vi.fn(() => []),
  resetMetrics: vi.fn(),
  performanceMonitor: vi.fn((_req, _res, next) => next()),
}));

vi.mock('../../utils/cache.js', () => ({
  appCache: {
    get: vi.fn().mockReturnValue(null),
    set: vi.fn(),
    stats: vi.fn(() => ({ size: 5, hits: 10, misses: 3 })),
  },
  TTL_PRODUCTS: 300_000,
  TTL_FAQS: 600_000,
  TTL_POLLS: 120_000,
}));

vi.mock('../../utils/logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { getMetricsSummary, resetMetrics } from '../../middleware/performanceMonitor.js';
import apmRouter from '../../routes/apm.js';
import { makeApp } from '../helpers/makeApp.js';

const app = makeApp({ '/api/apm': apmRouter });

beforeEach(() => vi.clearAllMocks());

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/apm/stats
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/apm/stats', () => {
  it('200 — returns success with timestamp, memory, cache, routes', async () => {
    getMetricsSummary.mockReturnValue([{ route: 'GET /api/products', p95: 50 }]);

    const res = await request(app).get('/api/apm/stats');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.timestamp).toBeDefined();
    expect(res.body.uptime).toBeDefined();
    expect(res.body.memory).toBeDefined();
    expect(res.body.memory.heapUsed).toMatch(/MB/);
    expect(res.body.cache).toEqual({ size: 5, hits: 10, misses: 3 });
    expect(res.body.routes).toHaveLength(1);
    expect(res.body.routes[0].route).toBe('GET /api/products');
  });

  it('200 — returns empty routes array when no metrics', async () => {
    getMetricsSummary.mockReturnValue([]);

    const res = await request(app).get('/api/apm/stats');

    expect(res.status).toBe(200);
    expect(res.body.routes).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/apm/health
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/apm/health', () => {
  it('200 — returns status ok, uptime, heapUsedMB', async () => {
    const res = await request(app).get('/api/apm/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.uptime).toBe('string');
    expect(res.body.uptime).toMatch(/s$/);
    expect(typeof res.body.heapUsedMB).toBe('number');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/apm/reset
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/apm/reset', () => {
  it('200 — calls resetMetrics and returns success', async () => {
    const res = await request(app).post('/api/apm/reset');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Metrics reset');
    expect(resetMetrics).toHaveBeenCalledOnce();
  });
});
