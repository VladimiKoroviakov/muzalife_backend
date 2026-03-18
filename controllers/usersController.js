import bcrypt from 'bcryptjs';
import { query } from '../config/database.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { constructFullUrl } from '../utils/urlHelper.js';
import { verificationService } from '../services/verificationService.js';
import { emailService } from '../services/emailService.js';

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
        is_admin: user.is_admin
      }
    };

    res.json(userProfile);

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Update user name
 */
export const updateName = async (req, res) => {
  try {
    const { name } = req.body;
    const userId = req.userId;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const result = await query(`
        UPDATE Users
        SET user_name = $1,
            user_updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $2
        RETURNING user_id, user_email, user_name
    `, [name, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Update name error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ---------- Email Change Handlers ----------
/**
 * Initiate email change
 */
export const initiateEmailChange = async (req, res) => {
  try {
    const { newEmail, id } = req.body;

    if (!newEmail || !id) {
      return res.status(400).json({ error: 'Всі поля обов\'язкові' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      return res.status(400).json({ error: 'Невірний формат email' });
    }

    // Get current user info
    const userResult = await query(
      'SELECT user_email FROM Users WHERE user_id = $1',
      [id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Користувача не знайдено' });
    }

    const currentEmail = userResult.rows[0].user_email;

    // Check if new email is the same as current
    if (newEmail === currentEmail) {
      return res.status(400).json({ error: 'Новий email не може бути таким же як поточний' });
    }

    // Check if new email is already used by another user
    const existingUser = await query(
      'SELECT user_id FROM Users WHERE user_email = $1 AND user_id != $2',
      [newEmail, id]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        error: 'Цей email вже зайнятий іншим користувачем',
        code: 'EMAIL_EXISTS'
      });
    }

    // Check if there's a pending email change
    const hasPendingChange = await verificationService.hasPendingVerification(newEmail);
    if (hasPendingChange) {
      return res.status(400).json({
        error: 'Код підтвердження для зміни email вже відправлено. Перевірте вашу пошту.',
        code: 'PENDING_EMAIL_CHANGE'
      });
    }

    // Generate and send verification code
    const verificationCode = await verificationService.createVerificationCode(
      newEmail,
      'email_change',
    );

    // Send verification email to new email address
    await emailService.sendVerificationEmail(newEmail, verificationCode, 'email_change');

    res.status(200).json({
      success: true,
      message: 'Код підтвердження відправлено на нову email адресу',
      email: newEmail,
      currentEmail
    });
  } catch (error) {
    console.error('Email change initiation error:', error);
    res.status(500).json({
      error: 'Внутрішня помилка сервера',
      details: error.message
    });
  }
};

/**
 * Verify email change
 */
export const verifyEmailChange = async (req, res) => {
  try {
    const { newEmail, verificationCode, userId } = req.body;

    if (!newEmail || !verificationCode || !userId) {
      return res.status(400).json({ error: 'Всі поля обов\'язкові' });
    }

    // Verify the code
    const verificationResult = await verificationService.verifyCode(
      newEmail,
      verificationCode
    );

    if (!verificationResult.isValid) {
      return res.status(400).json({
        error: verificationResult.message,
        code: 'INVALID_VERIFICATION_CODE'
      });
    }

     // Check if email still doesn't exist (double-check)
    const existingUser = await query(
      'SELECT user_id FROM Users WHERE user_email = $1',
      [newEmail]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        error: 'Користувач з таким email вже існує',
        code: 'USER_EXISTS'
      });
    }

    // Update user's email
    const result = await query(
      'UPDATE Users SET user_email = $1 WHERE user_id = $2 RETURNING user_id, user_email',
      [newEmail, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Користувача не знайдено' });
    }

    // Send notification to old email
    // TO DO: Implement sending notification to old email about the change

    // Clear codes related to this email change
    await query(
      'DELETE FROM EmailVerificationCodes WHERE email = $1 AND code = $2',
      [newEmail, verificationCode]
    );

    res.status(200).json({
      success: true,
      message: 'Email успішно змінено',
      user: {
        id: result.rows[0].user_id,
        email: result.rows[0].user_email
      }
    });
  } catch (error) {
    console.error('Email change verification error:', error);
    res.status(500).json({
      error: 'Внутрішня помилка сервера',
      details: error.message
    });
  }
};

/**
 * Resend email change code
 */
export const resendEmailChangeCode = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email обов\'язковий' });
    }

    // Check if new email is already used by another user
    const existingUser = await query(
      'SELECT user_id FROM Users WHERE user_email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        error: 'Цей email вже зайнятий іншим користувачем',
        code: 'EMAIL_EXISTS'
      });
    }

    // Generate new code
    const newCode = await verificationService.createVerificationCode(
      email,
      'email_change'
    );

    // Send new verification email
    await emailService.sendVerificationEmail(email, newCode);

    res.status(200).json({
      success: true,
      message: 'Новий код підтвердження відправлено',
      email
    });
  } catch (error) {
    console.error('Resend email change code error:', error);

    if (error.message === 'Failed to send verification email') {
      return res.status(500).json({
        error: 'Не вдалося відправити email. Спробуйте ще раз пізніше.'
      });
    }

    res.status(500).json({ error: 'Внутрішня помилка сервера' });
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
    const { materialName: _materialName, purchaseDate: _purchaseDate } = req.body;
    const _userId = req.userId;

    // Here you would typically:
    // 1. Verify the user purchased this material
    // 2. Generate/download link or send email
    // 3. Log the resend action

    // For now, we'll just return success
    // TODO: replace with proper logger — console.log(`Resending material: ${materialName} to user ${userId}`);

    res.json({
      success: true,
      message: 'Material will be sent to your email shortly'
    });
  } catch (error) {
    console.error('Resend material error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
