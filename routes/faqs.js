/**
 * @file FAQ REST API routes for MuzaLife.
 *
 * Optimised with in-memory caching: the full FAQ list is cached for
 * {@link TTL_FAQS} milliseconds (10 min by default) to avoid hitting the
 * database on every request for this rarely-changing data.
 * @module routes/faqs
 */

import express from 'express';
import { query } from '../config/database.js';
import { appCache, TTL_FAQS } from '../utils/cache.js';
import logger from '../utils/logger.js';

const router = express.Router();

const FAQS_CACHE_KEY = 'faqs:all';

// ── GET all FAQs ──────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  // Cache HIT
  const cached = appCache.get(FAQS_CACHE_KEY);
  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    return res.json(cached);
  }

  res.setHeader('X-Cache', 'MISS');
  try {
    const result = await query('SELECT faq_id as id, question, answer FROM FAQs ORDER BY faq_id');

    const payload = {
      success: true,
      data: result.rows,
      count: result.rowCount,
    };

    appCache.set(FAQS_CACHE_KEY, payload, TTL_FAQS);
    logger.debug('FAQs fetched from DB and cached', { module: 'routes/faqs', requestId: req.requestId });

    res.json(payload);
  } catch (error) {
    logger.error('Error fetching FAQs', { module: 'routes/faqs', error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch FAQs', details: error.message });
  }
});

// ── GET single FAQ by ID ──────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('SELECT faq_id as id, question, answer FROM FAQs WHERE faq_id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'FAQ not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error fetching FAQ', { module: 'routes/faqs', error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch FAQ', details: error.message });
  }
});

// ── POST create FAQ (invalidates list cache) ──────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { question, answer } = req.body;
    if (!question || !answer) {
      return res.status(400).json({ success: false, error: 'Question and answer are required' });
    }

    const result = await query(
      'INSERT INTO FAQs (question, answer) VALUES ($1, $2) RETURNING faq_id as id, question, answer',
      [question, answer]
    );

    appCache.invalidate(FAQS_CACHE_KEY); // invalidate stale list
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error creating FAQ', { module: 'routes/faqs', error: error.message });
    res.status(500).json({ success: false, error: 'Failed to create FAQ', details: error.message });
  }
});

// ── PUT update FAQ (invalidates list cache) ───────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { question, answer } = req.body;

    const result = await query(
      'UPDATE FAQs SET question = COALESCE($1, question), answer = COALESCE($2, answer) WHERE faq_id = $3 RETURNING faq_id as id, question, answer',
      [question, answer, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'FAQ not found' });
    }

    appCache.invalidate(FAQS_CACHE_KEY);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error updating FAQ', { module: 'routes/faqs', error: error.message });
    res.status(500).json({ success: false, error: 'Failed to update FAQ', details: error.message });
  }
});

// ── DELETE FAQ (invalidates list cache) ───────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('DELETE FROM FAQs WHERE faq_id = $1 RETURNING faq_id', [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'FAQ not found' });
    }

    appCache.invalidate(FAQS_CACHE_KEY);
    res.json({ success: true, message: 'FAQ deleted' });
  } catch (error) {
    logger.error('Error deleting FAQ', { module: 'routes/faqs', error: error.message });
    res.status(500).json({ success: false, error: 'Failed to delete FAQ', details: error.message });
  }
});

export default router;
