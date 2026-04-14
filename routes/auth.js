import express from 'express';
import {
  initiateRegistration,
  verifyEmailAndRegister,
  resendVerificationCode,
  login,
  googleAuth,
  facebookAuth
} from '../controllers/authController.js';
import {
  initiateGuestVerification,
  confirmGuestEmail,
  resendGuestVerification,
} from '../controllers/guestController.js';

const router = express.Router();

// Registration routes
router.post('/register/initiate', initiateRegistration);
router.post('/register/verify', verifyEmailAndRegister);
router.post('/register/resend-code', resendVerificationCode);

// Login routes
router.post('/login', login);
router.post('/google', googleAuth);
router.post('/facebook', facebookAuth);

// Guest checkout email verification (no account created)
router.post('/guest/verify/initiate', initiateGuestVerification);
router.post('/guest/verify/confirm', confirmGuestEmail);
router.post('/guest/verify/resend', resendGuestVerification);

export default router;
