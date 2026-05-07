/**
 * @file Extended tests for Users API — covers endpoints missing from users.routes.test.js.
 *
 * Tests:
 *   POST   /api/users/profile/image              — uploadProfileImage
 *   DELETE /api/users/profile/image              — removeProfileImage
 *   POST   /api/users/resend-material            — resendMaterial
 *   POST   /api/users/email/change/resend-code   — resendEmailChangeCode
 * @module tests/routes/users.extended.routes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Multer mock — upload.single() populates req.file in tests
const { uploadMiddleware } = vi.hoisted(() => {
  const fn = vi.fn((_req, _res, cb) => cb(null));
  return { uploadMiddleware: fn };
});

vi.mock('multer', () => {
  /**
   *
   */
  class MulterError extends Error {
    /**
     *
     * @param code
     */
    constructor(code) { super(code); this.code = code; }
  }
  const multerFn = vi.fn(() => ({
    single: vi.fn(() => uploadMiddleware),
    fields: vi.fn(() => uploadMiddleware),
  }));
  multerFn.diskStorage = vi.fn(() => ({}));
  multerFn.MulterError = MulterError;
  return { default: multerFn };
});

vi.mock('../../config/database.js', () => ({
  query: vi.fn(),
  default: {},
}));

vi.mock('../../services/verificationService.js', () => ({
  verificationService: {
    createVerificationCode: vi.fn().mockResolvedValue('654321'),
    verifyCode: vi.fn().mockResolvedValue({ isValid: true, message: 'ok' }),
  },
}));

vi.mock('../../services/emailService.js', () => ({
  emailService: {
    sendVerificationEmail: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('../../utils/urlHelper.js', () => ({
  constructFullUrl: vi.fn((_req, url) => `http://localhost:5001${url}`),
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: {
      ...actual.default,
      existsSync: vi.fn().mockReturnValue(false),
      unlinkSync: vi.fn(),
      mkdirSync: vi.fn(),
    },
  };
});

vi.mock('../../utils/logger.js', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { query } from '../../config/database.js';
import { verificationService } from '../../services/verificationService.js';
import { emailService } from '../../services/emailService.js';
import usersRouter from '../../routes/users.js';
import { makeApp } from '../helpers/makeApp.js';
import { makeUserToken } from '../helpers/makeToken.js';

const app = makeApp({ '/api/users': usersRouter });
const userToken = makeUserToken(42);

beforeEach(() => {
  vi.clearAllMocks();
  uploadMiddleware.mockImplementation((_req, _res, cb) => cb(null));
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/users/profile/image — uploadProfileImage
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/users/profile/image — uploadProfileImage', () => {
  it('200 — uploads profile image and returns imageUrl', async () => {
    uploadMiddleware.mockImplementationOnce((req, _res, cb) => {
      req.file = { filename: 'profile-123.jpg', path: '/tmp/profile-123.jpg' };
      cb(null);
    });
    query.mockResolvedValueOnce({ rows: [{ user_id: 42 }] }); // UPDATE returns row

    const res = await request(app)
      .post('/api/users/profile/image')
      .set('Authorization', `Bearer ${userToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.imageUrl).toContain('profile-123.jpg');
  });

  it('400 — no file provided', async () => {
    // multer runs but sets no req.file
    uploadMiddleware.mockImplementationOnce((_req, _res, cb) => cb(null));

    const res = await request(app)
      .post('/api/users/profile/image')
      .set('Authorization', `Bearer ${userToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('No image file');
  });

  it('500 — DB throws', async () => {
    uploadMiddleware.mockImplementationOnce((req, _res, cb) => {
      req.file = { filename: 'profile-123.jpg', path: '/tmp/profile-123.jpg' };
      cb(null);
    });
    query.mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app)
      .post('/api/users/profile/image')
      .set('Authorization', `Bearer ${userToken}`)
      .send({});

    expect(res.status).toBe(500);
  });

  it('401 — no token', async () => {
    const res = await request(app).post('/api/users/profile/image').send({});
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/users/profile/image — removeProfileImage
// ─────────────────────────────────────────────────────────────────────────────
describe('DELETE /api/users/profile/image — removeProfileImage', () => {
  it('200 — removes profile image (file exists)', async () => {
    const { default: fs } = await import('fs');
    fs.existsSync.mockReturnValue(true);

    query
      .mockResolvedValueOnce({ rows: [{ user_avatar_url: '/uploads/profiles/profile-123.jpg' }] }) // get current
      .mockResolvedValueOnce({ rows: [] }); // UPDATE

    const res = await request(app)
      .delete('/api/users/profile/image')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(fs.unlinkSync).toHaveBeenCalled();
  });

  it('200 — removes profile image (no existing avatar)', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ user_avatar_url: null }] }) // no avatar
      .mockResolvedValueOnce({ rows: [] }); // UPDATE

    const res = await request(app)
      .delete('/api/users/profile/image')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
  });

  it('200 — returns success when no user row found', async () => {
    query
      .mockResolvedValueOnce({ rows: [] }) // no user found
      .mockResolvedValueOnce({ rows: [] }); // UPDATE

    const res = await request(app)
      .delete('/api/users/profile/image')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
  });

  it('500 — DB throws', async () => {
    query.mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app)
      .delete('/api/users/profile/image')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(500);
  });

  it('401 — no token', async () => {
    const res = await request(app).delete('/api/users/profile/image');
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/users/resend-material — resendMaterial
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/users/resend-material — resendMaterial', () => {
  it('200 — returns success immediately', async () => {
    const res = await request(app)
      .post('/api/users/resend-material')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ materialName: 'Test Material', purchaseDate: '2024-01-01' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBeDefined();
  });

  it('200 — works with empty body', async () => {
    const res = await request(app)
      .post('/api/users/resend-material')
      .set('Authorization', `Bearer ${userToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('401 — no token', async () => {
    const res = await request(app).post('/api/users/resend-material').send({});
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/users/email/change/resend-code — resendEmailChangeCode
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/users/email/change/resend-code', () => {
  it('200 — resends code for available email', async () => {
    query.mockResolvedValueOnce({ rows: [] }); // email not taken

    const res = await request(app)
      .post('/api/users/email/change/resend-code')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ email: 'new@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(verificationService.createVerificationCode).toHaveBeenCalled();
    expect(emailService.sendVerificationEmail).toHaveBeenCalled();
  });

  it('400 — email already taken', async () => {
    query.mockResolvedValueOnce({ rows: [{ user_id: 99 }] }); // email exists

    const res = await request(app)
      .post('/api/users/email/change/resend-code')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ email: 'taken@example.com' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('EMAIL_EXISTS');
  });

  it('400 — missing email', async () => {
    const res = await request(app)
      .post('/api/users/email/change/resend-code')
      .set('Authorization', `Bearer ${userToken}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('500 — email sending fails', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    emailService.sendVerificationEmail.mockRejectedValueOnce(
      new Error('Failed to send verification email'),
    );

    const res = await request(app)
      .post('/api/users/email/change/resend-code')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ email: 'new@example.com' });

    expect(res.status).toBe(500);
  });

  it('401 — no token', async () => {
    const res = await request(app).post('/api/users/email/change/resend-code').send({});
    expect(res.status).toBe(401);
  });
});
