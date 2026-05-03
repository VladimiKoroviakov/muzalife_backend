/**
 * @file JWT test-token factories.
 *
 * Generates signed tokens using the same secret injected by vitest.config.js
 * (`JWT_SECRET = 'test-secret-for-living-docs'`) so the real `verifyToken`
 * utility accepts them in route integration tests.
 * @module tests/helpers/makeToken
 */

import jwt from 'jsonwebtoken';

const TEST_SECRET = 'test-secret-for-living-docs';

/**
 * Returns a signed user JWT for the given userId.
 * @param {number} [userId]
 * @returns {string}
 */
export function makeUserToken(userId = 42) {
  return jwt.sign({ userId }, TEST_SECRET, { expiresIn: '1h' });
}

/**
 * Returns a signed guest JWT for the given email.
 * @param {string} [email]
 * @returns {string}
 */
export function makeGuestToken(email = 'guest@example.com') {
  return jwt.sign({ guestEmail: email, isGuest: true }, TEST_SECRET, { expiresIn: '30m' });
}

/**
 * Returns a token signed with a wrong secret — `verifyToken` will reject it.
 * @returns {string}
 */
export function makeInvalidToken() {
  return jwt.sign({ userId: 1 }, 'wrong-secret', { expiresIn: '1h' });
}
