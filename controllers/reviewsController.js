import pool from "../config/database.js";
import { constructFullUrl } from '../utils/urlHelper.js';

// GET /api/reviews/product/:productId - Get all reviews for a specific product
export const getProductReviews = async (req, res) => {
  try {
    const productId = parseInt(req.params.productId);
    
    if (isNaN(productId)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    const query = `
      SELECT 
        r.review_id,
        r.review_rating,
        r.review_text,
        pr.review_created_at,
        pr.product_id,
        u.user_id,
        u.user_name,
        u.user_avatar_url
      FROM Reviews r
      JOIN ProductReviews pr ON r.review_id = pr.review_id
      JOIN Users u ON pr.user_id = u.user_id
      WHERE pr.product_id = $1
      ORDER BY pr.review_created_at DESC
    `;
    
    const result = await pool.query(query, [productId]);
    
    // Transform the data to match your frontend Review type
    const reviews = result.rows.map(review => ({
      id: review.review_id,
      productId: review.product_id,
      userId: review.user_id,
      userName: review.user_name,
      userInitials: review.user_name,
      userAvatar: constructFullUrl(req, review.user_avatar_url) || null,
      rating: review.review_rating,
      comment: review.review_text,
      createdAt: review.review_created_at
    }));

    res.json(reviews);
  } catch (error) {
    console.error('Error fetching product reviews:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/reviews/user/:userId - Get all reviews by a specific user
export const getReviewsByUser = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const query = `
      SELECT 
        r.review_id as id,
        r.review_text as comment,
        r.review_rating as rating,
        u.user_id as "userId",
        u.user_name as "userName",
        COALESCE(
          NULLIF(u.user_avatar_url, ''),
          CONCAT(
            'https://ui-avatars.com/api/?name=', 
            REPLACE(u.user_name, ' ', '+'),
            '&background=random'
          )
        ) as "userAvatar",
        SUBSTRING(u.user_name FROM 1 FOR 2) as "userInitials",
        pr.product_id as "productId",
        pr.review_created_at as "createdAt"
      FROM Reviews r
      INNER JOIN ProductReviews pr ON r.review_id = pr.review_id
      INNER JOIN Users u ON pr.user_id = u.user_id
      WHERE pr.user_id = $1
      ORDER BY pr.review_created_at DESC
    `;

    const result = await pool.query(query, [userId]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching user reviews:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/reviews - Submit a new review
export const submitReview = async (req, res) => {
  try {
    const userId = req.userId;
    const { productId, rating, comment } = req.body;

    // Validate input
    if (!productId || !rating || !comment) {
      return res.status(400).json({ error: 'Product ID, rating, and comment are required' });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    // Check if user already reviewed this product
    const existingReviewQuery = `
      SELECT r.review_id 
      FROM Reviews r
      INNER JOIN ProductReviews pr ON r.review_id = pr.review_id
      WHERE pr.user_id = $1 AND pr.product_id = $2
    `;

    const existingReview = await pool.query(existingReviewQuery, [userId, productId]);
    
    if (existingReview.rows.length > 0) {
      return res.status(409).json({ error: 'You have already reviewed this product' });
    }

    // Start transaction
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // 1. Insert into Reviews table
      const insertReviewQuery = `
        INSERT INTO Reviews (review_text, review_rating)
        VALUES ($1, $2)
        RETURNING review_id
      `;
      
      const reviewResult = await client.query(insertReviewQuery, [comment, rating]);
      const reviewId = reviewResult.rows[0].review_id;

      // 2. Insert into ProductReviews junction table
      const insertProductReviewQuery = `
        INSERT INTO ProductReviews (review_id, user_id, product_id, review_created_at)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      `;
      
      await client.query(insertProductReviewQuery, [reviewId, userId, productId]);

      // 3. Update product rating (average)
      const updateProductRatingQuery = `
        UPDATE Products 
        SET product_rating = (
          SELECT AVG(r.review_rating) 
          FROM Reviews r
          INNER JOIN ProductReviews pr ON r.review_id = pr.review_id
          WHERE pr.product_id = $1
        ),
        product_updated_at = CURRENT_TIMESTAMP
        WHERE product_id = $1
      `;
      
      await client.query(updateProductRatingQuery, [productId]);

      await client.query('COMMIT');

      // Return the created review
      const newReviewQuery = `
        SELECT 
          r.review_id as id,
          r.review_text as comment,
          r.review_rating as rating,
          u.user_id as "userId",
          u.user_name as "userName",
          COALESCE(
            NULLIF(u.user_avatar_url, ''),
            CONCAT(
              'https://ui-avatars.com/api/?name=', 
              REPLACE(u.user_name, ' ', '+'),
              '&background=random'
            )
          ) as "userAvatar",
          SUBSTRING(u.user_name FROM 1 FOR 2) as "userInitials",
          pr.product_id as "productId",
          pr.review_created_at as "createdAt"
        FROM Reviews r
        INNER JOIN ProductReviews pr ON r.review_id = pr.review_id
        INNER JOIN Users u ON pr.user_id = u.user_id
        WHERE r.review_id = $1
      `;

      const newReviewResult = await client.query(newReviewQuery, [reviewId]);
      
      res.status(201).json(newReviewResult.rows[0]);
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Error submitting review:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// // PUT /api/reviews/:reviewId - Update a review
// export const updateReview = async (req, res) => {
//   try {
//     const userId = req.user.userId;
//     const reviewId = parseInt(req.params.reviewId);
//     const { rating, comment } = req.body;

//     if (isNaN(reviewId)) {
//       return res.status(400).json({ error: 'Invalid review ID' });
//     }

//     if (rating && (rating < 1 || rating > 5)) {
//       return res.status(400).json({ error: 'Rating must be between 1 and 5' });
//     }

//     // Check if review exists and belongs to user
//     const checkQuery = `
//       SELECT pr.product_id 
//       FROM ProductReviews pr 
//       WHERE pr.review_id = $1 AND pr.user_id = $2
//     `;

//     const checkResult = await pool.query(checkQuery, [reviewId, userId]);
    
//     if (checkResult.rows.length === 0) {
//       return res.status(404).json({ error: 'Review not found or access denied' });
//     }

//     const productId = checkResult.rows[0].product_id;

//     // Update review
//     const updateQuery = `
//       UPDATE Reviews 
//       SET review_text = COALESCE($1, review_text),
//           review_rating = COALESCE($2, review_rating),
//       WHERE review_id = $3
//       RETURNING *
//     `;

//     const updateResult = await pool.query(updateQuery, [comment, rating, reviewId]);

//     // Update product rating
//     const updateProductRatingQuery = `
//       UPDATE Products 
//       SET product_rating = (
//         SELECT AVG(r.review_rating) 
//         FROM Reviews r
//         INNER JOIN ProductReviews pr ON r.review_id = pr.review_id
//         WHERE pr.product_id = $1
//       ),
//       product_updated_at = CURRENT_TIMESTAMP
//       WHERE product_id = $1
//     `;
    
//     await pool.query(updateProductRatingQuery, [productId]);

//     res.json(updateResult.rows[0]);
//   } catch (error) {
//     console.error('Error updating review:', error);
//     res.status(500).json({ error: 'Internal server error' });
//   }
// };

// DELETE /api/reviews/:reviewId - Delete a review
export const deleteReview = async (req, res) => {
  try {
    const userId = req.user.userId;
    const reviewId = parseInt(req.params.reviewId);

    if (isNaN(reviewId)) {
      return res.status(400).json({ error: 'Invalid review ID' });
    }

    // Check if review exists and belongs to user
    const checkQuery = `
      SELECT pr.product_id 
      FROM ProductReviews pr 
      WHERE pr.review_id = $1 AND pr.user_id = $2
    `;

    const checkResult = await pool.query(checkQuery, [reviewId, userId]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Review not found or access denied' });
    }

    const productId = checkResult.rows[0].product_id;

    // Delete review (cascade will handle ProductReviews due to ON DELETE CASCADE)
    const deleteQuery = 'DELETE FROM Reviews WHERE review_id = $1';
    await pool.query(deleteQuery, [reviewId]);

    // Update product rating
    const updateProductRatingQuery = `
      UPDATE Products 
      SET product_rating = COALESCE((
        SELECT AVG(r.review_rating) 
        FROM Reviews r
        INNER JOIN ProductReviews pr ON r.review_id = pr.review_id
        WHERE pr.product_id = $1
      ), 0),
      product_updated_at = CURRENT_TIMESTAMP
      WHERE product_id = $1
    `;
    
    await pool.query(updateProductRatingQuery, [productId]);

    res.json({ message: 'Review deleted successfully' });
  } catch (error) {
    console.error('Error deleting review:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};