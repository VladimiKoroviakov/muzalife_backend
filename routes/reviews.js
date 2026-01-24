import express from 'express';
import { 
  submitReview, 
  getProductReviews,
  getReviewsByUser,
  // updateReview,
  deleteReview
} from '../controllers/reviewsController.js';
import { authenticateToken } from '../middleware/auth.js';


const router = express.Router();

// Public routes
router.get('/product/:productId', getProductReviews);

// Protected routes (require authentication)
router.get('/user/:userId', getReviewsByUser);
router.use(authenticateToken);
router.post('/', submitReview);
// router.put('/:reviewId', updateReview);
router.delete('/:reviewId', deleteReview);

export default router;