/**
 * @file Analytics API routes for MuzaLife (admin only).
 *
 * Aggregates product engagement data — views, purchases, and saves — within
 * an optional time window.  All endpoints require a valid JWT and admin
 * privileges.
 * @module routes/analytics
 */

import express from 'express';
import pool from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import logger from '../utils/logger.js';

const router = express.Router();

// All analytics routes require authentication
router.use(authenticateToken);

/**
 * Verifies that the authenticated user is an admin.
 * Rejects the request with 403 if not.
 * @param req
 * @param res
 * @param next
 * @private
 */
const requireAdmin = async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT is_admin FROM Users WHERE user_id = $1',
      [req.userId],
    );

    if (!result.rows[0]?.is_admin) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Admins only.',
      });
    }

    next();
  } catch (err) {
    logger.error('Admin check failed in analytics', {
      module: 'routes/analytics',
      requestId: req.requestId,
      error: err.message,
    });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

router.use(requireAdmin);

// ── GET /api/analytics/stats/:productId ──────────────────────────────────────
/**
 * Returns engagement statistics for a single product.
 *
 * **Query parameters (optional):**
 * - `timeFrom` {ISO 8601 string}  Start of the time window. Defaults to 30 days ago.
 * - `timeTo`   {ISO 8601 string}  End of the time window. Defaults to now.
 *
 * **Response shape:**
 * ```json
 * {
 *   "success": true,
 *   "analytics": {
 *     "productId": "5",
 *     "timeFrom": "2026-03-01T00:00:00.000Z",
 *     "timeTo":   "2026-04-01T00:00:00.000Z",
 *     "views":     142,
 *     "purchases": 18,
 *     "saves":     34
 *   }
 * }
 * ```
 */
router.get('/stats/:productId', async (req, res) => {
  const { productId } = req.params;
  const parsedId = parseInt(productId, 10);

  if (isNaN(parsedId)) {
    return res.status(400).json({ success: false, error: 'Invalid product ID' });
  }

  // ── Resolve time window ─────────────────────────────────────────────────────
  // timeFrom / timeTo come from query-string, not path params.
  const now        = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const rawFrom = req.query.timeFrom;
  const rawTo   = req.query.timeTo;

  const startDate = rawFrom ? new Date(rawFrom) : thirtyDaysAgo;
  const endDate   = rawTo   ? new Date(rawTo)   : now;

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return res.status(400).json({
      success: false,
      error: 'Invalid timeFrom or timeTo — use ISO 8601 format (e.g. 2026-01-01T00:00:00Z)',
    });
  }

  if (startDate >= endDate) {
    return res.status(400).json({
      success: false,
      error: 'timeFrom must be earlier than timeTo',
    });
  }

  try {
    // Verify the product exists first
    const productCheck = await pool.query(
      'SELECT product_id FROM Products WHERE product_id = $1',
      [parsedId],
    );

    if (productCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    const [views, purchases, saves] = await Promise.all([
      pool.query(`
        SELECT COUNT(*) AS count FROM ProductViews
        WHERE product_id = $1
          AND viewed_at >= $2
          AND viewed_at <= $3
      `, [parsedId, startDate, endDate]),

      pool.query(`
        SELECT COUNT(*) AS count FROM BoughtUserProducts
        WHERE product_id = $1
          AND bought_at >= $2
          AND bought_at <= $3
      `, [parsedId, startDate, endDate]),

      pool.query(`
        SELECT COUNT(*) AS count FROM SavedUserProducts
        WHERE product_id = $1
          AND saved_at >= $2
          AND saved_at <= $3
      `, [parsedId, startDate, endDate]),
    ]);

    const analyticsData = {
      productId: parsedId,
      timeFrom:  startDate.toISOString(),
      timeTo:    endDate.toISOString(),
      views:     parseInt(views.rows[0].count,     10),
      purchases: parseInt(purchases.rows[0].count, 10),
      saves:     parseInt(saves.rows[0].count,     10),
    };

    logger.debug('Analytics stats computed', {
      module: 'routes/analytics',
      requestId: req.requestId,
      productId: parsedId,
    });

    res.json({ success: true, analytics: analyticsData });

  } catch (error) {
    logger.error('Error fetching analytics', {
      module: 'routes/analytics',
      requestId: req.requestId,
      productId: parsedId,
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to fetch analytics',
      details: error.message,
    });
  }
});

export default router;
