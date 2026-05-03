/**
 * @file HTTP-level integration tests for the Saved Products API.
 *
 * Tests every endpoint in `routes/savedProducts.js`:
 *   GET    /api/saved-products/ids     — list saved product IDs (auth required)
 *   POST   /api/saved-products         — save a product (auth required)
 *   DELETE /api/saved-products/:id     — unsave a product (auth required)
 *
 * All routes require a valid JWT. Database is fully mocked.
 * @module tests/routes/savedProducts.routes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../config/database.js', () => ({
  query: vi.fn(),
  default: {},
}));

vi.mock('../../utils/logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { query } from '../../config/database.js';
import savedProductsRouter from '../../routes/savedProducts.js';
import { makeApp } from '../helpers/makeApp.js';
import { makeUserToken, makeInvalidToken } from '../helpers/makeToken.js';

const app = makeApp({ '/api/saved-products': savedProductsRouter });

const validToken = makeUserToken(42);
const badToken   = makeInvalidToken();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/saved-products/ids
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/saved-products/ids — authentication required', () => {
  beforeEach(() => vi.clearAllMocks());

  it('responds 401 when no Authorization header is provided', async () => {
    const res = await request(app).get('/api/saved-products/ids');
    expect(res.status).toBe(401);
  });

  it('responds 403 when the token is invalid', async () => {
    const res = await request(app)
      .get('/api/saved-products/ids')
      .set('Authorization', `Bearer ${badToken}`);
    expect(res.status).toBe(403);
  });

  it('responds 200 with success:true and a data array of product IDs', async () => {
    query.mockResolvedValue({ rows: [{ product_id: 1 }, { product_id: 5 }] });

    const res = await request(app)
      .get('/api/saved-products/ids')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([1, 5]);
  });

  it('data array contains only the product_id values (not full row objects)', async () => {
    query.mockResolvedValue({ rows: [{ product_id: 3 }] });

    const res = await request(app)
      .get('/api/saved-products/ids')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.body.data).toEqual([3]);
    expect(typeof res.body.data[0]).toBe('number');
  });

  it('responds with an empty array when the user has no saved products', async () => {
    query.mockResolvedValue({ rows: [] });

    const res = await request(app)
      .get('/api/saved-products/ids')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('responds 500 when the database query throws', async () => {
    query.mockRejectedValue(new Error('DB error'));

    const res = await request(app)
      .get('/api/saved-products/ids')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/saved-products — save a product
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/saved-products — authentication required', () => {
  beforeEach(() => vi.clearAllMocks());

  it('responds 401 when no Authorization header is provided', async () => {
    const res = await request(app).post('/api/saved-products').send({ productId: 1 });
    expect(res.status).toBe(401);
  });

  it('responds 400 when productId is missing from the request body', async () => {
    const res = await request(app)
      .post('/api/saved-products')
      .set('Authorization', `Bearer ${validToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('responds 404 when the product does not exist or is hidden', async () => {
    query.mockResolvedValueOnce({ rows: [] }); // product check — not found

    const res = await request(app)
      .post('/api/saved-products')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ productId: 999 });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('responds 409 when the product is already saved by the user', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ product_id: 1 }] }) // product exists
      .mockResolvedValueOnce({ rows: [{ user_id: 42, product_id: 1 }] }); // already saved

    const res = await request(app)
      .post('/api/saved-products')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ productId: 1 });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('responds 201 with success:true when the product is saved successfully', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ product_id: 1 }] }) // product exists
      .mockResolvedValueOnce({ rows: [] })                   // not yet saved
      .mockResolvedValueOnce({ rows: [] });                  // insert

    const res = await request(app)
      .post('/api/saved-products')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ productId: 1 });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('responds 500 when the database query throws', async () => {
    query.mockRejectedValue(new Error('DB error'));

    const res = await request(app)
      .post('/api/saved-products')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ productId: 1 });

    expect(res.status).toBe(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/saved-products/:productId — unsave a product
// ─────────────────────────────────────────────────────────────────────────────
describe('DELETE /api/saved-products/:productId — authentication required', () => {
  beforeEach(() => vi.clearAllMocks());

  it('responds 401 when no Authorization header is provided', async () => {
    const res = await request(app).delete('/api/saved-products/1');
    expect(res.status).toBe(401);
  });

  it('responds 404 when the saved product record is not found (rowCount=0)', async () => {
    query.mockResolvedValue({ rowCount: 0 });

    const res = await request(app)
      .delete('/api/saved-products/999')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('responds 200 with success:true when the product is unsaved successfully', async () => {
    query.mockResolvedValue({ rowCount: 1 });

    const res = await request(app)
      .delete('/api/saved-products/1')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('responds 500 when the database query throws', async () => {
    query.mockRejectedValue(new Error('DB error'));

    const res = await request(app)
      .delete('/api/saved-products/1')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(500);
  });
});
