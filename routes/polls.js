import express from 'express';
import { query } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get all active polls
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;

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
    `, [userId]);

    res.json({
      success: true,
      polls: result.rows
    });
  } catch (error) {
    console.error('Error fetching polls:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch polls',
      details: error.message
    });
  }
});

// Get a specific poll with options and user vote (if authenticated)
router.get('/:pollId', authenticateToken, async (req, res) => {
  try {
    const { pollId } = req.params;
    const userId = req.userId;

    console.log(`Fetching poll ${pollId} for user ${userId}`);

    // Get poll details with total votes
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
        error: 'Poll not found'
      });
    }

    // Get poll options with individual vote counts
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

    // Check if current user has voted on this poll and get their vote
    let userVote = null;
    let user_has_voted = false;
    
    if (userId) {
      const userVoteResult = await query(`
        SELECT 
          puv.vote_id,
          pv.vote_text
        FROM PollUserVotes puv
        JOIN PollVotes pv ON puv.vote_id = pv.vote_id
        WHERE pv.poll_id = $1 AND puv.user_id = $2
      `, [pollId, userId]);
      
      if (userVoteResult.rows.length > 0) {
        user_has_voted = true;
        userVote = userVoteResult.rows[0].vote_id;
      }
    }

    // Build the complete poll response
    const poll = {
      ...pollResult.rows[0],
      options: optionsResult.rows,
      user_vote: userVote,
      user_has_voted: user_has_voted
    };

    res.json({
      success: true,
      poll
    });
  } catch (error) {
    console.error('Error fetching poll:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch poll',
      details: error.message
    });
  }
});

// Vote on a poll
router.post('/:pollId/vote', authenticateToken, async (req, res) => {
  try {
    const { pollId } = req.params;
    const { vote_id } = req.body;
    const userId = req.userId;

    console.log(`User ${userId} voting on poll ${pollId} for option ${vote_id}`);

    if (!vote_id) {
      return res.status(400).json({
        success: false,
        error: 'Vote ID is required'
      });
    }

    // Check if poll exists and is active
    const pollCheck = await query(`
      SELECT * FROM Polls 
      WHERE poll_id = $1 AND is_active = true
    `, [pollId]);

    if (pollCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Poll not found or not active'
      });
    }

    // Check if vote option exists AND belongs to this poll
    const voteCheck = await query(`
      SELECT * FROM PollVotes 
      WHERE vote_id = $1 AND poll_id = $2
    `, [vote_id, pollId]);
    
    if (voteCheck.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid vote option for this poll'
      });
    }

    // Check if user has already voted on this poll
    const existingVote = await query(`
      SELECT puv.* 
      FROM PollUserVotes puv
      JOIN PollVotes pv ON puv.vote_id = pv.vote_id
      WHERE pv.poll_id = $1 AND puv.user_id = $2
    `, [pollId, userId]);

    if (existingVote.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'You have already voted on this poll'
      });
    }

    // Record the vote (no poll_id in PollUserVotes table)
    await query(`
      INSERT INTO PollUserVotes (vote_id, user_id) 
      VALUES ($1, $2)
    `, [vote_id, userId]);

    res.json({
      success: true,
      message: 'Vote recorded successfully'
    });
  } catch (error) {
    console.error('Error recording vote:', error);
    
    // Check for duplicate vote constraint violation
    if (error.code === '23505') { // PostgreSQL unique violation
      return res.status(400).json({
        success: false,
        error: 'You have already voted on this poll'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to record vote',
      details: error.message
    });
  }
});

// Get poll results (vote counts for each option)
router.get('/:pollId/results', async (req, res) => {
  try {
    const { pollId } = req.params;

    // First check if poll exists
    const pollCheck = await query(`
      SELECT * FROM Polls WHERE poll_id = $1
    `, [pollId]);

    if (pollCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Poll not found'
      });
    }

    // Get all options for this poll with vote counts
    const result = await query(`
      SELECT 
        pv.vote_id, 
        pv.vote_text, 
        COUNT(puv.user_id) as vote_count
      FROM PollVotes pv
      LEFT JOIN PollUserVotes puv ON pv.vote_id = puv.vote_id
      WHERE pv.poll_id = $1
      GROUP BY pv.vote_id, pv.vote_text
      ORDER BY 
        COUNT(puv.user_id) DESC,
        pv.vote_created_at ASC
    `, [pollId]);

    // Calculate total votes
    const totalVotes = result.rows.reduce((sum, row) => sum + parseInt(row.vote_count || 0), 0);

    // Add percentages to each option
    const resultsWithPercentages = result.rows.map(row => ({
      vote_id: row.vote_id,
      vote_text: row.vote_text,
      vote_count: parseInt(row.vote_count || 0),
      percentage: totalVotes > 0 
        ? ((parseInt(row.vote_count || 0) / totalVotes) * 100).toFixed(1)
        : "0.0"
    }));

    res.json({
      success: true,
      poll_id: parseInt(pollId),
      poll_question: pollCheck.rows[0].poll_question,
      results: resultsWithPercentages,
      total_votes: totalVotes,
      poll_active: pollCheck.rows[0].is_active
    });
  } catch (error) {
    console.error('Error fetching poll results:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch poll results',
      details: error.message
    });
  }
});

// Update poll status (admin only)
router.put('/:pollId/status', authenticateToken, async (req, res) => {
  try {
    const { pollId } = req.params;
    const { is_active } = req.body;
    const userId = req.user.user_id;

    // Check if user is admin
    const userCheck = await query('SELECT is_admin FROM Users WHERE user_id = $1', [userId]);
    if (!userCheck.rows[0]?.is_admin) {
      return res.status(403).json({
        success: false,
        error: 'Only administrators can update poll status'
      });
    }

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'is_active must be a boolean'
      });
    }

    const result = await query(`
      UPDATE Polls 
      SET is_active = $1 
      WHERE poll_id = $2 
      RETURNING *
    `, [is_active, pollId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Poll not found'
      });
    }

    res.json({
      success: true,
      message: `Poll ${is_active ? 'activated' : 'deactivated'} successfully`,
      poll: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating poll status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update poll status',
      details: error.message
    });
  }
});

// ------- CHECK THIS ONE -------
// Create a new poll (admin only) 
router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;

    // Check if user is admin
    const userCheck = await query('SELECT is_admin FROM Users WHERE user_id = $1', [userId]);
    if (!userCheck.rows[0]?.is_admin) {
      return res.status(403).json({
        success: false,
        error: 'Only administrators can create polls'
      });
    }

    const { poll_question, options } = req.body;

    if (!poll_question || !Array.isArray(options) || options.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Invalid poll question or options'
      });
    }

    // Create the poll
    const pollResult = await query(`
      INSERT INTO Polls (poll_question, is_active) 
      VALUES ($1, true) 
      RETURNING *
    `, [poll_question]);

    const pollId = pollResult.rows[0].poll_id;

    // Insert poll options
    const insertOptionsPromises = options.map(optionText => {
      return query(`
        INSERT INTO PollVotes (poll_id, vote_text) 
        VALUES ($1, $2)
      `, [pollId, optionText]);
    });

    await Promise.all(insertOptionsPromises);

    res.status(201).json({
      success: true,
      poll: pollResult.rows[0]
    });
  } catch (error) {
    console.error('Error creating poll:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create poll',
      details: error.message
    });
  }
});

export default router;