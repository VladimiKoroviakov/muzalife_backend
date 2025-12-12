import crypto from 'crypto';

// In-memory storage for verification codes (use Redis in production)
const verificationCodes = new Map();
const pendingOrders = new Map();

export const generateOrderId = () => {
  return `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

export const createLiqPayCheckout = (orderData) => {
  const { amount, currency, description, order_id, email } = orderData;
  
  const publicKey = process.env.LIQPAY_PUBLIC_KEY;
  const privateKey = process.env.LIQPAY_PRIVATE_KEY;
  
  const params = {
    version: '3',
    action: 'pay',
    amount: amount,
    currency: currency || 'UAH',
    description: description,
    order_id: order_id,
    sandbox: 1, // Use sandbox for testing
    result_url: `${process.env.FRONTEND_URL}/payment/success?email=${encodeURIComponent(email)}`,
    server_url: `${process.env.BACKEND_URL}/api/payments/webhook`,
    public_key: publicKey
  };
  
  const data = Buffer.from(JSON.stringify(params)).toString('base64');
  
  const signature = crypto
    .createHash('sha1')
    .update(privateKey + data + privateKey)
    .digest('base64');
  
  return {
    checkout_url: `https://www.liqpay.ua/api/3/checkout?data=${data}&signature=${signature}`,
    order_id: order_id
  };
};

export const storeVerificationCode = (email, code, orderData) => {
  verificationCodes.set(email, {
    code,
    orderData,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
  });
};

export const verifyCode = (email, code) => {
  const stored = verificationCodes.get(email);
  
  if (!stored) {
    return { success: false, error: 'Code not found or expired' };
  }
  
  if (Date.now() > stored.expiresAt) {
    verificationCodes.delete(email);
    return { success: false, error: 'Code expired' };
  }
  
  if (stored.code !== code) {
    return { success: false, error: 'Invalid code' };
  }
  
  const checkout = createLiqPayCheckout(stored.orderData);
  
  pendingOrders.set(stored.orderData.order_id, {
    ...stored.orderData,
    email: email,
    verifiedAt: new Date().toISOString()
  });
  
  verificationCodes.delete(email);
  
  return { success: true, checkout };
};

export const getPendingOrder = (orderId) => {
  return pendingOrders.get(orderId);
};

export const removePendingOrder = (orderId) => {
  pendingOrders.delete(orderId);
};