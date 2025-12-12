import bcrypt from 'bcryptjs';
import { query } from '../config/database.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { constructFullUrl } from '../utils/urlHelper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get user profile
 */
export const getProfile = async (req, res) => {
  try {
    const result = await query(
      `SELECT user_id, user_email, user_name, user_avatar_url, user_auth_provider, user_created_at, is_admin 
       FROM Users WHERE user_id = $1`,
      [req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    
    const userProfile = {
      user: {
        id: user.user_id,
        name: user.user_name,
        email: user.user_email,
        avatar_url: constructFullUrl(req, user.user_avatar_url),
        authProvider: user.user_auth_provider,
        createdAt: user.user_created_at,
        is_admin: user.is_admin  // Add this field
      }
    };
    
    res.json(userProfile);
    
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Update user profile
 */
export const updateProfile = async (req, res) => {
  try {
    const { name, email } = req.body;
    const userId = req.userId;

    if (!name && !email) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    // Check if email is already taken by another user
    if (email) {
      const existingUser = await query(
        'SELECT user_id FROM Users WHERE user_email = $1 AND user_id != $2',
        [email, userId]
      );

      if (existingUser.rows.length > 0) {
        return res.status(400).json({ error: 'Email already in use' });
      }
    }

    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name) {
      updates.push(`user_name = $${paramCount}`);
      values.push(name);
      paramCount++;
    }

    if (email) {
      updates.push(`user_email = $${paramCount}`);
      values.push(email);
      paramCount++;
    }

    values.push(userId);

    const queryText = `
      UPDATE Users 
      SET ${updates.join(', ')}, user_updated_at = CURRENT_TIMESTAMP 
      WHERE user_id = $${paramCount} 
      RETURNING user_id, user_email, user_name
    `;

    const result = await query(queryText, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ 
      success: true,
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Change password
 */
export const changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const userId = req.userId;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Old password and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    // Get current user with password
    const userResult = await query(
      'SELECT user_password FROM Users WHERE user_id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // For OAuth users without password, allow setting a password
    if (user.user_password) {
      const validPassword = await bcrypt.compare(oldPassword, user.user_password);
      if (!validPassword) {
        return res.status(400).json({ error: 'Current password is incorrect' });
      }
    }

    // Hash new password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    await query(
      'UPDATE Users SET user_password = $1, user_updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
      [hashedPassword, userId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Upload profile image
 */
export const uploadProfileImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const userId = req.userId;
    const relativePath = `/uploads/profiles/${req.file.filename}`;

    await query(
      'UPDATE Users SET user_avatar_url = $1, user_updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
      [relativePath, userId]
    );

    res.json({ 
      success: true, 
      imageUrl: constructFullUrl(req, relativePath)
    });
  } catch (error) {
    console.error('Upload profile image error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Remove profile image
 */
export const removeProfileImage = async (req, res) => {
  try {
    const userId = req.userId;

    // Get current avatar URL to delete the file
    const userResult = await query(
      'SELECT user_avatar_url FROM Users WHERE user_id = $1',
      [userId]
    );

    if (userResult.rows.length > 0 && userResult.rows[0].user_avatar_url) {
      const oldImagePath = path.join(__dirname, '..', userResult.rows[0].user_avatar_url);
      
      // Delete the file if it exists
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }
    }

    // Remove avatar URL from database
    await query(
      'UPDATE Users SET user_avatar_url = NULL, user_updated_at = CURRENT_TIMESTAMP WHERE user_id = $1',
      [userId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Remove profile image error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Delete user account
 */
export const deleteAccount = async (req, res) => {
  try {
    const userId = req.userId;

    // Delete user from database
    await query('DELETE FROM Users WHERE user_id = $1', [userId]);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Resend material
 */
export const resendMaterial = async (req, res) => {
  try {
    const { materialName, purchaseDate } = req.body;
    const userId = req.userId;

    // Here you would typically:
    // 1. Verify the user purchased this material
    // 2. Generate/download link or send email
    // 3. Log the resend action

    // For now, we'll just return success
    console.log(`Resending material: ${materialName} to user ${userId}`);

    res.json({ 
      success: true,
      message: 'Material will be sent to your email shortly'
    });
  } catch (error) {
    console.error('Resend material error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};