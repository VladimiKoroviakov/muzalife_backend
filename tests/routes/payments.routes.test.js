/**
 * @file HTTP-level integration tests for the payments REST API.
 *
 * Tests all endpoints in `routes/payments.js`:
 *   POST /api/payments/product/:productId/initiate
 *   POST /api/payments/order/:orderId/initiate
 *   POST /api/payments/cart/initiate
 *   POST /api/payments/verify
 *   POST /api/payments/result
 *   GET  /api/payments/result
 *   POST /api/payments/callback
 *
 * Database, LiqPay service, and email service are fully mocked.
 * @module tests/routes/payments.routes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../config/database.js', () => ({
  query: vi.fn(),
  default: {},
}));

vi.mock('../../services/liqpayService.js', () => ({
  createPaymentData: vi.fn().mockReturnValue({ data: 'base64data', signature: 'sig' }),
  verifyCallback: vi.fn(),
}));

vi.mock('../../services/emailService.js', () => ({
  emailService: {
    sendProductMaterials: vi.fn().mockResolvedValue(true),
    sendOrderMaterials: vi.fn().mockResolvedValue(true),
    sendGuestPurchaseConfirmation: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('../../utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { query } from '../../config/database.js';
import { createPaymentData, verifyCallback } from '../../services/liqpayService.js';
import { emailService } from '../../services/emailService.js';
import paymentsRouter from '../../routes/payments.js';
import { makeApp } from '../helpers/makeApp.js';
import { makeUserToken, makeGuestToken, makeInvalidToken } from '../helpers/makeToken.js';

const app = makeApp({ '/api/payments': paymentsRouter });

const makePayload = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64');

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payments/product/:productId/initiate
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/payments/product/:productId/initiate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('200 — returns LiqPay payload for valid product', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ product_id: 5, product_title: 'Test', product_price: 199 }] })
      .mockResolvedValueOnce({ rows: [] }); // not yet bought

    const res = await request(app)
      .post('/api/payments/product/5/initiate')
      .set('Authorization', `Bearer ${makeUserToken(42)}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({ data: 'base64data', signature: 'sig' });
    expect(createPaymentData).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 199, currency: 'UAH', description: 'Test' }),
    );
  });

  it('404 — product not found', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/payments/product/999/initiate')
      .set('Authorization', `Bearer ${makeUserToken(42)}`);

    expect(res.status).toBe(404);
  });

  it('409 — product already purchased', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ product_id: 5, product_title: 'Test', product_price: 199 }] })
      .mockResolvedValueOnce({ rows: [{ product_id: 5 }] }); // already bought

    const res = await request(app)
      .post('/api/payments/product/5/initiate')
      .set('Authorization', `Bearer ${makeUserToken(42)}`);

    expect(res.status).toBe(409);
  });

  it('401 — no auth token', async () => {
    const res = await request(app).post('/api/payments/product/5/initiate');
    expect(res.status).toBe(401);
  });

  it('403 — invalid token', async () => {
    const res = await request(app)
      .post('/api/payments/product/5/initiate')
      .set('Authorization', `Bearer ${makeInvalidToken()}`);
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payments/order/:orderId/initiate
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/payments/order/:orderId/initiate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('200 — returns LiqPay payload for valid accepted order', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        order_id: 10,
        user_id: 42,
        order_status: 'accepted',
        order_price: '500',
        order_title: 'Custom Quest',
      }],
    });

    const res = await request(app)
      .post('/api/payments/order/10/initiate')
      .set('Authorization', `Bearer ${makeUserToken(42)}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(createPaymentData).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'personalorder_10', amount: '500' }),
    );
  });

  it('404 — order not found', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/payments/order/999/initiate')
      .set('Authorization', `Bearer ${makeUserToken(42)}`);

    expect(res.status).toBe(404);
  });

  it('403 — order belongs to another user', async () => {
    query.mockResolvedValueOnce({
      rows: [{ order_id: 10, user_id: 99, order_status: 'accepted', order_price: '500', order_title: 'X' }],
    });

    const res = await request(app)
      .post('/api/payments/order/10/initiate')
      .set('Authorization', `Bearer ${makeUserToken(42)}`);

    expect(res.status).toBe(403);
  });

  it('400 — order status is not accepted', async () => {
    query.mockResolvedValueOnce({
      rows: [{ order_id: 10, user_id: 42, order_status: 'pending', order_price: '500', order_title: 'X' }],
    });

    const res = await request(app)
      .post('/api/payments/order/10/initiate')
      .set('Authorization', `Bearer ${makeUserToken(42)}`);

    expect(res.status).toBe(400);
  });

  it('400 — order has no price', async () => {
    query.mockResolvedValueOnce({
      rows: [{ order_id: 10, user_id: 42, order_status: 'accepted', order_price: null, order_title: 'X' }],
    });

    const res = await request(app)
      .post('/api/payments/order/10/initiate')
      .set('Authorization', `Bearer ${makeUserToken(42)}`);

    expect(res.status).toBe(400);
  });

  it('400 — order price is zero', async () => {
    query.mockResolvedValueOnce({
      rows: [{ order_id: 10, user_id: 42, order_status: 'accepted', order_price: '0', order_title: 'X' }],
    });

    const res = await request(app)
      .post('/api/payments/order/10/initiate')
      .set('Authorization', `Bearer ${makeUserToken(42)}`);

    expect(res.status).toBe(400);
  });

  it('401 — no token', async () => {
    const res = await request(app).post('/api/payments/order/10/initiate');
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payments/cart/initiate
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/payments/cart/initiate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('200 — authenticated user, single product', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ product_id: 1, product_title: 'Сценарій', product_price: '150' }] })
      .mockResolvedValueOnce({ rows: [] }); // not already bought

    const res = await request(app)
      .post('/api/payments/cart/initiate')
      .set('Authorization', `Bearer ${makeUserToken(42)}`)
      .send({ productIds: [1] });

    expect(res.status).toBe(200);
    expect(createPaymentData).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Сценарій' }),
    );
  });

  it('200 — authenticated user, multiple products', async () => {
    query
      .mockResolvedValueOnce({
        rows: [
          { product_id: 1, product_title: 'A', product_price: '100' },
          { product_id: 2, product_title: 'B', product_price: '200' },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/payments/cart/initiate')
      .set('Authorization', `Bearer ${makeUserToken(42)}`)
      .send({ productIds: [1, 2] });

    expect(res.status).toBe(200);
    expect(createPaymentData).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Покупка 2 матеріалів', amount: '300.00' }),
    );
  });

  it('200 — guest user, encodes email in orderId', async () => {
    query.mockResolvedValueOnce({
      rows: [{ product_id: 3, product_title: 'Quest', product_price: '99' }],
    });

    const res = await request(app)
      .post('/api/payments/cart/initiate')
      .set('Authorization', `Bearer ${makeGuestToken('guest@example.com')}`)
      .send({ productIds: [3] });

    expect(res.status).toBe(200);
    const calledWith = createPaymentData.mock.calls[0][0];
    expect(calledWith.orderId).toContain('guest_');
  });

  it('400 — productIds missing', async () => {
    const res = await request(app)
      .post('/api/payments/cart/initiate')
      .set('Authorization', `Bearer ${makeUserToken(42)}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('400 — productIds is empty array', async () => {
    const res = await request(app)
      .post('/api/payments/cart/initiate')
      .set('Authorization', `Bearer ${makeUserToken(42)}`)
      .send({ productIds: [] });

    expect(res.status).toBe(400);
  });

  it('400 — productIds contains non-integer', async () => {
    const res = await request(app)
      .post('/api/payments/cart/initiate')
      .set('Authorization', `Bearer ${makeUserToken(42)}`)
      .send({ productIds: ['abc'] });

    expect(res.status).toBe(400);
  });

  it('404 — one product not found', async () => {
    query.mockResolvedValueOnce({ rows: [{ product_id: 1, product_title: 'A', product_price: '100' }] }); // only 1 found, 2 requested

    const res = await request(app)
      .post('/api/payments/cart/initiate')
      .set('Authorization', `Bearer ${makeUserToken(42)}`)
      .send({ productIds: [1, 999] });

    expect(res.status).toBe(404);
  });

  it('409 — product already purchased by authenticated user', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ product_id: 1, product_title: 'A', product_price: '100' }] })
      .mockResolvedValueOnce({ rows: [{ product_id: 1 }] }); // already bought

    const res = await request(app)
      .post('/api/payments/cart/initiate')
      .set('Authorization', `Bearer ${makeUserToken(42)}`)
      .send({ productIds: [1] });

    expect(res.status).toBe(409);
  });

  it('401 — no token', async () => {
    const res = await request(app).post('/api/payments/cart/initiate').send({ productIds: [1] });
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payments/verify
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/payments/verify', () => {
  beforeEach(() => vi.clearAllMocks());

  it('404 — returns not-found in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const res = await request(app)
      .post('/api/payments/verify')
      .set('Authorization', `Bearer ${makeUserToken(42)}`)
      .send({ orderId: 'product_5_42_1714000000' });

    expect(res.status).toBe(404);
    vi.unstubAllEnvs();
  });

  it('400 — orderId missing', async () => {
    const res = await request(app)
      .post('/api/payments/verify')
      .set('Authorization', `Bearer ${makeUserToken(42)}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('400 — unrecognised orderId format', async () => {
    const res = await request(app)
      .post('/api/payments/verify')
      .set('Authorization', `Bearer ${makeUserToken(42)}`)
      .send({ orderId: 'unknown_format_123' });

    expect(res.status).toBe(400);
  });

  it('product_ — 200 success, records purchase and sends email', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ product_id: 5 }] }) // INSERT returns row
      .mockResolvedValueOnce({ rows: [{ user_email: 'user@test.com' }] })
      .mockResolvedValueOnce({ rows: [{ product_title: 'Test Product' }] })
      .mockResolvedValueOnce({ rows: [{ fileName: 'f.pdf', fileUrl: 'http://localhost:5001/uploads/products/5/f.pdf' }] });

    const orderId = 'product_5_42_1714000000';

    const res = await request(app)
      .post('/api/payments/verify')
      .set('Authorization', `Bearer ${makeUserToken(42)}`)
      .send({ orderId });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(emailService.sendProductMaterials).toHaveBeenCalled();
  });

  it('product_ — 200 success, no email when insert returns no row', async () => {
    query.mockResolvedValueOnce({ rows: [] }); // ON CONFLICT DO NOTHING returned nothing

    const orderId = 'product_5_42_1714000000';

    const res = await request(app)
      .post('/api/payments/verify')
      .set('Authorization', `Bearer ${makeUserToken(42)}`)
      .send({ orderId });

    expect(res.status).toBe(200);
    expect(emailService.sendProductMaterials).not.toHaveBeenCalled();
  });

  it('product_ — 403 userId mismatch', async () => {
    const orderId = 'product_5_99_1714000000'; // userId=99, but token is userId=42

    const res = await request(app)
      .post('/api/payments/verify')
      .set('Authorization', `Bearer ${makeUserToken(42)}`)
      .send({ orderId });

    expect(res.status).toBe(403);
  });

  it('product_ — email error is swallowed, still returns 200', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ product_id: 5 }] })
      .mockResolvedValueOnce({ rows: [{ user_email: 'user@test.com' }] })
      .mockResolvedValueOnce({ rows: [{ product_title: 'Test' }] })
      .mockResolvedValueOnce({ rows: [{ fileName: 'f.pdf', fileUrl: 'http://localhost:5001/uploads/products/5/f.pdf' }] });

    emailService.sendProductMaterials.mockRejectedValueOnce(new Error('smtp fail'));

    const orderId = 'product_5_42_1714000000';

    const res = await request(app)
      .post('/api/payments/verify')
      .set('Authorization', `Bearer ${makeUserToken(42)}`)
      .send({ orderId });

    expect(res.status).toBe(200);
  });

  it('cart_ (auth user) — 200 success with new rows, sends emails', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ product_id: 1 }] }) // insert product 1 — new row
      .mockResolvedValueOnce({ rows: [{ product_id: 2 }] }) // insert product 2 — new row
      .mockResolvedValueOnce({ rows: [{ user_email: 'user@test.com' }] })
      .mockResolvedValueOnce({ rows: [{ product_id: 1, product_title: 'A' }, { product_id: 2, product_title: 'B' }] })
      .mockResolvedValueOnce({
        rows: [
          { productId: 1, fileName: 'a.pdf', fileUrl: 'http://localhost:5001/uploads/products/1/a.pdf' },
        ],
      });

    const orderId = 'cart_1-2_42_1714000000';

    const res = await request(app)
      .post('/api/payments/verify')
      .set('Authorization', `Bearer ${makeUserToken(42)}`)
      .send({ orderId });

    expect(res.status).toBe(200);
    expect(emailService.sendProductMaterials).toHaveBeenCalled();
  });

  it('cart_ (auth user) — 200 with zero new rows, no emails', async () => {
    query
      .mockResolvedValueOnce({ rows: [] }) // insert p1 — conflict, no row
      .mockResolvedValueOnce({ rows: [] }); // insert p2 — conflict, no row

    const orderId = 'cart_1-2_42_1714000000';

    const res = await request(app)
      .post('/api/payments/verify')
      .set('Authorization', `Bearer ${makeUserToken(42)}`)
      .send({ orderId });

    expect(res.status).toBe(200);
    expect(emailService.sendProductMaterials).not.toHaveBeenCalled();
  });

  it('cart_ (auth user) — 403 userId mismatch', async () => {
    const orderId = 'cart_1-2_99_1714000000'; // userId=99, token has 42

    const res = await request(app)
      .post('/api/payments/verify')
      .set('Authorization', `Bearer ${makeUserToken(42)}`)
      .send({ orderId });

    expect(res.status).toBe(403);
  });

  it('cart_ (guest) — 200 success, sends guest confirmation and materials', async () => {
    const guestEmail = 'guest@example.com';
    const encodedEmail = Buffer.from(guestEmail).toString('base64url');

    query
      .mockResolvedValueOnce({ rows: [{ product_id: 3 }] }) // insert — new row
      .mockResolvedValueOnce({ rows: [{ product_id: 3, product_title: 'Quest' }] })
      .mockResolvedValueOnce({ rows: [{ productId: 3, fileName: 'q.pdf', fileUrl: 'http://localhost:5001/uploads/products/3/q.pdf' }] });

    const orderId = `cart_3_guest_${encodedEmail}_1714000000`;

    const res = await request(app)
      .post('/api/payments/verify')
      .set('Authorization', `Bearer ${makeGuestToken(guestEmail)}`)
      .send({ orderId });

    expect(res.status).toBe(200);
    expect(emailService.sendGuestPurchaseConfirmation).toHaveBeenCalledWith(guestEmail, ['Quest']);
    expect(emailService.sendProductMaterials).toHaveBeenCalled();
  });

  it('cart_ (guest) — 403 when no guest token', async () => {
    const encodedEmail = Buffer.from('guest@example.com').toString('base64url');
    const orderId = `cart_3_guest_${encodedEmail}_1714000000`;

    const res = await request(app)
      .post('/api/payments/verify')
      .set('Authorization', `Bearer ${makeUserToken(42)}`) // regular user token, not guest
      .send({ orderId });

    expect(res.status).toBe(403);
  });

  it('cart_ (guest) — 403 when email in token differs from orderId', async () => {
    const tokenEmail = 'other@example.com';
    const orderEmail = 'guest@example.com';
    const encodedEmail = Buffer.from(orderEmail).toString('base64url');
    const orderId = `cart_3_guest_${encodedEmail}_1714000000`;

    const res = await request(app)
      .post('/api/payments/verify')
      .set('Authorization', `Bearer ${makeGuestToken(tokenEmail)}`)
      .send({ orderId });

    expect(res.status).toBe(403);
  });

  it('personalorder_ — 200 success, marks paid and sends email', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ user_id: 42, order_status: 'accepted' }] })
      .mockResolvedValueOnce({ rows: [] }) // UPDATE
      .mockResolvedValueOnce({ rows: [{ order_title: 'Quest', user_email: 'user@test.com' }] })
      .mockResolvedValueOnce({ rows: [{ fileName: 'q.pdf', fileUrl: 'http://localhost:5001/uploads/personal-orders/10/q.pdf' }] });

    const res = await request(app)
      .post('/api/payments/verify')
      .set('Authorization', `Bearer ${makeUserToken(42)}`)
      .send({ orderId: 'personalorder_10' });

    expect(res.status).toBe(200);
    expect(emailService.sendOrderMaterials).toHaveBeenCalled();
  });

  it('personalorder_ — 200, no email when already paid', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ user_id: 42, order_status: 'paid' }] })
      .mockResolvedValueOnce({ rows: [] }); // UPDATE

    const res = await request(app)
      .post('/api/payments/verify')
      .set('Authorization', `Bearer ${makeUserToken(42)}`)
      .send({ orderId: 'personalorder_10' });

    expect(res.status).toBe(200);
    expect(emailService.sendOrderMaterials).not.toHaveBeenCalled();
  });

  it('personalorder_ — 403 when order belongs to different user', async () => {
    query.mockResolvedValueOnce({ rows: [{ user_id: 99, order_status: 'accepted' }] });

    const res = await request(app)
      .post('/api/payments/verify')
      .set('Authorization', `Bearer ${makeUserToken(42)}`)
      .send({ orderId: 'personalorder_10' });

    expect(res.status).toBe(403);
  });

  it('personalorder_ — 403 when order not found', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/payments/verify')
      .set('Authorization', `Bearer ${makeUserToken(42)}`)
      .send({ orderId: 'personalorder_10' });

    expect(res.status).toBe(403);
  });

  it('401 — no token', async () => {
    const res = await request(app).post('/api/payments/verify').send({ orderId: 'product_5_42_1' });
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payments/result  &  GET /api/payments/result
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/payments/result — handleLiqPayResult', () => {
  beforeEach(() => vi.clearAllMocks());

  it('redirects to /payment/result (no query) when no data/signature', async () => {
    const res = await request(app).post('/api/payments/result').send({}).redirects(0);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('http://localhost:3000/payment/result');
  });

  it('redirects to failure when signature invalid', async () => {
    verifyCallback.mockReturnValue(false);

    const res = await request(app)
      .post('/api/payments/result')
      .send({ data: 'somedata', signature: 'badsig' })
      .redirects(0);

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('status=failure');
  });

  it('redirects to failure when data is not valid base64 JSON', async () => {
    verifyCallback.mockReturnValue(true);

    const res = await request(app)
      .post('/api/payments/result')
      .send({ data: '!!!invalid!!!', signature: 'sig' })
      .redirects(0);

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('status=failure');
  });

  it('redirects to failure for non-success status in payload', async () => {
    verifyCallback.mockReturnValue(true);
    const data = makePayload({ order_id: 'product_5_42_1', status: 'failure' });

    const res = await request(app)
      .post('/api/payments/result')
      .send({ data, signature: 'sig' })
      .redirects(0);

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('status=failure');
  });

  it('redirects to success for product_ order', async () => {
    verifyCallback.mockReturnValue(true);
    const data = makePayload({ order_id: 'product_5_42_1714000000', status: 'success' });

    query
      .mockResolvedValueOnce({ rows: [] }) // INSERT
      .mockResolvedValueOnce({ rows: [{ user_email: 'u@test.com' }] })
      .mockResolvedValueOnce({ rows: [{ product_title: 'T' }] })
      .mockResolvedValueOnce({ rows: [] }); // no files

    const res = await request(app)
      .post('/api/payments/result')
      .send({ data, signature: 'sig' })
      .redirects(0);

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('status=success');
  });

  it('redirects to success for sandbox status', async () => {
    verifyCallback.mockReturnValue(true);
    const data = makePayload({ order_id: 'product_5_42_1714000000', status: 'sandbox' });

    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/payments/result')
      .send({ data, signature: 'sig' })
      .redirects(0);

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('status=success');
  });

  it('redirects to success for personalorder_ order', async () => {
    verifyCallback.mockReturnValue(true);
    const data = makePayload({ order_id: 'personalorder_10', status: 'success' });

    query
      .mockResolvedValueOnce({ rows: [] }) // UPDATE
      .mockResolvedValueOnce({ rows: [{ order_title: 'Q', user_email: 'u@test.com' }] })
      .mockResolvedValueOnce({ rows: [] }); // no files

    const res = await request(app)
      .post('/api/payments/result')
      .send({ data, signature: 'sig' })
      .redirects(0);

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('status=success');
  });

  it('redirects to success for cart_ (auth user) order', async () => {
    verifyCallback.mockReturnValue(true);
    const data = makePayload({ order_id: 'cart_1-2_42_1714000000', status: 'success' });

    query
      .mockResolvedValueOnce({ rows: [] }) // INSERT p1
      .mockResolvedValueOnce({ rows: [] }) // INSERT p2
      .mockResolvedValueOnce({ rows: [{ user_email: 'u@test.com' }] })
      .mockResolvedValueOnce({ rows: [] }) // products
      .mockResolvedValueOnce({ rows: [] }); // files

    const res = await request(app)
      .post('/api/payments/result')
      .send({ data, signature: 'sig' })
      .redirects(0);

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('status=success');
  });

  it('redirects to success for cart_ (guest) order', async () => {
    verifyCallback.mockReturnValue(true);
    const guestEmail = 'guest@example.com';
    const encodedEmail = Buffer.from(guestEmail).toString('base64url');
    const data = makePayload({ order_id: `cart_3_guest_${encodedEmail}_1714000000`, status: 'success' });

    query
      .mockResolvedValueOnce({ rows: [] }) // INSERT p3
      .mockResolvedValueOnce({ rows: [{ product_id: 3, product_title: 'Quest' }] })
      .mockResolvedValueOnce({ rows: [] }); // files

    const res = await request(app)
      .post('/api/payments/result')
      .send({ data, signature: 'sig' })
      .redirects(0);

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('status=success');
  });

  it('redirects to failure when DB throws during processVerifiedPayload', async () => {
    verifyCallback.mockReturnValue(true);
    const data = makePayload({ order_id: 'product_5_42_1714000000', status: 'success' });

    query.mockRejectedValueOnce(new Error('DB down'));

    const res = await request(app)
      .post('/api/payments/result')
      .send({ data, signature: 'sig' })
      .redirects(0);

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('status=failure');
  });
});

describe('GET /api/payments/result — handleLiqPayResult via query string', () => {
  beforeEach(() => vi.clearAllMocks());

  it('redirects to /payment/result when no query params', async () => {
    const res = await request(app).get('/api/payments/result').redirects(0);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('http://localhost:3000/payment/result');
  });

  it('redirects to success when valid data and signature passed as query params', async () => {
    verifyCallback.mockReturnValue(true);
    const data = makePayload({ order_id: 'product_5_42_1', status: 'success' });

    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/payments/result')
      .query({ data, signature: 'sig' })
      .redirects(0);

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('status=success');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payments/callback
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/payments/callback', () => {
  beforeEach(() => vi.clearAllMocks());

  it('400 — missing data', async () => {
    const res = await request(app).post('/api/payments/callback').send({ signature: 'sig' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('MISSING_PAYLOAD');
  });

  it('400 — missing signature', async () => {
    const res = await request(app).post('/api/payments/callback').send({ data: 'somedata' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('MISSING_PAYLOAD');
  });

  it('400 — invalid signature', async () => {
    verifyCallback.mockReturnValue(false);

    const res = await request(app).post('/api/payments/callback').send({ data: 'data', signature: 'badsig' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_SIGNATURE');
  });

  it('400 — data is not valid base64 JSON', async () => {
    verifyCallback.mockReturnValue(true);

    const res = await request(app).post('/api/payments/callback').send({ data: '!!!notbase64!!!', signature: 'sig' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_ENCODING');
  });

  it('200 — non-success status, no DB write', async () => {
    verifyCallback.mockReturnValue(true);
    const data = makePayload({ order_id: 'product_5_42_1', status: 'failure' });

    const res = await request(app).post('/api/payments/callback').send({ data, signature: 'sig' });

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
    expect(query).not.toHaveBeenCalled();
  });

  it('200 — success, product_ order, inserts record', async () => {
    verifyCallback.mockReturnValue(true);
    const data = makePayload({ order_id: 'product_5_42_1714000000', status: 'success', amount: 199 });

    query
      .mockResolvedValueOnce({ rows: [] }) // INSERT
      .mockResolvedValueOnce({ rows: [{ user_email: 'u@test.com' }] })
      .mockResolvedValueOnce({ rows: [{ product_title: 'T' }] })
      .mockResolvedValueOnce({ rows: [{ fileName: 'f.pdf', fileUrl: 'http://localhost:5001/uploads/products/5/f.pdf' }] });

    const res = await request(app).post('/api/payments/callback').send({ data, signature: 'sig' });

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
    expect(emailService.sendProductMaterials).toHaveBeenCalled();
  });

  it('200 — success, email send throws, still returns 200', async () => {
    verifyCallback.mockReturnValue(true);
    const data = makePayload({ order_id: 'product_5_42_1714000000', status: 'success' });

    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ user_email: 'u@test.com' }] })
      .mockResolvedValueOnce({ rows: [{ product_title: 'T' }] })
      .mockResolvedValueOnce({ rows: [{ fileName: 'f.pdf', fileUrl: 'http://localhost:5001/uploads/products/5/f.pdf' }] });

    emailService.sendProductMaterials.mockRejectedValueOnce(new Error('smtp fail'));

    const res = await request(app).post('/api/payments/callback').send({ data, signature: 'sig' });

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
  });

  it('200 — success, cart_ (auth user) order, inserts records', async () => {
    verifyCallback.mockReturnValue(true);
    const data = makePayload({ order_id: 'cart_1-2_42_1714000000', status: 'success' });

    query
      .mockResolvedValueOnce({ rows: [] }) // INSERT p1
      .mockResolvedValueOnce({ rows: [] }) // INSERT p2
      .mockResolvedValueOnce({ rows: [{ user_email: 'u@test.com' }] })
      .mockResolvedValueOnce({ rows: [] }) // products
      .mockResolvedValueOnce({ rows: [] }); // files

    const res = await request(app).post('/api/payments/callback').send({ data, signature: 'sig' });

    expect(res.status).toBe(200);
    expect(query).toHaveBeenCalledTimes(5);
  });

  it('200 — success, cart_ (guest) order, inserts into GuestPurchases', async () => {
    verifyCallback.mockReturnValue(true);
    const guestEmail = 'guest@example.com';
    const encodedEmail = Buffer.from(guestEmail).toString('base64url');
    const data = makePayload({ order_id: `cart_3_guest_${encodedEmail}_1714000000`, status: 'success' });

    query
      .mockResolvedValueOnce({ rows: [] }) // INSERT GuestPurchases p3
      .mockResolvedValueOnce({ rows: [{ product_id: 3, product_title: 'Quest' }] }) // products
      .mockResolvedValueOnce({ rows: [] }); // files

    const res = await request(app).post('/api/payments/callback').send({ data, signature: 'sig' });

    expect(res.status).toBe(200);
    expect(emailService.sendGuestPurchaseConfirmation).toHaveBeenCalledWith(guestEmail, ['Quest']);
  });

  it('200 — success, personalorder_ order, updates status', async () => {
    verifyCallback.mockReturnValue(true);
    const data = makePayload({ order_id: 'personalorder_10', status: 'success' });

    query
      .mockResolvedValueOnce({ rows: [] }) // UPDATE
      .mockResolvedValueOnce({ rows: [{ order_title: 'Q', user_email: 'u@test.com' }] })
      .mockResolvedValueOnce({ rows: [] }); // no files

    const res = await request(app).post('/api/payments/callback').send({ data, signature: 'sig' });

    expect(res.status).toBe(200);
  });

  it('200 — DB error in processVerifiedPayload, still returns 200', async () => {
    verifyCallback.mockReturnValue(true);
    const data = makePayload({ order_id: 'product_5_42_1714000000', status: 'success' });

    query.mockRejectedValueOnce(new Error('DB down'));

    const res = await request(app).post('/api/payments/callback').send({ data, signature: 'sig' });

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
  });

  it('200 — unrecognised orderId format is logged but still returns 200', async () => {
    verifyCallback.mockReturnValue(true);
    const data = makePayload({ order_id: 'unknown_xyz_123', status: 'success' });

    const res = await request(app).post('/api/payments/callback').send({ data, signature: 'sig' });

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
    expect(query).not.toHaveBeenCalled();
  });
});
