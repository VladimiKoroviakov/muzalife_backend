/**
 * @file HTTP-level integration tests for the Polls API.
 *
 * Tests the key endpoints in `routes/polls.js`:
 *   GET  /api/polls/:pollId/results  — public single-poll results
 *   POST /api/polls/:pollId/vote     — authenticated user voting
 *   POST /api/polls                  — admin-only poll creation
 *   GET  /api/polls/results          — admin-only all-polls results
 *
 * Database is fully mocked. Admin checks (`isAdmin`) are satisfied by
 * returning `{ rows: [{ is_admin: true }] }` as the first DB call in
 * admin-only test cases.
 * @module tests/routes/polls.routes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../config/database.js', () => ({
  query: vi.fn(),
  default: {},
}));

vi.mock('../../utils/logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { query } from '../../config/database.js';
import pollsRouter from '../../routes/polls.js';
import { makeApp } from '../helpers/makeApp.js';
import { makeUserToken, makeInvalidToken } from '../helpers/makeToken.js';

const app = makeApp({ '/api/polls': pollsRouter });

const adminToken   = makeUserToken(1);   // userId=1 — mocked as admin in admin tests
const userToken    = makeUserToken(42);  // userId=42 — mocked as non-admin
const badToken     = makeInvalidToken();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/polls/:pollId/results — public endpoint
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/polls/:pollId/results — public endpoint (no auth required)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('accepts requests with no Authorization header', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ poll_id: 1, poll_question: 'Favourite?', is_active: true }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/polls/1/results');

    expect(res.status).toBe(200);
  });

  it('responds 200 with poll_id, poll_question, results, total_votes, poll_active', async () => {
    const poll = { poll_id: 1, poll_question: 'Best colour?', is_active: true };
    const votes = [
      { vote_id: 1, vote_text: 'Blue', vote_count: '3' },
      { vote_id: 2, vote_text: 'Red',  vote_count: '1' },
    ];
    query
      .mockResolvedValueOnce({ rows: [poll] })
      .mockResolvedValueOnce({ rows: votes });

    const res = await request(app).get('/api/polls/1/results');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.poll_id).toBe(1);
    expect(res.body.poll_question).toBe('Best colour?');
    expect(res.body.poll_active).toBe(true);
    expect(Array.isArray(res.body.results)).toBe(true);
    expect(typeof res.body.total_votes).toBe('number');
  });

  it('calculates percentage for each option (vote_count / total * 100 rounded to 1 dp)', async () => {
    const poll = { poll_id: 2, poll_question: 'Pick one', is_active: true };
    const votes = [
      { vote_id: 1, vote_text: 'A', vote_count: '1' },
      { vote_id: 2, vote_text: 'B', vote_count: '3' },
    ];
    query
      .mockResolvedValueOnce({ rows: [poll] })
      .mockResolvedValueOnce({ rows: votes });

    const res = await request(app).get('/api/polls/2/results');

    const resultA = res.body.results.find((r) => r.vote_text === 'A');
    const resultB = res.body.results.find((r) => r.vote_text === 'B');
    expect(resultA.percentage).toBe('25.0');
    expect(resultB.percentage).toBe('75.0');
    expect(res.body.total_votes).toBe(4);
  });

  it('responds 404 when the poll does not exist', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/polls/999/results');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('responds 500 when the database query throws', async () => {
    query.mockRejectedValue(new Error('DB error'));

    const res = await request(app).get('/api/polls/1/results');

    expect(res.status).toBe(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/polls/:pollId/vote — requires authentication
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/polls/:pollId/vote — requires authentication', () => {
  beforeEach(() => vi.clearAllMocks());

  it('responds 401 when no Authorization header is provided', async () => {
    const res = await request(app).post('/api/polls/1/vote').send({ vote_id: 1 });
    expect(res.status).toBe(401);
  });

  it('responds 403 when the token is invalid', async () => {
    const res = await request(app)
      .post('/api/polls/1/vote')
      .set('Authorization', `Bearer ${badToken}`)
      .send({ vote_id: 1 });
    expect(res.status).toBe(403);
  });

  it('responds 400 when vote_id is missing from the body', async () => {
    const res = await request(app)
      .post('/api/polls/1/vote')
      .set('Authorization', `Bearer ${userToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('responds 404 when the poll is not found or not active', async () => {
    query.mockResolvedValueOnce({ rows: [] }); // poll check fails

    const res = await request(app)
      .post('/api/polls/999/vote')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ vote_id: 1 });

    expect(res.status).toBe(404);
  });

  it('responds 400 when the vote_id does not belong to this poll', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ poll_id: 1, is_active: true }] }) // poll exists
      .mockResolvedValueOnce({ rows: [] }); // vote check fails

    const res = await request(app)
      .post('/api/polls/1/vote')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ vote_id: 99 });

    expect(res.status).toBe(400);
  });

  it('responds 400 when the user has already voted on this poll', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ poll_id: 1, is_active: true }] })  // poll exists
      .mockResolvedValueOnce({ rows: [{ vote_id: 1 }] })                    // vote belongs to poll
      .mockResolvedValueOnce({ rows: [{ vote_id: 1, user_id: 42 }] });      // already voted

    const res = await request(app)
      .post('/api/polls/1/vote')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ vote_id: 1 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('responds 200 with success:true and bilingual message on a successful vote', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ poll_id: 1, is_active: true }] }) // poll exists
      .mockResolvedValueOnce({ rows: [{ vote_id: 1 }] })                   // vote valid
      .mockResolvedValueOnce({ rows: [] })                                  // not yet voted
      .mockResolvedValueOnce({ rows: [] });                                 // insert vote

    const res = await request(app)
      .post('/api/polls/1/vote')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ vote_id: 1 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toHaveProperty('uk');
    expect(res.body.message).toHaveProperty('en');
  });

  it('responds 400 on a DB unique-constraint violation (error code 23505)', async () => {
    const dbError = Object.assign(new Error('duplicate key'), { code: '23505' });
    query
      .mockResolvedValueOnce({ rows: [{ poll_id: 1, is_active: true }] })
      .mockResolvedValueOnce({ rows: [{ vote_id: 1 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(dbError); // insert throws constraint error

    const res = await request(app)
      .post('/api/polls/1/vote')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ vote_id: 1 });

    expect(res.status).toBe(400);
  });

  it('responds 500 when the database throws an unexpected error', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ poll_id: 1, is_active: true }] })
      .mockRejectedValueOnce(new Error('unexpected'));

    const res = await request(app)
      .post('/api/polls/1/vote')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ vote_id: 1 });

    expect(res.status).toBe(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/polls — admin only
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/polls — admin only', () => {
  beforeEach(() => vi.clearAllMocks());

  it('responds 401 when no Authorization header is provided', async () => {
    const res = await request(app)
      .post('/api/polls')
      .send({ poll_question: 'Q?', options: ['A', 'B'] });
    expect(res.status).toBe(401);
  });

  it('responds 403 when the authenticated user is not an admin', async () => {
    query.mockResolvedValueOnce({ rows: [{ is_admin: false }] }); // isAdmin check

    const res = await request(app)
      .post('/api/polls')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ poll_question: 'Q?', options: ['A', 'B'] });

    expect(res.status).toBe(403);
  });

  it('responds 400 when poll_question is missing', async () => {
    query.mockResolvedValueOnce({ rows: [{ is_admin: true }] }); // admin check passes

    const res = await request(app)
      .post('/api/polls')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ options: ['A', 'B'] });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('responds 400 when options has fewer than 2 items', async () => {
    query.mockResolvedValueOnce({ rows: [{ is_admin: true }] });

    const res = await request(app)
      .post('/api/polls')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ poll_question: 'Q?', options: ['Only one'] });

    expect(res.status).toBe(400);
  });

  it('responds 201 with success:true and the created poll for an admin user', async () => {
    const createdPoll = { poll_id: 10, poll_question: 'Q?', is_active: true };
    query
      .mockResolvedValueOnce({ rows: [{ is_admin: true }] })   // isAdmin
      .mockResolvedValueOnce({ rows: [createdPoll] })           // INSERT poll
      .mockResolvedValueOnce({ rows: [] })                      // INSERT option A
      .mockResolvedValueOnce({ rows: [] });                     // INSERT option B

    const res = await request(app)
      .post('/api/polls')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ poll_question: 'Q?', options: ['A', 'B'] });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.poll).toMatchObject({ poll_id: 10 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/polls/results — admin only
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/polls/results — admin only (all polls)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('responds 401 when no Authorization header is provided', async () => {
    const res = await request(app).get('/api/polls/results');
    expect(res.status).toBe(401);
  });

  it('responds 403 when the authenticated user is not an admin', async () => {
    query.mockResolvedValueOnce({ rows: [{ is_admin: false }] });

    const res = await request(app)
      .get('/api/polls/results')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
  });

  it('responds 200 with success:true and polls array for an admin', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ is_admin: true }] })           // isAdmin
      .mockResolvedValueOnce({ rows: [{ poll_id: 1, poll_question: 'Q?', is_active: true, poll_created_at: new Date() }] }) // all polls
      .mockResolvedValueOnce({ rows: [] })                              // options for poll 1
      .mockResolvedValueOnce({ rows: [] });                             // recent voters for poll 1

    const res = await request(app)
      .get('/api/polls/results')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.polls)).toBe(true);
  });
});
