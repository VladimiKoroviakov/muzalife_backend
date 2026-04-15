import express from 'express';
import { query } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import { emailService } from '../services/emailService.js';
import logger from '../utils/logger.js';
import { NotFoundError } from '../utils/AppError.js';

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

// ── POST /api/bought-products/:productId/send-materials ──────────────────────
/**
 * Re-sends purchased product material download links to the authenticated user.
 *
 * Verifies that the user owns the purchase, fetches the product's attached
 * files, and emails download links to the user's registered email address.
 *
 * **Auth:** authenticated user (must own the purchase)
 * @param {string} req.params.productId - ID of the purchased product.
 * @returns {object} 200 - `{ success: true, message: { uk, en } }`
 * @throws {NotFoundError} 404 - Product not purchased or has no files.
 */
router.post('/:productId/send-materials', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.userId;
    const productId = Number(req.params.productId);

    if (!Number.isInteger(productId) || productId <= 0) {
      throw new NotFoundError('Product not found', { productId: req.params.productId });
    }

    // Verify ownership and fetch product title + user email in one query
    const purchaseResult = await query(
      `SELECT p.product_title, u.user_email
         FROM BoughtUserProducts bup
         JOIN Products p ON p.product_id = bup.product_id
         JOIN Users u ON u.user_id = bup.user_id
        WHERE bup.user_id = $1 AND bup.product_id = $2`,
      [userId, productId],
    );

    if (!purchaseResult.rows.length) {
      throw new NotFoundError('Product not purchased', { productId, userId });
    }

    const { product_title, user_email } = purchaseResult.rows[0];

    const filesResult = await query(
      `SELECT f.file_name AS "fileName", f.file_url AS "fileUrl"
         FROM Files f
         JOIN ProductFiles pf ON pf.file_id = f.file_id
        WHERE pf.product_id = $1
        ORDER BY f.file_id`,
      [productId],
    );

    if (!filesResult.rows.length) {
      throw new NotFoundError('No materials found for this product', { productId });
    }

    await emailService.sendProductMaterials(user_email, product_title, filesResult.rows);

    logger.info('Product materials re-sent', { requestId: req.requestId, userId, productId });

    res.json({
      success: true,
      message: {
        uk: 'Матеріали надіслано на вашу електронну пошту',
        en: 'Materials sent to your email',
      },
    });
  } catch (err) {
    next(err);
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
