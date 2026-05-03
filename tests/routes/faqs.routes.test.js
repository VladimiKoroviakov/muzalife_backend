/**
 * @file HTTP-level integration tests for the FAQ REST API.
 *
 * Tests every endpoint in `routes/faqs.js`:
 *   GET /api/faqs        — list (with cache)
 *   GET /api/faqs/:id    — single FAQ
 *   POST /api/faqs       — create
 *   PUT /api/faqs/:id    — update
 *   DELETE /api/faqs/:id — delete
 *
 * Database and cache are fully mocked. No real HTTP server is started;
 * `supertest` drives the Express app created by `makeApp()`.
 * @module tests/routes/faqs.routes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// ── Mocks must be declared before any import that triggers the real module ────
vi.mock('../../config/database.js', () => ({
  query: vi.fn(),
  default: {},
}));

vi.mock('../../utils/cache.js', () => ({
  appCache: {
    get: vi.fn().mockReturnValue(null),
    set: vi.fn(),
    invalidate: vi.fn(),
    has: vi.fn().mockReturnValue(false),
  },
  TTL_FAQS: 600_000,
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
import { appCache } from '../../utils/cache.js';
import faqRouter from '../../routes/faqs.js';
import { makeApp } from '../helpers/makeApp.js';

const app = makeApp({ '/api/faqs': faqRouter });

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/faqs — list all FAQs
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/faqs — list all FAQs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appCache.get.mockReturnValue(null); // cold cache by default
  });

  it('responds 200 with success:true and data array from DB', async () => {
    query.mockResolvedValue({ rows: [{ id: 1, question: 'Q?', answer: 'A.' }], rowCount: 1 });

    const res = await request(app).get('/api/faqs');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('sets X-Cache: MISS header when the cache is cold', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0 });

    const res = await request(app).get('/api/faqs');

    expect(res.headers['x-cache']).toBe('MISS');
  });

  it('response includes count equal to the number of rows returned', async () => {
    const rows = [
      { id: 1, question: 'Q1?', answer: 'A1.' },
      { id: 2, question: 'Q2?', answer: 'A2.' },
    ];
    query.mockResolvedValue({ rows, rowCount: rows.length });

    const res = await request(app).get('/api/faqs');

    expect(res.body.count).toBe(2);
  });

  it('calls appCache.set() with the response payload after fetching from DB', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0 });

    await request(app).get('/api/faqs');

    expect(appCache.set).toHaveBeenCalledOnce();
    expect(appCache.set.mock.calls[0][0]).toBe('faqs:all');
  });

  it('responds 200 from cache and sets X-Cache: HIT when cache returns data', async () => {
    const cached = { success: true, data: [{ id: 1, question: 'Q?', answer: 'A.' }], count: 1 };
    appCache.get.mockReturnValue(cached);

    const res = await request(app).get('/api/faqs');

    expect(res.status).toBe(200);
    expect(res.headers['x-cache']).toBe('HIT');
  });

  it('does not call query() when serving from cache', async () => {
    appCache.get.mockReturnValue({ success: true, data: [], count: 0 });

    await request(app).get('/api/faqs');

    expect(query).not.toHaveBeenCalled();
  });

  it('responds 500 when the database query throws', async () => {
    query.mockRejectedValue(new Error('DB connection lost'));

    const res = await request(app).get('/api/faqs');

    expect(res.status).toBe(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/faqs/:id — single FAQ by ID
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/faqs/:id — single FAQ by ID', () => {
  beforeEach(() => vi.clearAllMocks());

  it('responds 200 with success:true and the matching FAQ row', async () => {
    query.mockResolvedValue({ rows: [{ id: 1, question: 'What?', answer: 'This.' }] });

    const res = await request(app).get('/api/faqs/1');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({ id: 1 });
  });

  it('responds 404 when the DB returns no rows for the given id', async () => {
    query.mockResolvedValue({ rows: [] });

    const res = await request(app).get('/api/faqs/999');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('responds 500 when the database query throws', async () => {
    query.mockRejectedValue(new Error('DB error'));

    const res = await request(app).get('/api/faqs/1');

    expect(res.status).toBe(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/faqs — create a FAQ
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/faqs — create a FAQ', () => {
  beforeEach(() => vi.clearAllMocks());

  it('responds 201 with success:true and the newly created FAQ', async () => {
    query.mockResolvedValue({ rows: [{ id: 5, question: 'New?', answer: 'Yes.' }] });

    const res = await request(app)
      .post('/api/faqs')
      .send({ question: 'New?', answer: 'Yes.' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({ id: 5 });
  });

  it('responds 400 when question is missing from the request body', async () => {
    const res = await request(app)
      .post('/api/faqs')
      .send({ answer: 'Answer only.' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('responds 400 when answer is missing from the request body', async () => {
    const res = await request(app)
      .post('/api/faqs')
      .send({ question: 'Question only?' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('calls appCache.invalidate("faqs:all") after successful insert', async () => {
    query.mockResolvedValue({ rows: [{ id: 5, question: 'Q?', answer: 'A.' }] });

    await request(app).post('/api/faqs').send({ question: 'Q?', answer: 'A.' });

    expect(appCache.invalidate).toHaveBeenCalledWith('faqs:all');
  });

  it('responds 500 when the database query throws', async () => {
    query.mockRejectedValue(new Error('insert failed'));

    const res = await request(app).post('/api/faqs').send({ question: 'Q?', answer: 'A.' });

    expect(res.status).toBe(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/faqs/:id — update a FAQ
// ─────────────────────────────────────────────────────────────────────────────
describe('PUT /api/faqs/:id — update a FAQ', () => {
  beforeEach(() => vi.clearAllMocks());

  it('responds 200 with success:true and the updated FAQ row', async () => {
    query.mockResolvedValue({ rows: [{ id: 1, question: 'Updated?', answer: 'Yes.' }] });

    const res = await request(app)
      .put('/api/faqs/1')
      .send({ question: 'Updated?' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({ id: 1 });
  });

  it('responds 404 when the DB returns no rows for the given id', async () => {
    query.mockResolvedValue({ rows: [] });

    const res = await request(app).put('/api/faqs/999').send({ question: 'X?' });

    expect(res.status).toBe(404);
  });

  it('calls appCache.invalidate("faqs:all") after successful update', async () => {
    query.mockResolvedValue({ rows: [{ id: 1, question: 'Q?', answer: 'A.' }] });

    await request(app).put('/api/faqs/1').send({ question: 'Q?' });

    expect(appCache.invalidate).toHaveBeenCalledWith('faqs:all');
  });

  it('responds 500 when the database query throws', async () => {
    query.mockRejectedValue(new Error('update failed'));

    const res = await request(app).put('/api/faqs/1').send({ question: 'Q?' });

    expect(res.status).toBe(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/faqs/:id — delete a FAQ
// ─────────────────────────────────────────────────────────────────────────────
describe('DELETE /api/faqs/:id — delete a FAQ', () => {
  beforeEach(() => vi.clearAllMocks());

  it('responds 200 with success:true and a deletion message', async () => {
    query.mockResolvedValue({ rows: [{ faq_id: 1 }], rowCount: 1 });

    const res = await request(app).delete('/api/faqs/1');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('responds 404 when rowCount is 0 (FAQ not found)', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0 });

    const res = await request(app).delete('/api/faqs/999');

    expect(res.status).toBe(404);
  });

  it('calls appCache.invalidate("faqs:all") after successful deletion', async () => {
    query.mockResolvedValue({ rows: [{ faq_id: 1 }], rowCount: 1 });

    await request(app).delete('/api/faqs/1');

    expect(appCache.invalidate).toHaveBeenCalledWith('faqs:all');
  });

  it('responds 500 when the database query throws', async () => {
    query.mockRejectedValue(new Error('delete failed'));

    const res = await request(app).delete('/api/faqs/1');

    expect(res.status).toBe(500);
  });
});
