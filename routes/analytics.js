import express from 'express';
import pool from '../config/database.js';

const router = express.Router();

// Get analytics stats for a specific product (admin only)
router.get('/stats/:productId', async (req, res) => {
  try {
    const { productId, timeFrom, timeTo } = req.params;

    const views = await pool.query(`
        SELECT * FROM productViews
        WHERE product_id = $1 AND viewed_at BETWEEN $2 AND $3
        ORDER BY viewed_at DESC
    `, [productId, timeFrom, timeTo]);

    const purchases = await pool.query(`
        SELECT * FROM BoughtUserProducts
        WHERE product_id = $1 AND bought_at BETWEEN $2 AND $3
        ORDER BY bought_at DESC
    `, [productId, timeFrom, timeTo]);

    const saves = await pool.query(`
        SELECT * FROM SavedUserProducts
        WHERE product_id = $1 AND saved_at BETWEEN $2 AND $3
        ORDER BY saved_at DESC
    `, [productId, timeFrom, timeTo]);

    const analyticsData = {
        productId,
        views: views.rowCount,
        purchases: purchases.rowCount,
        saves: saves.rowCount,
    };

    res.json({
      success: true,
      analytics: analyticsData
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch analytics',
      details: error.message
    });
  }
});

export default router;