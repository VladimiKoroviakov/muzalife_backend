import express from 'express';
import { query } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get only saved product IDs (for bookmarks)
router.get('/ids', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    
    const result = await query(
      'SELECT product_id FROM SavedUserProducts WHERE user_id = $1',
      [userId]
    );
    
    const productIds = result.rows.map(row => row.product_id);
    
    res.json({
      success: true,
      data: productIds
    });
  } catch (error) {
    console.error('Error fetching saved product IDs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch saved product IDs'
    });
  }
});

// Save a product (add to saved products)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({
        success: false,
        error: 'Product ID is required'
      });
    }

    // Check if product exists
    const productCheck = await query(
      'SELECT product_id FROM Products WHERE product_id = $1',
      [productId]
    );

    if (productCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    // Check if already saved
    const existingSave = await query(
      'SELECT * FROM SavedUserProducts WHERE user_id = $1 AND product_id = $2',
      [userId, productId]
    );

    if (existingSave.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'Product already saved'
      });
    }

    // Save the product
    await query(
      'INSERT INTO SavedUserProducts (user_id, product_id) VALUES ($1, $2)',
      [userId, productId]
    );

    res.status(201).json({
      success: true
    });
  } catch (error) {
    console.error('Error saving product:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save product'
    });
  }
});

// Unsave a product (remove from saved products)
router.delete('/:productId', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { productId } = req.params;

    const result = await query(
      'DELETE FROM SavedUserProducts WHERE user_id = $1 AND product_id = $2',
      [userId, productId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Saved product not found'
      });
    }

    res.json({
      success: true
    });
  } catch (error) {
    console.error('Error unsaving product:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to unsave product'
    });
  }
});

export default router;