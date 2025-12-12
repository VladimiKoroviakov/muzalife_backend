import express from 'express';
import { generateVerificationCode, sendVerificationEmail } from '../utils/emailService.js';
import { storeVerificationCode, verifyCode, generateOrderId } from '../utils/paymentService.js';

const router = express.Router();

// Step 1: Initiate email verification for payment
router.post('/payments/initiate', async (req, res) => {
  try {
    const { email, cartItems, totalAmount, productNames } = req.body;

    if (!email || !cartItems || !totalAmount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: email, cartItems, totalAmount'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    const verificationCode = generateVerificationCode();

    const orderData = {
      order_id: generateOrderId(),
      amount: totalAmount,
      currency: 'UAH',
      description: `Digital products: ${productNames}`,
      cartItems: cartItems,
      productNames: productNames,
      email: email
    };

    storeVerificationCode(email, verificationCode, orderData);

    const emailResult = await sendVerificationEmail(email, verificationCode);

    if (!emailResult.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to send verification email: ' + emailResult.error
      });
    }

    res.json({
      success: true,
      message: 'Verification code sent to your email',
      orderId: orderData.order_id
    });

  } catch (error) {
    console.error('Payment initiation error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Step 2: Verify email code and get LiqPay checkout URL
router.post('/payments/verify', async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({
        success: false,
        error: 'Email and verification code are required'
      });
    }

    const verificationResult = verifyCode(email, code);

    if (!verificationResult.success) {
      return res.status(400).json({
        success: false,
        error: verificationResult.error
      });
    }

    res.json({
      success: true,
      checkout_url: verificationResult.checkout.checkout_url,
      order_id: verificationResult.checkout.order_id
    });

  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Step 3: LiqPay webhook handler
router.post('/payments/webhook', async (req, res) => {
  try {
    const { data, signature } = req.body;
    const paymentData = JSON.parse(Buffer.from(data, 'base64').toString());
    
    const { order_id, status, amount, currency } = paymentData;

    console.log('Payment webhook received:', {
      order_id,
      status,
      amount,
      currency
    });

    if (status === 'success') {
      // Handle successful payment
      console.log('Payment successful for order:', order_id);
      // Here you would deliver the digital products
    }

    res.status(200).send('OK');

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(200).send('OK');
  }
});

export default router;