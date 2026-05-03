/**
 * @file HTTP-level integration tests for the Products API.
 *
 * Tests the key endpoints in `routes/products.js`:
 *   GET    /api/products       — public product catalogue (with cache support)
 *   GET    /api/products/:id   — public single-product detail (with cache support)
 *   DELETE /api/products/:id   — admin-only product deletion
 *
 * The database (`pool`) and in-memory cache (`appCache`) are fully mocked so
 * no real PostgreSQL connection is required.
 *
 * QA traceability:
 *   TC_2.7.1  — view materials table (GET /)
 *   TC_2.7.2  — (implied) product detail (GET /:id)
 *   TC_2.3.1  — admin deletes a product (DELETE /:id positive)
 *   TC_2.3.2  — deletion blocked without auth (DELETE /:id — 401)
 *   TC_3.9.1  — product detail page (GET /:id with full data)
 * @module tests/routes/products.routes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// ── Mocks (must come before any import that transitively loads these modules) ──
vi.mock('../../config/database.js', () => ({
  query: vi.fn(),
  default: { query: vi.fn(), connect: vi.fn() },
}));

vi.mock('../../utils/cache.js', () => ({
  appCache: { get: vi.fn(() => null), set: vi.fn(), del: vi.fn(), invalidate: vi.fn() },
  TTL_PRODUCTS_LIST: 300,
  TTL_PRODUCT_SINGLE: 300,
}));

vi.mock('../../utils/watermark.js', () => ({
  applyWatermark: vi.fn((buffer) => Promise.resolve(buffer)),
}));

// Prevent the DELETE handler from touching the real filesystem when it tries to
// clean up the product's upload directory after a successful hard-delete.
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: {
      ...actual.default,
      existsSync: vi.fn(() => false),
      rmSync:     vi.fn(),
      mkdirSync:  vi.fn(),
    },
  };
});

vi.mock('../../utils/logger.js', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import db from '../../config/database.js';
import { appCache } from '../../utils/cache.js';
import productsRouter from '../../routes/products.js';
import { makeApp } from '../helpers/makeApp.js';
import { makeUserToken, makeInvalidToken } from '../helpers/makeToken.js';

const app = makeApp({ '/api/products': productsRouter });

// ── Tokens ────────────────────────────────────────────────────────────────────
const adminToken = makeUserToken(1);   // userId=1 — returned as admin in admin tests
const userToken  = makeUserToken(42);  // userId=42 — returned as non-admin
const badToken   = makeInvalidToken();

// ── Shared mock product row (as returned by the multi-join SQL query) ─────────
const mockProductRow = {
  id:               1,
  title:            'Тестовий сценарій',
  description:      'Опис сценарію',
  price:            '150.00',
  rating:           '4.5',
  image:            '/uploads/products/test.jpg',
  type:             'Сценарій',
  type_id:          1,
  agecategories:    ['Дошкільний', 'Молодший шкільний'],
  events:           ['Новий рік'],
  additionalimages: [],
  createdat:        new Date('2025-01-01'),
  updatedat:        new Date('2025-01-01'),
};

beforeEach(() => {
  vi.clearAllMocks();
  // pool.query is called fire-and-forget by recordView (INSERT INTO ProductViews).
  // Without a default, it returns undefined and .catch() on undefined throws a
  // TypeError that propagates out of the async route handler, causing Supertest
  // to hang forever.  Setting a default resolved value prevents this.
  db.query.mockResolvedValue({ rows: [] });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/products — public catalogue
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/products — public catalogue (TC_2.7.1)', () => {
  it('responds 200 with a products array from the database (cache miss)', async () => {
    appCache.get.mockReturnValue(null); // cache miss
    db.query.mockResolvedValueOnce({ rows: [mockProductRow], rowCount: 1 });

    const res = await request(app).get('/api/products');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ title: 'Тестовий сценарій', price: 150 });
  });

  it('returns transformed product with nested ageCategory and events arrays', async () => {
    appCache.get.mockReturnValue(null);
    db.query.mockResolvedValueOnce({ rows: [mockProductRow], rowCount: 1 });

    const res = await request(app).get('/api/products');

    expect(res.status).toBe(200);
    expect(res.body[0].ageCategory).toEqual(['Дошкільний', 'Молодший шкільний']);
    expect(res.body[0].events).toEqual(['Новий рік']);
  });

  it('responds 200 from cache (X-Cache: HIT) when cached data exists', async () => {
    const cachedProducts = [{ id: 1, title: 'Cached product', price: 100, type: 'Сценарій' }];
    appCache.get.mockReturnValue(cachedProducts); // cache hit

    const res = await request(app).get('/api/products');

    expect(res.status).toBe(200);
    expect(res.headers['x-cache']).toBe('HIT');
    expect(db.query).not.toHaveBeenCalled();
    expect(res.body).toEqual(cachedProducts);
  });

  it('sends X-Cache: MISS header when reading from DB', async () => {
    appCache.get.mockReturnValue(null);
    db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app).get('/api/products');

    expect(res.headers['x-cache']).toBe('MISS');
  });

  it('responds 200 with an empty array when no products exist', async () => {
    appCache.get.mockReturnValue(null);
    db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app).get('/api/products');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('responds 500 when the database query throws', async () => {
    appCache.get.mockReturnValue(null);
    db.query.mockRejectedValueOnce(new Error('DB connection failed'));

    const res = await request(app).get('/api/products');

    expect(res.status).toBe(500);
  });

  it('accepts requests without an Authorization header (public route)', async () => {
    appCache.get.mockReturnValue(null);
    db.query.mockResolvedValueOnce({ rows: [mockProductRow], rowCount: 1 });

    const res = await request(app).get('/api/products');

    expect(res.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/products/:id — single product detail
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/products/:id — single product (TC_2.7.2, TC_3.9.1)', () => {
  it('responds 200 with the product object on success (TC_3.9.1)', async () => {
    appCache.get.mockReturnValue(null);
    // pool.query is called twice: product query + fire-and-forget view insert
    db.query
      .mockResolvedValueOnce({ rows: [mockProductRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [] }); // recordView

    const res = await request(app).get('/api/products/1');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 1,
      title: 'Тестовий сценарій',
      price: 150,
      rating: 4.5,
      type: 'Сценарій',
    });
  });

  it('responds with ageCategory array and events array', async () => {
    appCache.get.mockReturnValue(null);
    db.query
      .mockResolvedValueOnce({ rows: [mockProductRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/products/1');

    expect(res.body.ageCategory).toEqual(['Дошкільний', 'Молодший шкільний']);
    expect(res.body.events).toEqual(['Новий рік']);
  });

  it('responds 404 when the product does not exist (empty rows)', async () => {
    appCache.get.mockReturnValue(null);
    db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app).get('/api/products/999');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('responds 200 from cache (X-Cache: HIT) on a cached product', async () => {
    const cachedProduct = { id: 1, title: 'Cached', price: 50, type: 'Сценарій' };
    appCache.get.mockReturnValue(cachedProduct);

    const res = await request(app).get('/api/products/1');

    expect(res.status).toBe(200);
    expect(res.headers['x-cache']).toBe('HIT');
    expect(res.body).toEqual(cachedProduct);
  });

  it('responds 400 for a non-numeric product ID', async () => {
    const res = await request(app).get('/api/products/abc');

    expect(res.status).toBe(400);
  });

  it('responds 500 when the database query throws', async () => {
    appCache.get.mockReturnValue(null);
    db.query.mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app).get('/api/products/1');

    expect(res.status).toBe(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/products/:id — admin only
// ─────────────────────────────────────────────────────────────────────────────
describe('DELETE /api/products/:id — admin only (TC_2.3.1, TC_2.3.2)', () => {
  /**
   * Builds a mock pg client with chainable query responses.
   * The DELETE handler opens a transaction using pool.connect() then
   * calls client.query() for each step.
   * @param {Array<object>} responses - Ordered { rows } objects returned by client.query.
   * @returns {{ connect: import('pg').Pool['connect'] }} Pool-like mock
   */
  const makePoolMock = (responses) => {
    const client = {
      query:   vi.fn(),
      release: vi.fn(),
    };
    let idx = 0;
    client.query.mockImplementation(() => {
      const r = responses[idx++] ?? { rows: [] };
      return Promise.resolve(r);
    });
    db.connect.mockResolvedValue(client);
    return client;
  };

  it('responds 401 when no Authorization header is provided (TC_2.3.2)', async () => {
    const res = await request(app).delete('/api/products/1');
    expect(res.status).toBe(401);
  });

  it('responds 403 when the token is invalid', async () => {
    const res = await request(app)
      .delete('/api/products/1')
      .set('Authorization', `Bearer ${badToken}`);
    expect(res.status).toBe(403);
  });

  it('responds 403 when the authenticated user is not an admin', async () => {
    makePoolMock([
      { rows: [] },                          // BEGIN
      { rows: [{ is_admin: false }] },        // isAdmin check → NOT admin
      { rows: [] },                          // ROLLBACK
    ]);

    const res = await request(app)
      .delete('/api/products/1')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
  });

  it('responds 200 with success:true when admin deletes an existing product (TC_2.3.1)', async () => {
    makePoolMock([
      { rows: [] },                           // BEGIN
      { rows: [{ is_admin: true }] },          // isAdmin → admin
      { rows: [{ product_id: 1 }] },           // product exists
      { rows: [] },                           // boughtCheck → no purchases → proceed
      { rows: [] },                           // imageRows (SELECT FROM Images JOIN ProductImages)
      { rows: [] },                           // fileRows  (SELECT FROM Files JOIN ProductFiles)
      { rows: [] },                           // DELETE ProductAgeCategories
      { rows: [] },                           // DELETE ProductEvents
      { rows: [] },                           // DELETE ProductViews
      { rows: [] },                           // DELETE BoughtUserProducts
      { rows: [] },                           // DELETE SavedUserProducts
      { rows: [] },                           // DELETE ProductReviews
      { rows: [] },                           // DELETE ProductImages
      { rows: [] },                           // DELETE ProductFiles
      { rows: [] },                           // DELETE Products
      { rows: [] },                           // COMMIT
    ]);

    const res = await request(app)
      .delete('/api/products/1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('responds 200 with hidden:true when the product has purchases', async () => {
    makePoolMock([
      { rows: [] },                           // BEGIN
      { rows: [{ is_admin: true }] },          // isAdmin → admin
      { rows: [{ product_id: 1 }] },           // product exists
      { rows: [{ 1: 1 }] },                   // boughtCheck → has purchases → hide
      { rows: [] },                           // UPDATE product_hidden = true
      { rows: [] },                           // COMMIT
    ]);

    const res = await request(app)
      .delete('/api/products/1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.hidden).toBe(true);
  });

  it('responds 404 when the product does not exist', async () => {
    makePoolMock([
      { rows: [] },                           // BEGIN
      { rows: [{ is_admin: true }] },          // isAdmin → admin
      { rows: [] },                           // product check → not found
      { rows: [] },                           // ROLLBACK
    ]);

    const res = await request(app)
      .delete('/api/products/999')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });

  it('responds 400 for a non-numeric product ID', async () => {
    const res = await request(app)
      .delete('/api/products/abc')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
  });
});
