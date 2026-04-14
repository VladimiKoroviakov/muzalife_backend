/**
 * @file SMTP email delivery service for MuzaLife.
 *
 * Wraps `nodemailer` to send transactional emails (currently only email
 * verification messages).  SMTP credentials and server settings are loaded
 * exclusively from environment variables.
 *
 * **Architecture note:** the `nodemailer` transporter is created once at
 * startup (singleton via module-level instantiation) and reused for every
 * send operation.  This keeps the TCP connection warm and avoids the overhead
 * of re-authenticating for every email.
 * @module services/emailService
 */

import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Service responsible for sending transactional emails via SMTP.
 */
class EmailService {
  /**
   * Initialises the service and creates the underlying nodemailer transporter.
   *
   * The constructor intentionally does not throw on SMTP configuration errors
   * (e.g. missing env vars) — it only logs warnings so that other server
   * functionality remains available.
   */
  constructor() {
    this.transporter = this.createTransporter();
  }

  /**
   * Creates and returns a configured `nodemailer` SMTP transporter.
   *
   * Reads SMTP settings from environment variables with sensible defaults.
   * After creation, calls `transporter.verify()` to assert connectivity and
   * logs the result.
   * @returns {object | undefined} The nodemailer
   *   transporter, or `undefined` if creation fails.
   * @example
   * // Called automatically by the constructor — not meant for external use.
   */
  createTransporter() {
    const smtpConfig = {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
      tls: {
        rejectUnauthorized: false
      }
    };

    // Validate required SMTP settings
    const requiredEnvVars = ['SMTP_USER', 'SMTP_PASSWORD'];
    const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);

    if (missingVars.length > 0) {
      console.warn(`⚠️  Missing SMTP environment variables: ${missingVars.join(', ')}`);
    }

    try {
      const transporter = nodemailer.createTransport(smtpConfig);

      // Verify connection configuration
      transporter.verify((error, _success) => {
        if (error) {
          console.error('❌ SMTP connection failed:', error.message);
        } else {
          console.error('✅ SMTP server is ready to send messages');
        }
      });

      return transporter;
    } catch (error) {
      console.error('❌ Failed to create SMTP transporter:', error.message);
    }
  }

  /**
   * Extracts a 6-digit numeric verification code from an HTML email body.
   *
   * Used primarily in integration tests to retrieve the code from the
   * rendered HTML without actually receiving the email.
   *
   * **Algorithm:** searches for the first occurrence of `>NNNNNN<` where
   * `N` is a digit (matches the code rendered inside an HTML tag).
   * @param {string} html - Raw HTML string of the email body.
   * @returns {string} The 6-digit code, or `'Not found in HTML'` if the
   *   pattern is absent.
   * @example
   * const code = emailService.extractVerificationCode('<h3>483920</h3>');
   * console.log(code); // '483920'
   */
  extractVerificationCode(html) {
    const match = html.match(/>(\d{6})</);
    return match ? match[1] : 'Not found in HTML';
  }

  /**
   * Sends a verification email containing a one-time code to the given address.
   *
   * The email is bilingual-ready but currently rendered in Ukrainian.  The
   * subject line and body copy differ slightly between `'registration'` and
   * `'email_change'` flows.
   * @param {string} email             - The recipient email address.
   * @param {string} verificationCode  - The 6-digit plain-text code to embed.
   * @param {string} [verification_type] - Context of the
   *   verification: `'registration'` (new account) or `'email_change'`.
   * @returns {Promise<true>} Resolves with `true` on successful delivery.
   * @throws {Error} Throws `'Failed to send verification email'` if nodemailer
   *   encounters a delivery error.
   * @example
   * await emailService.sendVerificationEmail(
   *   'new-user@example.com',
   *   '483920',
   *   'registration'
   * );
   */
  async sendVerificationEmail(email, verificationCode, verification_type = 'registration') {
    try {
      const mailOptions = {
        from: process.env.EMAIL_FROM || '"Muza Life" <noreply@muzalife.com>',
        to: email,
        subject: verification_type === 'registration' ? 'Підтвердження електронної пошти - Muza Life' : 'Підтвердження зміни електронної пошти - Muza Life',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #5e89e8;">Muza Life</h1>
            </div>

            <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px; text-align: center;">
              <h2 style="color: #333; margin-bottom: 20px;">Підтвердження електронної пошти</h2>
              <p style="color: #666; margin-bottom: 30px; font-size: 16px;">
                ${verification_type === 'registration' ? 'Дякуємо за реєстрацію! Для завершення процесу, будь ласка, введіть наступний код підтвердження:'
                  : 'Для завершення зміни електронної пошти, будь ласка, введіть наступний код підтвердження:'}
              </p>

              <div style="background-color: white; padding: 20px; border-radius: 8px; border: 2px dashed #5e89e8; display: inline-block; margin: 20px 0;">
                <h3 style="color: #5e89e8; font-size: 32px; letter-spacing: 10px; margin: 0; font-family: monospace;">
                  ${verificationCode}
                </h3>
              </div>

              <p style="color: #999; font-size: 14px; margin-top: 20px;">
                Цей код дійсний протягом 15 хвилин.
              </p>

              <p style="color: #666; font-size: 14px; margin-top: 40px;">
                ${verification_type === 'registration' ? 'Якщо ви не реєструвались на Muza Life, просто проігноруйте цей лист.' : 'Якщо ви не змінювали електронну пошту на Muza Life, просто проігноруйте цей лист.'}
              </p>
            </div>

            <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
              <p style="color: #999; font-size: 12px;">
                &copy; ${new Date().getFullYear()} Muza Life. Всі права захищені.
              </p>
            </div>
          </div>
        `,
        text: verification_type === 'registration' ? `Підтвердження електронної пошти для Muza Life\n\nВаш код підтвердження: ${verificationCode}\n\nЦей код дійсний протягом 15 хвилин.\n\nЯкщо ви не реєструвались, проігноруйте цей лист.` : `Підтвердження зміни електронної пошти для Muza Life\n\nВаш код підтвердження: ${verificationCode}\n\nЦей код дійсний протягом 15 хвилин.\n\nЯкщо ви не змінювали електронну пошту, проігноруйте цей лист.`
      };

      await this.transporter.sendMail(mailOptions);
      return true;
    } catch (error) {
      console.error('❌ Error in email service:', error.message);
      throw new Error('Failed to send verification email');
    }
  }

  /**
   * Sends a purchase confirmation email to a guest shopper.
   *
   * Called after a successful LiqPay payment for a guest (unauthenticated)
   * cart checkout.  Informs the guest that their materials will be delivered
   * to the verified email address.
   * @param {string}   email        - The verified guest email address.
   * @param {string[]} productNames - Titles of the purchased products.
   * @returns {Promise<true>} Resolves with `true` on successful delivery.
   * @throws {Error} Throws if nodemailer encounters a delivery error.
   * @example
   * await emailService.sendGuestPurchaseConfirmation(
   *   'guest@example.com',
   *   ['Сценарій для дня народження', 'Квест для дітей']
   * );
   */
  async sendGuestPurchaseConfirmation(email, productNames) {
    try {
      const productList = productNames
        .map((name) => `<li style="margin-bottom:8px;">${name}</li>`)
        .join('');

      const mailOptions = {
        from: process.env.EMAIL_FROM || '"Muza Life" <noreply@muzalife.com>',
        to: email,
        subject: 'Дякуємо за покупку! — Muza Life',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #5e89e8;">Muza Life</h1>
            </div>

            <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px;">
              <h2 style="color: #333; margin-bottom: 16px;">Дякуємо за покупку!</h2>
              <p style="color: #666; font-size: 16px; margin-bottom: 20px;">
                Ваше замовлення успішно оплачено. Придбані матеріали будуть надіслані на цю електронну адресу найближчим часом.
              </p>

              <h3 style="color: #333; margin-bottom: 12px;">Придбані матеріали:</h3>
              <ul style="color: #444; font-size: 15px; padding-left: 20px;">
                ${productList}
              </ul>

              <p style="color: #999; font-size: 13px; margin-top: 24px;">
                Якщо у вас виникли питання, зверніться до нашої підтримки.
              </p>
            </div>

            <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
              <p style="color: #999; font-size: 12px;">
                &copy; ${new Date().getFullYear()} Muza Life. Всі права захищені.
              </p>
            </div>
          </div>
        `,
        text: `Дякуємо за покупку!\n\nПридбані матеріали:\n${productNames.map((n) => `- ${n}`).join('\n')}\n\nМатеріали будуть надіслані на цю електронну пошту найближчим часом.\n\n© ${new Date().getFullYear()} Muza Life`,
      };

      await this.transporter.sendMail(mailOptions);
      return true;
    } catch (error) {
      console.error('❌ Error sending guest purchase confirmation:', error.message);
      throw new Error('Failed to send guest purchase confirmation email');
    }
  }
}

/**
 * Singleton instance of {@link EmailService}.
 * Import this throughout the application — do not construct a new instance.
 * @type {EmailService}
 */
export const emailService = new EmailService();
