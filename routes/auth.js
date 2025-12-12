import express from 'express';
import { 
  register, 
  login, 
  googleAuth, 
  facebookAuth,
  getCurrentUser 
} from '../controllers/authController.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/google', googleAuth);
router.post('/facebook', facebookAuth);

export default router;