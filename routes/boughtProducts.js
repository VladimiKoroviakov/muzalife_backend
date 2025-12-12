import express from 'express';
import pool from "../config/database.js";

const router = express.Router();

// Get bought products for the authenticated user
router.get('/', async (req, res) => {
  try {
    const userId = req.user.user_id;

    const result = await pool.query(`
      SELECT bp.*, p.name AS product_name, p.description AS product_description
      FROM BoughtProducts bp
      JOIN Products p ON bp.product_id = p.product_id
      WHERE bp.user_id = $1
      ORDER BY bp.purchase_date DESC
    `, [userId]);

    res.json({
      success: true,
      boughtProducts: result.rows
    });
  } catch (error) {
    console.error('Error fetching bought products:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch bought products',
      details: error.message
    });
  }
});

// Add a new bought product record
router.post('/', async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { productId, purchaseDate, amount } = req.body;

    const result = await pool.query(`
      INSERT INTO BoughtProducts (user_id, product_id, purchase_date)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [userId, productId, purchaseDate]);

    res.status(201).json({
      success: true,
      boughtProduct: result.rows[0]
    });
  } catch (error) {
    console.error('Error adding bought product:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add bought product',
      details: error.message
    });
  }
}); 

// Delete a bought product record
router.delete('/:boughtProductId', async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { boughtProductId } = req.params;

    const result = await pool.query(`
      DELETE FROM BoughtProducts
      WHERE bought_product_id = $1 AND user_id = $2
      RETURNING *
    `, [boughtProductId, userId]);

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Bought product not found or not owned by user'
      });
    }

    res.json({
      success: true,
      message: 'Bought product deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting bought product:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete bought product',
      details: error.message
    });
  }
});

export default router;