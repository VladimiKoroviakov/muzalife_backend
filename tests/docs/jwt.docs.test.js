/**
 * @file Living documentation for {@link module:utils/jwt}.
 *
 * These tests act as **executable documentation**: each `it()` block is a
 * human-readable specification of how the JWT utilities behave.  Reading the
 * test file top-to-bottom gives the same information as the JSDoc comments,
 * but with the guarantee that the examples are always in sync with the actual
 * implementation (tests would fail if they drifted).
 *
 * Run with:
 *   npm run test:docs
 * @module tests/docs/jwt.docs
 */

// JWT_SECRET / JWT_EXPIRES_IN are injected by vitest.config.js `env` before
// any module is loaded, so jwt.js captures the correct value at init time.
import { describe, it, expect } from 'vitest';
import { generateToken, verifyToken } from '../../utils/jwt.js';

// ─────────────────────────────────────────────────────────────────────────────
// generateToken
// ─────────────────────────────────────────────────────────────────────────────
describe('generateToken(userId)', () => {
  it('returns a non-empty JWT string for a valid userId', () => {
    const token = generateToken(42);

    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
  });

  it('produces a three-part dot-separated JWT (header.payload.signature)', () => {
    const token = generateToken(1);
    const parts = token.split('.');

    expect(parts).toHaveLength(3);
  });

  it('encodes the userId inside the token payload', () => {
    const userId = 99;
    const token = generateToken(userId);

    // Decode payload without verifying signature (base64url)
    const payloadBase64 = token.split('.')[1];
    const payload = JSON.parse(
      Buffer.from(payloadBase64, 'base64url').toString('utf8')
    );

    expect(payload.userId).toBe(userId);
  });

  it('generates different tokens for different userIds', () => {
    const tokenA = generateToken(1);
    const tokenB = generateToken(2);

    expect(tokenA).not.toBe(tokenB);
  });

  it('generates different tokens on successive calls for the same userId (different iat)', async () => {
    const token1 = generateToken(5);
    await new Promise((r) => setTimeout(r, 1100)); // wait >1 s so iat differs
    const token2 = generateToken(5);

    expect(token1).not.toBe(token2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// verifyToken
// ─────────────────────────────────────────────────────────────────────────────
describe('verifyToken(token)', () => {
  it('returns the decoded payload for a freshly generated token', () => {
    const userId = 7;
    const token = generateToken(userId);
    const decoded = verifyToken(token);

    expect(decoded).toMatchObject({ userId });
  });

  it('payload contains standard JWT claims: iat and exp', () => {
    const token = generateToken(3);
    const decoded = verifyToken(token);

    expect(decoded).toHaveProperty('iat');
    expect(decoded).toHaveProperty('exp');
    expect(decoded.exp).toBeGreaterThan(decoded.iat);
  });

  it('throws JsonWebTokenError for a tampered token', () => {
    const token = generateToken(1);
    const tampered = `${token.slice(0, -5)  }XXXXX`; // corrupt the signature

    expect(() => verifyToken(tampered)).toThrow();
  });

  it('throws JsonWebTokenError for a token signed with a different secret', async () => {
    const { default: jwt } = await import('jsonwebtoken');
    const foreign = jwt.sign({ userId: 1 }, 'wrong-secret');
    expect(() => verifyToken(foreign)).toThrow();
  });

  it('round-trips: generate then verify returns the original userId', () => {
    const original = 123;
    const token = generateToken(original);
    const { userId } = verifyToken(token);

    expect(userId).toBe(original);
  });
});
