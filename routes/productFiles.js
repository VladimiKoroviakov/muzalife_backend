import express from 'express';
import { uploadFiles, getProductFiles, deleteFile } from '../controllers/productFilesController.js';
import { uploadProductFiles } from '../middleware/upload.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(verifyToken);

// Upload files for a product
router.post('/:productId/upload', uploadProductFiles, uploadFiles);

// Get all files for a product
router.get('/:productId/files', getProductFiles);

// Delete a file
router.delete('/files/:fileId', deleteFile);

export { router as productFilesRoutes };