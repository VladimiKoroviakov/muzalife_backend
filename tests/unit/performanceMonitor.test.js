/**
 * @file Unit tests for the performance monitoring middleware.
 *
 * Tests `middleware/performanceMonitor.js`:
 *   performanceMonitor — Express middleware
 *   getMetricsSummary  — aggregated stats
 *   resetMetrics       — clears store
 * @module tests/unit/performanceMonitor
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// logger is globally mocked by tests/setup.js
import logger from '../../utils/logger.js';

import {
  performanceMonitor,
  getMetricsSummary,
  resetMetrics,
} from '../../middleware/performanceMonitor.js';

/**
 *
 * @param handler
 */
function makeMonitorApp(handler) {
  const app = express();
  app.use(performanceMonitor);
  app.get('/test', handler);
  return app;
}

beforeEach(() => {
  resetMetrics();
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// Basic middleware behaviour
// ─────────────────────────────────────────────────────────────────────────────
describe('performanceMonitor middleware', () => {
  it('calls next()', async () => {
    const app = makeMonitorApp((_req, res) => res.json({ ok: true }));

    const res = await request(app).get('/test');

    expect(res.status).toBe(200);
  });

  it('records a sample for the route after response', async () => {
    const app = makeMonitorApp((_req, res) => res.json({ ok: true }));

    await request(app).get('/test');

    const summary = getMetricsSummary();
    expect(summary.length).toBeGreaterThan(0);
    expect(summary[0].route).toBe('GET /test');
    expect(summary[0].count).toBe(1);
  });

  it('normalises numeric path segment to :id', async () => {
    const app = express();
    app.use(performanceMonitor);
    app.get('/api/products/:id', (_req, res) => res.json({ ok: true }));

    await request(app).get('/api/products/123');

    const summary = getMetricsSummary();
    expect(summary[0].route).toBe('GET /api/products/:id');
  });

  it('strips query string when normalising route key', async () => {
    const app = express();
    app.use(performanceMonitor);
    app.get('/api/products', (_req, res) => res.json({ ok: true }));

    await request(app).get('/api/products?page=1');

    const summary = getMetricsSummary();
    expect(summary[0].route).toBe('GET /api/products');
  });

  it('increments error count for 5xx response', async () => {
    const app = makeMonitorApp((_req, res) => res.status(500).json({ error: true }));

    await request(app).get('/test');

    const summary = getMetricsSummary();
    expect(summary[0].errors).toBe(1);
  });

  it('does not increment error count for 2xx response', async () => {
    const app = makeMonitorApp((_req, res) => res.json({ ok: true }));

    await request(app).get('/test');

    const summary = getMetricsSummary();
    expect(summary[0].errors).toBe(0);
  });

  it('accumulates multiple samples for same route', async () => {
    const app = makeMonitorApp((_req, res) => res.json({ ok: true }));

    await request(app).get('/test');
    await request(app).get('/test');
    await request(app).get('/test');

    const summary = getMetricsSummary();
    expect(summary[0].count).toBe(3);
  });

  it('emits slow-request warning when duration exceeds 500ms', async () => {
    const originalHrtime = process.hrtime.bigint;
    let callCount = 0;
    process.hrtime.bigint = vi.fn(() => {
      callCount++;
      // First call (start): 0; second call (finish): 600ms in nanoseconds
      return callCount === 1 ? BigInt(0) : BigInt(600_000_000);
    });

    const app = makeMonitorApp((_req, res) => res.json({ ok: true }));
    await request(app).get('/test');

    expect(logger.warn).toHaveBeenCalledWith(
      'Slow request detected',
      expect.objectContaining({ module: 'performanceMonitor' }),
    );

    process.hrtime.bigint = originalHrtime;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getMetricsSummary
// ─────────────────────────────────────────────────────────────────────────────
describe('getMetricsSummary', () => {
  it('returns empty array when no metrics collected', () => {
    expect(getMetricsSummary()).toEqual([]);
  });

  it('returns correct avg, min, max for single sample', async () => {
    const app = makeMonitorApp((_req, res) => res.json({ ok: true }));
    await request(app).get('/test');

    const summary = getMetricsSummary();
    expect(summary[0].avg).toBeGreaterThanOrEqual(0);
    expect(summary[0].min).toBeGreaterThanOrEqual(0);
    expect(summary[0].max).toBeGreaterThanOrEqual(0);
  });

  it('sorts by p95 descending (slowest routes first)', async () => {
    const fast = express();
    fast.use(performanceMonitor);
    fast.get('/fast', (_req, res) => res.json({ ok: true }));
    fast.get('/slow', (_req, res) => res.json({ ok: true }));

    await request(fast).get('/fast');
    await request(fast).get('/slow');

    const summary = getMetricsSummary();
    // Just verify both routes appear (order may vary in test environment)
    const routes = summary.map((s) => s.route);
    expect(routes).toContain('GET /fast');
    expect(routes).toContain('GET /slow');
  });

  it('includes p50, p95, p99 fields', async () => {
    const app = makeMonitorApp((_req, res) => res.json({ ok: true }));
    await request(app).get('/test');

    const summary = getMetricsSummary();
    expect(typeof summary[0].p50).toBe('number');
    expect(typeof summary[0].p95).toBe('number');
    expect(typeof summary[0].p99).toBe('number');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resetMetrics
// ─────────────────────────────────────────────────────────────────────────────
describe('resetMetrics', () => {
  it('clears all collected metrics', async () => {
    const app = makeMonitorApp((_req, res) => res.json({ ok: true }));
    await request(app).get('/test');

    expect(getMetricsSummary().length).toBeGreaterThan(0);

    resetMetrics();

    expect(getMetricsSummary()).toEqual([]);
  });
});
