/**
 * @file Application Performance Monitoring (APM) route for MuzaLife.
 *
 * Exposes internal performance statistics collected by
 * {@link module:middleware/performanceMonitor} and cache statistics from
 * {@link module:utils/cache}.
 *
 * **Endpoints:**
 * - `GET /api/apm/stats`  — per-route latency percentiles + cache info
 * - `GET /api/apm/health` — quick liveness check with memory usage
 * - `POST /api/apm/reset` — clears the in-memory metrics (dev / test use)
 * @module routes/apm
 */

import express from 'express';
import { getMetricsSummary, resetMetrics } from '../middleware/performanceMonitor.js';
import { appCache } from '../utils/cache.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * GET /api/apm/stats
 * Returns per-route latency statistics and cache info.
 */
router.get('/stats', (req, res) => {
  logger.debug('APM stats requested', { module: 'routes/apm', requestId: req.requestId });

  const routes  = getMetricsSummary();
  const cache   = appCache.stats();
  const memUsed = process.memoryUsage();

  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      rss:       `${(memUsed.rss       / 1024 / 1024).toFixed(1)} MB`,
      heapUsed:  `${(memUsed.heapUsed  / 1024 / 1024).toFixed(1)} MB`,
      heapTotal: `${(memUsed.heapTotal / 1024 / 1024).toFixed(1)} MB`,
      external:  `${(memUsed.external  / 1024 / 1024).toFixed(1)} MB`,
    },
    cache,
    routes,
  });
});

/**
 * GET /api/apm/health
 * Quick liveness check — returns process uptime and memory snapshot.
 */
router.get('/health', (_req, res) => {
  const mem = process.memoryUsage();
  res.json({
    status: 'ok',
    uptime: `${process.uptime().toFixed(1)}s`,
    heapUsedMB: +(mem.heapUsed / 1024 / 1024).toFixed(1),
  });
});

/**
 * POST /api/apm/reset
 * Clears all collected performance metrics (intended for dev / CI use).
 */
router.post('/reset', (req, res) => {
  logger.info('APM metrics reset', { module: 'routes/apm', requestId: req.requestId });
  resetMetrics();
  res.json({ success: true, message: 'Metrics reset' });
});

export default router;
