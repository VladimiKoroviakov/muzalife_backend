/**
 * @file LiqPay payment processing service for MuzaLife.
 *
 * Provides utilities to create signed LiqPay payment payloads and to verify
 * the authenticity of incoming LiqPay webhook callbacks.
 *
 * **LiqPay signature algorithm:**
 * `base64( sha1( private_key + base64_data + private_key ) )`
 *
 * Sandbox mode is enabled automatically when `NODE_ENV` is not `'production'`.
 * @module services/liqpayService
 */

import { createHash } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const {
  LIQPAY_PUBLIC_KEY,
  LIQPAY_PRIVATE_KEY,
  BACKEND_URL,
  NODE_ENV,
} = process.env;

/**
 * Computes the LiqPay signature for a given base64-encoded data string.
 * @param {string} data - Base64-encoded JSON payload.
 * @returns {string} Base64-encoded SHA1 signature.
 */
function sign(data) {
  return createHash('sha1')
    .update(LIQPAY_PRIVATE_KEY + data + LIQPAY_PRIVATE_KEY)
    .digest('base64');
}

/**
 * Creates a signed LiqPay payment payload to be forwarded to the frontend.
 *
 * The frontend uses the returned `data` and `signature` to render a LiqPay
 * checkout button or to redirect the user to LiqPay's hosted payment page.
 * @param {object} params - Payment parameters.
 * @param {string} params.orderId     - Unique internal order identifier.
 * @param {number|string} params.amount - Payment amount (UAH).
 * @param {string} [params.currency] - ISO 4217 currency code.
 * @param {string} params.description - Human-readable payment description.
 * @returns {{ data: string, signature: string }} Signed LiqPay payload.
 * @example
 * const { data, signature } = createPaymentData({
 *   orderId: 'product_42_7_1714000000000',
 *   amount: 199.99,
 *   description: 'Сценарій — Романтичний вечір',
 * });
 */
export function createPaymentData({ orderId, amount, currency = 'UAH', description }) {
  const params = {
    public_key: LIQPAY_PUBLIC_KEY,
    version: '3',
    action: 'pay',
    amount: String(amount),
    currency,
    description,
    order_id: orderId,
    sandbox: NODE_ENV !== 'production' ? 1 : 0,
    // server_url is only sent in production — localhost is unreachable from
    // LiqPay's servers and causes the sandbox checkout to return 403.
    // In development the frontend's /payments/verify fallback handles confirmation.
    ...(NODE_ENV === 'production' && {
      server_url: `${BACKEND_URL}/api/payments/callback`,
    }),
    result_url: `${BACKEND_URL}/api/payments/result`,
  };

  const data = Buffer.from(JSON.stringify(params)).toString('base64');
  const signature = sign(data);

  return { data, signature };
}

/**
 * Verifies that a LiqPay webhook callback was genuinely sent by LiqPay.
 *
 * Recomputes the expected signature from the private key and data, then
 * compares it against the provided signature using strict equality.
 * @param {string} data      - Base64-encoded payload received in the callback.
 * @param {string} signature - Signature received in the callback.
 * @returns {boolean} `true` if the signature is valid, `false` otherwise.
 * @example
 * if (!verifyCallback(req.body.data, req.body.signature)) {
 *   return res.status(400).json({ error: 'Invalid signature' });
 * }
 */
export function verifyCallback(data, signature) {
  return sign(data) === signature;
}
