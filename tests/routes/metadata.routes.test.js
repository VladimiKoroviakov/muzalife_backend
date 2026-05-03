/**
 * @file Route-level integration tests for /api/metadata
 *
 * QA Test Cases (TC_3.4.x):
 *   TC_3.4.1 — GET /types → 200 with product types array
 *   TC_3.4.2 — GET /age-categories → 200 with age categories array
 *   TC_3.4.3 — GET /events → 200 with events array
 *   TC_3.4.4 — Cache hit: returns cached value without querying the database
 *   TC_3.4.5 — Database error propagates as 500
 *
 * All endpoints are public (no authentication required).
 * The route uses `pool` (default export from database.js) and `appCache`
 * from `utils/cache.js`.
 * @module tests/routes/metadata.routes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../config/database.js', () => ({
  query: vi.fn(),
  default: { query: vi.fn(), connect: vi.fn() },
}));

vi.mock('../../utils/cache.js', () => ({
  appCache: {
    get: vi.fn(() => null),
    set: vi.fn(),
  },
}));

vi.mock('../../utils/logger.js', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import db from '../../config/database.js';
import { appCache } from '../../utils/cache.js';
import metadataRouter from '../../routes/metadata.js';
import { makeApp } from '../helpers/makeApp.js';

const app = makeApp({ '/api/metadata': metadataRouter });

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/metadata/types — TC_3.4.1
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/metadata/types — product types lookup', () => {
  beforeEach(() => vi.clearAllMocks());

  it('TC_3.4.1 (positive): responds 200 with success:true and a data array of {id, name} objects', async () => {
    appCache.get.mockReturnValueOnce(null); // cache miss
    db.query.mockResolvedValueOnce({
      rows: [
        { id: 1, name: 'Сценарій' },
        { id: 2, name: 'Квест' },
        { id: 3, name: 'Вірш' },
      ],
    });

    const res = await request(app).get('/api/metadata/types');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data[0]).toMatchObject({ id: 1, name: 'Сценарій' });
  });

  it('stores the result in the cache after a successful DB query', async () => {
    appCache.get.mockReturnValueOnce(null);
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Сценарій' }] });

    await request(app).get('/api/metadata/types');

    expect(appCache.set).toHaveBeenCalledWith(
      'meta:types',
      [{ id: 1, name: 'Сценарій' }],
      expect.any(Number),
    );
  });

  it('TC_3.4.4 (cache hit): returns cached data without querying the database', async () => {
    const cachedTypes = [{ id: 1, name: 'Сценарій (cached)' }];
    appCache.get.mockReturnValueOnce(cachedTypes);

    const res = await request(app).get('/api/metadata/types');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(cachedTypes);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('returns an empty data array when no types exist in the database', async () => {
    appCache.get.mockReturnValueOnce(null);
    db.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/metadata/types');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('TC_3.4.5: responds 500 when the database query throws', async () => {
    appCache.get.mockReturnValueOnce(null);
    db.query.mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app).get('/api/metadata/types');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  it('accepts requests with no Authorization header (public endpoint)', async () => {
    appCache.get.mockReturnValueOnce([{ id: 1, name: 'Тип' }]);

    const res = await request(app).get('/api/metadata/types');

    expect(res.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/metadata/age-categories — TC_3.4.2
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/metadata/age-categories — age categories lookup', () => {
  beforeEach(() => vi.clearAllMocks());

  it('TC_3.4.2 (positive): responds 200 with success:true and an array of age categories', async () => {
    appCache.get.mockReturnValueOnce(null);
    db.query.mockResolvedValueOnce({
      rows: [
        { id: 1, name: '3+' },
        { id: 2, name: '6+' },
        { id: 3, name: '12+' },
        { id: 4, name: '18+' },
      ],
    });

    const res = await request(app).get('/api/metadata/age-categories');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(4);
    expect(res.body.data[0]).toMatchObject({ id: 1, name: '3+' });
  });

  it('TC_3.4.4 (cache hit): returns cached age categories without DB query', async () => {
    const cached = [{ id: 1, name: '6+ (cached)' }];
    appCache.get.mockReturnValueOnce(cached);

    const res = await request(app).get('/api/metadata/age-categories');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(cached);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('stores the result in the cache with key meta:age_cats', async () => {
    appCache.get.mockReturnValueOnce(null);
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, name: '3+' }] });

    await request(app).get('/api/metadata/age-categories');

    expect(appCache.set).toHaveBeenCalledWith(
      'meta:age_cats',
      expect.any(Array),
      expect.any(Number),
    );
  });

  it('TC_3.4.5: responds 500 when the database query throws', async () => {
    appCache.get.mockReturnValueOnce(null);
    db.query.mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app).get('/api/metadata/age-categories');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/metadata/events — TC_3.4.3
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/metadata/events — events lookup', () => {
  beforeEach(() => vi.clearAllMocks());

  it('TC_3.4.3 (positive): responds 200 with success:true and an array of events', async () => {
    appCache.get.mockReturnValueOnce(null);
    db.query.mockResolvedValueOnce({
      rows: [
        { id: 1, name: 'День народження' },
        { id: 2, name: 'Весілля' },
        { id: 3, name: 'Корпоратив' },
      ],
    });

    const res = await request(app).get('/api/metadata/events');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data[1]).toMatchObject({ id: 2, name: 'Весілля' });
  });

  it('TC_3.4.4 (cache hit): returns cached events without DB query', async () => {
    const cached = [{ id: 3, name: 'Корпоратив (cached)' }];
    appCache.get.mockReturnValueOnce(cached);

    const res = await request(app).get('/api/metadata/events');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(cached);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('stores the result in the cache with key meta:events', async () => {
    appCache.get.mockReturnValueOnce(null);
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'День народження' }] });

    await request(app).get('/api/metadata/events');

    expect(appCache.set).toHaveBeenCalledWith(
      'meta:events',
      expect.any(Array),
      expect.any(Number),
    );
  });

  it('returns an empty data array when no events exist in the database', async () => {
    appCache.get.mockReturnValueOnce(null);
    db.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/metadata/events');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('TC_3.4.5: responds 500 when the database query throws', async () => {
    appCache.get.mockReturnValueOnce(null);
    db.query.mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app).get('/api/metadata/events');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});
