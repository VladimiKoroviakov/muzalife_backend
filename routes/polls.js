/**
 * @file Polls REST API routes for MuzaLife.
 *
 * Handles poll creation, user voting, status management, and result aggregation.
 *
 * **Auth summary:**
 * - `GET /`                  — authenticated users (active polls + per-user vote state)
 * - `GET /results`           — admin only (all polls, all vote counts)
 * - `GET /:pollId`           — authenticated users
 * - `POST /`                 — admin only (create poll)
 * - `POST /:pollId/vote`     — authenticated users
 * - `GET /:pollId/results`   — public (single-poll result)
 * - `PUT /:pollId/status`    — admin only (activate / deactivate)
 * @module routes/polls
 */

import express from 'express';
import { query } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import logger from '../utils/logger.js';

const router = express.Router();

// ── Helper: check if the authenticated user is admin ─────────────────────────
/**
 * Returns true if the given user has admin privileges.
 * @param {number} userId - Authenticated user ID from the JWT.
 * @returns {Promise<boolean>} True if the user is an admin, false otherwise.
 */
const isAdmin = async (userId) => {
  const result = await query(
    'SELECT is_admin FROM Users WHERE user_id = $1',
    [userId],
  );
  return result.rows[0]?.is_admin === true;
};

// ── GET /api/polls ────────────────────────────────────────────────────────────
/**
 * Returns all active polls, including per-option vote counts and whether the
 * current user has already voted.
 *
 * **Auth:** authenticated user
 *
 * **Response:**
 * ```json
 * { "success": true, "polls": [ { poll_id, poll_question, is_active, total_votes, user_has_voted, options: [...] } ] }
 * ```
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await query(`
      SELECT
        p.poll_id,
        p.poll_question,
        p.is_active,
        p.poll_created_at,
        COUNT(DISTINCT puv.user_id) as total_votes,
        EXISTS(
          SELECT 1 FROM PollUserVotes puv2
          JOIN PollVotes pv2 ON puv2.vote_id = pv2.vote_id
          WHERE pv2.poll_id = p.poll_id AND puv2.user_id = $1
        ) as user_has_voted,
        COALESCE(
          jsonb_agg(
            DISTINCT jsonb_build_object(
              'vote_id', pv.vote_id,
              'vote_text', pv.vote_text,
              'vote_count', (
                SELECT COUNT(*)
                FROM PollUserVotes puv3
                WHERE puv3.vote_id = pv.vote_id
              )
            )
          ) FILTER (WHERE pv.vote_id IS NOT NULL),
          '[]'::jsonb
        ) as options
      FROM Polls p
      LEFT JOIN PollVotes pv ON p.poll_id = pv.poll_id
      LEFT JOIN PollUserVotes puv ON pv.vote_id = puv.vote_id
      WHERE p.is_active = true
      GROUP BY p.poll_id, p.poll_question, p.is_active, p.poll_created_at
      ORDER BY p.poll_created_at DESC
    `, [req.userId]);

    res.json({ success: true, polls: result.rows });
  } catch (error) {
    logger.error('Error fetching polls', {
      module: 'routes/polls',
      requestId: req.requestId,
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: { uk: 'Не вдалося отримати опитування', en: 'Failed to fetch polls' },
    });
  }
});

// ── GET /api/polls/results ────────────────────────────────────────────────────
/**
 * Returns vote results for **all** polls (active and closed).
 * Intended for the admin dashboard.
 *
 * **Auth:** admin
 *
 * **Response:**
 * ```json
 * {
 *   "success": true,
 *   "polls": [
 *     {
 *       "poll_id": 1,
 *       "poll_question": "...",
 *       "is_active": false,
 *       "total_votes": 42,
 *       "options": [
 *         { "vote_id": 1, "vote_text": "Option A", "vote_count": 28, "percentage": "66.7" }
 *       ]
 *     }
 *   ]
 * }
 * ```
 */
router.get('/results', authenticateToken, async (req, res) => {
  try {
    if (!(await isAdmin(req.userId))) {
      return res.status(403).json({
        success: false,
        error: { uk: 'Доступ лише для адміністраторів', en: 'Access denied. Admins only.' },
      });
    }

    const pollsResult = await query(`
      SELECT poll_id, poll_question, is_active, poll_created_at
      FROM Polls
      ORDER BY poll_created_at DESC
    `);

    const polls = await Promise.all(
      pollsResult.rows.map(async (poll) => {
        const optionsResult = await query(`
          SELECT
            pv.vote_id,
            pv.vote_text,
            COUNT(puv.user_id) AS vote_count
          FROM PollVotes pv
          LEFT JOIN PollUserVotes puv ON pv.vote_id = puv.vote_id
          WHERE pv.poll_id = $1
          GROUP BY pv.vote_id, pv.vote_text
          ORDER BY COUNT(puv.user_id) DESC, pv.vote_id ASC
        `, [poll.poll_id]);

        const totalVotes = optionsResult.rows.reduce(
          (sum, row) => sum + parseInt(row.vote_count || 0, 10),
          0,
        );

        const options = optionsResult.rows.map((row) => {
          const count = parseInt(row.vote_count || 0, 10);
          return {
            vote_id:    row.vote_id,
            vote_text:  row.vote_text,
            vote_count: count,
            percentage: totalVotes > 0
              ? ((count / totalVotes) * 100).toFixed(1)
              : '0.0',
          };
        });

        return {
          poll_id:         poll.poll_id,
          poll_question:   poll.poll_question,
          is_active:       poll.is_active,
          poll_created_at: poll.poll_created_at,
          total_votes:     totalVotes,
          options,
        };
      }),
    );

    res.json({ success: true, polls });
  } catch (error) {
    logger.error('Error fetching all poll results', {
      module: 'routes/polls',
      requestId: req.requestId,
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: { uk: 'Не вдалося отримати результати опитувань', en: 'Failed to fetch poll results' },
    });
  }
});

// ── GET /api/polls/:pollId ────────────────────────────────────────────────────
/**
 * Returns a single poll with its options, total votes, and the current user's
 * vote (if any).
 *
 * **Auth:** authenticated user
 *
 * **Response:**
 * ```json
 * { "success": true, "poll": { ...poll, options: [...], user_vote, user_has_voted } }
 * ```
 */
router.get('/:pollId', authenticateToken, async (req, res) => {
  const { pollId } = req.params;

  try {
    const pollResult = await query(`
      SELECT
        p.*,
        COUNT(DISTINCT puv.user_id) as total_votes
      FROM Polls p
      LEFT JOIN PollVotes pv ON p.poll_id = pv.poll_id
      LEFT JOIN PollUserVotes puv ON pv.vote_id = puv.vote_id
      WHERE p.poll_id = $1
      GROUP BY p.poll_id
    `, [pollId]);

    if (pollResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { uk: 'Опитування не знайдено', en: 'Poll not found' },
      });
    }

    const optionsResult = await query(`
      SELECT
        pv.vote_id,
        pv.vote_text,
        COUNT(puv.user_id) as vote_count
      FROM PollVotes pv
      LEFT JOIN PollUserVotes puv ON pv.vote_id = puv.vote_id
      WHERE pv.poll_id = $1
      GROUP BY pv.vote_id, pv.vote_text
      ORDER BY pv.vote_created_at
    `, [pollId]);

    let userVote      = null;
    let user_has_voted = false;

    const userVoteResult = await query(`
      SELECT puv.vote_id, pv.vote_text
      FROM PollUserVotes puv
      JOIN PollVotes pv ON puv.vote_id = pv.vote_id
      WHERE pv.poll_id = $1 AND puv.user_id = $2
    `, [pollId, req.userId]);

    if (userVoteResult.rows.length > 0) {
      user_has_voted = true;
      userVote = userVoteResult.rows[0].vote_id;
    }

    res.json({
      success: true,
      poll: {
        ...pollResult.rows[0],
        options: optionsResult.rows,
        user_vote: userVote,
        user_has_voted,
      },
    });
  } catch (error) {
    logger.error('Error fetching poll', {
      module: 'routes/polls',
      requestId: req.requestId,
      pollId,
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: { uk: 'Не вдалося отримати опитування', en: 'Failed to fetch poll' },
    });
  }
});

// ── POST /api/polls ───────────────────────────────────────────────────────────
/**
 * Creates a new poll with its vote options (admin only).
 *
 * **Auth:** admin
 *
 * **Body:**
 * - `poll_question` {string}   Required
 * - `options`       {string[]} Required — minimum 2 items
 *
 * **Response:** `201` with the created poll row.
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    if (!(await isAdmin(req.userId))) {
      return res.status(403).json({
        success: false,
        error: { uk: 'Лише адміністратори можуть створювати опитування', en: 'Only administrators can create polls' },
      });
    }

    const { poll_question, options } = req.body;

    if (!poll_question || !Array.isArray(options) || options.length < 2) {
      return res.status(400).json({
        success: false,
        error: {
          uk: 'poll_question є обов\'язковим, а options має містити мінімум 2 варіанти',
          en: 'poll_question is required and options must be an array with at least 2 items',
        },
      });
    }

    const pollResult = await query(`
      INSERT INTO Polls (poll_question, is_active)
      VALUES ($1, true)
      RETURNING *
    `, [poll_question]);

    const pollId = pollResult.rows[0].poll_id;

    await Promise.all(
      options.map((optionText) =>
        query(
          'INSERT INTO PollVotes (poll_id, vote_text) VALUES ($1, $2)',
          [pollId, optionText],
        ),
      ),
    );

    logger.info('Poll created', {
      module: 'routes/polls',
      requestId: req.requestId,
      pollId,
      userId: req.userId,
    });

    res.status(201).json({ success: true, poll: pollResult.rows[0] });
  } catch (error) {
    logger.error('Error creating poll', {
      module: 'routes/polls',
      requestId: req.requestId,
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: { uk: 'Не вдалося створити опитування', en: 'Failed to create poll' },
    });
  }
});

// ── POST /api/polls/:pollId/vote ──────────────────────────────────────────────
/**
 * Records a vote for the authenticated user.
 * Each user may vote only once per poll.
 *
 * **Auth:** authenticated user
 *
 * **Body:** `{ vote_id: number }`
 *
 * **Response:** `{ "success": true, "message": { uk, en } }`
 */
router.post('/:pollId/vote', authenticateToken, async (req, res) => {
  const { pollId } = req.params;
  const { vote_id } = req.body;

  if (!vote_id) {
    return res.status(400).json({
      success: false,
      error: { uk: 'vote_id є обов\'язковим', en: 'vote_id is required' },
    });
  }

  try {
    const pollCheck = await query(
      'SELECT * FROM Polls WHERE poll_id = $1 AND is_active = true',
      [pollId],
    );

    if (pollCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { uk: 'Опитування не знайдено або воно закрите', en: 'Poll not found or not active' },
      });
    }

    const voteCheck = await query(
      'SELECT * FROM PollVotes WHERE vote_id = $1 AND poll_id = $2',
      [vote_id, pollId],
    );

    if (voteCheck.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: { uk: 'Невірний варіант відповіді для цього опитування', en: 'Invalid vote option for this poll' },
      });
    }

    const existingVote = await query(`
      SELECT puv.*
      FROM PollUserVotes puv
      JOIN PollVotes pv ON puv.vote_id = pv.vote_id
      WHERE pv.poll_id = $1 AND puv.user_id = $2
    `, [pollId, req.userId]);

    if (existingVote.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: { uk: 'Ви вже проголосували в цьому опитуванні', en: 'You have already voted on this poll' },
      });
    }

    await query(
      'INSERT INTO PollUserVotes (vote_id, user_id) VALUES ($1, $2)',
      [vote_id, req.userId],
    );

    res.json({
      success: true,
      message: { uk: 'Голос успішно зараховано', en: 'Vote recorded successfully' },
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({
        success: false,
        error: { uk: 'Ви вже проголосували в цьому опитуванні', en: 'You have already voted on this poll' },
      });
    }

    logger.error('Error recording vote', {
      module: 'routes/polls',
      requestId: req.requestId,
      pollId,
      userId: req.userId,
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: { uk: 'Не вдалося зарахувати голос', en: 'Failed to record vote' },
    });
  }
});

// ── GET /api/polls/:pollId/results ────────────────────────────────────────────
/**
 * Returns vote results for a single poll (public — no auth required).
 *
 * **Auth:** none
 *
 * **Response:**
 * ```json
 * {
 *   "success": true,
 *   "poll_id": 1,
 *   "poll_question": "...",
 *   "results": [ { "vote_id": 1, "vote_text": "...", "vote_count": 28, "percentage": "66.7" } ],
 *   "total_votes": 42,
 *   "poll_active": true
 * }
 * ```
 */
router.get('/:pollId/results', async (req, res) => {
  const { pollId } = req.params;

  try {
    const pollCheck = await query('SELECT * FROM Polls WHERE poll_id = $1', [pollId]);

    if (pollCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { uk: 'Опитування не знайдено', en: 'Poll not found' },
      });
    }

    const result = await query(`
      SELECT
        pv.vote_id,
        pv.vote_text,
        COUNT(puv.user_id) as vote_count
      FROM PollVotes pv
      LEFT JOIN PollUserVotes puv ON pv.vote_id = puv.vote_id
      WHERE pv.poll_id = $1
      GROUP BY pv.vote_id, pv.vote_text
      ORDER BY COUNT(puv.user_id) DESC, pv.vote_created_at ASC
    `, [pollId]);

    const totalVotes = result.rows.reduce(
      (sum, row) => sum + parseInt(row.vote_count || 0, 10),
      0,
    );

    const resultsWithPercentages = result.rows.map((row) => ({
      vote_id:    row.vote_id,
      vote_text:  row.vote_text,
      vote_count: parseInt(row.vote_count || 0, 10),
      percentage: totalVotes > 0
        ? ((parseInt(row.vote_count || 0, 10) / totalVotes) * 100).toFixed(1)
        : '0.0',
    }));

    res.json({
      success:       true,
      poll_id:       parseInt(pollId, 10),
      poll_question: pollCheck.rows[0].poll_question,
      results:       resultsWithPercentages,
      total_votes:   totalVotes,
      poll_active:   pollCheck.rows[0].is_active,
    });
  } catch (error) {
    logger.error('Error fetching poll results', {
      module: 'routes/polls',
      requestId: req.requestId,
      pollId,
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: { uk: 'Не вдалося отримати результати опитування', en: 'Failed to fetch poll results' },
    });
  }
});

// ── PUT /api/polls/:pollId/status ─────────────────────────────────────────────
/**
 * Activates or deactivates a poll (admin only).
 *
 * **Auth:** admin
 *
 * **Body:** `{ is_active: boolean }`
 *
 * **Response:** updated poll row.
 */
router.put('/:pollId/status', authenticateToken, async (req, res) => {
  const { pollId } = req.params;
  const { is_active } = req.body;

  try {
    if (!(await isAdmin(req.userId))) {
      return res.status(403).json({
        success: false,
        error: { uk: 'Лише адміністратори можуть змінювати статус опитування', en: 'Only administrators can update poll status' },
      });
    }

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: { uk: 'is_active має бути булевим значенням', en: 'is_active must be a boolean' },
      });
    }

    const result = await query(
      'UPDATE Polls SET is_active = $1 WHERE poll_id = $2 RETURNING *',
      [is_active, pollId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { uk: 'Опитування не знайдено', en: 'Poll not found' },
      });
    }

    logger.info('Poll status updated', {
      module: 'routes/polls',
      requestId: req.requestId,
      pollId,
      is_active,
      userId: req.userId,
    });

    res.json({
      success: true,
      message: {
        uk: `Опитування ${is_active ? 'активовано' : 'деактивовано'}`,
        en: `Poll ${is_active ? 'activated' : 'deactivated'} successfully`,
      },
      poll: result.rows[0],
    });
  } catch (error) {
    logger.error('Error updating poll status', {
      module: 'routes/polls',
      requestId: req.requestId,
      pollId,
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: { uk: 'Не вдалося змінити статус опитування', en: 'Failed to update poll status' },
    });
  }
});

export default router;
