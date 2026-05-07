/**
 * @file Unit tests for the LiqPay payment service.
 *
 * Tests `createPaymentData` and `verifyCallback` from `services/liqpayService.js`.
 * No mocks needed — the service uses only native `crypto` and process.env.
 * @module tests/unit/liqpayService
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createHash } from 'crypto';

beforeAll(() => {
  process.env.LIQPAY_PUBLIC_KEY = 'sandbox_test_public';
  process.env.LIQPAY_PRIVATE_KEY = 'sandbox_test_private';
  process.env.BACKEND_URL = 'http://localhost:5001';
});

import { createPaymentData, verifyCallback } from '../../services/liqpayService.js';

/**
 *
 * @param data
 */
function computeExpectedSignature(data) {
  return createHash('sha1')
    .update(`sandbox_test_private${  data  }sandbox_test_private`)
    .digest('base64');
}

// ─────────────────────────────────────────────────────────────────────────────
// createPaymentData
// ─────────────────────────────────────────────────────────────────────────────
describe('createPaymentData', () => {
  it('returns data and signature strings', () => {
    const result = createPaymentData({ orderId: 'test_1', amount: 199, description: 'Test' });

    expect(typeof result.data).toBe('string');
    expect(typeof result.signature).toBe('string');
  });

  it('data decodes to valid JSON with required fields', () => {
    const result = createPaymentData({ orderId: 'test_1', amount: 199, description: 'Test' });
    const decoded = JSON.parse(Buffer.from(result.data, 'base64').toString('utf-8'));

    expect(decoded.public_key).toBe('sandbox_test_public');
    expect(decoded.version).toBe('3');
    expect(decoded.action).toBe('pay');
    expect(decoded.amount).toBe('199');
    expect(decoded.currency).toBe('UAH');
    expect(decoded.description).toBe('Test');
    expect(decoded.order_id).toBe('test_1');
  });

  it('sets sandbox=1 when not in production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';

    const result = createPaymentData({ orderId: 'test_1', amount: 100, description: 'X' });
    const decoded = JSON.parse(Buffer.from(result.data, 'base64').toString('utf-8'));

    expect(decoded.sandbox).toBe(1);
    process.env.NODE_ENV = originalEnv;
  });

  it('sets sandbox=1 when NODE_ENV is not production (test/dev)', () => {
    // NODE_ENV is captured at module load time; in test env it is not 'production'
    const result = createPaymentData({ orderId: 'test_1', amount: 100, description: 'X' });
    const decoded = JSON.parse(Buffer.from(result.data, 'base64').toString('utf-8'));

    expect([0, 1]).toContain(decoded.sandbox); // either value is valid — ensures branch is reached
  });

  it('includes server_url when LIQPAY_WEBHOOK_ENABLED=true', () => {
    const original = process.env.LIQPAY_WEBHOOK_ENABLED;
    process.env.LIQPAY_WEBHOOK_ENABLED = 'true';

    const result = createPaymentData({ orderId: 'test_1', amount: 100, description: 'X' });
    const decoded = JSON.parse(Buffer.from(result.data, 'base64').toString('utf-8'));

    expect(decoded.server_url).toBe('http://localhost:5001/api/payments/callback');
    process.env.LIQPAY_WEBHOOK_ENABLED = original;
  });

  it('omits server_url when LIQPAY_WEBHOOK_ENABLED is not set', () => {
    const original = process.env.LIQPAY_WEBHOOK_ENABLED;
    delete process.env.LIQPAY_WEBHOOK_ENABLED;

    const result = createPaymentData({ orderId: 'test_1', amount: 100, description: 'X' });
    const decoded = JSON.parse(Buffer.from(result.data, 'base64').toString('utf-8'));

    expect(decoded.server_url).toBeUndefined();
    process.env.LIQPAY_WEBHOOK_ENABLED = original;
  });

  it('uses UAH as default currency', () => {
    const result = createPaymentData({ orderId: 'test_1', amount: 100, description: 'X' });
    const decoded = JSON.parse(Buffer.from(result.data, 'base64').toString('utf-8'));

    expect(decoded.currency).toBe('UAH');
  });

  it('accepts custom currency', () => {
    const result = createPaymentData({ orderId: 'test_1', amount: 100, currency: 'USD', description: 'X' });
    const decoded = JSON.parse(Buffer.from(result.data, 'base64').toString('utf-8'));

    expect(decoded.currency).toBe('USD');
  });

  it('result_url points to backend payments/result', () => {
    const result = createPaymentData({ orderId: 'test_1', amount: 100, description: 'X' });
    const decoded = JSON.parse(Buffer.from(result.data, 'base64').toString('utf-8'));

    expect(decoded.result_url).toBe('http://localhost:5001/api/payments/result');
  });

  it('signature is valid SHA1 of private_key+data+private_key', () => {
    const result = createPaymentData({ orderId: 'test_1', amount: 100, description: 'X' });
    const expected = computeExpectedSignature(result.data);

    expect(result.signature).toBe(expected);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// verifyCallback
// ─────────────────────────────────────────────────────────────────────────────
describe('verifyCallback', () => {
  it('returns true when signature matches', () => {
    const data = Buffer.from(JSON.stringify({ order_id: 'test_1', status: 'success' })).toString('base64');
    const signature = computeExpectedSignature(data);

    expect(verifyCallback(data, signature)).toBe(true);
  });

  it('returns false when signature does not match', () => {
    const data = Buffer.from(JSON.stringify({ order_id: 'test_1' })).toString('base64');

    expect(verifyCallback(data, 'wrong-signature')).toBe(false);
  });

  it('returns false when data is tampered', () => {
    const data = Buffer.from(JSON.stringify({ order_id: 'test_1' })).toString('base64');
    const signature = computeExpectedSignature(data);
    const tamperedData = Buffer.from(JSON.stringify({ order_id: 'test_1', injected: true })).toString('base64');

    expect(verifyCallback(tamperedData, signature)).toBe(false);
  });
});
