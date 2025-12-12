import express from 'express';
import { query } from '../config/database.js';

const router = express.Router();

// Get personal orders for the authenticated user
router.get('/', async (req, res) => {
  try {
    const userId = req.user.user_id;

    const result = await query(`
      SELECT * FROM PersonalOrders
      WHERE user_id = $1
      ORDER BY order_date DESC
    `, [userId]);

    res.json({
      success: true,
      personalOrders: result.rows
    });
  } catch (error) {
    console.error('Error fetching personal orders:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch personal orders',
      details: error.message
    });
  }
});

// get all personal orders for admin
router.get('/all', async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user.is_admin) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Admins only.'
      });
    }

    const result = await query(`
      SELECT * FROM PersonalOrders
      ORDER BY order_date DESC
    `);

    res.json({
      success: true,
      personalOrders: result.rows
    });
  } catch (error) {
    console.error('Error fetching all personal orders:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch personal orders',
      details: error.message
    });
  }
});

// Add a new personal order
router.post('/', async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { orderDetails, orderDate, amount } = req.body;

    const result = await query(`
      INSERT INTO PersonalOrders (user_id, order_details, order_date, amount)
        VALUES ($1, $2, $3, $4)
        RETURNING *
    `, [userId, orderDetails, orderDate, amount]);

    res.status(201).json({
      success: true,
      personalOrder: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating personal order:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create personal order',
      details: error.message
    });
  }
});

// Update a personal order
router.put('/:orderId', async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { orderId } = req.params;
    const { orderDetails } = req.body;

    const result = await query(`
      UPDATE PersonalOrders
      SET order_status = $1, 
          order_price = $2, 
          order_material_type = $3 , 
          order_material_age_category = $4
          order_deadline = $5
      WHERE order_id = $6 AND user_id = $7
      RETURNING *
    `, [
        orderDetails.status, 
        orderDetails.price, 
        orderDetails.materialType, 
        orderDetails.materialAgeCategory, 
        orderDetails.deadline,
        orderId, 
        userId
      ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Personal order not found or not owned by user'
      });
    }

    res.json({
      success: true,
      personalOrder: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating personal order:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update personal order',
      details: error.message
    });
  }
});
export default router;