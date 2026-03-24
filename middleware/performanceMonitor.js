/**
 * @file Performance monitoring middleware for MuzaLife backend.
 *
 * Collects per-endpoint latency metrics, aggregates them in-memory, and
 * exposes the summary via the APM stats endpoint (`GET /api/apm/stats`).
 *
 * **Architecture:** metrics are stored in a plain JS Map keyed by
 * `"METHOD /route"`.  Each bucket holds a rolling window of the last
 * {@link MAX_SAMPLES} latency samples plus derived statistics (min, max,
 * p50, p95, p99, avg, count).  No external dependency is required.
 *
 * **Integration:** mount this middleware **before** route handlers so the
 * full handler latency is captured.
 * @module middleware/performanceMonitor
 */

import logger from '../utils/logger.js';

/** Maximum latency samples retained per route bucket (rolling window). */
const MAX_SAMPLES = 500;

/**
 * In-memory metrics store.
 * Key: `"METHOD /normalised-path"` (e.g. `"GET /api/products"`).
 * @type {Map<string, {samples: number[], count: number, errors: number}>}
 */
const metricsStore = new Map();

/**
 * Returns a normalised route key from a raw URL by replacing numeric
 * path segments with `:id` to group per-resource endpoints.
 * @param {string} method - HTTP verb.
 * @param {string} url    - Raw `req.originalUrl` value.
 * @returns {string} Normalised key, e.g. `"GET /api/products/:id"`.
 */
const normaliseKey = (method, url) => {
  // Strip query string, then replace numeric segments with :id placeholder
  const path = url.split('?')[0].replace(/\/\d+/g, '/:id');
  return `${method} ${path}`;
};

/**
 * Computes p-th percentile of a sorted numeric array.
 * @param {number[]} sorted - Ascending-sorted array.
 * @param {number}   p      - Percentile 0–100.
 * @returns {number}
 */
const percentile = (sorted, p) => {
  if (sorted.length === 0) {return 0;}
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
};

/**
 * Records a latency sample for the given route key.
 * @param {string}  key       - Normalised route key.
 * @param {number}  durationMs - Elapsed milliseconds.
 * @param {boolean} isError   - Whether the response was a server error (5xx).
 */
const recordSample = (key, durationMs, isError) => {
  if (!metricsStore.has(key)) {
    metricsStore.set(key, { samples: [], count: 0, errors: 0 });
  }
  const bucket = metricsStore.get(key);
  bucket.samples.push(durationMs);
  if (bucket.samples.length > MAX_SAMPLES) {
    bucket.samples.shift(); // keep rolling window
  }
  bucket.count += 1;
  if (isError) {bucket.errors += 1;}
};

/**
 * Express middleware that measures response time for every HTTP request and
 * records it into {@link metricsStore}.
 *
 * Attach with `app.use(performanceMonitor)` **before** all route handlers.
 * @param {object}   req  - Express request.
 * @param {object}   res  - Express response.
 * @param {Function} next - Next middleware in the chain.
 */
export const performanceMonitor = (req, res, next) => {
  const start = process.hrtime.bigint(); // nanosecond precision

  res.on('finish', () => {
    const durationNs = process.hrtime.bigint() - start;
    const durationMs = Number(durationNs) / 1_000_000;
    const key = normaliseKey(req.method, req.originalUrl);
    const isError = res.statusCode >= 500;

    recordSample(key, durationMs, isError);

    // Emit slow-request warnings (threshold: 500 ms)
    if (durationMs > 500) {
      logger.warn('Slow request detected', {
        module: 'performanceMonitor',
        route: key,
        durationMs: durationMs.toFixed(2),
        statusCode: res.statusCode,
        requestId: req.requestId,
      });
    }
  });

  next();
};

/**
 * Returns aggregated performance statistics for all observed routes.
 * @returns {object[]} Array of route stat objects sorted by descending p95.
 * @example
 * // { route, count, errors, avg, min, max, p50, p95, p99 }
 */
export const getMetricsSummary = () => {
  const result = [];
  for (const [route, bucket] of metricsStore.entries()) {
    const sorted = [...bucket.samples].sort((a, b) => a - b);
    const avg = sorted.reduce((s, v) => s + v, 0) / (sorted.length || 1);
    result.push({
      route,
      count:  bucket.count,
      errors: bucket.errors,
      avg:    +avg.toFixed(2),
      min:    +sorted[0]?.toFixed(2) || 0,
      max:    +sorted[sorted.length - 1]?.toFixed(2) || 0,
      p50:    +percentile(sorted, 50).toFixed(2),
      p95:    +percentile(sorted, 95).toFixed(2),
      p99:    +percentile(sorted, 99).toFixed(2),
    });
  }
  // Sort by p95 descending (worst routes first)
  return result.sort((a, b) => b.p95 - a.p95);
};

/**
 * Resets all collected metrics (useful for tests).
 */
export const resetMetrics = () => metricsStore.clear();
