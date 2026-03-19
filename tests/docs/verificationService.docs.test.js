/**
 * @file Living documentation for the verification OTP lifecycle.
 *
 * These tests document the **business rules** of the email-verification flow:
 *  - OTP generation format and length
 *  - How codes are invalidated after use or expiry
 *  - The "pending verification" guard that prevents duplicate registrations
 *
 * Because `verificationService` depends on the database, all DB calls are
 * stubbed via `vi.mock` so this file runs in pure unit-test mode with zero
 * external dependencies.
 * @module tests/docs/verificationService.docs
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock the named `query` export — what verificationService.js actually uses ─
vi.mock('../../config/database.js', () => ({
  query: vi.fn(),
  default: {},           // pool default export (not used by the service)
}));

import { query } from '../../config/database.js';
import { verificationService } from '../../services/verificationService.js';

beforeEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// generateVerificationCode — pure helper, no DB
// ─────────────────────────────────────────────────────────────────────────────
describe('generateVerificationCode()', () => {
  it('returns a string of exactly 6 characters', () => {
    const code = verificationService.generateVerificationCode();
    expect(typeof code).toBe('string');
    expect(code).toHaveLength(6);
  });

  it('contains only digit characters (0-9)', () => {
    for (let i = 0; i < 20; i++) {
      const code = verificationService.generateVerificationCode();
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it('is non-deterministic — two successive calls return different codes (with high probability)', () => {
    const results = new Set(
      Array.from({ length: 50 }, () => verificationService.generateVerificationCode())
    );
    // With 10^6 possibilities, 50 calls should yield >1 unique value
    expect(results.size).toBeGreaterThan(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createVerificationCode — DB write
// ─────────────────────────────────────────────────────────────────────────────
describe('createVerificationCode(email, verification_type)', () => {
  it('invalidates any existing code for the email before inserting a new one', async () => {
    query.mockResolvedValue({ rows: [] });

    await verificationService.createVerificationCode('user@example.com', 'registration');

    // First DB call should UPDATE existing codes to is_used = true
    const firstCall = query.mock.calls[0][0];
    expect(firstCall).toMatch(/UPDATE/i);
    expect(firstCall).toMatch(/is_used/i);
  });

  it('inserts a new verification record for the given email', async () => {
    query.mockResolvedValue({ rows: [] });

    await verificationService.createVerificationCode('user@example.com', 'registration');

    const insertCall = query.mock.calls.find(([sql]) => /INSERT/i.test(sql));
    expect(insertCall).toBeDefined();
  });

  it('returns the generated code so the caller can email it to the user', async () => {
    query.mockResolvedValue({ rows: [] });

    const result = await verificationService.createVerificationCode('x@x.com', 'registration');

    expect(typeof result).toBe('string');
    expect(result).toMatch(/^\d{6}$/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// verifyCode — DB read + write
// ─────────────────────────────────────────────────────────────────────────────
describe('verifyCode(email, code)', () => {
  it('returns a valid result when the OTP matches and has not expired', async () => {
    const fakeRow = {
      id: 1,
      email: 'user@example.com',
      name: 'Alice',
      password: 'hashed',
      is_used: false,
    };
    query
      .mockResolvedValueOnce({ rows: [fakeRow] })  // SELECT
      .mockResolvedValueOnce({ rows: [] });          // UPDATE is_used

    const result = await verificationService.verifyCode('user@example.com', '123456');

    expect(result).toMatchObject({ isValid: true });
  });

  it('returns an invalid result when no matching, non-expired OTP is found', async () => {
    query.mockResolvedValueOnce({ rows: [] }); // no matching row

    const result = await verificationService.verifyCode('user@example.com', '000000');

    expect(result).toMatchObject({ isValid: false });
  });

  it('marks the code as used after a successful verification (prevents replay attacks)', async () => {
    const fakeRow = { id: 1, email: 'e@e.com', name: 'X', password: 'pw', is_used: false };
    query
      .mockResolvedValueOnce({ rows: [fakeRow] })
      .mockResolvedValueOnce({ rows: [] });

    await verificationService.verifyCode('e@e.com', '654321');

    const updateCall = query.mock.calls.find(([sql]) =>
      /UPDATE/i.test(sql) && /is_used/i.test(sql)
    );
    expect(updateCall).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// hasPendingVerification — DB read
// ─────────────────────────────────────────────────────────────────────────────
describe('hasPendingVerification(email)', () => {
  it('returns true when an unexpired, unused code exists for the email', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

    const result = await verificationService.hasPendingVerification('user@example.com');

    expect(result).toBe(true);
  });

  it('returns false when no pending verification exists', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const result = await verificationService.hasPendingVerification('nobody@example.com');

    expect(result).toBe(false);
  });
});
