import express from 'express';
import { 
  getProfile,
  updateName,
  changePassword,
  uploadProfileImage,
  removeProfileImage,
  deleteAccount,
  resendMaterial,
  initiateEmailChange,
  verifyEmailChange,
  resendEmailChangeCode
} from '../controllers/usersController.js';
import { authenticateToken } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../uploads/profiles');
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    cb(null, `profile-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// All routes require authentication
router.use(authenticateToken);

// Profile routes
router.get('/profile', getProfile);
router.put('/profile/name', updateName);
router.post('/change-password', changePassword);
router.post('/profile/image', upload.single('image'), uploadProfileImage);
router.delete('/profile/image', removeProfileImage);
router.delete('/account', deleteAccount);

// Email change routes
router.post('/email/change/initiate', initiateEmailChange);
router.post('/email/change/verify', verifyEmailChange);
router.post('/email/change/resend-code', resendEmailChangeCode);

// Material routes
router.post('/resend-material', resendMaterial);

export default router;