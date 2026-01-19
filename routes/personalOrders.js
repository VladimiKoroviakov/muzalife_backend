import express from 'express';
import { query } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Get personal orders for the authenticated user
router.get('/', async (req, res) => {
  try {
    const userId = req.userId;
    
    const result = await query(`
      SELECT * FROM PersonalOrders
      WHERE user_id = $1
      ORDER BY order_created_at DESC
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

// Get all personal orders for admin
router.get('/all', async (req, res) => {
  try {
    const userId = req.userId;
    
    // Check if user is admin by querying database
    const userResult = await query(
      'SELECT is_admin FROM Users WHERE user_id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const user = userResult.rows[0];
    
    if (!user.is_admin) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Admins only.'
      });
    }

    // User is admin, fetch all orders
    const result = await query(`
      SELECT 
        po.*,
        u.name as user_name,
        u.email as user_email
      FROM PersonalOrders po
      JOIN Users u ON po.user_id = u.user_id
      ORDER BY po.order_created_at DESC
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
    const userId = req.userId;
    const { 
      orderTitle, 
      orderDescription, 
      orderStatus, 
      orderPrice, 
      orderMaterialType, 
      orderMaterialAgeCategory,
      orderDeadline 
    } = req.body;

    // Validate required fields
    if (!orderTitle || !orderDescription || !orderMaterialType || !orderMaterialAgeCategory) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    const result = await query(`
      INSERT INTO PersonalOrders (
        user_id, 
        order_title, 
        order_description, 
        order_status, 
        order_price, 
        order_material_type, 
        order_material_age_category,
        order_deadline
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      userId, 
      orderTitle, 
      orderDescription, 
      orderStatus || 'pending',  // Default status
      orderPrice || 0,           // Default price
      orderMaterialType, 
      orderMaterialAgeCategory,
      orderDeadline || null
    ]);

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

// Get a single personal order by ID
router.get('/:orderId', async (req, res) => {
  try {
    const userId = req.userId;
    const { orderId } = req.params;

    // First, check if the order exists and belongs to the user or if user is admin
    const orderResult = await query(
      'SELECT * FROM PersonalOrders WHERE order_id = $1',
      [orderId]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Personal order not found'
      });
    }

    const order = orderResult.rows[0];
    
    // Check if user owns the order
    if (order.user_id !== userId) {
      // User doesn't own the order, check if they're admin
      const userResult = await query(
        'SELECT is_admin FROM Users WHERE user_id = $1',
        [userId]
      );
      
      if (userResult.rows.length === 0 || !userResult.rows[0].is_admin) {
        return res.status(403).json({
          success: false,
          error: 'Not authorized to view this order'
        });
      }
      // Admin can view any order
    }

    res.json({
      success: true,
      personalOrder: order
    });
  } catch (error) {
    console.error('Error fetching personal order:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch personal order',
      details: error.message
    });
  }
});

// Update a personal order
router.put('/:orderId', async (req, res) => {
  try {
    const userId = req.userId;
    const { orderId } = req.params;
    const { 
      orderTitle,
      orderDescription,
      orderStatus, 
      orderPrice, 
      orderMaterialType, 
      orderMaterialAgeCategory,
      orderDeadline 
    } = req.body;

    // Check if order exists
    const checkOwnership = await query(
      'SELECT user_id FROM PersonalOrders WHERE order_id = $1',
      [orderId]
    );

    if (checkOwnership.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Personal order not found'
      });
    }

    const orderUserId = checkOwnership.rows[0].user_id;
    
    // Check if user is admin
    const userResult = await query(
      'SELECT is_admin FROM Users WHERE user_id = $1',
      [userId]
    );
    
    const isAdmin = userResult.rows.length > 0 ? userResult.rows[0].is_admin : false;
    
    // Only allow update if user owns the order or is admin
    if (orderUserId !== userId && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to update this order'
      });
    }

    // Build update query dynamically based on provided fields
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (orderTitle !== undefined) {
      updates.push(`order_title = $${paramIndex++}`);
      values.push(orderTitle);
    }
    if (orderDescription !== undefined) {
      updates.push(`order_description = $${paramIndex++}`);
      values.push(orderDescription);
    }
    if (orderStatus !== undefined) {
      updates.push(`order_status = $${paramIndex++}`);
      values.push(orderStatus);
    }
    if (orderPrice !== undefined) {
      updates.push(`order_price = $${paramIndex++}`);
      values.push(orderPrice);
    }
    if (orderMaterialType !== undefined) {
      updates.push(`order_material_type = $${paramIndex++}`);
      values.push(orderMaterialType);
    }
    if (orderMaterialAgeCategory !== undefined) {
      updates.push(`order_material_age_category = $${paramIndex++}`);
      values.push(orderMaterialAgeCategory);
    }
    if (orderDeadline !== undefined) {
      updates.push(`order_deadline = $${paramIndex++}`);
      values.push(orderDeadline);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    values.push(orderId);
    
    const result = await query(`
      UPDATE PersonalOrders
      SET ${updates.join(', ')}
      WHERE order_id = $${paramIndex}
      RETURNING *
    `, values);

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

// Delete a personal order
router.delete('/:orderId', async (req, res) => {
  try {
    const userId = req.userId;
    const { orderId } = req.params;

    // Check if order exists
    const checkOwnership = await query(
      'SELECT user_id FROM PersonalOrders WHERE order_id = $1',
      [orderId]
    );

    if (checkOwnership.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Personal order not found'
      });
    }

    const orderUserId = checkOwnership.rows[0].user_id;
    
    // Check if user is admin
    const userResult = await query(
      'SELECT is_admin FROM Users WHERE user_id = $1',
      [userId]
    );
    
    const isAdmin = userResult.rows.length > 0 ? userResult.rows[0].is_admin : false;
    
    // Only allow delete if user owns the order or is admin
    if (orderUserId !== userId && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to delete this order'
      });
    }

    await query('DELETE FROM PersonalOrders WHERE order_id = $1', [orderId]);

    res.json({
      success: true,
      message: 'Personal order deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting personal order:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete personal order',
      details: error.message
    });
  }
});

export default router;