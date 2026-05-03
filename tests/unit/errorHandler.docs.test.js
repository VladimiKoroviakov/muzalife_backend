/**
 * @file Living documentation for {@link module:middleware/errorHandler}.
 *
 * Specifies the response shape and HTTP status produced by:
 *   - `globalErrorHandler` — for AppErrors, generic errors, and Multer errors
 *   - `notFoundHandler`    — the catch-all 404 middleware
 *
 * All error handlers are tested by calling them directly with mock req/res
 * objects, without going through the HTTP layer.
 * @module tests/unit/errorHandler.docs
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { globalErrorHandler, notFoundHandler } from '../../middleware/errorHandler.js';
import {
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  InternalError,
} from '../../utils/AppError.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
/**
 *
 * @param overrides
 */
function makeReq(overrides = {}) {
  return {
    method: 'GET',
    originalUrl: '/api/test',
    ip: '127.0.0.1',
    requestId: 'test-req-id',
    userId: null,
    ...overrides,
  };
}

/**
 *
 */
function makeRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

const noop = () => {};

// ─────────────────────────────────────────────────────────────────────────────
// globalErrorHandler — AppError instances
// ─────────────────────────────────────────────────────────────────────────────
describe('globalErrorHandler — AppError instances', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses err.statusCode from the AppError', () => {
    const err = new ValidationError('invalid');
    const res = makeRes();

    globalErrorHandler(err, makeReq(), res, noop);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('responds with the AppError errorId already on the error instance', () => {
    const err = new NotFoundError('missing');
    const res = makeRes();

    globalErrorHandler(err, makeReq(), res, noop);

    const body = res.json.mock.calls[0][0];
    expect(body.errorId).toBe(err.errorId);
  });

  it('response body contains the full required shape', () => {
    const err = new ValidationError('bad input');
    const res = makeRes();

    globalErrorHandler(err, makeReq(), res, noop);

    const body = res.json.mock.calls[0][0];
    expect(body).toHaveProperty('error');
    expect(body).toHaveProperty('errorId');
    expect(body).toHaveProperty('timestamp');
    expect(body.message).toHaveProperty('uk');
    expect(body.message).toHaveProperty('en');
    expect(body.hint).toHaveProperty('uk');
    expect(body.hint).toHaveProperty('en');
    expect(body).toHaveProperty('supportInfo');
  });

  it('message.uk and message.en are non-empty strings', () => {
    const err = new ForbiddenError();
    const res = makeRes();

    globalErrorHandler(err, makeReq(), res, noop);

    const { message } = res.json.mock.calls[0][0];
    expect(typeof message.uk).toBe('string');
    expect(typeof message.en).toBe('string');
    expect(message.uk.length).toBeGreaterThan(0);
    expect(message.en.length).toBeGreaterThan(0);
  });

  it('returns 401 for UnauthorizedError', () => {
    const res = makeRes();
    globalErrorHandler(new UnauthorizedError(), makeReq(), res, noop);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 403 for ForbiddenError', () => {
    const res = makeRes();
    globalErrorHandler(new ForbiddenError(), makeReq(), res, noop);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 404 for NotFoundError', () => {
    const res = makeRes();
    globalErrorHandler(new NotFoundError(), makeReq(), res, noop);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 500 for InternalError', () => {
    const res = makeRes();
    globalErrorHandler(new InternalError(), makeReq(), res, noop);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// globalErrorHandler — generic (non-AppError) errors
// ─────────────────────────────────────────────────────────────────────────────
describe('globalErrorHandler — generic (non-AppError) errors', () => {
  beforeEach(() => vi.clearAllMocks());

  it('defaults to statusCode 500 for a plain Error', () => {
    const res = makeRes();
    globalErrorHandler(new Error('unexpected'), makeReq(), res, noop);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('defaults to errorCode "INTERNAL_ERROR"', () => {
    const res = makeRes();
    globalErrorHandler(new Error('unexpected'), makeReq(), res, noop);
    const body = res.json.mock.calls[0][0];
    expect(body.error).toBe('INTERNAL_ERROR');
  });

  it('generates a new errorId (UUID-shaped string) when err.errorId is absent', () => {
    const res = makeRes();
    globalErrorHandler(new Error('plain'), makeReq(), res, noop);
    const body = res.json.mock.calls[0][0];
    expect(typeof body.errorId).toBe('string');
    expect(body.errorId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('response body still has the full required shape', () => {
    const res = makeRes();
    globalErrorHandler(new Error('plain'), makeReq(), res, noop);
    const body = res.json.mock.calls[0][0];
    expect(body).toHaveProperty('error');
    expect(body).toHaveProperty('errorId');
    expect(body).toHaveProperty('timestamp');
    expect(body.message).toHaveProperty('uk');
    expect(body.message).toHaveProperty('en');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// globalErrorHandler — Multer errors
// ─────────────────────────────────────────────────────────────────────────────
describe('globalErrorHandler — Multer errors', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 with VALIDATION_ERROR for LIMIT_FILE_SIZE errors', () => {
    const multerErr = Object.assign(new Error('File too large'), { code: 'LIMIT_FILE_SIZE' });
    const res = makeRes();

    globalErrorHandler(multerErr, makeReq(), res, noop);

    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.errorCode).toBe('VALIDATION_ERROR');
  });

  it('LIMIT_FILE_SIZE response includes errorId and uk/en messages', () => {
    const multerErr = Object.assign(new Error('File too large'), { code: 'LIMIT_FILE_SIZE' });
    const res = makeRes();

    globalErrorHandler(multerErr, makeReq(), res, noop);

    const body = res.json.mock.calls[0][0];
    expect(body).toHaveProperty('errorId');
    expect(body.message).toHaveProperty('uk');
    expect(body.message).toHaveProperty('en');
  });

  it('returns 400 for errors whose message includes "Invalid file type"', () => {
    const multerErr = new Error('Invalid file type: only JPEG, PNG are allowed');
    const res = makeRes();

    globalErrorHandler(multerErr, makeReq(), res, noop);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// globalErrorHandler — unknown errorCode
// ─────────────────────────────────────────────────────────────────────────────
describe('globalErrorHandler — unknown errorCode', () => {
  it('falls back to UNKNOWN_ERROR localised message when errorCode has no mapping', () => {
    const err = { statusCode: 418, errorCode: 'IM_A_TEAPOT', message: 'teapot', errorId: 'abc' };
    const res = makeRes();

    globalErrorHandler(err, makeReq(), res, noop);

    const body = res.json.mock.calls[0][0];
    // The fallback message must still have uk and en keys
    expect(body.message).toHaveProperty('uk');
    expect(body.message).toHaveProperty('en');
    expect(body.message.uk.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// notFoundHandler — catch-all 404
// ─────────────────────────────────────────────────────────────────────────────
describe('notFoundHandler — catch-all 404', () => {
  beforeEach(() => vi.clearAllMocks());

  it('responds with status 404', () => {
    const res = makeRes();
    notFoundHandler(makeReq({ originalUrl: '/api/nonexistent' }), res, noop);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('response body has error: "NOT_FOUND", errorId, and timestamp', () => {
    const res = makeRes();
    notFoundHandler(makeReq(), res, noop);
    const body = res.json.mock.calls[0][0];
    expect(body.error).toBe('NOT_FOUND');
    expect(typeof body.errorId).toBe('string');
    expect(typeof body.timestamp).toBe('string');
  });

  it('response body includes hint with uk and en keys', () => {
    const res = makeRes();
    notFoundHandler(makeReq(), res, noop);
    const body = res.json.mock.calls[0][0];
    expect(body.hint).toHaveProperty('uk');
    expect(body.hint).toHaveProperty('en');
  });

  it('response body includes availableRoutes array with at least one entry', () => {
    const res = makeRes();
    notFoundHandler(makeReq(), res, noop);
    const body = res.json.mock.calls[0][0];
    expect(Array.isArray(body.availableRoutes)).toBe(true);
    expect(body.availableRoutes.length).toBeGreaterThan(0);
  });
});
