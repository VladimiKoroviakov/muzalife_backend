/**
 * @file Unit tests for the HTTP request logging middleware.
 *
 * Tests `middleware/requestLogger.js`:
 *   requestLogger — assigns request ID, sets response header, logs events
 * @module tests/unit/requestLogger
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid-1234'),
}));

vi.mock('../../utils/logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    http: vi.fn(),
  },
}));

import logger from '../../utils/logger.js';
import { requestLogger } from '../../middleware/requestLogger.js';

/**
 *
 * @param handler
 */
function makeLogApp(handler) {
  const app = express();
  app.use(express.json());
  app.use(requestLogger);
  app.get('/test', handler);
  app.post('/test', handler);
  return app;
}

beforeEach(() => vi.clearAllMocks());

// ─────────────────────────────────────────────────────────────────────────────
// Request ID assignment
// ─────────────────────────────────────────────────────────────────────────────
describe('request ID assignment', () => {
  it('assigns generated UUID when no x-request-id header present', async () => {
    let capturedId;
    const app = makeLogApp((req, res) => {
      capturedId = req.requestId;
      res.json({ ok: true });
    });

    await request(app).get('/test');

    expect(capturedId).toBe('test-uuid-1234');
  });

  it('honours x-request-id header when provided', async () => {
    let capturedId;
    const app = makeLogApp((req, res) => {
      capturedId = req.requestId;
      res.json({ ok: true });
    });

    await request(app).get('/test').set('x-request-id', 'existing-request-id');

    expect(capturedId).toBe('existing-request-id');
  });

  it('sets X-Request-ID response header', async () => {
    const app = makeLogApp((_req, res) => res.json({ ok: true }));

    const res = await request(app).get('/test');

    expect(res.headers['x-request-id']).toBe('test-uuid-1234');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Logging behaviour
// ─────────────────────────────────────────────────────────────────────────────
describe('logging behaviour', () => {
  it('logs incoming request with method, url, and requestId', async () => {
    const app = makeLogApp((_req, res) => res.json({ ok: true }));

    await request(app).get('/test');

    expect(logger.http).toHaveBeenCalledWith(
      'Incoming request',
      expect.objectContaining({
        method: 'GET',
        url: '/test',
        requestId: 'test-uuid-1234',
      }),
    );
  });

  it('calls next()', async () => {
    const app = makeLogApp((_req, res) => res.json({ ok: true }));

    const res = await request(app).get('/test');

    expect(res.status).toBe(200);
  });

  it('logs at http level for 2xx response', async () => {
    const app = makeLogApp((_req, res) => res.status(200).json({ ok: true }));

    await request(app).get('/test');

    expect(logger.http).toHaveBeenCalledWith(
      'Request completed',
      expect.objectContaining({ statusCode: 200 }),
    );
  });

  it('logs at warn level for 4xx response', async () => {
    const app = makeLogApp((_req, res) => res.status(400).json({ error: 'bad' }));

    await request(app).get('/test');

    expect(logger.warn).toHaveBeenCalledWith(
      'Request completed',
      expect.objectContaining({ statusCode: 400 }),
    );
  });

  it('logs at error level for 5xx response', async () => {
    const app = makeLogApp((_req, res) => res.status(500).json({ error: 'server error' }));

    await request(app).get('/test');

    expect(logger.error).toHaveBeenCalledWith(
      'Request completed',
      expect.objectContaining({ statusCode: 500 }),
    );
  });

  it('includes durationMs as non-negative number in completion log', async () => {
    let loggedContext;
    logger.http.mockImplementation((_msg, ctx) => {
      if (ctx?.durationMs !== undefined) { loggedContext = ctx; }
    });

    const app = makeLogApp((_req, res) => res.json({ ok: true }));
    await request(app).get('/test');

    expect(loggedContext.durationMs).toBeGreaterThanOrEqual(0);
  });
});
