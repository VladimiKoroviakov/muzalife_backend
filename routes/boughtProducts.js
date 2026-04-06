import express from 'express';
import { query } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get full bought products
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;

    const result = await query(
      `SELECT
        p.product_id AS id,
        p.product_title AS title,
        pt.product_type_name AS type,
        p.product_hidden AS hidden,
        bup.bought_at AS boughtAt
      FROM BoughtUserProducts bup
      JOIN Products p      ON p.product_id = bup.product_id
      JOIN ProductTypes pt ON pt.product_type_id = p.product_type_id
      WHERE bup.user_id = $1
      ORDER BY bup.bought_at DESC`,
      [userId]
    );

    const products = result.rows.map((p) => ({
      id: p.id,
      title: p.title,
      type: p.type,
      boughtAt: p.boughtat,
      hidden: p.hidden
    }));

    res.json({
      success: true,
      data: products
    });
  } catch (error) {
    console.error('Error fetching bought products:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch bought products'
    });
  }
});

// Add a product to bought products (record a purchase)
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
      'SELECT product_id FROM Products WHERE product_id = $1 AND product_hidden = false',
      [productId]
    );

    if (productCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    // Check if already bought (optional - you might want to allow multiple purchases)
    // If you want to prevent duplicates, uncomment this:
    /*
    const existingPurchase = await query(
      'SELECT * FROM BoughtUserProducts WHERE user_id = $1 AND product_id = $2',
      [userId, productId]
    );

    if (existingPurchase.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'Product already purchased'
      });
    }
    */

    // Record the purchase
    await query(
      'INSERT INTO BoughtUserProducts (user_id, product_id) VALUES ($1, $2)',
      [userId, productId]
    );

    res.status(201).json({
      success: true
    });
  } catch (error) {
    console.error('Error recording purchase:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record purchase'
    });
  }
});

// Remove a product from bought products (optional - you might not want to allow this)
router.delete('/:productId', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { productId } = req.params;

    const result = await query(
      'DELETE FROM BoughtUserProducts WHERE user_id = $1 AND product_id = $2',
      [userId, productId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Purchased product not found'
      });
    }

    res.json({
      success: true
    });
  } catch (error) {
    console.error('Error removing purchased product:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove purchased product'
    });
  }
});


export default router;
