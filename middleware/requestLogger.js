/**
 * @file HTTP request/response logging middleware for MuzaLife.
 *
 * Attaches a unique `X-Request-ID` header to every request, stores it on
 * `req.requestId`, and logs each request/response pair with timing information.
 *
 * The request ID travels with the request through all layers (controllers,
 * services, DB queries) so that all log entries for a single HTTP call share
 * the same identifier — making log analysis and tracing trivial.
 *
 * **Context added to req:**
 * - `req.requestId`  — UUID v4 unique per request
 * - `req.startTime`  — high-resolution start timestamp (Date.now())
 * @module middleware/requestLogger
 */

import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';

/**
 * Middleware that assigns a unique request ID and logs HTTP events.
 * @param {object}   req  - Express request.
 * @param {object}   res  - Express response.
 * @param {Function} next - Next middleware.
 */
export const requestLogger = (req, res, next) => {
  // Honour forwarded request ID (e.g. from API gateway / load balancer)
  req.requestId = req.headers['x-request-id'] || uuidv4();
  req.startTime = Date.now();

  // Propagate the ID back to the client so they can quote it in bug reports
  res.setHeader('X-Request-ID', req.requestId);

  // Build log context shared by both request and response entries
  const baseContext = {
    module: 'http',
    requestId: req.requestId,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip || req.socket?.remoteAddress,
    userAgent: req.headers['user-agent'],
  };

  logger.http('Incoming request', baseContext);

  // Hook into response finish to log the outcome
  res.on('finish', () => {
    const duration = Date.now() - req.startTime;
    const level = res.statusCode >= 500 ? 'error'
      : res.statusCode >= 400 ? 'warn'
        : 'http';

    logger[level]('Request completed', {
      ...baseContext,
      statusCode: res.statusCode,
      durationMs: duration,
      userId: req.userId ?? null,
    });
  });

  next();
};
