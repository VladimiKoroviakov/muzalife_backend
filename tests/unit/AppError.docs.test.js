/**
 * @file Living documentation for {@link module:utils/AppError}.
 *
 * Specifies the class hierarchy of typed application errors: their HTTP status
 * codes, machine-readable error codes, operational flag, and the shape of the
 * JSON response payload produced by `toJSON()`.
 * @module tests/unit/AppError.docs
 */

import { describe, it, expect } from 'vitest';
import {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  UnprocessableError,
  RateLimitError,
  InternalError,
  ExternalServiceError,
  ServiceUnavailableError,
} from '../../utils/AppError.js';

// ─────────────────────────────────────────────────────────────────────────────
// AppError — base class
// ─────────────────────────────────────────────────────────────────────────────
describe('AppError — base class', () => {
  it('is an instance of both Error and AppError', () => {
    const err = new AppError('oops', 400, 'OOPS');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
  });

  it('exposes statusCode, errorCode, and message', () => {
    const err = new AppError('bad input', 400, 'VALIDATION_ERROR');
    expect(err.statusCode).toBe(400);
    expect(err.errorCode).toBe('VALIDATION_ERROR');
    expect(err.message).toBe('bad input');
  });

  it('assigns a non-empty errorId string in UUID v4 format', () => {
    const err = new AppError('test', 500, 'INTERNAL_ERROR');
    expect(typeof err.errorId).toBe('string');
    expect(err.errorId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('assigns a timestamp that is a valid ISO 8601 string', () => {
    const err = new AppError('test', 500, 'INTERNAL_ERROR');
    expect(typeof err.timestamp).toBe('string');
    expect(() => new Date(err.timestamp).toISOString()).not.toThrow();
    expect(new Date(err.timestamp).toISOString()).toBe(err.timestamp);
  });

  it('stores the context object on the instance', () => {
    const ctx = { productId: 7, userId: 3 };
    const err = new AppError('test', 404, 'NOT_FOUND', ctx);
    expect(err.context).toEqual(ctx);
  });

  it('defaults isOperational to true', () => {
    const err = new AppError('test', 400, 'VALIDATION_ERROR');
    expect(err.isOperational).toBe(true);
  });

  it('captures a stack trace on the instance', () => {
    const err = new AppError('test', 500, 'INTERNAL_ERROR');
    expect(typeof err.stack).toBe('string');
    expect(err.stack.length).toBeGreaterThan(0);
  });

  it('toJSON() returns error, errorCode, message, errorId, timestamp — no stack or context', () => {
    const err = new AppError('secret details', 400, 'VALIDATION_ERROR', { internal: 'data' });
    const json = err.toJSON();
    expect(json).toMatchObject({
      error: 'AppError',
      errorCode: 'VALIDATION_ERROR',
      message: 'secret details',
      errorId: err.errorId,
      timestamp: err.timestamp,
    });
    expect(json).not.toHaveProperty('stack');
    expect(json).not.toHaveProperty('context');
  });

  it('every new instance gets a unique errorId', () => {
    const ids = new Set(Array.from({ length: 20 }, () => new AppError('x', 400, 'X').errorId));
    expect(ids.size).toBe(20);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ValidationError — 400
// ─────────────────────────────────────────────────────────────────────────────
describe('ValidationError — 400 Bad Request', () => {
  it('has statusCode 400', () => {
    expect(new ValidationError('bad').statusCode).toBe(400);
  });

  it('has errorCode VALIDATION_ERROR', () => {
    expect(new ValidationError('bad').errorCode).toBe('VALIDATION_ERROR');
  });

  it('is operational (expected business error)', () => {
    expect(new ValidationError('bad').isOperational).toBe(true);
  });

  it('accepts a custom message and context', () => {
    const err = new ValidationError('field required', { field: 'email' });
    expect(err.message).toBe('field required');
    expect(err.context).toEqual({ field: 'email' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// UnauthorizedError — 401
// ─────────────────────────────────────────────────────────────────────────────
describe('UnauthorizedError — 401 Unauthorized', () => {
  it('has statusCode 401', () => {
    expect(new UnauthorizedError().statusCode).toBe(401);
  });

  it('has errorCode UNAUTHORIZED', () => {
    expect(new UnauthorizedError().errorCode).toBe('UNAUTHORIZED');
  });

  it('defaults message to "Authentication required"', () => {
    expect(new UnauthorizedError().message).toBe('Authentication required');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ForbiddenError — 403
// ─────────────────────────────────────────────────────────────────────────────
describe('ForbiddenError — 403 Forbidden', () => {
  it('has statusCode 403', () => {
    expect(new ForbiddenError().statusCode).toBe(403);
  });

  it('has errorCode FORBIDDEN', () => {
    expect(new ForbiddenError().errorCode).toBe('FORBIDDEN');
  });

  it('defaults message to "Access denied"', () => {
    expect(new ForbiddenError().message).toBe('Access denied');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// NotFoundError — 404
// ─────────────────────────────────────────────────────────────────────────────
describe('NotFoundError — 404 Not Found', () => {
  it('has statusCode 404', () => {
    expect(new NotFoundError().statusCode).toBe(404);
  });

  it('has errorCode NOT_FOUND', () => {
    expect(new NotFoundError().errorCode).toBe('NOT_FOUND');
  });

  it('defaults message to "Resource not found"', () => {
    expect(new NotFoundError().message).toBe('Resource not found');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ConflictError — 409
// ─────────────────────────────────────────────────────────────────────────────
describe('ConflictError — 409 Conflict', () => {
  it('has statusCode 409', () => {
    expect(new ConflictError('already exists').statusCode).toBe(409);
  });

  it('has errorCode CONFLICT', () => {
    expect(new ConflictError('already exists').errorCode).toBe('CONFLICT');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// UnprocessableError — 422
// ─────────────────────────────────────────────────────────────────────────────
describe('UnprocessableError — 422 Unprocessable Entity', () => {
  it('has statusCode 422', () => {
    expect(new UnprocessableError('semantic error').statusCode).toBe(422);
  });

  it('has errorCode UNPROCESSABLE', () => {
    expect(new UnprocessableError('semantic error').errorCode).toBe('UNPROCESSABLE');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RateLimitError — 429
// ─────────────────────────────────────────────────────────────────────────────
describe('RateLimitError — 429 Too Many Requests', () => {
  it('has statusCode 429', () => {
    expect(new RateLimitError().statusCode).toBe(429);
  });

  it('has errorCode RATE_LIMIT_EXCEEDED', () => {
    expect(new RateLimitError().errorCode).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('defaults message to "Too many requests"', () => {
    expect(new RateLimitError().message).toBe('Too many requests');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// InternalError — 500
// ─────────────────────────────────────────────────────────────────────────────
describe('InternalError — 500 Internal Server Error', () => {
  it('has statusCode 500', () => {
    expect(new InternalError().statusCode).toBe(500);
  });

  it('has errorCode INTERNAL_ERROR', () => {
    expect(new InternalError().errorCode).toBe('INTERNAL_ERROR');
  });

  it('isOperational is false — signals a programming bug, not a business error', () => {
    expect(new InternalError().isOperational).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ExternalServiceError — 502
// ─────────────────────────────────────────────────────────────────────────────
describe('ExternalServiceError — 502 Bad Gateway', () => {
  it('has statusCode 502', () => {
    expect(new ExternalServiceError('email down', 'smtp').statusCode).toBe(502);
  });

  it('has errorCode EXTERNAL_SERVICE_ERROR', () => {
    expect(new ExternalServiceError('email down', 'smtp').errorCode).toBe('EXTERNAL_SERVICE_ERROR');
  });

  it('merges serviceName into context alongside caller-supplied context', () => {
    const err = new ExternalServiceError('db error', 'postgres', { retryCount: 3 });
    expect(err.context.serviceName).toBe('postgres');
    expect(err.context.retryCount).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ServiceUnavailableError — 503
// ─────────────────────────────────────────────────────────────────────────────
describe('ServiceUnavailableError — 503 Service Unavailable', () => {
  it('has statusCode 503', () => {
    expect(new ServiceUnavailableError().statusCode).toBe(503);
  });

  it('has errorCode SERVICE_UNAVAILABLE', () => {
    expect(new ServiceUnavailableError().errorCode).toBe('SERVICE_UNAVAILABLE');
  });

  it('defaults message to "Service temporarily unavailable"', () => {
    expect(new ServiceUnavailableError().message).toBe('Service temporarily unavailable');
  });
});
