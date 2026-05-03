/**
 * @file Route-level integration tests for /api/auth
 *
 * QA Test Cases:
 *   TC_3.1.1 — Email + password registration (positive, missing fields, existing email)
 *   TC_3.1.4 — Existing email during registration initiation → 400 USER_EXISTS
 *   TC_3.1.5 — Email login (positive, wrong password, missing credentials)
 *   TC_3.1.2 / TC_3.1.6 — Google OAuth (positive, missing token)
 *   TC_3.1.3 / TC_3.1.7 — Facebook OAuth (positive, missing token)
 *   TC_3.10.4 — Wrong OTP during register/verify → 400 INVALID_VERIFICATION_CODE
 *
 * Requirement: R1.12 — Registration with Google/Facebook/email; personal account created.
 * @module tests/routes/auth.routes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../config/database.js', () => ({
  query: vi.fn(),
  default: {},
}));

vi.mock('../../services/verificationService.js', () => ({
  verificationService: {
    createVerificationCode: vi.fn(),
    verifyCode: vi.fn(),
    hasPendingVerification: vi.fn(),
    deletePendingVerification: vi.fn(),
  },
}));

vi.mock('../../services/emailService.js', () => ({
  emailService: {
    sendVerificationEmail: vi.fn(),
    sendWelcomeEmail: vi.fn(),
    sendPasswordResetEmail: vi.fn(),
  },
}));

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn(() => Promise.resolve('$2b$12$hashedpassword')),
    compare: vi.fn(),
    genSalt: vi.fn(() => Promise.resolve('$2b$12$salt')),
  },
}));

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('../../utils/logger.js', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { query } from '../../config/database.js';
import { verificationService } from '../../services/verificationService.js';
import { emailService } from '../../services/emailService.js';
import bcrypt from 'bcryptjs';
import axios from 'axios';
import authRouter from '../../routes/auth.js';
import { makeApp } from '../helpers/makeApp.js';

const app = makeApp({ '/api/auth': authRouter });

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/register/initiate — TC_3.1.1, TC_3.1.4
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/auth/register/initiate — two-step registration step 1', () => {
  beforeEach(() => vi.clearAllMocks());

  it('TC_3.1.1 (positive): returns 200 and sends OTP when all fields are valid and email is new', async () => {
    query.mockResolvedValueOnce({ rows: [] }); // no existing user
    verificationService.hasPendingVerification.mockResolvedValueOnce(false);
    verificationService.createVerificationCode.mockResolvedValueOnce('123456');
    emailService.sendVerificationEmail.mockResolvedValueOnce(undefined);

    const res = await request(app)
      .post('/api/auth/register/initiate')
      .send({ email: 'new@example.com', password: 'SecurePass1!', name: 'Test User' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.email).toBe('new@example.com');
  });

  it('TC_3.1.1 (negative): returns 400 when email is missing', async () => {
    const res = await request(app)
      .post('/api/auth/register/initiate')
      .send({ password: 'SecurePass1!', name: 'Test User' });

    expect(res.status).toBe(400);
  });

  it('TC_3.1.1 (negative): returns 400 when password is missing', async () => {
    const res = await request(app)
      .post('/api/auth/register/initiate')
      .send({ email: 'new@example.com', name: 'Test User' });

    expect(res.status).toBe(400);
  });

  it('TC_3.1.1 (negative): returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/auth/register/initiate')
      .send({ email: 'new@example.com', password: 'SecurePass1!' });

    expect(res.status).toBe(400);
  });

  it('TC_3.1.4: returns 400 with USER_EXISTS code when email already registered', async () => {
    query.mockResolvedValueOnce({ rows: [{ user_id: 7 }] }); // user exists

    const res = await request(app)
      .post('/api/auth/register/initiate')
      .send({ email: 'existing@example.com', password: 'pass', name: 'User' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('USER_EXISTS');
  });

  it('returns 400 with PENDING_VERIFICATION when a code was already sent to this email', async () => {
    query.mockResolvedValueOnce({ rows: [] }); // no existing user
    verificationService.hasPendingVerification.mockResolvedValueOnce(true);

    const res = await request(app)
      .post('/api/auth/register/initiate')
      .send({ email: 'pending@example.com', password: 'pass', name: 'User' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PENDING_VERIFICATION');
  });

  it('returns 500 when email delivery fails (cleans up verification code)', async () => {
    query
      .mockResolvedValueOnce({ rows: [] }) // no existing user
      .mockResolvedValueOnce({ rows: [] }); // DELETE cleanup query
    verificationService.hasPendingVerification.mockResolvedValueOnce(false);
    verificationService.createVerificationCode.mockResolvedValueOnce('654321');
    emailService.sendVerificationEmail.mockRejectedValueOnce(new Error('SMTP error'));

    const res = await request(app)
      .post('/api/auth/register/initiate')
      .send({ email: 'fail@example.com', password: 'pass', name: 'User' });

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('EMAIL_SEND_FAILED');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/register/verify — TC_3.10.4
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/auth/register/verify — two-step registration step 2', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 when any required field is missing', async () => {
    const res = await request(app)
      .post('/api/auth/register/verify')
      .send({ email: 'u@example.com', password: 'pass', name: 'User' }); // missing verificationCode

    expect(res.status).toBe(400);
  });

  it('TC_3.10.4: returns 400 with INVALID_VERIFICATION_CODE when OTP is wrong', async () => {
    verificationService.verifyCode.mockResolvedValueOnce({
      isValid: false,
      message: 'Невірний або прострочений код підтвердження',
    });

    const res = await request(app)
      .post('/api/auth/register/verify')
      .send({ email: 'u@example.com', password: 'pass', name: 'User', verificationCode: '000000' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_VERIFICATION_CODE');
  });

  it('returns 400 with USER_EXISTS when email was registered between initiate and verify', async () => {
    verificationService.verifyCode.mockResolvedValueOnce({ isValid: true });
    query.mockResolvedValueOnce({ rows: [{ user_id: 5 }] }); // email already taken

    const res = await request(app)
      .post('/api/auth/register/verify')
      .send({ email: 'race@example.com', password: 'pass', name: 'User', verificationCode: '123456' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('USER_EXISTS');
  });

  it('returns 201 with user object and token on successful registration', async () => {
    verificationService.verifyCode.mockResolvedValueOnce({ isValid: true });
    query
      .mockResolvedValueOnce({ rows: [] }) // no duplicate
      .mockResolvedValueOnce({             // INSERT user
        rows: [{
          user_id: 99,
          user_email: 'new@example.com',
          user_name: 'New User',
          user_created_at: new Date().toISOString(),
        }],
      })
      .mockResolvedValueOnce({ rows: [] }); // DELETE code
    bcrypt.hash.mockResolvedValueOnce('$2b$12$hashed');

    const res = await request(app)
      .post('/api/auth/register/verify')
      .send({ email: 'new@example.com', password: 'SecurePass1!', name: 'New User', verificationCode: '123456' });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ id: 99, email: 'new@example.com' });
    expect(typeof res.body.token).toBe('string');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/login — TC_3.1.5
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/auth/login — email/password login', () => {
  beforeEach(() => vi.clearAllMocks());

  it('TC_3.1.5 (positive): returns 200 with user and token on valid credentials', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        user_id: 42,
        user_email: 'user@example.com',
        user_name: 'Test User',
        user_password: '$2b$12$hashed',
        user_auth_provider: 'email',
        user_created_at: new Date().toISOString(),
        is_admin: false,
      }],
    });
    bcrypt.compare.mockResolvedValueOnce(true);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'CorrectPass1!' });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: 42, email: 'user@example.com' });
    expect(typeof res.body.token).toBe('string');
  });

  it('TC_3.1.5 (negative): returns 400 when email is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'pass' });

    expect(res.status).toBe(400);
  });

  it('TC_3.1.5 (negative): returns 400 when password is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com' });

    expect(res.status).toBe(400);
  });

  it('TC_3.1.5 (negative): returns 400 when the email is not found', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@example.com', password: 'pass' });

    expect(res.status).toBe(400);
  });

  it('TC_3.1.5 (negative): returns 400 when the password is wrong', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        user_id: 1,
        user_email: 'user@example.com',
        user_password: '$2b$12$hashed',
        is_admin: false,
      }],
    });
    bcrypt.compare.mockResolvedValueOnce(false);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'WrongPass!' });

    expect(res.status).toBe(400);
  });

  it('returns 403 when a non-admin user tries to log in via loginType=admin', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        user_id: 10,
        user_email: 'regular@example.com',
        user_password: '$2b$12$hashed',
        is_admin: false,
      }],
    });
    bcrypt.compare.mockResolvedValueOnce(true);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'regular@example.com', password: 'pass', loginType: 'admin' });

    expect(res.status).toBe(403);
  });

  it('returns 403 when an admin user tries to log in via loginType=regular', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        user_id: 1,
        user_email: 'admin@example.com',
        user_password: '$2b$12$hashed',
        is_admin: true,
      }],
    });
    bcrypt.compare.mockResolvedValueOnce(true);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'pass', loginType: 'regular' });

    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/google — TC_3.1.2, TC_3.1.6
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/auth/google — Google OAuth', () => {
  beforeEach(() => vi.clearAllMocks());

  it('TC_3.1.2 (positive): returns 200 with user and token for an existing Google user', async () => {
    axios.get.mockResolvedValueOnce({
      data: {
        sub: 'google-uid-123',
        email: 'google@example.com',
        name: 'Google User',
        picture: 'https://example.com/avatar.jpg',
      },
    });
    query.mockResolvedValueOnce({
      rows: [{
        user_id: 55,
        user_email: 'google@example.com',
        user_name: 'Google User',
        user_google_id: 'google-uid-123',
        user_auth_provider: 'google',
        user_avatar_url: null,
        user_created_at: new Date().toISOString(),
      }],
    });

    const res = await request(app)
      .post('/api/auth/google')
      .send({ accessToken: 'valid-google-token' });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: 55, email: 'google@example.com' });
    expect(typeof res.body.token).toBe('string');
  });

  it('TC_3.1.6 (positive): creates a new user when Google email is not yet registered', async () => {
    axios.get.mockResolvedValueOnce({
      data: {
        sub: 'google-uid-new',
        email: 'newgoogle@example.com',
        name: 'New Google',
        picture: null,
      },
    });
    query
      .mockResolvedValueOnce({ rows: [] }) // no existing user
      .mockResolvedValueOnce({             // INSERT
        rows: [{
          user_id: 66,
          user_email: 'newgoogle@example.com',
          user_name: 'New Google',
          user_avatar_url: null,
          user_auth_provider: 'google',
          user_created_at: new Date().toISOString(),
        }],
      });

    const res = await request(app)
      .post('/api/auth/google')
      .send({ accessToken: 'fresh-google-token' });

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(66);
  });

  it('returns 400 when accessToken is missing', async () => {
    const res = await request(app)
      .post('/api/auth/google')
      .send({});

    expect(res.status).toBe(400);
  });

  it('returns 401 when Google rejects the token (401 from Google API)', async () => {
    const err = new Error('Unauthorized');
    err.response = { status: 401 };
    axios.get.mockRejectedValueOnce(err);

    const res = await request(app)
      .post('/api/auth/google')
      .send({ accessToken: 'bad-token' });

    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/facebook — TC_3.1.3, TC_3.1.7
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/auth/facebook — Facebook OAuth', () => {
  // vi.resetAllMocks() (not just clearAllMocks) is needed here because
  // vi.clearAllMocks() does NOT drain the mockResolvedValueOnce queue.
  // If a test returns early (e.g. 401 from the app_id check) without
  // consuming all its queued mocks, those leftover mocks bleed into the
  // next test and produce wrong behaviour.
  beforeEach(() => vi.resetAllMocks());

  it('TC_3.1.3 (positive): returns 200 with user and token for an existing Facebook user', async () => {
    // First call: debug_token; second call: user data
    axios.get
      .mockResolvedValueOnce({
        data: {
          data: {
            is_valid: true,
            app_id: process.env.FACEBOOK_APP_ID ?? 'test-app-id',
            user_id: 'fb-uid-123',
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: 'fb-uid-123',
          name: 'FB User',
          email: 'fb@example.com',
          picture: { data: { url: 'https://example.com/fb.jpg' } },
        },
      });

    query.mockResolvedValueOnce({
      rows: [{
        user_id: 77,
        user_email: 'fb@example.com',
        user_name: 'FB User',
        user_facebook_id: 'fb-uid-123',
        user_auth_provider: 'facebook',
        user_avatar_url: null,
        user_created_at: new Date().toISOString(),
      }],
    });

    const res = await request(app)
      .post('/api/auth/facebook')
      .send({ accessToken: 'valid-fb-token' });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: 77, email: 'fb@example.com' });
    expect(typeof res.body.token).toBe('string');
  });

  it('TC_3.1.7 (positive): creates a new user when Facebook email is not yet registered', async () => {
    axios.get
      .mockResolvedValueOnce({
        data: {
          data: {
            is_valid: true,
            app_id: process.env.FACEBOOK_APP_ID ?? 'test-app-id',
            user_id: 'fb-uid-new',
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: 'fb-uid-new',
          name: 'New FB',
          email: 'newfb@example.com',
          picture: null,
        },
      });

    query
      .mockResolvedValueOnce({ rows: [] }) // no existing user
      .mockResolvedValueOnce({             // INSERT
        rows: [{
          user_id: 88,
          user_email: 'newfb@example.com',
          user_name: 'New FB',
          user_avatar_url: null,
          user_auth_provider: 'facebook',
          user_created_at: new Date().toISOString(),
        }],
      });

    const res = await request(app)
      .post('/api/auth/facebook')
      .send({ accessToken: 'fresh-fb-token' });

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(88);
  });

  it('returns 400 when accessToken is missing', async () => {
    const res = await request(app)
      .post('/api/auth/facebook')
      .send({});

    expect(res.status).toBe(400);
  });

  it('returns 401 when Facebook marks the debug_token as invalid', async () => {
    axios.get.mockResolvedValueOnce({
      data: {
        data: {
          is_valid: false,
          error: { message: 'Token has expired' },
          app_id: 'test-app-id',
          user_id: null,
        },
      },
    });

    const res = await request(app)
      .post('/api/auth/facebook')
      .send({ accessToken: 'expired-fb-token' });

    expect(res.status).toBe(401);
  });
});
