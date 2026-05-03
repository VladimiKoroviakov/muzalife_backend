/**
 * @file Route-level integration tests for /api/bought-products
 *
 * QA Test Cases:
 *   TC_3.2.1 — Purchase history with date & price (GET / → list of bought products)
 *   TC_3.6.1 — Purchased product is recorded (POST /)
 *
 * Requirement: R1.13 — Purchase history and saved products list always stored.
 * @module tests/routes/boughtProducts.routes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import boughtProductsRouter from '../../routes/boughtProducts.js';
import { makeApp } from '../helpers/makeApp.js';
import { makeUserToken, makeInvalidToken } from '../helpers/makeToken.js';

vi.mock('../../config/database.js', () => ({
  query: vi.fn(),
  default: {},
}));

vi.mock('../../services/emailService.js', () => ({
  emailService: {
    sendProductMaterials: vi.fn(),
  },
}));

vi.mock('../../utils/logger.js', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { query } from '../../config/database.js';
import { emailService } from '../../services/emailService.js';

const app = makeApp({ '/api/bought-products': boughtProductsRouter });

const TOKEN = makeUserToken(42);

const mockBoughtRow = {
  id: 5,
  title: 'Сценарій для вечірки',
  type: 'Сценарій',
  boughtat: new Date('2025-06-01T12:00:00.000Z'),
  hidden: false,
};

beforeEach(() => vi.clearAllMocks());

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/bought-products — TC_3.2.1
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/bought-products — TC_3.2.1 (purchase history)', () => {
  it('returns 401 when no Authorization header is provided', async () => {
    const res = await request(app).get('/api/bought-products');
    expect(res.status).toBe(401);
  });

  it('returns 403 when an invalid token is provided', async () => {
    const res = await request(app)
      .get('/api/bought-products')
      .set('Authorization', `Bearer ${makeInvalidToken()}`);
    expect(res.status).toBe(403);
  });

  it('TC_3.2.1: returns 200 with an array of bought products for an authenticated user', async () => {
    query.mockResolvedValueOnce({ rows: [mockBoughtRow] });

    const res = await request(app)
      .get('/api/bought-products')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(5);
    expect(res.body.data[0].title).toBe('Сценарій для вечірки');
  });

  it('returns 200 with an empty array when the user has no purchases', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/bought-products')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('queries the DB with the authenticated user ID', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await request(app)
      .get('/api/bought-products')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('BoughtUserProducts'),
      [42],
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/bought-products — TC_3.6.1 (record a purchase)
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/bought-products — TC_3.6.1 (record purchase)', () => {
  it('returns 401 when no Authorization header is provided', async () => {
    const res = await request(app)
      .post('/api/bought-products')
      .send({ productId: 5 });
    expect(res.status).toBe(401);
  });

  it('returns 400 when productId is missing from the body', async () => {
    const res = await request(app)
      .post('/api/bought-products')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 when the product does not exist or is hidden', async () => {
    query.mockResolvedValueOnce({ rows: [] }); // product not found

    const res = await request(app)
      .post('/api/bought-products')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ productId: 999 });

    expect(res.status).toBe(404);
  });

  it('TC_3.6.1: returns 201 when purchase is recorded successfully', async () => {
    query.mockResolvedValueOnce({ rows: [{ product_id: 5 }] }); // product exists
    query.mockResolvedValueOnce({ rows: [], rowCount: 1 });      // INSERT succeeds

    const res = await request(app)
      .post('/api/bought-products')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ productId: 5 });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/bought-products/:productId/send-materials — TC_3.6.1 (resend)
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/bought-products/:productId/send-materials', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post('/api/bought-products/5/send-materials');
    expect(res.status).toBe(401);
  });

  it('returns 404 when the product was not purchased by this user', async () => {
    query.mockResolvedValueOnce({ rows: [] }); // not purchased

    const res = await request(app)
      .post('/api/bought-products/5/send-materials')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(404);
  });

  it('returns 200 and calls emailService when materials exist', async () => {
    query.mockResolvedValueOnce({
      rows: [{ product_title: 'Тест', user_email: 'user@example.com' }],
    }); // purchase verified
    query.mockResolvedValueOnce({
      rows: [{ fileName: 'file.pdf', fileUrl: '/uploads/file.pdf' }],
    }); // files found
    emailService.sendProductMaterials.mockResolvedValueOnce(undefined);

    const res = await request(app)
      .post('/api/bought-products/5/send-materials')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    expect(emailService.sendProductMaterials).toHaveBeenCalledWith(
      'user@example.com',
      'Тест',
      expect.any(Array),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/bought-products/:productId
// ─────────────────────────────────────────────────────────────────────────────
describe('DELETE /api/bought-products/:productId', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).delete('/api/bought-products/5');
    expect(res.status).toBe(401);
  });

  it('returns 404 when the record does not exist for this user', async () => {
    query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .delete('/api/bought-products/999')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(404);
  });

  it('returns 200 when the purchase record is removed successfully', async () => {
    query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const res = await request(app)
      .delete('/api/bought-products/5')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
