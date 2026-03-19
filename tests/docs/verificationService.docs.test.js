/**
 * @fileoverview Living documentation for the verification OTP lifecycle.
 *
 * These tests document the **business rules** of the email-verification flow:
 *  - OTP generation format and length
 *  - How codes are invalidated after use or expiry
 *  - The "pending verification" guard that prevents duplicate registrations
 *
 * Because `verificationService` depends on the database, all DB calls are
 * stubbed via `vi.mock` so this file runs in pure unit-test mode with zero
 * external dependencies.
 *
 * @module tests/docs/verificationService.docs
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock the DB pool before importing the service ───────────────────────────
vi.mock('../../config/database.js', () => ({
  default: {
    query: vi.fn(),
  },
}));

import pool from '../../config/database.js';
import {
  generateVerificationCode,
  createVerificationCode,
  verifyCode,
  hasPendingVerification,
} from '../../services/verificationService.js';

beforeEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// generateVerificationCode — pure helper, no DB
// ─────────────────────────────────────────────────────────────────────────────
describe('generateVerificationCode()', () => {
  it('returns a string of exactly 6 characters', () => {
    const code = generateVerificationCode();
    expect(typeof code).toBe('string');
    expect(code).toHaveLength(6);
  });

  it('contains only digit characters (0-9)', () => {
    for (let i = 0; i < 20; i++) {
      const code = generateVerificationCode();
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it('is non-deterministic — two successive calls return different codes (with high probability)', () => {
    const results = new Set(Array.from({ length: 50 }, generateVerificationCode));
    // With 10^6 possibilities, 50 calls should yield >1 unique value
    expect(results.size).toBeGreaterThan(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createVerificationCode — DB write
// ─────────────────────────────────────────────────────────────────────────────
describe('createVerificationCode(email, name, password)', () => {
  it('invalidates any existing code for the email before inserting a new one', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    await createVerificationCode('user@example.com', 'Alice', 'hashed-pw');

    // First call should UPDATE existing codes to is_used=true
    const firstCall = pool.query.mock.calls[0][0];
    expect(firstCall).toMatch(/UPDATE/i);
    expect(firstCall).toMatch(/is_used/i);
  });

  it('inserts a new verification record for the given email', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    await createVerificationCode('user@example.com', 'Alice', 'hashed-pw');

    const insertCall = pool.query.mock.calls.find(([sql]) =>
      /INSERT/i.test(sql)
    );
    expect(insertCall).toBeDefined();
  });

  it('returns the generated code so the caller can email it to the user', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    const result = await createVerificationCode('x@x.com', 'Bob', 'pw');

    expect(typeof result).toBe('string');
    expect(result).toMatch(/^\d{6}$/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// verifyCode — DB read + write
// ─────────────────────────────────────────────────────────────────────────────
describe('verifyCode(email, code)', () => {
  it('returns the verification row when the OTP matches and has not expired', async () => {
    const fakeRow = {
      id: 1,
      email: 'user@example.com',
      name: 'Alice',
      password: 'hashed',
      is_used: false,
    };
    // First query returns a matching row
    pool.query
      .mockResolvedValueOnce({ rows: [fakeRow] })  // SELECT
      .mockResolvedValueOnce({ rows: [] });          // UPDATE is_used

    const result = await verifyCode('user@example.com', '123456');

    expect(result).toMatchObject({ email: 'user@example.com' });
  });

  it('returns null when no valid (unused, non-expired) OTP is found', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] }); // no matching row

    const result = await verifyCode('user@example.com', '000000');

    expect(result).toBeNull();
  });

  it('marks the code as used after a successful verification (prevents replay attacks)', async () => {
    const fakeRow = { id: 1, email: 'e@e.com', name: 'X', password: 'pw', is_used: false };
    pool.query
      .mockResolvedValueOnce({ rows: [fakeRow] })
      .mockResolvedValueOnce({ rows: [] });

    await verifyCode('e@e.com', '654321');

    const updateCall = pool.query.mock.calls.find(([sql]) =>
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
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

    const result = await hasPendingVerification('user@example.com');

    expect(result).toBe(true);
  });

  it('returns false when no pending verification exists', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const result = await hasPendingVerification('nobody@example.com');

    expect(result).toBe(false);
  });
});
