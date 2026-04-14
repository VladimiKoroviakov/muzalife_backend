/**
 * @file Authentication middleware for the MuzaLife Express application.
 *
 * Provides Express middleware that validates JSON Web Tokens supplied in the
 * `Authorization: Bearer <token>` header.  Verified tokens result in
 * `req.userId` being set so that downstream route handlers can identify the
 * caller without re-querying the database.
 *
 * **Interaction with other components:** this middleware depends on
 * {@link module:utils/jwt} for token verification and is mounted on every
 * protected route via `router.use(authenticateToken)` or applied
 * per-endpoint.
 * @module middleware/auth
 */

import { verifyToken as jwtVerifyToken } from '../utils/jwt.js';
import logger from '../utils/logger.js';

/**
 * Express middleware that enforces guest JWT authentication.
 *
 * Expects a short-lived guest token (issued by `generateGuestToken`) in the
 * `Authorization: Bearer <token>` header.  On success `req.guestEmail` is set.
 * @type {Function}
 * @param {object} req  - Express request. `req.guestEmail` is set on success.
 * @param {object} res  - Express response.
 * @param {Function} next - Next middleware.
 * @returns {void}
 */
export const authenticateGuestToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwtVerifyToken(token);
    if (!decoded.isGuest || !decoded.guestEmail) {
      return res.status(403).json({ error: 'Invalid guest token' });
    }
    req.guestEmail = decoded.guestEmail;
    next();
  } catch {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

/**
 * Express middleware that accepts either a regular user JWT or a guest JWT.
 *
 * Sets `req.userId` for regular users or `req.guestEmail` for guests.
 * Used by payment endpoints that must serve both authenticated users and
 * verified guest shoppers.
 * @type {Function}
 * @param {object} req  - Express request.
 * @param {object} res  - Express response.
 * @param {Function} next - Next middleware.
 * @returns {void}
 */
export const authenticateAnyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    logger.warn('Authentication failed: no token provided', {
      module: 'middleware/auth',
      requestId: req.requestId,
      method: req.method,
      url: req.originalUrl,
    });
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwtVerifyToken(token);
    if (decoded.isGuest && decoded.guestEmail) {
      req.guestEmail = decoded.guestEmail;
    } else {
      req.userId = decoded.userId;
    }
    next();
  } catch (err) {
    logger.warn('Authentication failed: invalid or expired token', {
      module: 'middleware/auth',
      requestId: req.requestId,
      reason: err.message,
    });
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

/**
 * Express middleware that enforces JWT authentication.
 *
 * Reads the `Authorization` header, extracts the bearer token, and verifies
 * it using the application's JWT secret.  On success the decoded `userId` is
 * attached to `req` and `next()` is called.  On failure an appropriate HTTP
 * error response is returned immediately.
 *
 * **Business logic:** all stateful user actions (bookmarks, orders, reviews,
 * profile updates, …) require authentication.  Public endpoints such as
 * browsing products or reading FAQs do not use this middleware.
 * @type {Function}
 * @param {object} req  - The incoming Express request.
 *   After successful verification `req.userId` is set to the numeric user ID.
 * @param {object} res  - The Express response used to
 *   return 401 / 403 error payloads.
 * @param {object} next - Called to pass control to
 *   the next middleware when authentication succeeds.
 * @returns {void}
 * @example
 * // Apply to a single route
 * router.get('/profile', authenticateToken, (req, res) => {
 *   res.json({ userId: req.userId });
 * });
 * @example
 * // Apply to all routes in a router
 * router.use(authenticateToken);
 */
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    logger.warn('Authentication failed: no token provided', {
      module: 'middleware/auth',
      requestId: req.requestId,
      method: req.method,
      url: req.originalUrl,
    });
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwtVerifyToken(token);
    req.userId = decoded.userId;
    logger.debug('Token verified successfully', {
      module: 'middleware/auth',
      requestId: req.requestId,
      userId: decoded.userId,
    });
    next();
  } catch (err) {
    logger.warn('Authentication failed: invalid or expired token', {
      module: 'middleware/auth',
      requestId: req.requestId,
      method: req.method,
      url: req.originalUrl,
      reason: err.message,
    });
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

export { jwtVerifyToken as verifyToken };
