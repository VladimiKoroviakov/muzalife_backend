import express from 'express';
import {
  initiateRegistration,
  verifyEmailAndRegister,
  resendVerificationCode,
  login,
  googleAuth,
  facebookAuth
} from '../controllers/authController.js';

const router = express.Router();

// Registration routes
router.post('/register/initiate', initiateRegistration);
router.post('/register/verify', verifyEmailAndRegister);
router.post('/register/resend-code', resendVerificationCode);

// Login routes
router.post('/login', login);
router.post('/google', googleAuth);
router.post('/facebook', facebookAuth);

export default router;