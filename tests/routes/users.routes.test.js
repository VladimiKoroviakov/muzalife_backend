/**
 * @file Route-level integration tests for /api/users
 *
 * QA Test Cases:
 *   TC_3.10.1 — Change email with OTP → success (positive)
 *   TC_3.10.2 — Change password → success (positive)
 *   TC_3.10.3 — Wrong current password → 400 (negative)
 *   TC_3.10.4 — Wrong OTP during email change → 400 (negative)
 *   TC_3.11.1 — Delete account with confirmation → 200 (positive)
 *   Also covers: GET /profile, PUT /profile/name, auth guards
 *
 * All routes require a valid JWT (Bearer token).
 * @module tests/routes/users.routes
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
  },
}));

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn(() => Promise.resolve('$2b$12$newhashed')),
    compare: vi.fn(),
    genSalt: vi.fn(),
  },
}));

vi.mock('../../utils/logger.js', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../utils/urlHelper.js', () => ({
  constructFullUrl: vi.fn((_req, path) => (path ? `https://localhost:5001${path}` : null)),
}));

import { query } from '../../config/database.js';
import { verificationService } from '../../services/verificationService.js';
import { emailService } from '../../services/emailService.js';
import bcrypt from 'bcryptjs';
import usersRouter from '../../routes/users.js';
import { makeApp } from '../helpers/makeApp.js';
import { makeUserToken, makeInvalidToken } from '../helpers/makeToken.js';

const app = makeApp({ '/api/users': usersRouter });

const validToken = makeUserToken(42);
const badToken   = makeInvalidToken();

// ─────────────────────────────────────────────────────────────────────────────
// Auth guards — common to all routes
// ─────────────────────────────────────────────────────────────────────────────
describe('Auth guards — all /api/users routes require a valid JWT', () => {
  beforeEach(() => vi.clearAllMocks());

  it('responds 401 when no Authorization header is provided to GET /profile', async () => {
    const res = await request(app).get('/api/users/profile');
    expect(res.status).toBe(401);
  });

  it('responds 403 when the token is invalid/signed with wrong secret', async () => {
    const res = await request(app)
      .get('/api/users/profile')
      .set('Authorization', `Bearer ${badToken}`);
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/users/profile
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/users/profile — retrieve authenticated user profile', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 with a user object for an authenticated request', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        user_id: 42,
        user_email: 'user@example.com',
        user_name: 'Test User',
        user_avatar_url: null,
        user_auth_provider: 'email',
        user_created_at: new Date().toISOString(),
        is_admin: false,
      }],
    });

    const res = await request(app)
      .get('/api/users/profile')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: 42, email: 'user@example.com' });
  });

  it('returns 404 when the user is not found in the database', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/users/profile')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(404);
  });

  it('returns 500 when the database query throws', async () => {
    query.mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app)
      .get('/api/users/profile')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/users/profile/name
// ─────────────────────────────────────────────────────────────────────────────
describe('PUT /api/users/profile/name — update display name', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 with updated user data on a valid request', async () => {
    query.mockResolvedValueOnce({
      rows: [{ user_id: 42, user_email: 'user@example.com', user_name: 'New Name' }],
    });

    const res = await request(app)
      .put('/api/users/profile/name')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ name: 'New Name' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.user_name).toBe('New Name');
  });

  it('returns 400 when name is missing from request body', async () => {
    const res = await request(app)
      .put('/api/users/profile/name')
      .set('Authorization', `Bearer ${validToken}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('returns 401 when no token is provided', async () => {
    const res = await request(app)
      .put('/api/users/profile/name')
      .send({ name: 'Someone' });

    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/users/change-password — TC_3.10.2, TC_3.10.3
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/users/change-password — change account password', () => {
  beforeEach(() => vi.clearAllMocks());

  it('TC_3.10.2 (positive): returns 200 success:true when old password is correct', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ user_password: '$2b$12$oldhashed' }] }) // get user
      .mockResolvedValueOnce({ rows: [] }); // UPDATE
    bcrypt.compare.mockResolvedValueOnce(true);
    bcrypt.hash.mockResolvedValueOnce('$2b$12$newhashed');

    const res = await request(app)
      .post('/api/users/change-password')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ oldPassword: 'OldPass1!', newPassword: 'NewPass2!' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('TC_3.10.3 (negative): returns 400 when current password is incorrect', async () => {
    query.mockResolvedValueOnce({ rows: [{ user_password: '$2b$12$oldhashed' }] });
    bcrypt.compare.mockResolvedValueOnce(false);

    const res = await request(app)
      .post('/api/users/change-password')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ oldPassword: 'WrongOldPass!', newPassword: 'NewPass2!' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/incorrect/i);
  });

  it('returns 400 when new password is shorter than 6 characters', async () => {
    const res = await request(app)
      .post('/api/users/change-password')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ oldPassword: 'OldPass1!', newPassword: '123' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when either password field is missing', async () => {
    const res = await request(app)
      .post('/api/users/change-password')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ oldPassword: 'OldPass1!' }); // newPassword missing

    expect(res.status).toBe(400);
  });

  it('returns 401 when no token is provided', async () => {
    const res = await request(app)
      .post('/api/users/change-password')
      .send({ oldPassword: 'old', newPassword: 'newpass' });

    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/users/email/change/initiate — TC_3.10.1 (step 1)
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/users/email/change/initiate — email change step 1', () => {
  beforeEach(() => vi.clearAllMocks());

  it('TC_3.10.1 (positive): returns 200 when all fields are valid and email is available', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ user_email: 'old@example.com' }] }) // get current email
      .mockResolvedValueOnce({ rows: [] });                                  // no conflict
    verificationService.hasPendingVerification.mockResolvedValueOnce(false);
    verificationService.createVerificationCode.mockResolvedValueOnce('789012');
    emailService.sendVerificationEmail.mockResolvedValueOnce(undefined);

    const res = await request(app)
      .post('/api/users/email/change/initiate')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ newEmail: 'new@example.com', id: 42 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.email).toBe('new@example.com');
  });

  it('returns 400 when new email is the same as the current email', async () => {
    query.mockResolvedValueOnce({ rows: [{ user_email: 'same@example.com' }] });

    const res = await request(app)
      .post('/api/users/email/change/initiate')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ newEmail: 'same@example.com', id: 42 });

    expect(res.status).toBe(400);
  });

  it('returns 400 when the new email is already taken by another user', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ user_email: 'old@example.com' }] })
      .mockResolvedValueOnce({ rows: [{ user_id: 99 }] }); // conflict

    const res = await request(app)
      .post('/api/users/email/change/initiate')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ newEmail: 'taken@example.com', id: 42 });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('EMAIL_EXISTS');
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/users/email/change/initiate')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ newEmail: 'new@example.com' }); // id missing

    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/users/email/change/verify — TC_3.10.1 (step 2), TC_3.10.4
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/users/email/change/verify — email change step 2', () => {
  beforeEach(() => vi.clearAllMocks());

  it('TC_3.10.1 (positive): returns 200 with updated email on correct OTP', async () => {
    verificationService.verifyCode.mockResolvedValueOnce({ isValid: true });
    query
      .mockResolvedValueOnce({ rows: [] })  // no existing user with new email
      .mockResolvedValueOnce({              // UPDATE
        rows: [{ user_id: 42, user_email: 'new@example.com' }],
      })
      .mockResolvedValueOnce({ rows: [] }); // DELETE code

    const res = await request(app)
      .post('/api/users/email/change/verify')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ newEmail: 'new@example.com', verificationCode: '789012', userId: 42 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.email).toBe('new@example.com');
  });

  it('TC_3.10.4 (negative): returns 400 with INVALID_VERIFICATION_CODE when OTP is wrong', async () => {
    verificationService.verifyCode.mockResolvedValueOnce({
      isValid: false,
      message: 'Невірний або прострочений код',
    });

    const res = await request(app)
      .post('/api/users/email/change/verify')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ newEmail: 'new@example.com', verificationCode: '000000', userId: 42 });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_VERIFICATION_CODE');
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/users/email/change/verify')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ newEmail: 'new@example.com' }); // verificationCode and userId missing

    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/users/account — TC_3.11.1
// ─────────────────────────────────────────────────────────────────────────────
describe('DELETE /api/users/account — delete own account', () => {
  beforeEach(() => vi.clearAllMocks());

  it('TC_3.11.1 (positive): returns 200 success:true when account is deleted', async () => {
    query.mockResolvedValueOnce({ rows: [] }); // DELETE user

    const res = await request(app)
      .delete('/api/users/account')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 401 when no Authorization header is provided', async () => {
    const res = await request(app).delete('/api/users/account');
    expect(res.status).toBe(401);
  });

  it('returns 500 when the database query throws', async () => {
    query.mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app)
      .delete('/api/users/account')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(500);
  });
});
