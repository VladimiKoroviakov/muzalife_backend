/**
 * @file Products REST API routes for MuzaLife.
 *
 * Provides endpoints for retrieving, creating, updating and deleting products.
 * Results are cached in-memory using {@link module:utils/cache} to avoid
 * repeating expensive multi-join PostgreSQL queries on every request.
 *
 * **Cache strategy:**
 * - `GET /api/products`    — cached under `"products:all"` for 5 minutes.
 * - `GET /api/products/:id` — cached under `"products:<id>"` for 5 minutes.
 * - Cache is invalidated for the affected key on any write (POST/PUT/DELETE).
 *
 * **File upload strategy (POST / PUT):**
 * Files are saved to `uploads/temp/` by multer during parsing, then moved into
 * `uploads/products/<productId>/` once the DB insert returns a stable product
 * ID.  Everything runs inside a Postgres transaction so a failed DB write
 * triggers a rollback *and* temp-file cleanup.
 * @module routes/products
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';

const router = express.Router();

import pool from '../config/database.js';
import { appCache, TTL_PRODUCTS_LIST, TTL_PRODUCT_SINGLE } from '../utils/cache.js';
import { authenticateToken } from '../middleware/auth.js';
import logger from '../utils/logger.js';
import { applyWatermark } from '../utils/watermark.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

// ── Multer — temporary storage for product creation / updates ─────────────────
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

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/x-rar-compressed',
  'application/octet-stream', // .rar on some clients
  'image/jpeg',
  'image/png',
]);

const productUpload = multer({
  storage: tempStorage,
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype}`), false);
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
}).fields([
  { name: 'mainImage', maxCount: 1  },
  { name: 'images',    maxCount: 10 },
  { name: 'files',     maxCount: 10 },
]);

// ── Shared SQL fragment ───────────────────────────────────────────────────────
const PRODUCT_SELECT = `
  SELECT
    p.product_id AS id,
    p.product_title AS title,
    p.product_description AS description,
    p.product_main_img_url AS image,
    p.product_price AS price,
    p.product_rating AS rating,

    pt.product_type_id AS type_id,
    pt.product_type_name AS type,

    p.product_created_at AS createdAt,
    p.product_updated_at AS updatedAt,

    ARRAY_AGG(DISTINCT ac.age_category_name) AS ageCategories,
    ARRAY_AGG(DISTINCT e.event_name)         AS events,
    ARRAY_AGG(DISTINCT i.image_url)          AS additionalImages

  FROM products p
  JOIN producttypes pt ON pt.product_type_id = p.product_type_id

  LEFT JOIN productagecategories pac ON p.product_id = pac.product_id
  LEFT JOIN agecategories ac         ON pac.age_category_id = ac.age_category_id
  LEFT JOIN productevents pe         ON p.product_id = pe.product_id
  LEFT JOIN events e                 ON pe.event_id = e.event_id
  LEFT JOIN productimages pi         ON p.product_id = pi.product_id
  LEFT JOIN images i                 ON pi.image_id = i.image_id
`;

const PRODUCT_GROUP_BY = `
  GROUP BY
    p.product_id,
    pt.product_type_id,
    pt.product_type_name,
    p.product_title,
    p.product_description,
    p.product_main_img_url,
    p.product_price,
    p.product_rating,
    p.product_created_at,
    p.product_updated_at
`;

/**
 * Transforms a raw DB row into the API response shape.
 * @param {object} product - Raw row from the PostgreSQL query.
 * @returns {object} Transformed product object for API response.  Fields:
 * - `id`            {number}
 * - `title`         {string}
 * - `description`   {string}
 * - `image`         {string|null} URL of the main image, or null if none
 * - `price`         {number}
 * - `rating`        {number}
 * - `type`          {string} Product type name
 * - `ageCategory`    {string[]} Array of age category names (empty if none)
 * - `events`         {string[]} Array of event names (empty if none)
 * - `additionalImages` {string[]} Array of additional image URLs (empty if none)
 * - `createdAt`      {string} ISO timestamp
 * - `updatedAt`      {string} ISO timestamp
 * Note: the `ageCategory` and `events` fields are aggregated as arrays in the SQL query;
 */
const transformProduct = (product) => ({
  id: product.id,
  title: product.title,
  price: parseFloat(product.price),
  rating: parseFloat(product.rating),
  type: product.type,
  image: product.image,
  ageCategory:      (product.agecategories    || []).filter(Boolean),
  events:           (product.events           || []).filter(Boolean),
  description:      product.description,
  createdAt:        product.createdat,
  updatedAt:        product.updatedat,
  additionalImages: (product.additionalimages || []).filter(Boolean),
});

// ── Helper: fire-and-forget view tracking ─────────────────────────────────────
/**
 * Records a product view asynchronously without blocking the response.
 * Failures are logged as warnings and swallowed — a broken view counter
 * must never degrade the product detail response.
 * @param {number} productId - ID of the product being viewed.
 * @param {string} requestId - Request correlation ID for log tracing.
 * @returns {void} No return value — errors are swallowed after logging.
 */
const recordView = (productId, requestId) => {
  pool.query(
    'INSERT INTO ProductViews (product_id) VALUES ($1)',
    [productId],
  ).catch((err) =>
    logger.warn('Failed to record product view', {
      module: 'routes/products',
      requestId,
      productId,
      error: err.message,
    }),
  );
};

// ── Helper: check admin ───────────────────────────────────────────────────────
const isAdmin = async (client, userId) => {
  const result = await client.query(
    'SELECT is_admin FROM Users WHERE user_id = $1',
    [userId],
  );
  return result.rows[0]?.is_admin === true;
};

// ── Helper: move uploaded file to the product directory ───────────────────────
const moveToProductDir = (file, productId, baseUrl = 'https://localhost:5001') => {
  const destDir = path.join(UPLOADS_DIR, 'products', String(productId));
  if (!fs.existsSync(destDir)) { fs.mkdirSync(destDir, { recursive: true }); }
  const destPath = path.join(destDir, file.filename);
  fs.renameSync(file.path, destPath);

  const relativePath = `/uploads/products/${productId}/${file.filename}`;

  // Store absolute URL for consistency with existing data
  return baseUrl ? `${baseUrl}${relativePath}` : relativePath;
};

// ── Helper: clean up temp files on error ─────────────────────────────────────
const cleanupTempFiles = (reqFiles) => {
  if (!reqFiles) { return; }
  const all = [
    ...(reqFiles.mainImage || []),
    ...(reqFiles.images    || []),
    ...(reqFiles.files     || []),
  ];
  for (const f of all) {
    if (fs.existsSync(f.path)) { fs.unlinkSync(f.path); }
  }
};

// ── GET /api/products ─────────────────────────────────────────────────────────
/**
 * Returns the full product catalogue with all related data.
 *
 * **Optimisation:** the result set is cached for {@link TTL_PRODUCTS_LIST}
 * milliseconds.  Cache hits skip the DB round-trip entirely; a
 * `X-Cache: HIT` / `MISS` header is sent for observability.
 */
router.get('/', async (req, res) => {
  const CACHE_KEY = 'products:all';

  const cached = appCache.get(CACHE_KEY);
  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    logger.debug('Products list served from cache', {
      module: 'routes/products',
      requestId: req.requestId,
    });
    return res.json(cached);
  }

  res.setHeader('X-Cache', 'MISS');
  try {
    const queryText = `${PRODUCT_SELECT} WHERE p.product_hidden = false ${PRODUCT_GROUP_BY} ORDER BY p.product_id`;
    const dbStart   = Date.now();
    const result    = await pool.query(queryText);
    const dbMs      = Date.now() - dbStart;

    logger.debug('Products DB query completed', {
      module: 'routes/products',
      requestId: req.requestId,
      rowCount: result.rowCount,
      dbMs,
    });

    const products = result.rows.map(transformProduct);
    appCache.set(CACHE_KEY, products, TTL_PRODUCTS_LIST);

    res.json(products);
  } catch (error) {
    logger.error('Error fetching products', {
      module: 'routes/products',
      requestId: req.requestId,
      error: error.message,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/products/:id ─────────────────────────────────────────────────────
/**
 * Returns a single product by its numeric ID.
 *
 * Result is cached per-product under `"products:<id>"` for
 * {@link TTL_PRODUCT_SINGLE} milliseconds.
 */
router.get('/:id', async (req, res) => {
  const productId = parseInt(req.params.id);

  if (isNaN(productId)) {
    return res.status(400).json({ error: 'Invalid product ID' });
  }

  const CACHE_KEY = `products:${productId}`;

  const cached = appCache.get(CACHE_KEY);
  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    recordView(productId, req.requestId);
    return res.json(cached);
  }

  res.setHeader('X-Cache', 'MISS');
  try {
    const queryText = `${PRODUCT_SELECT} WHERE p.product_id = $1 AND p.product_hidden = false ${PRODUCT_GROUP_BY}`;
    const result    = await pool.query(queryText, [productId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const product = transformProduct(result.rows[0]);
    appCache.set(CACHE_KEY, product, TTL_PRODUCT_SINGLE);

    recordView(productId, req.requestId);
    res.json(product);
  } catch (error) {
    logger.error('Error fetching product', {
      module: 'routes/products',
      requestId: req.requestId,
      productId,
      error: error.message,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/products ────────────────────────────────────────────────────────
/**
 * Creates a new product (admin only).
 *
 * Accepts `multipart/form-data` with the following fields:
 * - `title`          {string}   Product title (required)
 * - `description`    {string}   Product description (required)
 * - `price`          {number}   Price (required)
 * - `typeId`         {number}   Product type ID FK (required)
 * - `hidden`         {boolean}  Whether product is hidden (optional, default false)
 * - `ageCategoryIds` {number[]} Age category IDs (optional, comma-separated or repeated)
 * - `eventIds`       {number[]} Event IDs (optional, comma-separated or repeated)
 * - `mainImage`      {file}     Primary product image (.png/.jpg)
 * - `images`         {file[]}   Additional gallery images (.png/.jpg)
 * - `files`          {file[]}   Downloadable product files (.rar/.zip/.docx/.pdf/.pptx/.png/.jpg)
 */
router.post('/', authenticateToken, (req, res, next) => {
  productUpload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: `File upload error: ${err.message}` });
    }
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // ── Admin check ───────────────────────────────────────────────────────────
    if (!(await isAdmin(client, req.userId))) {
      await client.query('ROLLBACK');
      cleanupTempFiles(req.files);
      return res.status(403).json({ success: false, error: 'Admins only' });
    }

    // ── Validate required fields ──────────────────────────────────────────────
    const { title, description, price, typeId, hidden, ageCategoryIds, eventIds } = req.body;

    if (!title || !description || !price || !typeId) {
      await client.query('ROLLBACK');
      cleanupTempFiles(req.files);
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: title, description, price, typeId',
      });
    }

    const parsedPrice  = parseFloat(price);
    const parsedTypeId = parseInt(typeId, 10);

    if (isNaN(parsedPrice) || isNaN(parsedTypeId)) {
      await client.query('ROLLBACK');
      cleanupTempFiles(req.files);
      return res.status(400).json({ success: false, error: 'price and typeId must be numbers' });
    }

    if (!req.files?.mainImage?.[0]) {
      await client.query('ROLLBACK');
      cleanupTempFiles(req.files);
      return res.status(400).json({ success: false, error: 'mainImage is required' });
    }

    // ── Insert core product record ────────────────────────────────────────────
    const productResult = await client.query(`
      INSERT INTO Products (
        product_title, product_description, product_price,
        product_type_id, product_hidden, product_rating,
        product_main_img_url
      ) VALUES ($1, $2, $3, $4, $5, 0, '')
      RETURNING product_id
    `, [
      title,
      description,
      parsedPrice,
      parsedTypeId,
      hidden === 'true' || hidden === true,
    ]);

    const productId = productResult.rows[0].product_id;

    logger.debug('Product record created', {
      module: 'routes/products',
      productId,
      requestId: req.requestId,
    });

    // ── Handle main image ─────────────────────────────────────────────────────
    if (req.files?.mainImage?.[0]) {
      const fileUrl = moveToProductDir(req.files.mainImage[0], productId);
      await client.query(
        'UPDATE Products SET product_main_img_url = $1 WHERE product_id = $2',
        [fileUrl, productId],
      );
    }

    // ── Handle additional gallery images ──────────────────────────────────────
    if (req.files?.images?.length) {
      for (const file of req.files.images) {
        const imageUrl = moveToProductDir(file, productId);

        const imageResult = await client.query(
          'INSERT INTO Images (image_url) VALUES ($1) RETURNING image_id',
          [imageUrl],
        );

        await client.query(
          'INSERT INTO ProductImages (product_id, image_id) VALUES ($1, $2)',
          [productId, imageResult.rows[0].image_id],
        );
      }
    }

    // ── Handle downloadable files ─────────────────────────────────────────────
    if (req.files?.files?.length) {
      for (const file of req.files.files) {
        const fileUrl  = moveToProductDir(file, productId);
        const destPath = path.join(UPLOADS_DIR, 'products', String(productId), file.filename);
        try {
          await applyWatermark(destPath, file.mimetype);
        } catch (wmErr) {
          logger.warn('Watermark failed, file saved without watermark', {
            module: 'routes/products',
            requestId: req.requestId,
            filePath: destPath,
            error: wmErr.message,
          });
        }

        const fileName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        const fileResult = await client.query(`
          INSERT INTO Files (file_name, file_url, file_size)
          VALUES ($1, $2, $3)
          RETURNING file_id
        `, [fileName, fileUrl, file.size]);

        await client.query(
          'INSERT INTO ProductFiles (file_id, product_id) VALUES ($1, $2)',
          [fileResult.rows[0].file_id, productId],
        );
      }
    }

    // ── Handle age categories ─────────────────────────────────────────────────
    if (ageCategoryIds) {
      const ids = (Array.isArray(ageCategoryIds) ? ageCategoryIds : [ageCategoryIds])
        .map((id) => parseInt(id, 10))
        .filter((id) => !isNaN(id));

      for (const catId of ids) {
        await client.query(
          'INSERT INTO ProductAgeCategories (product_id, age_category_id) VALUES ($1, $2)',
          [productId, catId],
        );
      }
    }

    // ── Handle events ─────────────────────────────────────────────────────────
    if (eventIds) {
      const ids = (Array.isArray(eventIds) ? eventIds : [eventIds])
        .map((id) => parseInt(id, 10))
        .filter((id) => !isNaN(id));

      for (const eventId of ids) {
        await client.query(
          'INSERT INTO ProductEvents (product_id, event_id) VALUES ($1, $2)',
          [productId, eventId],
        );
      }
    }

    await client.query('COMMIT');

    // ── Invalidate caches ─────────────────────────────────────────────────────
    appCache.invalidate('products:all');

    logger.info('Product created successfully', {
      module: 'routes/products',
      productId,
      requestId: req.requestId,
    });

    const newProduct = await client.query(
      `${PRODUCT_SELECT} WHERE p.product_id = $1 ${PRODUCT_GROUP_BY}`,
      [productId]
    );
    res.status(201).json({
      success: true,
      product: transformProduct(newProduct.rows[0])
    });

  } catch (error) {
    await client.query('ROLLBACK');
    cleanupTempFiles(req.files);

    logger.error('Error creating product', {
      module: 'routes/products',
      requestId: req.requestId,
      error: error.message,
    });

    res.status(500).json({ success: false, error: 'Failed to create product' });
  } finally {
    client.release();
  }
});

// ── GET /api/products/:id/files ──────────────────────────────────────────────
/**
 * Returns the downloadable files attached to a product (admin only).
 * @returns {Promise<object>} A response object containing:
 * - `success` {boolean} Whether the operation was successful.
 * - `files` {Array<{fileId: number, fileName: string, fileUrl: string, fileSize: number}>} List of files.
 */
router.get('/:id/files', authenticateToken, async (req, res) => {
  const productId = parseInt(req.params.id, 10);

  if (isNaN(productId)) {
    return res.status(400).json({ success: false, error: 'Invalid product ID' });
  }

  const client = await pool.connect();
  try {
    if (!(await isAdmin(client, req.userId))) {
      return res.status(403).json({ success: false, error: 'Admins only' });
    }

    const result = await client.query(`
      SELECT
        f.file_id   AS "fileId",
        f.file_name AS "fileName",
        f.file_url  AS "fileUrl",
        f.file_size AS "fileSize"
      FROM Files f
      JOIN ProductFiles pf ON pf.file_id = f.file_id
      WHERE pf.product_id = $1
      ORDER BY f.file_id
    `, [productId]);

    res.json({ success: true, files: result.rows });
  } catch (error) {
    logger.error('Error fetching product files', {
      module: 'routes/products',
      requestId: req.requestId,
      productId,
      error: error.message,
    });
    res.status(500).json({ success: false, error: 'Failed to fetch product files' });
  } finally {
    client.release();
  }
});

// ── PUT /api/products/:id ─────────────────────────────────────────────────────
/**
 * Updates an existing product (admin only).
 *
 * Accepts `multipart/form-data`.  Only supplied fields are updated (PATCH
 * semantics despite using PUT so the client doesn't have to resend unchanged
 * files).  New files are appended; existing files are not removed unless
 * `removeFileIds` / `removeImageIds` are provided.
 *
 * Additional body fields:
 * - `removeFileIds`    {number[]} IDs of Files rows to delete
 * - `removeImageIds`   {number[]} IDs of Images rows to delete
 * - `ageCategoryIds`   {number[]} Replaces all existing age-category links
 * - `eventIds`         {number[]} Replaces all existing event links
 */
router.put('/:id', authenticateToken, (req, res, next) => {
  productUpload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: `File upload error: ${err.message}` });
    }
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, async (req, res) => {
  const productId = parseInt(req.params.id, 10);

  if (isNaN(productId)) {
    cleanupTempFiles(req.files);
    return res.status(400).json({ success: false, error: 'Invalid product ID' });
  }

  const client = await pool.connect();
  const baseUrl = `${req.protocol}://${req.get('host')}`;

  const parseArrayField = (field, isNumeric = true) => {

    const arr = Array.isArray(field) ? field : String(field).split(',');

    if (isNumeric) {
      return arr.map((i) => parseInt(i, 10)).filter((i) => !isNaN(i));
    }

    return arr.map((i) => i.trim()).filter(Boolean);
  };

  try {
    await client.query('BEGIN');

    if (!(await isAdmin(client, req.userId))) {
      await client.query('ROLLBACK');
      cleanupTempFiles(req.files);
      return res.status(403).json({ success: false, error: 'Admins only' });
    }

    const exists = await client.query(
      'SELECT product_id FROM Products WHERE product_id = $1',
      [productId],
    );

    if (exists.rows.length === 0) {
      await client.query('ROLLBACK');
      cleanupTempFiles(req.files);
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    const {
      title, description, price, typeId, hidden,
      ageCategoryIds, eventIds,
      removeFileIds, removeImageUrls = [],
      removeMainImage,
    } = req.body;

    // Parse and validate fields
    const parsedRemoveImageUrls = parseArrayField(removeImageUrls, false);
    const parsedRemoveFileIds  = parseArrayField(removeFileIds);
    const parsedAgeCategoryIds = ageCategoryIds !== undefined ? parseArrayField(ageCategoryIds) : undefined;
    const parsedEventIds       = eventIds !== undefined ? parseArrayField(eventIds) : undefined;

    const setClauses = [];
    const values = [];
    let idx = 1;

    const push = (col, val) => {
      setClauses.push(`${col} = $${idx++}`);
      values.push(val);
    };

    if (title !== undefined) {push('product_title', title);}
    if (description !== undefined) {push('product_description', description);}
    if (price !== undefined) {push('product_price', parseFloat(price));}
    if (typeId !== undefined) {push('product_type_id', parseInt(typeId, 10));}
    if (hidden !== undefined) {push('product_hidden', hidden === 'true' || hidden === true);}

    // ── Remove main image ─────────────────────────────────────────────
    if (removeMainImage === 'true' || removeMainImage === true) {
      const current = await client.query(
        'SELECT product_main_img_url FROM Products WHERE product_id = $1',
        [productId]
      );

      if (current.rows[0]?.product_main_img_url) {
        const relativePath = current.rows[0].product_main_img_url.replace(/^https?:\/\/[^/]+/, '');
        const diskPath = path.join(__dirname, '..', relativePath);
        if (fs.existsSync(diskPath)) {
          fs.unlinkSync(diskPath);
        }
      }

      push('product_main_img_url', '');
    }

    // ── Replace main image ───────────────────────────────────────────
    if (req.files?.mainImage?.[0]) {
      const current = await client.query(
        'SELECT product_main_img_url FROM Products WHERE product_id = $1',
        [productId]
      );

      if (current.rows[0]?.product_main_img_url) {
        const relativePath = current.rows[0].product_main_img_url.replace(/^https?:\/\/[^/]+/, '');
        const diskPath = path.join(__dirname, '..', relativePath);
        if (fs.existsSync(diskPath)) {
          fs.unlinkSync(diskPath);
        }
      }

      const imageUrl = moveToProductDir(req.files.mainImage[0], productId, baseUrl);
      push('product_main_img_url', imageUrl);
    }

    setClauses.push('product_updated_at = NOW()');

    if (setClauses.length > 0) {
      values.push(productId);
      await client.query(
        `UPDATE Products SET ${setClauses.join(', ')} WHERE product_id = $${idx}`,
        values,
      );
    }

    // ── Remove files ─────────────────────────────────────────────────
    if (parsedRemoveFileIds.length > 0) {
      for (const fileId of parsedRemoveFileIds) {
        const fRow = await client.query(
          'SELECT file_url FROM Files WHERE file_id = $1',
          [fileId]
        );

        if (fRow.rows[0]) {
          const relativePath = fRow.rows[0].file_url.replace(/^https?:\/\/[^/]+/, '');
          const diskPath = path.join(__dirname, '..', relativePath);
          if (fs.existsSync(diskPath)) {
            fs.unlinkSync(diskPath);
          }
        }

        await client.query('DELETE FROM ProductFiles WHERE file_id = $1', [fileId]);
        await client.query('DELETE FROM Files WHERE file_id = $1', [fileId]);
      }
    }

    // ── Remove images ────────────────────────────────────────
    if (parsedRemoveImageUrls && parsedRemoveImageUrls.length > 0) {
      for (const imageUrl of parsedRemoveImageUrls) {
        // Fetch the record first to get the actual image_id and confirm existence
        const iRow = await client.query(
          'SELECT image_id, image_url FROM Images WHERE image_url = $1',
          [imageUrl]
        );

        if (iRow.rows.length > 0) {
          const { image_id, image_url } = iRow.rows[0];

          // Handle File System Deletion
          // Clean the URL to get the relative path
          const relativePath = image_url.replace(/^https?:\/\/[^/]+/, '');
          const diskPath = path.resolve(__dirname, '..', relativePath);

          try {
            if (fs.existsSync(diskPath)) {
              fs.unlinkSync(diskPath);
            }
          } catch (err) {
            logger.warn('Failed to delete image file from disk', {
              module: 'routes/products',
              requestId: req.requestId,
              diskPath,
              error: err.message,
            });
          }

          // Handle Database Deletion
          await client.query('DELETE FROM Images WHERE image_id = $1', [image_id]);
        }
      }
    }

    // ── Add new images ───────────────────────────────────────────────
    if (req.files?.images?.length) {
      for (const file of req.files.images) {
        const imageUrl = moveToProductDir(file, productId, baseUrl);
        const imgRow = await client.query(
          'INSERT INTO Images (image_url) VALUES ($1) RETURNING image_id',
          [imageUrl],
        );

        await client.query(
          'INSERT INTO ProductImages (product_id, image_id) VALUES ($1, $2)',
          [productId, imgRow.rows[0].image_id],
        );
      }
    }

    // ── Add files ────────────────────────────────────────────────────
    if (req.files?.files?.length) {
      for (const file of req.files.files) {
        const fileUrl  = moveToProductDir(file, productId, baseUrl);
        const destPath = path.join(UPLOADS_DIR, 'products', String(productId), file.filename);
        try {
          await applyWatermark(destPath, file.mimetype);
        } catch (wmErr) {
          logger.warn('Watermark failed, file saved without watermark', {
            module: 'routes/products',
            requestId: req.requestId,
            filePath: destPath,
            error: wmErr.message,
          });
        }
        const fileName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        const fRow = await client.query(
          `INSERT INTO Files (file_name, file_url, file_size)
           VALUES ($1, $2, $3) RETURNING file_id`,
          [fileName, fileUrl, file.size]
        );

        await client.query(
          'INSERT INTO ProductFiles (file_id, product_id) VALUES ($1, $2)',
          [fRow.rows[0].file_id, productId],
        );
      }
    }

    // ── Age categories ───────────────────────────────────────────────
    if (parsedAgeCategoryIds !== undefined) {
      await client.query('DELETE FROM ProductAgeCategories WHERE product_id = $1', [productId]);

      for (const id of parsedAgeCategoryIds) {
        await client.query(
          'INSERT INTO ProductAgeCategories (product_id, age_category_id) VALUES ($1, $2)',
          [productId, id]
        );
      }
    }

    // ── Events ───────────────────────────────────────────────────────
    if (parsedEventIds !== undefined) {
      await client.query('DELETE FROM ProductEvents WHERE product_id = $1', [productId]);

      for (const id of parsedEventIds) {
        await client.query(
          'INSERT INTO ProductEvents (product_id, event_id) VALUES ($1, $2)',
          [productId, id]
        );
      }
    }

    await client.query('COMMIT');

    appCache.invalidate(`products:${productId}`);
    appCache.invalidate('products:all');

    res.json({ success: true, message: 'Product updated successfully' });

  } catch(error) {
    await client.query('ROLLBACK');
    cleanupTempFiles(req.files);

    logger.error('Failed to update product', {
      module: 'routes/products',
      requestId: req.requestId,
      productId,
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to update product'
    });
  } finally {
    client.release();
  }
});

// ── DELETE /api/products/:id ──────────────────────────────────────────────────
/**
 * Deletes a product and all its associated data (admin only).
 *
 * Cascade order:
 * 1. Collect file/image paths from DB for disk cleanup.
 * 2. Delete junction rows (ProductAgeCategories, ProductEvents, ProductImages,
 *    ProductFiles, ProductViews, BoughtUserProducts, SavedUserProducts,
 *    ProductReviews).
 * 3. Delete Files and Images rows.
 * 4. Delete the Products row.
 * 5. Remove the product directory from disk.
 * 6. Invalidate the cache.
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  const productId = parseInt(req.params.id, 10);

  if (isNaN(productId)) {
    return res.status(400).json({ success: false, error: 'Invalid product ID' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // ── Admin check ───────────────────────────────────────────────────────────
    if (!(await isAdmin(client, req.userId))) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, error: 'Admins only' });
    }

    // ── Verify product exists ─────────────────────────────────────────────────
    const exists = await client.query(
      'SELECT product_id FROM Products WHERE product_id = $1',
      [productId],
    );

    if (exists.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    // ── Guard: hide instead of delete if product was ever purchased ──────────
    const boughtCheck = await client.query(
      'SELECT 1 FROM BoughtUserProducts WHERE product_id = $1 LIMIT 1',
      [productId],
    );

    if (boughtCheck.rows.length > 0) {
      await client.query(
        'UPDATE Products SET product_hidden = true WHERE product_id = $1',
        [productId],
      );
      await client.query('COMMIT');

      appCache.invalidate(`products:${productId}`);
      appCache.invalidate('products:all');

      logger.info('Product hidden (has purchases) instead of deleted', {
        module: 'routes/products',
        productId,
        requestId: req.requestId,
      });

      return res.json({ success: true, hidden: true, message: 'Product has purchases and was hidden instead of deleted' });
    }

    // ── Collect file paths before deleting ────────────────────────────────────
    const imageRows = await client.query(`
      SELECT i.image_url FROM Images i
      JOIN ProductImages pi ON pi.image_id = i.image_id
      WHERE pi.product_id = $1
    `, [productId]);

    const fileRows = await client.query(`
      SELECT f.file_url FROM Files f
      JOIN ProductFiles pf ON pf.file_id = f.file_id
      WHERE pf.product_id = $1
    `, [productId]);

    // ── Delete junction / dependent rows ─────────────────────────────────────
    await client.query('DELETE FROM ProductAgeCategories WHERE product_id = $1', [productId]);
    await client.query('DELETE FROM ProductEvents       WHERE product_id = $1', [productId]);
    await client.query('DELETE FROM ProductViews        WHERE product_id = $1', [productId]);
    await client.query('DELETE FROM BoughtUserProducts  WHERE product_id = $1', [productId]);
    await client.query('DELETE FROM SavedUserProducts   WHERE product_id = $1', [productId]);
    await client.query('DELETE FROM ProductReviews      WHERE product_id = $1', [productId]);

    // Images junction + leaf rows
    await client.query('DELETE FROM ProductImages WHERE product_id = $1', [productId]);
    for (const row of imageRows.rows) {
      await client.query('DELETE FROM Images WHERE image_url = $1', [row.image_url]);
    }

    // Files junction + leaf rows
    await client.query('DELETE FROM ProductFiles WHERE product_id = $1', [productId]);
    for (const row of fileRows.rows) {
      await client.query('DELETE FROM Files WHERE file_url = $1', [row.file_url]);
    }

    // ── Delete the product row ────────────────────────────────────────────────
    await client.query('DELETE FROM Products WHERE product_id = $1', [productId]);

    await client.query('COMMIT');

    // ── Remove files from disk ────────────────────────────────────────────────
    const productDir = path.join(UPLOADS_DIR, 'products', String(productId));
    if (fs.existsSync(productDir)) {
      fs.rmSync(productDir, { recursive: true, force: true });
    }

    // ── Invalidate caches ─────────────────────────────────────────────────────
    appCache.invalidate(`products:${productId}`);
    appCache.invalidate('products:all');

    logger.info('Product deleted successfully', {
      module: 'routes/products',
      productId,
      requestId: req.requestId,
    });

    res.json({ success: true, message: 'Product deleted successfully' });

  } catch (error) {
    await client.query('ROLLBACK');

    logger.error('Error deleting product', {
      module: 'routes/products',
      requestId: req.requestId,
      productId,
      error: error.message,
    });

    res.status(500).json({ success: false, error: 'Failed to delete product' });
  } finally {
    client.release();
  }
});

export default router;
