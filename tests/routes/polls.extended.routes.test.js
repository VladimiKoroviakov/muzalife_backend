/**
 * @file Extended tests for the Polls API — covers missing endpoints.
 *
 * Tests endpoints not covered by `polls.routes.test.js`:
 *   GET    /api/polls                 — list active polls (authenticated)
 *   GET    /api/polls/:pollId         — single poll (authenticated)
 *   DELETE /api/polls/:pollId         — delete poll (admin only)
 *   PUT    /api/polls/:pollId/status  — toggle active status (admin only)
 * @module tests/routes/polls.extended.routes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../config/database.js', () => ({
  query: vi.fn(),
  default: {},
}));

vi.mock('../../utils/logger.js', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../utils/urlHelper.js', () => ({
  constructFullUrl: vi.fn((req, url) => url || null),
}));

import { query } from '../../config/database.js';
import pollsRouter from '../../routes/polls.js';
import { makeApp } from '../helpers/makeApp.js';
import { makeUserToken, makeInvalidToken } from '../helpers/makeToken.js';

const app = makeApp({ '/api/polls': pollsRouter });
const adminToken = makeUserToken(1);
const userToken = makeUserToken(42);

beforeEach(() => vi.clearAllMocks());

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/polls — list active polls
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/polls — list active polls', () => {
  it('200 — returns active polls for authenticated user', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        poll_id: 1,
        poll_question: 'Яку тему обрати?',
        is_active: true,
        total_votes: 5,
        user_has_voted: false,
        options: [{ vote_id: 1, vote_text: 'Option A', vote_count: 3 }],
        recent_voters: [],
      }],
    });

    const res = await request(app)
      .get('/api/polls')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.polls)).toBe(true);
  });

  it('200 — returns empty list when no active polls', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/polls')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.polls).toEqual([]);
  });

  it('200 — maps recent_voters imageUrl via constructFullUrl', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        poll_id: 1,
        poll_question: 'Q?',
        is_active: true,
        total_votes: 1,
        user_has_voted: false,
        options: [],
        recent_voters: [{ name: 'Alice', imageUrl: '/uploads/profiles/alice.jpg' }],
      }],
    });

    const res = await request(app)
      .get('/api/polls')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.polls[0].recent_voters[0].name).toBe('Alice');
  });

  it('500 — returns 500 when DB throws', async () => {
    query.mockRejectedValueOnce(new Error('DB down'));

    const res = await request(app)
      .get('/api/polls')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(500);
  });

  it('401 — no token', async () => {
    const res = await request(app).get('/api/polls');
    expect(res.status).toBe(401);
  });

  it('403 — invalid token', async () => {
    const res = await request(app)
      .get('/api/polls')
      .set('Authorization', `Bearer ${makeInvalidToken()}`);
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/polls/:pollId — single poll
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/polls/:pollId — single poll', () => {
  it('200 — returns poll with options and user vote', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ poll_id: 1, poll_question: 'Q?', is_active: true, total_votes: 3 }] }) // poll
      .mockResolvedValueOnce({ rows: [{ vote_id: 10, vote_text: 'A', vote_count: 2 }] }) // options
      .mockResolvedValueOnce({ rows: [{ vote_id: 10, vote_text: 'A' }] }); // user vote

    const res = await request(app)
      .get('/api/polls/1')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.poll.poll_id).toBe(1);
    expect(res.body.poll.user_has_voted).toBe(true);
    expect(res.body.poll.user_vote).toBe(10);
  });

  it('200 — user has not voted', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ poll_id: 2, poll_question: 'Q2?', is_active: true, total_votes: 0 }] })
      .mockResolvedValueOnce({ rows: [] }) // options
      .mockResolvedValueOnce({ rows: [] }); // no user vote

    const res = await request(app)
      .get('/api/polls/2')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.poll.user_has_voted).toBe(false);
    expect(res.body.poll.user_vote).toBeNull();
  });

  it('404 — poll not found', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/polls/999')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(404);
  });

  it('500 — DB throws', async () => {
    query.mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app)
      .get('/api/polls/1')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(500);
  });

  it('401 — no token', async () => {
    const res = await request(app).get('/api/polls/1');
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/polls/:pollId — admin only
// ─────────────────────────────────────────────────────────────────────────────
describe('DELETE /api/polls/:pollId', () => {
  it('200 — admin deletes a poll', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ is_admin: true }] }) // isAdmin
      .mockResolvedValueOnce({ rows: [{ poll_id: 5 }] }) // poll exists
      .mockResolvedValueOnce({ rows: [] }) // delete votes
      .mockResolvedValueOnce({ rows: [] }) // delete poll votes
      .mockResolvedValueOnce({ rows: [] }); // delete poll

    const res = await request(app)
      .delete('/api/polls/5')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('403 — non-admin user', async () => {
    query.mockResolvedValueOnce({ rows: [{ is_admin: false }] });

    const res = await request(app)
      .delete('/api/polls/5')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
  });

  it('404 — poll not found', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ is_admin: true }] })
      .mockResolvedValueOnce({ rows: [] }); // poll not found

    const res = await request(app)
      .delete('/api/polls/999')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });

  it('500 — DB throws', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ is_admin: true }] })
      .mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app)
      .delete('/api/polls/5')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(500);
  });

  it('401 — no token', async () => {
    const res = await request(app).delete('/api/polls/5');
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/polls/:pollId/status — toggle active status
// ─────────────────────────────────────────────────────────────────────────────
describe('PUT /api/polls/:pollId/status', () => {
  it('200 — admin activates poll', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ is_admin: true }] })
      .mockResolvedValueOnce({ rows: [{ poll_id: 3, is_active: true }] });

    const res = await request(app)
      .put('/api/polls/3/status')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ is_active: true });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message.en).toContain('activated');
  });

  it('200 — admin deactivates poll', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ is_admin: true }] })
      .mockResolvedValueOnce({ rows: [{ poll_id: 3, is_active: false }] });

    const res = await request(app)
      .put('/api/polls/3/status')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ is_active: false });

    expect(res.status).toBe(200);
    expect(res.body.message.en).toContain('deactivated');
  });

  it('403 — non-admin', async () => {
    query.mockResolvedValueOnce({ rows: [{ is_admin: false }] });

    const res = await request(app)
      .put('/api/polls/3/status')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ is_active: true });

    expect(res.status).toBe(403);
  });

  it('400 — is_active is not a boolean', async () => {
    query.mockResolvedValueOnce({ rows: [{ is_admin: true }] });

    const res = await request(app)
      .put('/api/polls/3/status')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ is_active: 'yes' });

    expect(res.status).toBe(400);
  });

  it('404 — poll not found', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ is_admin: true }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .put('/api/polls/999/status')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ is_active: true });

    expect(res.status).toBe(404);
  });

  it('500 — DB throws', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ is_admin: true }] })
      .mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app)
      .put('/api/polls/3/status')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ is_active: true });

    expect(res.status).toBe(500);
  });

  it('401 — no token', async () => {
    const res = await request(app).put('/api/polls/3/status').send({ is_active: true });
    expect(res.status).toBe(401);
  });
});
