/**
 * @file Integration tests for the guest checkout controller endpoints.
 *
 * Tests endpoints in `routes/auth.js` that delegate to `controllers/guestController.js`:
 *   POST /api/auth/guest/verify/initiate
 *   POST /api/auth/guest/verify/confirm
 *   POST /api/auth/guest/verify/resend
 * @module tests/routes/guestController.routes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../config/database.js', () => ({
  query: vi.fn(),
  default: {},
}));

vi.mock('../../services/verificationService.js', () => ({
  verificationService: {
    createVerificationCode: vi.fn().mockResolvedValue('123456'),
    verifyCode: vi.fn().mockResolvedValue({ isValid: true, message: 'ok' }),
  },
}));

vi.mock('../../services/emailService.js', () => ({
  emailService: {
    sendVerificationEmail: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('../../utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { verificationService } from '../../services/verificationService.js';
import { emailService } from '../../services/emailService.js';
import authRouter from '../../routes/auth.js';
import { makeApp } from '../helpers/makeApp.js';

const app = makeApp({ '/api/auth': authRouter });

beforeEach(() => vi.clearAllMocks());

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/guest/verify/initiate
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/auth/guest/verify/initiate', () => {
  it('200 — sends verification code to valid email', async () => {
    const res = await request(app)
      .post('/api/auth/guest/verify/initiate')
      .send({ email: 'guest@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(verificationService.createVerificationCode).toHaveBeenCalledWith(
      'guest@example.com',
      'guest_checkout',
    );
    expect(emailService.sendVerificationEmail).toHaveBeenCalled();
  });

  it('400 — missing email', async () => {
    const res = await request(app)
      .post('/api/auth/guest/verify/initiate')
      .send({});

    expect(res.status).toBe(400);
  });

  it('400 — invalid email format', async () => {
    const res = await request(app)
      .post('/api/auth/guest/verify/initiate')
      .send({ email: 'not-an-email' });

    expect(res.status).toBe(400);
  });

  it('normalizes email (trims whitespace, lowercases)', async () => {
    const res = await request(app)
      .post('/api/auth/guest/verify/initiate')
      .send({ email: '  GUEST@Example.COM  ' });

    expect(res.status).toBe(200);
    expect(verificationService.createVerificationCode).toHaveBeenCalledWith(
      'guest@example.com',
      'guest_checkout',
    );
  });

  it('500 — propagates error when email service throws', async () => {
    emailService.sendVerificationEmail.mockRejectedValueOnce(new Error('smtp fail'));

    const res = await request(app)
      .post('/api/auth/guest/verify/initiate')
      .send({ email: 'guest@example.com' });

    expect(res.status).toBe(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/guest/verify/confirm
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/auth/guest/verify/confirm', () => {
  it('200 — returns guest JWT on valid code', async () => {
    verificationService.verifyCode.mockResolvedValue({ isValid: true, message: 'ok' });

    const res = await request(app)
      .post('/api/auth/guest/verify/confirm')
      .send({ email: 'guest@example.com', code: '123456' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.token).toBe('string');
  });

  it('400 — missing email', async () => {
    const res = await request(app)
      .post('/api/auth/guest/verify/confirm')
      .send({ code: '123456' });

    expect(res.status).toBe(400);
  });

  it('400 — missing code', async () => {
    const res = await request(app)
      .post('/api/auth/guest/verify/confirm')
      .send({ email: 'guest@example.com' });

    expect(res.status).toBe(400);
  });

  it('400 — invalid code (isValid false)', async () => {
    verificationService.verifyCode.mockResolvedValue({ isValid: false, message: 'Code expired' });

    const res = await request(app)
      .post('/api/auth/guest/verify/confirm')
      .send({ email: 'guest@example.com', code: '000000' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_CODE');
  });

  it('500 — propagates unexpected error', async () => {
    verificationService.verifyCode.mockRejectedValueOnce(new Error('service crash'));

    const res = await request(app)
      .post('/api/auth/guest/verify/confirm')
      .send({ email: 'guest@example.com', code: '123456' });

    expect(res.status).toBe(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/guest/verify/resend
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/auth/guest/verify/resend', () => {
  it('200 — resends verification code', async () => {
    const res = await request(app)
      .post('/api/auth/guest/verify/resend')
      .send({ email: 'guest@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(verificationService.createVerificationCode).toHaveBeenCalledWith(
      'guest@example.com',
      'guest_checkout',
    );
  });

  it('400 — missing email', async () => {
    const res = await request(app)
      .post('/api/auth/guest/verify/resend')
      .send({});

    expect(res.status).toBe(400);
  });

  it('500 — propagates error when service throws', async () => {
    verificationService.createVerificationCode.mockRejectedValueOnce(new Error('fail'));

    const res = await request(app)
      .post('/api/auth/guest/verify/resend')
      .send({ email: 'guest@example.com' });

    expect(res.status).toBe(500);
  });
});
