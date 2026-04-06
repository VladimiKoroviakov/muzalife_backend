import express from 'express';
import pool from '../config/database.js';
import { appCache } from '../utils/cache.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Cache TTL for metadata (e.g., 1 hour, as it rarely changes)
const TTL_METADATA = 60 * 60 * 1000;

/**
 * Generic helper to fetch lookup tables
 * @param req
 * @param res
 * @param {string} key - Cache key
 * @param {string} query - SQL Query
 */
async function getLookupData(req, res, key, query) {
  const cached = appCache.get(key);
  if (cached) {
    return res.json({ success: true, data: cached });
  }

  try {
    const result = await pool.query(query);
    appCache.set(key, result.rows, TTL_METADATA);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error(`Error fetching metadata [${key}]`, {
      module: 'routes/metadata',
      requestId: req.requestId,
      error: error.message,
    });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

// ── GET /api/metadata/types ──────────────────────────────────────────────────
router.get('/types', (req, res) => {
  const query = 'SELECT product_type_id AS id, product_type_name AS name FROM ProductTypes ORDER BY name ASC';
  getLookupData(req, res, 'meta:types', query);
});

// ── GET /api/metadata/age-categories ─────────────────────────────────────────
router.get('/age-categories', (req, res) => {
  const query = 'SELECT age_category_id AS id, age_category_name AS name FROM AgeCategories ORDER BY age_category_id ASC';
  getLookupData(req, res, 'meta:age_cats', query);
});

// ── GET /api/metadata/events ─────────────────────────────────────────────────
router.get('/events', (req, res) => {
  const query = 'SELECT event_id AS id, event_name AS name FROM Events ORDER BY name ASC';
  getLookupData(req, res, 'meta:events', query);
});

export default router;
