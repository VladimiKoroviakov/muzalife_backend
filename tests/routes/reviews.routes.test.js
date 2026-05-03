/**
 * @file HTTP-level integration tests for the Reviews API.
 *
 * Tests endpoints in `routes/reviews.js` / `controllers/reviewsController.js`:
 *   GET  /api/reviews/product/:productId  — public
 *   GET  /api/reviews/user/:userId        — public
 *   POST /api/reviews                     — auth required
 *   DELETE /api/reviews/:reviewId         — auth required (KNOWN BUG documented)
 *
 * The reviews controller uses the **default pool import** (`pool.query` and
 * `pool.connect()`). The DB mock exposes both so the controller can use them.
 * @module tests/routes/reviews.routes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// The mock client returned by pool.connect()
const mockClient = {
  query: vi.fn(),
  release: vi.fn(),
};

vi.mock('../../config/database.js', () => ({
  query: vi.fn(),
  default: {
    query: vi.fn(),
    connect: vi.fn(),
  },
}));

vi.mock('../../utils/logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import db from '../../config/database.js';
import reviewsRouter from '../../routes/reviews.js';
import { makeApp } from '../helpers/makeApp.js';
import { makeUserToken, makeInvalidToken } from '../helpers/makeToken.js';

const app = makeApp({ '/api/reviews': reviewsRouter });

const validToken = makeUserToken(42);
const badToken   = makeInvalidToken();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reviews/product/:productId — public
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/reviews/product/:productId — public endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.connect.mockResolvedValue(mockClient);
  });

  it('responds 200 with an array of reviews for a valid productId', async () => {
    db.query.mockResolvedValue({ rows: [] });

    const res = await request(app).get('/api/reviews/product/1');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('responds 400 when productId is not a number', async () => {
    const res = await request(app).get('/api/reviews/product/abc');
    expect(res.status).toBe(400);
  });

  it('responds 500 when the database query throws', async () => {
    db.query.mockRejectedValue(new Error('DB error'));

    const res = await request(app).get('/api/reviews/product/1');

    expect(res.status).toBe(500);
  });

  it('maps DB rows to the frontend Review shape (id, userId, userName, rating, comment, createdAt)', async () => {
    db.query.mockResolvedValue({
      rows: [{
        review_id: 10,
        review_rating: 5,
        review_text: 'Great!',
        review_created_at: new Date().toISOString(),
        product_id: 1,
        user_id: 3,
        user_name: 'Alice',
        user_avatar_url: null,
      }],
    });

    const res = await request(app).get('/api/reviews/product/1');

    expect(res.status).toBe(200);
    const review = res.body[0];
    expect(review).toHaveProperty('id');
    expect(review).toHaveProperty('userId');
    expect(review).toHaveProperty('userName');
    expect(review).toHaveProperty('rating');
    expect(review).toHaveProperty('comment');
    expect(review).toHaveProperty('createdAt');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reviews/user/:userId — public (registered before authenticateToken)
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/reviews/user/:userId — public endpoint', () => {
  beforeEach(() => vi.clearAllMocks());

  it('responds 200 with an array of user reviews (no auth needed)', async () => {
    db.query.mockResolvedValue({ rows: [] });

    const res = await request(app).get('/api/reviews/user/3');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('responds 400 when userId is not a number', async () => {
    const res = await request(app).get('/api/reviews/user/notanumber');
    expect(res.status).toBe(400);
  });

  it('responds 500 when the database query throws', async () => {
    db.query.mockRejectedValue(new Error('DB error'));

    const res = await request(app).get('/api/reviews/user/3');

    expect(res.status).toBe(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/reviews — requires authentication
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/reviews — requires authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.connect.mockResolvedValue(mockClient);
    mockClient.query.mockReset();
    mockClient.release.mockReset();
  });

  it('responds 401 when no Authorization header is provided', async () => {
    const res = await request(app).post('/api/reviews').send({ productId: 1, rating: 5, comment: 'Great' });
    expect(res.status).toBe(401);
  });

  it('responds 403 when the token is invalid', async () => {
    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${badToken}`)
      .send({ productId: 1, rating: 5, comment: 'Great' });
    expect(res.status).toBe(403);
  });

  it('responds 400 when productId is missing', async () => {
    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ rating: 5, comment: 'No product' });
    expect(res.status).toBe(400);
  });

  it('responds 400 when rating is missing', async () => {
    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ productId: 1, comment: 'No rating' });
    expect(res.status).toBe(400);
  });

  it('responds 400 when comment is missing', async () => {
    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ productId: 1, rating: 4 });
    expect(res.status).toBe(400);
  });

  it('responds 400 when rating is below 1', async () => {
    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ productId: 1, rating: 0, comment: 'Too low' });
    expect(res.status).toBe(400);
  });

  it('responds 400 when rating is above 5', async () => {
    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ productId: 1, rating: 6, comment: 'Too high' });
    expect(res.status).toBe(400);
  });

  it('responds 409 when the user has already reviewed this product', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ review_id: 1 }] }); // existing review check

    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ productId: 1, rating: 4, comment: 'Duplicate' });

    expect(res.status).toBe(409);
  });

  it('responds 404 when the product does not exist or is hidden', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })  // no existing review
      .mockResolvedValueOnce({ rows: [] }); // product not found

    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ productId: 999, rating: 4, comment: 'Ghost product' });

    expect(res.status).toBe(404);
  });

  it('responds 201 with the created review on success', async () => {
    const reviewRow = {
      id: 10, comment: 'Love it', rating: 5,
      userId: 42, userName: 'Bob', userAvatar: null, userInitials: 'Bo',
      productId: 1, createdAt: new Date().toISOString(),
    };

    db.query
      .mockResolvedValueOnce({ rows: [] })                // no existing review
      .mockResolvedValueOnce({ rows: [{ product_id: 1 }] }); // product exists

    // Transaction: BEGIN, INSERT review, INSERT junction, UPDATE rating, COMMIT, SELECT
    mockClient.query
      .mockResolvedValueOnce({ rows: [] })                        // BEGIN
      .mockResolvedValueOnce({ rows: [{ review_id: 10 }] })      // INSERT Reviews
      .mockResolvedValueOnce({ rows: [] })                        // INSERT ProductReviews
      .mockResolvedValueOnce({ rows: [] })                        // UPDATE product rating
      .mockResolvedValueOnce({ rows: [] })                        // COMMIT
      .mockResolvedValueOnce({ rows: [reviewRow] });              // SELECT new review

    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ productId: 1, rating: 5, comment: 'Love it' });

    expect(res.status).toBe(201);
  });

  it('responds 500 when the database throws during the transaction', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })                // no existing review
      .mockResolvedValueOnce({ rows: [{ product_id: 1 }] }); // product exists

    mockClient.query
      .mockResolvedValueOnce({ rows: [] })                // BEGIN
      .mockRejectedValueOnce(new Error('insert failed')); // INSERT throws

    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ productId: 1, rating: 5, comment: 'Fail me' });

    expect(res.status).toBe(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/reviews/:reviewId — requires authentication
// ─────────────────────────────────────────────────────────────────────────────
describe('DELETE /api/reviews/:reviewId — requires authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.connect.mockResolvedValue(mockClient);
  });

  it('responds 401 when no Authorization header is provided', async () => {
    const res = await request(app).delete('/api/reviews/1');
    expect(res.status).toBe(401);
  });

  it('responds 403 when the token is invalid', async () => {
    const res = await request(app)
      .delete('/api/reviews/1')
      .set('Authorization', `Bearer ${badToken}`);
    expect(res.status).toBe(403);
  });

  /**
   * KNOWN BUG: `deleteReview` in `controllers/reviewsController.js` line 286
   * reads `req.user.userId` but the auth middleware sets `req.userId`.
   * This causes a TypeError on every authenticated DELETE request.
   * Fix: change `req.user.userId` to `req.userId`.
   */
  it('KNOWN BUG: responds 500 due to TypeError reading req.user.userId (should be req.userId)', async () => {
    const res = await request(app)
      .delete('/api/reviews/1')
      .set('Authorization', `Bearer ${validToken}`);

    // This will be 500 until the bug is fixed in reviewsController.js:286
    expect(res.status).toBe(500);
  });
});
