/**
 * @file HTTP-level integration tests for the client error reporting endpoint.
 *
 * Tests `routes/clientErrors.js`:
 *   POST /api/errors
 * @module tests/routes/clientErrors.routes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

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
import clientErrorsRouter from '../../routes/clientErrors.js';
import { makeApp } from '../helpers/makeApp.js';

const app = makeApp({ '/api/errors': clientErrorsRouter });

beforeEach(() => vi.clearAllMocks());

describe('POST /api/errors', () => {
  it('204 — logs at error level by default', async () => {
    const res = await request(app)
      .post('/api/errors')
      .send({ message: 'TypeError: cannot read property' });

    expect(res.status).toBe(204);
    expect(logger.error).toHaveBeenCalledWith(
      '[CLIENT] TypeError: cannot read property',
      expect.objectContaining({ module: 'client-error' }),
    );
  });

  it('204 — respects level=warn', async () => {
    const res = await request(app)
      .post('/api/errors')
      .send({ level: 'warn', message: 'Slow network' });

    expect(res.status).toBe(204);
    expect(logger.warn).toHaveBeenCalledWith(
      '[CLIENT] Slow network',
      expect.objectContaining({ module: 'client-error' }),
    );
  });

  it('204 — respects level=info', async () => {
    const res = await request(app)
      .post('/api/errors')
      .send({ level: 'info', message: 'Page loaded' });

    expect(res.status).toBe(204);
    expect(logger.info).toHaveBeenCalled();
  });

  it('204 — respects level=debug', async () => {
    const res = await request(app)
      .post('/api/errors')
      .send({ level: 'debug', message: 'Debug event' });

    expect(res.status).toBe(204);
    expect(logger.debug).toHaveBeenCalled();
  });

  it('204 — falls back to error for invalid level', async () => {
    const res = await request(app)
      .post('/api/errors')
      .send({ level: 'critical', message: 'Bad level' });

    expect(res.status).toBe(204);
    expect(logger.error).toHaveBeenCalledWith(
      '[CLIENT] Bad level',
      expect.objectContaining({ module: 'client-error' }),
    );
  });

  it('204 — defaults message to Unknown client error when absent', async () => {
    const res = await request(app).post('/api/errors').send({});

    expect(res.status).toBe(204);
    expect(logger.error).toHaveBeenCalledWith(
      '[CLIENT] Unknown client error',
      expect.anything(),
    );
  });

  it('204 — forwards sessionId, url, userAgent, and extra fields to logger', async () => {
    const res = await request(app)
      .post('/api/errors')
      .send({
        level: 'error',
        message: 'crash',
        sessionId: 'sess123',
        url: '/checkout',
        userAgent: 'Mozilla/5.0',
        extraField: 'extraValue',
      });

    expect(res.status).toBe(204);
    expect(logger.error).toHaveBeenCalledWith(
      '[CLIENT] crash',
      expect.objectContaining({
        sessionId: 'sess123',
        clientUrl: '/checkout',
        userAgent: 'Mozilla/5.0',
        extraField: 'extraValue',
      }),
    );
  });

  it('204 — handles empty body gracefully', async () => {
    const res = await request(app).post('/api/errors').send('').set('Content-Type', 'application/json');
    expect(res.status).toBe(204);
  });
});
