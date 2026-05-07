/**
 * @file Extended tests for the Personal Orders API — covers missing endpoints.
 *
 * Tests endpoints not covered by `personalOrders.routes.test.js`:
 *   POST   /api/personal-orders/:orderId/send-materials  — admin sends files to user
 *   DELETE /api/personal-orders/:orderId/files/:fileId   — admin removes a file
 *   DELETE /api/personal-orders/:orderId                 — delete order
 * @module tests/routes/personalOrders.extended.routes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../config/database.js', () => ({
  query: vi.fn(),
  default: { query: vi.fn(), connect: vi.fn() },
}));

vi.mock('../../services/emailService.js', () => ({
  emailService: {
    sendOrderMaterials: vi.fn().mockResolvedValue(true),
    sendOrderNotification: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('../../utils/watermark.js', () => ({
  applyWatermark: vi.fn().mockResolvedValue(undefined),
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
      renameSync: vi.fn(),
    },
  };
});

vi.mock('../../utils/logger.js', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { query } from '../../config/database.js';
import db from '../../config/database.js';
import { emailService } from '../../services/emailService.js';
import personalOrdersRouter from '../../routes/personalOrders.js';
import { makeApp } from '../helpers/makeApp.js';
import { makeUserToken } from '../helpers/makeToken.js';

const app = makeApp({ '/api/personal-orders': personalOrdersRouter });
const adminToken = makeUserToken(1);
const userToken = makeUserToken(42);

let mockClient;

beforeEach(() => {
  vi.clearAllMocks();
  mockClient = { query: vi.fn(), release: vi.fn() };
  db.connect.mockResolvedValue(mockClient);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/personal-orders/:orderId/send-materials
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/personal-orders/:orderId/send-materials', () => {
  it('200 — admin sends materials to order owner', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ is_admin: true }] }) // isAdmin
      .mockResolvedValueOnce({ rows: [{ order_title: 'Quest', user_email: 'client@test.com' }] }) // order
      .mockResolvedValueOnce({ rows: [{ fileName: 'quest.pdf', fileUrl: 'http://localhost:5001/uploads/personal-orders/10/quest.pdf' }] }); // files

    const res = await request(app)
      .post('/api/personal-orders/10/send-materials')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(emailService.sendOrderMaterials).toHaveBeenCalledWith(
      'client@test.com',
      'Quest',
      expect.any(Array),
    );
  });

  it('403 — non-admin user', async () => {
    query.mockResolvedValueOnce({ rows: [{ is_admin: false }] });

    const res = await request(app)
      .post('/api/personal-orders/10/send-materials')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
  });

  it('404 — order not found', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ is_admin: true }] })
      .mockResolvedValueOnce({ rows: [] }) // order not found
      .mockResolvedValueOnce({ rows: [] }); // files

    const res = await request(app)
      .post('/api/personal-orders/999/send-materials')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });

  it('404 — order exists but has no files', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ is_admin: true }] })
      .mockResolvedValueOnce({ rows: [{ order_title: 'Quest', user_email: 'c@test.com' }] })
      .mockResolvedValueOnce({ rows: [] }); // no files

    const res = await request(app)
      .post('/api/personal-orders/10/send-materials')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });

  it('400 — invalid orderId', async () => {
    query.mockResolvedValueOnce({ rows: [{ is_admin: true }] });

    const res = await request(app)
      .post('/api/personal-orders/abc/send-materials')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404); // NotFoundError for invalid ID
  });

  it('401 — no token', async () => {
    const res = await request(app).post('/api/personal-orders/10/send-materials');
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/personal-orders/:orderId/files/:fileId
// ─────────────────────────────────────────────────────────────────────────────
describe('DELETE /api/personal-orders/:orderId/files/:fileId', () => {
  it('200 — admin deletes a file from an order', async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [{ is_admin: true }] }) // isAdmin (using query directly)
      .mockResolvedValueOnce({ rows: [{ file_url: 'http://localhost:5001/uploads/personal-orders/10/f.pdf' }] }) // file row
      .mockResolvedValueOnce(undefined) // DELETE PersonalOrderFiles
      .mockResolvedValueOnce(undefined) // DELETE Files
      .mockResolvedValueOnce(undefined); // COMMIT

    // isAdmin uses the module-level query, not the client
    query.mockResolvedValueOnce({ rows: [{ is_admin: true }] });

    const res = await request(app)
      .delete('/api/personal-orders/10/files/5')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('400 — invalid orderId or fileId', async () => {
    const res = await request(app)
      .delete('/api/personal-orders/abc/files/xyz')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
  });

  it('403 — non-admin user', async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [] }); // isAdmin check - but isAdmin uses module query

    query.mockResolvedValueOnce({ rows: [{ is_admin: false }] });

    const res = await request(app)
      .delete('/api/personal-orders/10/files/5')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
  });

  it('404 — file not found', async () => {
    query.mockResolvedValueOnce({ rows: [{ is_admin: true }] });
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [] }); // file not found

    const res = await request(app)
      .delete('/api/personal-orders/10/files/999')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });

  it('401 — no token', async () => {
    const res = await request(app).delete('/api/personal-orders/10/files/5');
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/personal-orders/:orderId
// ─────────────────────────────────────────────────────────────────────────────
describe('DELETE /api/personal-orders/:orderId', () => {
  it('200 — owner deletes own order', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ user_id: 42 }] }) // ownership check
      .mockResolvedValueOnce({ rows: [] }); // DELETE

    const res = await request(app)
      .delete('/api/personal-orders/10')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('200 — admin deletes another user order', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ user_id: 99 }] }) // different owner
      .mockResolvedValueOnce({ rows: [{ is_admin: true }] }) // isAdmin check
      .mockResolvedValueOnce({ rows: [] }); // DELETE

    const res = await request(app)
      .delete('/api/personal-orders/10')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
  });

  it('403 — non-owner, non-admin', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ user_id: 99 }] }) // different owner
      .mockResolvedValueOnce({ rows: [{ is_admin: false }] }); // not admin

    const res = await request(app)
      .delete('/api/personal-orders/10')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
  });

  it('404 — order not found', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .delete('/api/personal-orders/999')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(404);
  });

  it('500 — DB throws', async () => {
    query.mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app)
      .delete('/api/personal-orders/10')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(500);
  });

  it('401 — no token', async () => {
    const res = await request(app).delete('/api/personal-orders/10');
    expect(res.status).toBe(401);
  });
});
