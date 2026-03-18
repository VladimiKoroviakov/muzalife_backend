import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

class EmailService {
  constructor() {
    this.transporter = this.createTransporter();
  }

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
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

    if (missingVars.length > 0) {
      console.warn(`⚠️  Missing SMTP environment variables: ${missingVars.join(', ')}`);
    }

    try {
      const transporter = nodemailer.createTransport(smtpConfig);

      // Verify connection configuration
      transporter.verify((error, success) => {
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

  extractVerificationCode(html) {
    const match = html.match(/>(\d{6})</);
    return match ? match[1] : 'Not found in HTML';
  }

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

      const info = await this.transporter.sendMail(mailOptions);
      return true;
    } catch (error) {
      console.error('❌ Error in email service:', error.message);
      throw new Error('Failed to send verification email');
    }
  }
}

export const emailService = new EmailService();