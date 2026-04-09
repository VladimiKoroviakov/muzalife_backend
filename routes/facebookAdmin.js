/**
 * @file Admin Facebook posting route for MuzaLife.
 *
 * Provides a single admin-only endpoint that publishes a product promotion
 * to the Muzalife Facebook page via the Graph API (v20.0).
 *
 * **Image resolution strategy:**
 * - If the admin uploads images in the request, those are forwarded to Facebook.
 * - Otherwise the product's stored main image is read from disk and uploaded.
 *
 * **Environment variables required:**
 * - `FACEBOOK_PAGE_ID`           — numeric ID of the target Facebook page.
 * - `FACEBOOK_PAGE_ACCESS_TOKEN` — long-lived page access token.
 * @module routes/facebookAdmin
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';
import axios from 'axios';

import pool from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import logger from '../utils/logger.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

const FB_API     = 'https://graph.facebook.com/v20.0';

// ── Multer — temporary storage for admin-uploaded images ──────────────────────
const tempStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(UPLOADS_DIR, 'temp');
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
    cb(null, unique);
  },
});

const imageUpload = multer({
  storage: tempStorage,
  fileFilter: (_req, file, cb) => {
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (allowed.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype}`), false);
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 },
}).fields([{ name: 'images', maxCount: 10 }]);

// ── Auth & admin guard ────────────────────────────────────────────────────────
router.use(authenticateToken);

/**
 * Verifies that the authenticated user is an admin.
 * Rejects the request with 403 if not.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @param {Function} next - Express next function.
 * @returns {Promise<void>}
 */
const requireAdmin = async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT is_admin FROM Users WHERE user_id = $1',
      [req.userId],
    );
    if (!result.rows[0]?.is_admin) {
      return res.status(403).json({ success: false, error: 'Access denied. Admins only.' });
    }
    next();
  } catch (err) {
    logger.error('Admin check failed in facebookAdmin', {
      module: 'routes/facebookAdmin',
      requestId: req.requestId,
      error: err.message,
    });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

router.use(requireAdmin);

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Uploads an image binary to the Facebook page and returns the photo ID.
 * The `access_token` is passed as a URL query parameter — required by the
 * Graph API when the body is multipart/form-data.
 * @param {string} filePath    Absolute path to the image file on disk.
 * @param {string} mimeType    MIME type of the image (e.g. `'image/jpeg'`).
 * @param {string} pageId      Facebook page ID.
 * @param {string} pageToken   Facebook page access token.
 * @param {boolean} published  Whether to publish the photo immediately.
 * @param {string} [message]   Post text to attach (only used when `published` is true).
 * @returns {Promise<string>}  The Facebook photo ID.
 * @throws {Error}  If the Graph API returns an error.
 */
async function uploadPhoto(filePath, mimeType, pageId, pageToken, published, message) {
  const buf  = fs.readFileSync(filePath);
  const blob = new Blob([buf], { type: mimeType });
  const fd   = new FormData();
  fd.append('source', blob, path.basename(filePath));
  fd.append('published', published ? 'true' : 'false');
  if (published && message) {
    fd.append('message', message);
  }

  // access_token must be in the URL query string for multipart requests
  const url = `${FB_API}/${pageId}/photos?access_token=${encodeURIComponent(pageToken)}`;
  const res  = await fetch(url, { method: 'POST', body: fd });
  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(data.error?.message ?? `Facebook photo upload failed (HTTP ${res.status})`);
  }
  return data.id;
}

/**
 * Derives the absolute local file-system path for a product image that is
 * served under the `/uploads/` static route.
 * @param {string} imageUrl  Full URL as stored in the DB
 *   (e.g. `https://localhost:5001/uploads/products/3/main.jpg`).
 * @returns {string}  Absolute path on disk.
 */
function localPathFromUrl(imageUrl) {
  const { pathname } = new URL(imageUrl);                // /uploads/products/3/main.jpg
  const relative     = pathname.replace(/^\/uploads/, ''); // /products/3/main.jpg
  return path.join(UPLOADS_DIR, relative);
}

/**
 * Infers the MIME type from a file path or URL based on its extension.
 * Defaults to `image/jpeg` for unknown extensions.
 * @param {string} filePath  File path or URL.
 * @returns {string}  MIME type string.
 */
function mimeFromPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
  return map[ext] ?? 'image/jpeg';
}

// ── POST /facebook/post ───────────────────────────────────────────────────────
/**
 * Publishes a product promotion post to the Muzalife Facebook page.
 *
 * Accepts `multipart/form-data` with:
 * - `productId` {string}  Required. ID of the product to promote.
 * - `text`      {string}  Optional. Post caption; defaults to product description.
 * - `images`    {File[]}  Optional. Images to attach; defaults to product main image.
 * @returns {{ success: true }} on success.
 * @returns {{ success: false, error: string }} on failure.
 */
router.post('/facebook/post', (req, res, next) => {
  imageUpload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ success: false, error: `File upload error: ${err.message}` });
    }
    if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
    next();
  });
}, async (req, res) => {
  const tempFiles = req.files?.images ?? [];

  try {
    // ── Validate env config ─────────────────────────────────────────────────
    const pageId    = process.env.FACEBOOK_PAGE_ID;
    const pageToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

    if (!pageId || !pageToken) {
      logger.error('Facebook env vars missing', { module: 'routes/facebookAdmin' });
      return res.status(500).json({
        success: false,
        error: 'Facebook integration is not configured on the server.',
      });
    }

    // ── Validate productId ──────────────────────────────────────────────────
    const productId = parseInt(req.body?.productId, 10);
    if (!productId || productId < 1) {
      return res.status(400).json({ success: false, error: 'Invalid or missing productId.' });
    }

    // ── Fetch product + all its images from DB ─────────────────────────────
    const { rows } = await pool.query(
      `SELECT
         p.product_description,
         p.product_main_img_url,
         ARRAY_AGG(i.image_url) FILTER (WHERE i.image_url IS NOT NULL) AS additional_images
       FROM Products p
       LEFT JOIN ProductImages pi ON p.product_id = pi.product_id
       LEFT JOIN Images i ON pi.image_id = i.image_id
       WHERE p.product_id = $1
       GROUP BY p.product_id`,
      [productId],
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Product not found.' });
    }
    const product = rows[0];

    // ── Resolve post text ───────────────────────────────────────────────────
    const text = req.body?.text?.trim() || product.product_description;

    // ── Resolve images ──────────────────────────────────────────────────────
    // Admin-uploaded images take priority; otherwise use all product images
    // (main image first, then any additional gallery images).
    let images; // { path: string, mimetype: string }[]
    if (tempFiles.length > 0) {
      images = tempFiles.map((f) => ({ path: f.path, mimetype: f.mimetype }));
    } else {
      const allUrls = [
        product.product_main_img_url,
        ...(product.additional_images ?? []),
      ];
      images = allUrls.map((url) => ({
        path: localPathFromUrl(url),
        mimetype: mimeFromPath(url),
      }));
    }

    // ── Upload & publish ────────────────────────────────────────────────────
    if (images.length === 1) {
      // Single image: upload directly as published with caption in one step.
      await uploadPhoto(images[0].path, images[0].mimetype, pageId, pageToken, true, text);
    } else {
      // Multiple images: upload each as unpublished, then create a feed post
      // with all photos attached via attached_media.
      const photoIds = await Promise.all(
        images.map((img) => uploadPhoto(img.path, img.mimetype, pageId, pageToken, false)),
      );

      const fbRes = await axios.post(`${FB_API}/${pageId}/feed`, {
        message: text,
        attached_media: photoIds.map((id) => ({ media_fbid: id })),
        access_token: pageToken,
      });
      if (fbRes.data?.error) {
        throw new Error(fbRes.data.error.message);
      }
    }

    logger.info('Facebook post published', {
      module: 'routes/facebookAdmin',
      requestId: req.requestId,
      productId,
    });

    res.json({ success: true });

  } catch (err) {
    logger.error('Failed to publish Facebook post', {
      module: 'routes/facebookAdmin',
      requestId: req.requestId,
      error: err.message,
    });
    res.status(502).json({ success: false, error: err.message });
  } finally {
    // Clean up only the temp files uploaded in this request.
    for (const f of tempFiles) {
      if (fs.existsSync(f.path)) {
        fs.unlinkSync(f.path);
      }
    }
  }
});

export default router;
