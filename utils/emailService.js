import nodemailer from 'nodemailer';
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const oAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

oAuth2Client.setCredentials({ 
    refresh_token: process.env.GMAIL_REFRESH_TOKEN 
});

export const generateVerificationCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

export const sendVerificationEmail = async (toEmail, code) => {
    try {
        const accessToken = await oAuth2Client.getAccessToken();

        const transport = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                type: 'OAuth2',
                user: process.env.GMAIL_FROM_EMAIL,
                clientId: process.env.GOOGLE_CLIENT_ID,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                refreshToken: process.env.GMAIL_REFRESH_TOKEN,
                accessToken: accessToken,
            },
        });

        const mailOptions = {
            from: `Muza Life <${process.env.GMAIL_FROM_EMAIL}>`,
            to: toEmail,
            subject: 'Email Verification - Muza Life',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #333;">Email Verification</h2>
                    <p>Thank you for choosing Muza Life! Please use the following verification code to proceed with your email verification:</p>
                    <div style="background: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0;">
                        <h1 style="color: #5e89e8; margin: 0; font-size: 32px; letter-spacing: 5px;">${code}</h1>
                    </div>
                    <p>This code will expire in 10 minutes.</p>
                    <p>If you didn't request this, please ignore this email.</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                    <p style="color: #666; font-size: 12px;">Muza Life Digital Products</p>
                </div>
            `,
        };

        const result = await transport.sendMail(mailOptions);
        console.log('✅ Verification email sent to:', toEmail);
        return { success: true, messageId: result.messageId };
        
    } catch (error) {
        console.error('❌ Email sending error:', error);
        return { success: false, error: error.message };
    }
};