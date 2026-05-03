/**
 * @file Living documentation for {@link module:middleware/auth}.
 *
 * Specifies the three authentication middleware functions:
 *   - `authenticateToken`     — enforces a regular user JWT
 *   - `authenticateGuestToken`— enforces a guest JWT
 *   - `authenticateAnyToken`  — accepts either token type
 *
 * The JWT utility is stubbed via `vi.mock` so these tests run without needing
 * a real secret or a real token. Logger is silenced for the same reason.
 * @module tests/unit/auth.middleware.docs
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

vi.mock('../../utils/jwt.js', () => ({
  verifyToken: vi.fn(),
}));

import { verifyToken } from '../../utils/jwt.js';
import {
  authenticateToken,
  authenticateGuestToken,
  authenticateAnyToken,
} from '../../middleware/auth.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
/**
 *
 * @param authHeader
 */
function makeReq(authHeader = undefined) {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
    requestId: 'test-req-id',
    method: 'GET',
    originalUrl: '/api/test',
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

// ─────────────────────────────────────────────────────────────────────────────
// authenticateToken
// ─────────────────────────────────────────────────────────────────────────────
describe('authenticateToken — standard user JWT enforcement', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when the Authorization header is absent', () => {
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when the Authorization header has "Bearer" but no token value', () => {
    // 'Bearer'.split(' ')[1] === undefined → treated as missing token
    const req = makeReq('Bearer');
    const res = makeRes();
    const next = vi.fn();

    authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() and sets req.userId when the token is valid', () => {
    verifyToken.mockReturnValue({ userId: 7 });
    const req = makeReq('Bearer valid-token');
    const res = makeRes();
    const next = vi.fn();

    authenticateToken(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.userId).toBe(7);
  });

  it('sets req.userId to the value decoded from the token payload', () => {
    verifyToken.mockReturnValue({ userId: 99 });
    const req = makeReq('Bearer some-token');
    const res = makeRes();
    const next = vi.fn();

    authenticateToken(req, res, next);

    expect(req.userId).toBe(99);
  });

  it('returns 403 when verifyToken throws (invalid or expired token)', () => {
    verifyToken.mockImplementation(() => { throw new Error('jwt expired'); });
    const req = makeReq('Bearer expired-token');
    const res = makeRes();
    const next = vi.fn();

    authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('does not call next() when the token is missing', () => {
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    authenticateToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
  });

  it('does not call next() when the token is invalid', () => {
    verifyToken.mockImplementation(() => { throw new Error('invalid'); });
    const req = makeReq('Bearer bad');
    const res = makeRes();
    const next = vi.fn();

    authenticateToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// authenticateGuestToken
// ─────────────────────────────────────────────────────────────────────────────
describe('authenticateGuestToken — guest JWT enforcement', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no Authorization header is present', () => {
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    authenticateGuestToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when the decoded token is missing the isGuest flag', () => {
    verifyToken.mockReturnValue({ userId: 1 }); // regular user token, not guest
    const req = makeReq('Bearer user-token');
    const res = makeRes();
    const next = vi.fn();

    authenticateGuestToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when the decoded token has isGuest=true but no guestEmail', () => {
    verifyToken.mockReturnValue({ isGuest: true }); // missing guestEmail
    const req = makeReq('Bearer partial-guest-token');
    const res = makeRes();
    const next = vi.fn();

    authenticateGuestToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('sets req.guestEmail and calls next() for a valid guest token', () => {
    verifyToken.mockReturnValue({ isGuest: true, guestEmail: 'guest@example.com' });
    const req = makeReq('Bearer guest-token');
    const res = makeRes();
    const next = vi.fn();

    authenticateGuestToken(req, res, next);

    expect(req.guestEmail).toBe('guest@example.com');
    expect(next).toHaveBeenCalledOnce();
  });

  it('returns 403 when verifyToken throws', () => {
    verifyToken.mockImplementation(() => { throw new Error('expired'); });
    const req = makeReq('Bearer expired');
    const res = makeRes();
    const next = vi.fn();

    authenticateGuestToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// authenticateAnyToken
// ─────────────────────────────────────────────────────────────────────────────
describe('authenticateAnyToken — accepts user or guest JWT', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no Authorization header is present', () => {
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    authenticateAnyToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('sets req.userId and calls next() for a regular user token', () => {
    verifyToken.mockReturnValue({ userId: 42 });
    const req = makeReq('Bearer user-token');
    const res = makeRes();
    const next = vi.fn();

    authenticateAnyToken(req, res, next);

    expect(req.userId).toBe(42);
    expect(next).toHaveBeenCalledOnce();
  });

  it('sets req.guestEmail and calls next() for a guest token', () => {
    verifyToken.mockReturnValue({ isGuest: true, guestEmail: 'g@example.com' });
    const req = makeReq('Bearer guest-token');
    const res = makeRes();
    const next = vi.fn();

    authenticateAnyToken(req, res, next);

    expect(req.guestEmail).toBe('g@example.com');
    expect(next).toHaveBeenCalledOnce();
  });

  it('returns 403 when verifyToken throws', () => {
    verifyToken.mockImplementation(() => { throw new Error('bad token'); });
    const req = makeReq('Bearer bad');
    const res = makeRes();
    const next = vi.fn();

    authenticateAnyToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('never sets both req.userId and req.guestEmail simultaneously', () => {
    verifyToken.mockReturnValue({ userId: 5 });
    const req = makeReq('Bearer user-token');
    const res = makeRes();
    const next = vi.fn();

    authenticateAnyToken(req, res, next);

    expect(req.userId).toBe(5);
    expect(req.guestEmail).toBeUndefined();
  });
});
