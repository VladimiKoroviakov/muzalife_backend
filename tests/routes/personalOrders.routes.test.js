/**
 * @file HTTP-level integration tests for the Personal Orders API.
 *
 * Tests the key endpoints in `routes/personalOrders.js`:
 *   GET    /api/personal-orders         — authenticated user's own orders
 *   GET    /api/personal-orders/all     — admin-only: all orders
 *   POST   /api/personal-orders         — create a new order
 *   GET    /api/personal-orders/:id     — owner or admin: single order
 *   PUT    /api/personal-orders/:id     — update order (owner or admin)
 *   DELETE /api/personal-orders/:id     — delete order (owner or admin)
 *
 * All routes require a valid JWT (`router.use(authenticateToken)`).
 * Admin checks return `{ rows: [{ is_admin: true }] }` as the first DB call
 * in admin-only test cases (mirrors the `isAdmin` helper in the route file).
 *
 * QA traceability:
 *   TC_2.9.1  — admin sees all personal orders (GET /all)
 *   TC_2.9.2  — admin accepts order with price (PUT /:orderId → accepted status)
 *   TC_2.9.3  — admin rejects order with reason (PUT /:orderId → declined status)
 *   TC_3.7.1  — user submits order form (POST /)
 *   TC_3.7.2  — submit without required fields → 400 (POST / negative)
 * @module tests/routes/personalOrders.routes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// ── Mocks ─────────────────────────────────────────────────────────────────────
vi.mock('../../config/database.js', () => ({
  query: vi.fn(),
  default: { query: vi.fn(), connect: vi.fn() },
}));

vi.mock('../../services/emailService.js', () => ({
  emailService: {
    sendOrderMaterials:    vi.fn(),
    sendOrderNotification: vi.fn(),
  },
}));

vi.mock('../../utils/watermark.js', () => ({
  applyWatermark: vi.fn((buffer) => Promise.resolve(buffer)),
}));

vi.mock('../../utils/logger.js', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { query } from '../../config/database.js';
import personalOrdersRouter from '../../routes/personalOrders.js';
import { makeApp } from '../helpers/makeApp.js';
import { makeUserToken, makeInvalidToken } from '../helpers/makeToken.js';

const app = makeApp({ '/api/personal-orders': personalOrdersRouter });

// ── Tokens ────────────────────────────────────────────────────────────────────
const adminToken = makeUserToken(1);   // userId=1 — returned as admin in admin tests
const userToken  = makeUserToken(42);  // userId=42 — regular user
const badToken   = makeInvalidToken();

// ── Shared mock order ─────────────────────────────────────────────────────────
const mockOrder = {
  order_id:                     1,
  user_id:                      42,
  order_title:                  'Корпоратив 2026',
  order_description:            'Детальний опис',
  order_status:                 'pending',
  order_price:                  null,
  order_material_type:          'Сценарій',
  order_material_age_category:  '18+',
  order_deadline:               null,
  order_created_at:             new Date().toISOString(),
  order_decline_reason:         null,
};

beforeEach(() => vi.clearAllMocks());

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/personal-orders — user's own orders
// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/personal-orders — user's own orders", () => {
  it('responds 401 when no Authorization header is provided', async () => {
    const res = await request(app).get('/api/personal-orders');
    expect(res.status).toBe(401);
  });

  it('responds 403 when the token is invalid', async () => {
    const res = await request(app)
      .get('/api/personal-orders')
      .set('Authorization', `Bearer ${badToken}`);
    expect(res.status).toBe(403);
  });

  it('responds 200 with an array of orders for the authenticated user', async () => {
    query.mockResolvedValueOnce({ rows: [mockOrder] });

    const res = await request(app)
      .get('/api/personal-orders')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.personalOrders)).toBe(true);
    expect(res.body.personalOrders).toHaveLength(1);
    expect(res.body.personalOrders[0].order_title).toBe('Корпоратив 2026');
  });

  it('responds 200 with an empty array when the user has no orders', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/personal-orders')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.personalOrders).toEqual([]);
  });

  it('responds 500 when the database query throws', async () => {
    query.mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app)
      .get('/api/personal-orders')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/personal-orders/all — admin only (TC_2.9.1)
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/personal-orders/all — admin only (TC_2.9.1)', () => {
  it('responds 401 when no Authorization header is provided', async () => {
    const res = await request(app).get('/api/personal-orders/all');
    expect(res.status).toBe(401);
  });

  it('responds 403 when the authenticated user is not an admin', async () => {
    query.mockResolvedValueOnce({ rows: [{ is_admin: false }] }); // isAdmin → false

    const res = await request(app)
      .get('/api/personal-orders/all')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('responds 200 with all orders for an admin user (TC_2.9.1)', async () => {
    const adminOrder = { ...mockOrder, user_name: 'Test User', user_email: 'test@example.com' };
    query
      .mockResolvedValueOnce({ rows: [{ is_admin: true }] })   // isAdmin → true
      .mockResolvedValueOnce({ rows: [adminOrder] });           // all orders query

    const res = await request(app)
      .get('/api/personal-orders/all')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.personalOrders)).toBe(true);
    expect(res.body.personalOrders[0]).toHaveProperty('user_name');
    expect(res.body.personalOrders[0]).toHaveProperty('user_email');
  });

  it('responds 500 when the database query throws', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ is_admin: true }] })
      .mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app)
      .get('/api/personal-orders/all')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/personal-orders — create order (TC_3.7.1, TC_3.7.2)
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/personal-orders — create order (TC_3.7.1, TC_3.7.2)', () => {
  const validBody = {
    orderTitle:               'Корпоратив 2026',
    orderDescription:         'Детальний опис',
    orderMaterialType:        1,
    orderMaterialAgeCategory: 2,
  };

  it('responds 401 when no Authorization header is provided', async () => {
    const res = await request(app).post('/api/personal-orders').send(validBody);
    expect(res.status).toBe(401);
  });

  it('responds 400 when orderTitle is missing (TC_3.7.2)', async () => {
    const { orderTitle: _, ...bodyWithoutTitle } = validBody;

    const res = await request(app)
      .post('/api/personal-orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send(bodyWithoutTitle);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('responds 400 when orderDescription is missing (TC_3.7.2)', async () => {
    const { orderDescription: _, ...body } = validBody;

    const res = await request(app)
      .post('/api/personal-orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('responds 400 when orderMaterialType is missing (TC_3.7.2)', async () => {
    const { orderMaterialType: _, ...body } = validBody;

    const res = await request(app)
      .post('/api/personal-orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send(body);

    expect(res.status).toBe(400);
  });

  it('responds 400 when orderMaterialAgeCategory is missing (TC_3.7.2)', async () => {
    const { orderMaterialAgeCategory: _, ...body } = validBody;

    const res = await request(app)
      .post('/api/personal-orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send(body);

    expect(res.status).toBe(400);
  });

  it('responds 201 with the created order on success (TC_3.7.1)', async () => {
    query.mockResolvedValueOnce({ rows: [mockOrder] }); // INSERT RETURNING

    const res = await request(app)
      .post('/api/personal-orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.personalOrder).toMatchObject({ order_title: 'Корпоратив 2026' });
  });

  it('responds 500 when the database insert throws', async () => {
    query.mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app)
      .post('/api/personal-orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send(validBody);

    expect(res.status).toBe(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/personal-orders/:orderId — owner or admin
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/personal-orders/:orderId — owner or admin', () => {
  it('responds 401 when no Authorization header is provided', async () => {
    const res = await request(app).get('/api/personal-orders/1');
    expect(res.status).toBe(401);
  });

  it('responds 200 and returns the order when the authenticated user is the owner', async () => {
    // mockOrder.user_id = 42 matches userToken userId=42
    query.mockResolvedValueOnce({ rows: [mockOrder] });

    const res = await request(app)
      .get('/api/personal-orders/1')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.personalOrder.order_id).toBe(1);
  });

  it('responds 403 when the user does not own the order and is not an admin', async () => {
    const anotherUsersOrder = { ...mockOrder, user_id: 99 };
    query
      .mockResolvedValueOnce({ rows: [anotherUsersOrder] }) // order found
      .mockResolvedValueOnce({ rows: [{ is_admin: false }] }); // isAdmin → false

    const res = await request(app)
      .get('/api/personal-orders/1')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
  });

  it('responds 200 when an admin requests another user\'s order', async () => {
    const anotherUsersOrder = { ...mockOrder, user_id: 99 };
    query
      .mockResolvedValueOnce({ rows: [anotherUsersOrder] }) // order found
      .mockResolvedValueOnce({ rows: [{ is_admin: true }] }); // isAdmin → true

    const res = await request(app)
      .get('/api/personal-orders/1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('responds 404 when the order does not exist', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/personal-orders/999')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/personal-orders/:orderId — update (TC_2.9.2, TC_2.9.3)
// ─────────────────────────────────────────────────────────────────────────────
describe('PUT /api/personal-orders/:orderId — update (TC_2.9.2, TC_2.9.3)', () => {
  it('responds 401 when no Authorization header is provided', async () => {
    const res = await request(app).put('/api/personal-orders/1').send({ orderStatus: 'accepted' });
    expect(res.status).toBe(401);
  });

  it('responds 404 when the order does not exist', async () => {
    query.mockResolvedValueOnce({ rows: [] }); // ownership check → not found

    const res = await request(app)
      .put('/api/personal-orders/999')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ orderStatus: 'accepted' });

    expect(res.status).toBe(404);
  });

  it('responds 400 when status is declined but no decline reason is provided (TC_2.9.3)', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ user_id: 42 }] })       // ownership check
      .mockResolvedValueOnce({ rows: [{ is_admin: true }] });   // isAdmin → true

    const res = await request(app)
      .put('/api/personal-orders/1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ orderStatus: 'declined' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('responds 200 when admin accepts an order with price (TC_2.9.2)', async () => {
    const updatedOrder = { ...mockOrder, order_status: 'accepted', order_price: 500 };
    query
      .mockResolvedValueOnce({ rows: [{ user_id: 42 }] })       // ownership check
      .mockResolvedValueOnce({ rows: [{ is_admin: true }] })    // isAdmin → true
      .mockResolvedValueOnce({ rows: [{ order_id: 1 }] })       // UPDATE RETURNING order_id
      .mockResolvedValueOnce({ rows: [updatedOrder] });          // SELECT updated order

    const res = await request(app)
      .put('/api/personal-orders/1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ orderStatus: 'accepted', orderPrice: 500 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.personalOrder.order_status).toBe('accepted');
    expect(res.body.personalOrder.order_price).toBe(500);
  });

  it('responds 200 when admin rejects an order with a reason (TC_2.9.3)', async () => {
    const declinedOrder = {
      ...mockOrder,
      order_status: 'declined',
      order_decline_reason: 'Поза нашими можливостями',
    };
    query
      .mockResolvedValueOnce({ rows: [{ user_id: 42 }] })
      .mockResolvedValueOnce({ rows: [{ is_admin: true }] })
      .mockResolvedValueOnce({ rows: [{ order_id: 1 }] })
      .mockResolvedValueOnce({ rows: [declinedOrder] });

    const res = await request(app)
      .put('/api/personal-orders/1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ orderStatus: 'declined', orderDeclineReason: 'Поза нашими можливостями' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.personalOrder.order_status).toBe('declined');
    expect(res.body.personalOrder.order_decline_reason).toBe('Поза нашими можливостями');
  });

  it('responds 400 when no update fields are supplied', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ user_id: 42 }] });  // ownership check — owner
    // No isAdmin call expected because owner shortcircuits the check

    const res = await request(app)
      .put('/api/personal-orders/1')
      .set('Authorization', `Bearer ${userToken}`)
      .send({}); // no fields

    expect(res.status).toBe(400);
  });

  it('responds 403 when the user does not own the order and is not an admin', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ user_id: 99 }] })       // ownership → different user
      .mockResolvedValueOnce({ rows: [{ is_admin: false }] });   // isAdmin → false

    const res = await request(app)
      .put('/api/personal-orders/1')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ orderTitle: 'Changed' });

    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/personal-orders/:orderId — owner or admin
// ─────────────────────────────────────────────────────────────────────────────
describe('DELETE /api/personal-orders/:orderId — owner or admin', () => {
  it('responds 401 when no Authorization header is provided', async () => {
    const res = await request(app).delete('/api/personal-orders/1');
    expect(res.status).toBe(401);
  });

  it('responds 404 when the order does not exist', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .delete('/api/personal-orders/999')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(404);
  });

  it('responds 403 when the user does not own the order and is not an admin', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ user_id: 99 }] })       // ownership → different user
      .mockResolvedValueOnce({ rows: [{ is_admin: false }] });   // isAdmin → false

    const res = await request(app)
      .delete('/api/personal-orders/1')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
  });

  it('responds 200 with success:true when the owner deletes their own order', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ user_id: 42 }] }) // ownership check — owner
      .mockResolvedValueOnce({ rows: [] });                // DELETE

    const res = await request(app)
      .delete('/api/personal-orders/1')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toHaveProperty('uk');
    expect(res.body.message).toHaveProperty('en');
  });

  it('responds 200 when an admin deletes another user\'s order', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ user_id: 99 }] })      // ownership → different user
      .mockResolvedValueOnce({ rows: [{ is_admin: true }] })   // isAdmin → true
      .mockResolvedValueOnce({ rows: [] });                     // DELETE

    const res = await request(app)
      .delete('/api/personal-orders/1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
