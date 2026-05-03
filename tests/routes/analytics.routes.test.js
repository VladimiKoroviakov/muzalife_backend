/**
 * @file Route-level integration tests for /api/analytics
 *
 * QA Test Cases (TC_2.8.x):
 *   TC_2.8.1 — GET /stats/:productId no auth → 401
 *   TC_2.8.2 — GET /stats/:productId non-admin → 403
 *   TC_2.8.3 — GET /stats/:productId admin, valid product → 200 with analytics shape
 *   TC_2.8.4 — GET /stats/:productId with timeFrom/timeTo query params → 200
 *   TC_2.8.5 — GET /stats/:productId invalid productId → 400
 *   TC_2.8.6 — GET /stats/:productId invalid date range (timeFrom >= timeTo) → 400
 *   TC_2.8.7 — GET /stats/:productId product not found → 404
 *   TC_2.8.8 — GET /products no auth → 401
 *   TC_2.8.9 — GET /products non-admin → 403
 *   TC_2.8.10 — GET /products admin → 200 with products array
 *
 * All routes are admin-only (authenticateToken + inline requireAdmin middleware
 * which calls pool.query directly using the default export).
 * @module tests/routes/analytics.routes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../config/database.js', () => ({
  query: vi.fn(),
  default: { query: vi.fn(), connect: vi.fn() },
}));

vi.mock('../../utils/logger.js', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import db from '../../config/database.js';
import analyticsRouter from '../../routes/analytics.js';
import { makeApp } from '../helpers/makeApp.js';
import { makeUserToken, makeInvalidToken } from '../helpers/makeToken.js';

const app = makeApp({ '/api/analytics': analyticsRouter });

const adminToken   = makeUserToken(1);   // userId=1 — mocked as admin
const userToken    = makeUserToken(42);  // userId=42 — mocked as non-admin
const badToken     = makeInvalidToken();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/analytics/stats/:productId
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/analytics/stats/:productId — admin only', () => {
  beforeEach(() => vi.clearAllMocks());

  it('TC_2.8.1: responds 401 when no Authorization header is provided', async () => {
    const res = await request(app).get('/api/analytics/stats/5');
    expect(res.status).toBe(401);
  });

  it('responds 403 when the token is invalid/signed with wrong secret', async () => {
    const res = await request(app)
      .get('/api/analytics/stats/5')
      .set('Authorization', `Bearer ${badToken}`);
    expect(res.status).toBe(403);
  });

  it('TC_2.8.2: responds 403 when the authenticated user is not an admin', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ is_admin: false }] }); // requireAdmin check

    const res = await request(app)
      .get('/api/analytics/stats/5')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('TC_2.8.5: responds 400 when productId is not a valid integer', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ is_admin: true }] }); // requireAdmin

    const res = await request(app)
      .get('/api/analytics/stats/not-a-number')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('TC_2.8.6: responds 400 when timeFrom is equal to or later than timeTo', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ is_admin: true }] }); // requireAdmin

    const res = await request(app)
      .get('/api/analytics/stats/5')
      .query({ timeFrom: '2026-05-01T00:00:00Z', timeTo: '2026-04-01T00:00:00Z' })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/timeFrom must be earlier/i);
  });

  it('TC_2.8.7: responds 404 when the product does not exist', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ is_admin: true }] }) // requireAdmin
      .mockResolvedValueOnce({ rows: [] });                   // product lookup → not found

    const res = await request(app)
      .get('/api/analytics/stats/999')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('TC_2.8.3: responds 200 with a well-shaped analytics object for a valid product', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ is_admin: true }] })                   // requireAdmin
      .mockResolvedValueOnce({ rows: [{ product_id: 5, product_price: '70.00' }] }) // product check
      // Promise.all: views, purchases, saves, ratingResult
      .mockResolvedValueOnce({ rows: [{ count: '142' }] })
      .mockResolvedValueOnce({ rows: [{ count: '18' }] })
      .mockResolvedValueOnce({ rows: [{ count: '34' }] })
      .mockResolvedValueOnce({ rows: [{ avg_rating: '4.25', review_count: '12' }] });

    const res = await request(app)
      .get('/api/analytics/stats/5')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.analytics).toMatchObject({
      productId:   5,
      views:       142,
      purchases:   18,
      saves:       34,
      reviewCount: 12,
      revenue:     1260,
    });
    expect(typeof res.body.analytics.timeFrom).toBe('string');
    expect(typeof res.body.analytics.timeTo).toBe('string');
    expect(typeof res.body.analytics.averageRating).toBe('number');
  });

  it('TC_2.8.4: responds 200 when valid timeFrom and timeTo query params are supplied', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ is_admin: true }] })
      .mockResolvedValueOnce({ rows: [{ product_id: 5, product_price: '50.00' }] })
      .mockResolvedValueOnce({ rows: [{ count: '10' }] })
      .mockResolvedValueOnce({ rows: [{ count: '5' }] })
      .mockResolvedValueOnce({ rows: [{ count: '2' }] })
      .mockResolvedValueOnce({ rows: [{ avg_rating: '3.50', review_count: '4' }] });

    const res = await request(app)
      .get('/api/analytics/stats/5')
      .query({ timeFrom: '2026-01-01T00:00:00Z', timeTo: '2026-03-01T00:00:00Z' })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.analytics.timeFrom).toBe(new Date('2026-01-01T00:00:00Z').toISOString());
  });

  it('responds 500 when the database throws an unexpected error', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ is_admin: true }] })
      .mockResolvedValueOnce({ rows: [{ product_id: 5, product_price: '50.00' }] })
      .mockRejectedValueOnce(new Error('unexpected DB error')); // Promise.all first query

    const res = await request(app)
      .get('/api/analytics/stats/5')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/analytics/products
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/analytics/products — admin only product selector list', () => {
  beforeEach(() => vi.clearAllMocks());

  it('TC_2.8.8: responds 401 when no Authorization header is provided', async () => {
    const res = await request(app).get('/api/analytics/products');
    expect(res.status).toBe(401);
  });

  it('TC_2.8.9: responds 403 when the authenticated user is not an admin', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ is_admin: false }] });

    const res = await request(app)
      .get('/api/analytics/products')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
  });

  it('TC_2.8.10: responds 200 with success:true and a products array for an admin', async () => {
    const products = [
      { id: 1, title: 'Scenario A', hidden: false },
      { id: 2, title: 'Quest B',    hidden: true  },
    ];
    db.query
      .mockResolvedValueOnce({ rows: [{ is_admin: true }] }) // requireAdmin
      .mockResolvedValueOnce({ rows: products });            // SELECT products

    const res = await request(app)
      .get('/api/analytics/products')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.products)).toBe(true);
    expect(res.body.products).toHaveLength(2);
    expect(res.body.products[0]).toMatchObject({ id: 1, title: 'Scenario A', hidden: false });
  });

  it('responds 200 with an empty products array when no products exist', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ is_admin: true }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/analytics/products')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.products).toEqual([]);
  });

  it('responds 500 when the database query throws', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ is_admin: true }] })
      .mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app)
      .get('/api/analytics/products')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});
