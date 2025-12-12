import express from 'express';
import { 
  submitReview, 
  getProductReviews,
  getReviewById,
  updateReview,
  deleteReview
} from '../controllers/reviewsController.js';
import { authenticateToken } from '../middleware/auth.js';


const router = express.Router();

// Public routes
router.get('/product/:productId', getProductReviews);
router.get('/:reviewId', getReviewById);

// Protected routes (require authentication)
router.use(authenticateToken);
router.post('/', submitReview);
router.put('/:reviewId', updateReview);
router.delete('/:reviewId', deleteReview);

export default router;