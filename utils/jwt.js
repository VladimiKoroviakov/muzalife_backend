/**
 * @file JWT utility helpers for token generation and verification.
 *
 * All token operations are centralised here so that the secret key and
 * expiry configuration are managed in a single place.  Any change to the
 * signing algorithm or expiry policy only needs to happen in this file.
 *
 * **Business logic:** tokens are signed with an HS256 HMAC using the
 * application secret stored in `JWT_SECRET`.  The payload contains only the
 * numeric `userId` to keep tokens small; all other user attributes are fetched
 * from the database on each authenticated request.
 * @module utils/jwt
 */

import jwt from 'jsonwebtoken';

/** @type {string} Secret key used to sign and verify JWT tokens. */
const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Default token expiry duration.
 * Can be overridden via the `JWT_EXPIRES_IN` environment variable.
 * Accepts any value accepted by the `jsonwebtoken` `expiresIn` option
 * (e.g. `'7d'`, `'2h'`, `3600`).
 * @type {string|number}
 */
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Signs a new JWT that encodes a `userId` claim.
 * @param {number} userId - The numeric primary key of the authenticated user.
 * @returns {string} A signed JWT string ready to be returned to the client.
 * @example
 * import { generateToken } from './utils/jwt.js';
 *
 * const token = generateToken(user.user_id);
 * res.json({ token });
 */
export const generateToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

/**
 * Signs a short-lived guest JWT that encodes an email address instead of a
 * numeric user ID.  Used by the guest checkout flow so the frontend can call
 * payment-initiation endpoints without registering an account.
 * @param {string} email - The verified guest email address.
 * @returns {string} A signed JWT valid for 30 minutes.
 * @example
 * import { generateGuestToken } from './utils/jwt.js';
 *
 * const token = generateGuestToken('guest@example.com');
 * res.json({ token });
 */
export const generateGuestToken = (email) => {
  return jwt.sign({ guestEmail: email, isGuest: true }, JWT_SECRET, { expiresIn: '30m' });
};

/**
 * Verifies a JWT and returns its decoded payload.
 * @param {string} token - The JWT string to verify (typically extracted from
 *   the `Authorization: Bearer <token>` header).
 * @returns {{ userId: number, iat: number, exp: number }} The decoded JWT
 *   payload containing at minimum the `userId` claim.
 * @throws JsonWebTokenError If the token signature is
 *   invalid.
 * @throws TokenExpiredError If the token has expired.
 * @example
 * import { verifyToken } from './utils/jwt.js';
 *
 * try {
 *   const decoded = verifyToken(token);
 *   console.log(decoded.userId); // 42
 * } catch (err) {
 *   res.status(403).json({ error: 'Invalid or expired token' });
 * }
 */
export const verifyToken = (token) => {
  return jwt.verify(token, JWT_SECRET);
};
