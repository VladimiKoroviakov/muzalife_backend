import express from 'express';
import { query } from '../config/database.js';

const router = express.Router();

// GET all FAQs
router.get('/', async (req, res) => {
  try {
    const result = await query('SELECT faq_id as id, question, answer FROM FAQs ORDER BY faq_id');
    
    res.json({
      success: true,
      data: result.rows,
      count: result.rowCount
    });
  } catch (error) {
    console.error('Error fetching FAQs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch FAQs',
      details: error.message
    });
  }
});

// GET single FAQ by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('SELECT faq_id as id, question, answer FROM FAQs WHERE faq_id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'FAQ not found'
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching FAQ:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch FAQ',
      details: error.message
    });
  }
});

export default router;