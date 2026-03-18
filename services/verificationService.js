import { query } from '../config/database.js';

class VerificationService {
  // Generate a 6-digit verification code
  generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // Store verification code in database
  async createVerificationCode(email, verification_type = 'registration') {
    const code = this.generateVerificationCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now

    try {
      // Invalidate any existing codes for this email
      await query(
        'UPDATE EmailVerificationCodes SET is_used = true WHERE email = $1 AND is_used = false',
        [email]
      );

      // Insert new code
      await query(
        'INSERT INTO EmailVerificationCodes (email, code, expires_at, verification_type) VALUES ($1, $2, $3, $4)',
        [email, code, expiresAt, verification_type]
      );

      return code;
    } catch (error) {
      console.error('Error creating verification code:', error);
      throw new Error('Failed to create verification code');
    }
  }

  // Verify code
  async verifyCode(email, code) {
    try {
      const result = await query(
        `SELECT * FROM EmailVerificationCodes
         WHERE email = $1
         AND code = $2
         AND is_used = false
         AND expires_at > NOW()`,
        [email, code]
      );

      if (result.rows.length === 0) {
        return { isValid: false, message: 'Невірний або прострочений код' };
      }

      // Mark code as used
      await query(
        'UPDATE EmailVerificationCodes SET is_used = true WHERE email = $1 AND code = $2',
        [email, code]
      );

      return { isValid: true, message: 'Код підтверджено успішно' };
    } catch (error) {
      console.error('Error verifying code:', error);
      return { isValid: false, message: 'Помилка перевірки коду' };
    }
  }

  // Check if email has a pending verification
  async hasPendingVerification(email) {
    try {
      const result = await query(
        `SELECT * FROM EmailVerificationCodes
         WHERE email = $1
         AND is_used = false
         AND expires_at > NOW()`,
        [email]
      );

      return result.rows.length > 0;
    } catch (error) {
      console.error('Error checking pending verification:', error);
      return false;
    }
  }
}

export const verificationService = new VerificationService();
