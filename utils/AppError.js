/**
 * @file Custom application error classes for MuzaLife backend.
 *
 * Provides a hierarchy of typed errors that carry:
 *   - A unique `errorId` (UUID v4) for cross-log correlation
 *   - An HTTP `statusCode` for response generation
 *   - An `errorCode` string for client-side i18n and programmatic handling
 *   - Structured `context` (request params, user state, etc.)
 *   - `isOperational` flag — distinguishes expected business errors from
 *     unexpected programming bugs.
 *
 * **Usage pattern:**
 * ```js
 * throw new NotFoundError('Product not found', { productId: req.params.id });
 * ```
 * The global error handler in `server.js` catches these, logs them with full
 * context, and sends a sanitised JSON response.
 * @module utils/AppError
 */

import { v4 as uuidv4 } from 'uuid';

// ── Base error ────────────────────────────────────────────────────────────────

/**
 * Base class for all application-level errors.
 * @augments Error
 */
export class AppError extends Error {
  /**
   * @param {string} message       - Developer-facing error description.
   * @param {number} statusCode    - HTTP status code to send.
   * @param {string} errorCode     - Machine-readable code (e.g. 'USER_NOT_FOUND').
   * @param {object} [context]  - Extra diagnostic data (params, state, userId…).
   * @param {boolean} [isOperational] - `true` for expected errors, `false` for bugs.
   */
  constructor(message, statusCode, errorCode, context = {}, isOperational = true) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.context = context;
    this.isOperational = isOperational;

    /** Unique ID for this error instance — embed in logs and API responses. */
    this.errorId = uuidv4();

    this.timestamp = new Date().toISOString();

    // Preserve original stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Serialises the error to a plain object suitable for JSON API responses.
   * Sensitive fields (stack trace, internal context) are excluded.
   * @returns {object}
   */
  toJSON() {
    return {
      error: this.name,
      errorCode: this.errorCode,
      message: this.message,
      errorId: this.errorId,
      timestamp: this.timestamp,
    };
  }
}

// ── Derived error types ───────────────────────────────────────────────────────

/** 400 Bad Request — invalid client input. */
export class ValidationError extends AppError {
  /**
   *
   * @param message
   * @param context
   */
  constructor(message, context = {}) {
    super(message, 400, 'VALIDATION_ERROR', context);
  }
}

/** 401 Unauthorized — missing or invalid credentials. */
export class UnauthorizedError extends AppError {
  /**
   *
   * @param message
   * @param context
   */
  constructor(message = 'Authentication required', context = {}) {
    super(message, 401, 'UNAUTHORIZED', context);
  }
}

/** 403 Forbidden — authenticated but lacking permission. */
export class ForbiddenError extends AppError {
  /**
   *
   * @param message
   * @param context
   */
  constructor(message = 'Access denied', context = {}) {
    super(message, 403, 'FORBIDDEN', context);
  }
}

/** 404 Not Found — requested resource does not exist. */
export class NotFoundError extends AppError {
  /**
   *
   * @param message
   * @param context
   */
  constructor(message = 'Resource not found', context = {}) {
    super(message, 404, 'NOT_FOUND', context);
  }
}

/** 409 Conflict — resource already exists or state conflict. */
export class ConflictError extends AppError {
  /**
   *
   * @param message
   * @param context
   */
  constructor(message, context = {}) {
    super(message, 409, 'CONFLICT', context);
  }
}

/** 422 Unprocessable Entity — semantically invalid request. */
export class UnprocessableError extends AppError {
  /**
   *
   * @param message
   * @param context
   */
  constructor(message, context = {}) {
    super(message, 422, 'UNPROCESSABLE', context);
  }
}

/** 429 Too Many Requests — rate limit exceeded. */
export class RateLimitError extends AppError {
  /**
   *
   * @param message
   * @param context
   */
  constructor(message = 'Too many requests', context = {}) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED', context);
  }
}

/** 500 Internal Server Error — unexpected programming bugs. */
export class InternalError extends AppError {
  /**
   *
   * @param message
   * @param context
   */
  constructor(message = 'Internal server error', context = {}) {
    // isOperational = false → global handler will treat as critical bug
    super(message, 500, 'INTERNAL_ERROR', context, false);
  }
}

/** 502 Bad Gateway — upstream service (DB, OAuth, email) failure. */
export class ExternalServiceError extends AppError {
  /**
   *
   * @param message
   * @param serviceName
   * @param context
   */
  constructor(message, serviceName, context = {}) {
    super(message, 502, 'EXTERNAL_SERVICE_ERROR', { ...context, serviceName });
  }
}

/** 503 Service Unavailable — server is intentionally offline / overloaded. */
export class ServiceUnavailableError extends AppError {
  /**
   *
   * @param message
   * @param context
   */
  constructor(message = 'Service temporarily unavailable', context = {}) {
    super(message, 503, 'SERVICE_UNAVAILABLE', context);
  }
}
