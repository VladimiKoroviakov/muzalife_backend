/**
 * @file Payment routes for MuzaLife — LiqPay integration.
 *
 * Exposes three endpoints:
 * - `POST /api/payments/product/:productId/initiate` — start a catalog product purchase.
 * - `POST /api/payments/order/:orderId/initiate`    — start a personal order payment.
 * - `POST /api/payments/callback`                  — LiqPay server-to-server webhook.
 *
 * The two initiation endpoints require a valid JWT.  The callback endpoint is
 * intentionally public; authenticity is verified via the LiqPay signature.
 * @module routes/payments
 */

import { Router } from 'express';
import { query } from '../config/database.js';
import { authenticateToken, authenticateAnyToken } from '../middleware/auth.js';
import logger from '../utils/logger.js';
import { createPaymentData, verifyCallback } from '../services/liqpayService.js';
import { emailService } from '../services/emailService.js';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
  ForbiddenError,
} from '../utils/AppError.js';

const { FRONTEND_URL } = process.env;

const router = Router();

// ── POST /api/payments/product/:productId/initiate ────────────────────────────
/**
 * Initiates a LiqPay payment for a catalog product.
 *
 * Verifies the product exists and has not already been purchased by the
 * authenticated user, then returns a signed LiqPay payload for the frontend
 * to render the checkout form.
 *
 * **Auth:** authenticated user
 *
 * **Response:**
 * ```json
 * { "success": true, "data": { "data": "<base64>", "signature": "<base64>" } }
 * ```
 * @param {string} req.params.productId - ID of the product to purchase.
 * @returns {object} 200 - Signed LiqPay payment payload.
 * @throws {NotFoundError}  404 - Product not found or hidden.
 * @throws {ConflictError}  409 - Product already purchased.
 */
router.post('/product/:productId/initiate', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.userId;
    const { productId } = req.params;

    const productResult = await query(
      `SELECT product_id, product_title, product_price
         FROM Products
        WHERE product_id = $1 AND product_hidden = false`,
      [productId],
    );

    if (!productResult.rows.length) {
      throw new NotFoundError('Product not found', { productId });
    }

    const product = productResult.rows[0];

    const alreadyBought = await query(
      'SELECT 1 FROM BoughtUserProducts WHERE user_id = $1 AND product_id = $2',
      [userId, productId],
    );

    if (alreadyBought.rows.length) {
      throw new ConflictError('Product already purchased', { productId, userId });
    }

    const orderId = `product_${productId}_${userId}_${Date.now()}`;

    const paymentData = createPaymentData({
      orderId,
      amount: product.product_price,
      currency: 'UAH',
      description: product.product_title,
    });

    logger.info('Product payment initiated', {
      requestId: req.requestId,
      userId,
      productId,
      orderId,
    });

    res.json({ success: true, data: paymentData });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/payments/order/:orderId/initiate ────────────────────────────────
/**
 * Initiates a LiqPay payment for a personal order.
 *
 * The order must belong to the authenticated user, have status
 * `'accepted'`, and carry a positive price set by an admin.
 *
 * **Auth:** authenticated user (order owner)
 *
 * **Response:**
 * ```json
 * { "success": true, "data": { "data": "<base64>", "signature": "<base64>" } }
 * ```
 * @param {string} req.params.orderId - ID of the personal order to pay for.
 * @returns {object} 200 - Signed LiqPay payment payload.
 * @throws {NotFoundError}    404 - Order not found.
 * @throws {ForbiddenError}   403 - Order belongs to another user.
 * @throws {ValidationError}  400 - Order not awaiting payment or has no price.
 */
router.post('/order/:orderId/initiate', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.userId;
    const { orderId } = req.params;

    const orderResult = await query(
      `SELECT order_id, user_id, order_status, order_price, order_title
         FROM PersonalOrders
        WHERE order_id = $1`,
      [orderId],
    );

    if (!orderResult.rows.length) {
      throw new NotFoundError('Personal order not found', { orderId });
    }

    const order = orderResult.rows[0];

    if (order.user_id !== userId) {
      throw new ForbiddenError('Not authorized to pay for this order', { orderId, userId });
    }

    if (order.order_status !== 'accepted') {
      throw new ValidationError('Order is not awaiting payment', {
        orderId,
        currentStatus: order.order_status,
      });
    }

    if (!order.order_price || Number(order.order_price) <= 0) {
      throw new ValidationError('Order has no price set', { orderId });
    }

    const liqpayOrderId = `personalorder_${orderId}`;

    const paymentData = createPaymentData({
      orderId: liqpayOrderId,
      amount: order.order_price,
      currency: 'UAH',
      description: order.order_title,
    });

    logger.info('Personal order payment initiated', {
      requestId: req.requestId,
      userId,
      orderId,
      liqpayOrderId,
    });

    res.json({ success: true, data: paymentData });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/payments/cart/initiate ─────────────────────────────────────────
/**
 * Initiates a single LiqPay payment for multiple catalog products (cart checkout).
 *
 * Accepts both authenticated users and verified guest shoppers.
 *
 * For **authenticated users** the order_id is:
 *   `cart_${ids.join('-')}_${userId}_${timestamp}`
 *
 * For **guests** the order_id is:
 *   `cart_${ids.join('-')}_guest_${base64url(email)}_${timestamp}`
 *
 * **Auth:** regular user JWT **or** short-lived guest JWT
 *
 * **Body:** `{ productIds: number[] }`
 *
 * **Response:**
 * ```json
 * { "success": true, "data": { "data": "<base64>", "signature": "<base64>" } }
 * ```
 * @param {number[]} req.body.productIds - IDs of the products to purchase.
 * @returns {object} 200 - Signed LiqPay payment payload.
 * @throws {ValidationError} 400 - `productIds` is missing, empty, or invalid.
 * @throws {NotFoundError}   404 - One or more products not found or hidden.
 * @throws {ConflictError}   409 - One or more products already purchased (authenticated users only).
 */
router.post('/cart/initiate', authenticateAnyToken, async (req, res, next) => {
  try {
    const userId = req.userId;           // set for authenticated users
    const guestEmail = req.guestEmail;   // set for guest users
    const { productIds } = req.body;

    if (
      !Array.isArray(productIds) ||
      productIds.length === 0 ||
      productIds.some((id) => !Number.isInteger(Number(id)) || Number(id) <= 0)
    ) {
      throw new ValidationError('productIds must be a non-empty array of positive integers', {});
    }

    const ids = productIds.map(Number);

    // Fetch all products in one query
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    const productsResult = await query(
      `SELECT product_id, product_title, product_price
         FROM Products
        WHERE product_id IN (${placeholders}) AND product_hidden = false`,
      ids,
    );

    if (productsResult.rows.length !== ids.length) {
      const foundIds = productsResult.rows.map((r) => r.product_id);
      const missingIds = ids.filter((id) => !foundIds.includes(id));
      throw new NotFoundError('One or more products not found or hidden', { missingIds });
    }

    // Check for already-purchased products (authenticated users only)
    if (userId) {
      const boughtResult = await query(
        `SELECT product_id
           FROM BoughtUserProducts
          WHERE user_id = $1 AND product_id = ANY($2::int[])`,
        [userId, ids],
      );

      if (boughtResult.rows.length > 0) {
        const alreadyBoughtIds = boughtResult.rows.map((r) => r.product_id);
        throw new ConflictError('One or more products already purchased', { alreadyBoughtIds });
      }
    }

    const totalAmount = productsResult.rows.reduce(
      (sum, p) => sum + Number(p.product_price),
      0,
    );

    const description =
      ids.length === 1
        ? productsResult.rows[0].product_title
        : `Покупка ${ids.length} матеріалів`;

    // Build order_id:
    //   authenticated: cart_1-2-3_42_1714000000000
    //   guest:         cart_1-2-3_guest_<base64url(email)>_1714000000000
    let orderId;
    if (guestEmail) {
      const encodedEmail = Buffer.from(guestEmail).toString('base64url');
      orderId = `cart_${ids.join('-')}_guest_${encodedEmail}_${Date.now()}`;
    } else {
      orderId = `cart_${ids.join('-')}_${userId}_${Date.now()}`;
    }

    const paymentData = createPaymentData({
      orderId,
      amount: totalAmount.toFixed(2),
      currency: 'UAH',
      description,
    });

    logger.info('Cart payment initiated', {
      requestId: req.requestId,
      userId: userId ?? null,
      guestEmail: guestEmail ?? null,
      productIds: ids,
      totalAmount,
      orderId,
    });

    res.json({ success: true, data: paymentData });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/payments/verify ─────────────────────────────────────────────────
/**
 * Fallback purchase-confirmation endpoint for environments where LiqPay's
 * servers cannot reach the backend (e.g. localhost development).
 *
 * Accepts both regular user JWTs and short-lived guest JWTs so that both
 * checkout paths can fall back to this endpoint in development.
 *
 * **Auth:** regular user JWT **or** short-lived guest JWT
 *
 * **Body:** `{ orderId: string }`
 * @returns {object} 200 - `{ success: true }` — purchase recorded (or already existed).
 * @throws {ValidationError} 400 - `orderId` missing or in unrecognised format.
 * @throws {ForbiddenError}  403 - `orderId` encodes a different user's ID.
 */
router.post('/verify', authenticateAnyToken, async (req, res, next) => {
  try {
    const userId = req.userId;
    const guestEmail = req.guestEmail;
    const { orderId } = req.body;

    if (!orderId || typeof orderId !== 'string') {
      throw new ValidationError('orderId is required', {});
    }

    if (orderId.startsWith('product_')) {
      // Format: product_{productId}_{userId}_{timestamp}
      const parts = orderId.split('_');
      const productId = Number(parts[1]);
      const orderUserId = Number(parts[2]);

      if (orderUserId !== userId) {
        throw new ForbiddenError('Order does not belong to this user', { orderId, userId });
      }

      await query(
        'INSERT INTO BoughtUserProducts (user_id, product_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [userId, productId],
      );

      logger.info('Product purchase verified and recorded', { requestId: req.requestId, userId, productId, orderId });
    } else if (orderId.startsWith('cart_')) {
      // Detect guest cart order: cart_{ids}_guest_{base64email}_{timestamp}
      const parts = orderId.split('_');
      const productIds = parts[1].split('-').map(Number);
      const isGuest = parts[2] === 'guest';

      if (isGuest) {
        if (!guestEmail) {
          throw new ForbiddenError('Guest token required for guest order', { orderId });
        }
        // Decode email from order_id and verify it matches the token
        const encodedEmail = parts[3];
        const orderEmail = Buffer.from(encodedEmail, 'base64url').toString();
        if (orderEmail !== guestEmail) {
          throw new ForbiddenError('Guest order does not belong to this guest', { orderId });
        }

        // RETURNING lets us detect whether each row is new — used to guard email
        // sends so the server-to-server callback (if it already fired) doesn't
        // result in duplicate delivery.
        let newRows = 0;
        for (const productId of productIds) {
          const result = await query(
            'INSERT INTO GuestPurchases (guest_email, product_id, order_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING product_id',
            [guestEmail, productId, orderId],
          );
          newRows += result.rows.length;
        }
        logger.info('Guest cart purchase verified and recorded', { requestId: req.requestId, guestEmail, productIds, orderId });

        // Send confirmation + materials only when at least one row was newly inserted.
        // If newRows === 0 the server-to-server callback already processed this order.
        if (newRows > 0) {
          try {
            const [productsResult, filesResult] = await Promise.all([
              query(
                'SELECT product_id, product_title FROM Products WHERE product_id = ANY($1::int[])',
                [productIds],
              ),
              query(
                `SELECT pf.product_id AS "productId", f.file_name AS "fileName", f.file_url AS "fileUrl"
                   FROM Files f
                   JOIN ProductFiles pf ON pf.file_id = f.file_id
                  WHERE pf.product_id = ANY($1::int[])
                  ORDER BY pf.product_id, f.file_id`,
                [productIds],
              ),
            ]);

            const productNames = productsResult.rows.map((r) => r.product_title);
            await emailService.sendGuestPurchaseConfirmation(guestEmail, productNames);

            const filesByProduct = {};
            for (const row of filesResult.rows) {
              if (!filesByProduct[row.productId]) { filesByProduct[row.productId] = []; }
              filesByProduct[row.productId].push({ fileName: row.fileName, fileUrl: row.fileUrl });
            }
            for (const product of productsResult.rows) {
              const files = filesByProduct[product.product_id];
              if (files?.length) {
                await emailService.sendProductMaterials(guestEmail, product.product_title, files);
              }
            }
          } catch (emailErr) {
            logger.warn('Could not send guest purchase emails (verify fallback)', {
              requestId: req.requestId, guestEmail, productIds, error: emailErr.message,
            });
          }
        }
      } else {
        // Format: cart_{productIds joined by '-'}_{userId}_{timestamp}
        const orderUserId = Number(parts[2]);

        if (orderUserId !== userId) {
          throw new ForbiddenError('Order does not belong to this user', { orderId, userId });
        }

        for (const productId of productIds) {
          await query(
            'INSERT INTO BoughtUserProducts (user_id, product_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [userId, productId],
          );
        }

        logger.info('Cart purchase verified and recorded', { requestId: req.requestId, userId, productIds, orderId });
      }
    } else if (orderId.startsWith('personalorder_')) {
      // Format: personalorder_{orderId}
      const personalOrderId = Number(orderId.replace('personalorder_', ''));

      const orderResult = await query(
        'SELECT user_id FROM PersonalOrders WHERE order_id = $1',
        [personalOrderId],
      );

      if (!orderResult.rows.length || orderResult.rows[0].user_id !== userId) {
        throw new ForbiddenError('Order does not belong to this user', { personalOrderId, userId });
      }

      await query(
        'UPDATE PersonalOrders SET order_status = $1 WHERE order_id = $2',
        ['paid', personalOrderId],
      );

      logger.info('Personal order verified and marked paid', { requestId: req.requestId, userId, personalOrderId, orderId });
    } else {
      throw new ValidationError('Unrecognised orderId format', { orderId });
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ── Shared helper: process a verified LiqPay payload and persist the result ───
/**
 * Processes a decoded, signature-verified LiqPay payload and updates the DB.
 * @param {object} payload   - Decoded LiqPay JSON payload.
 * @param {string} requestId - Request ID for logging.
 * @returns {Promise<boolean>} `true` if a DB record was written, `false` if the
 *   order_id format was unrecognised (not an error — just skip).
 */
async function processVerifiedPayload(payload, requestId) {
  const liqpayOrderId = String(payload.order_id ?? '');

  if (liqpayOrderId.startsWith('product_')) {
    const parts = liqpayOrderId.split('_');
    const productId = Number(parts[1]);
    const userId = Number(parts[2]);
    await query(
      'INSERT INTO BoughtUserProducts (user_id, product_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [userId, productId],
    );
    logger.info('Product purchase recorded', { requestId, productId, userId, liqpayOrderId });

    // Auto-send product materials to the authenticated user
    try {
      const [userResult, productTitleResult, filesResult] = await Promise.all([
        query('SELECT user_email FROM Users WHERE user_id = $1', [userId]),
        query('SELECT product_title FROM Products WHERE product_id = $1', [productId]),
        query(
          `SELECT f.file_name AS "fileName", f.file_url AS "fileUrl"
             FROM Files f
             JOIN ProductFiles pf ON pf.file_id = f.file_id
            WHERE pf.product_id = $1
            ORDER BY f.file_id`,
          [productId],
        ),
      ]);
      const userEmail = userResult.rows[0]?.user_email;
      if (userEmail && filesResult.rows.length > 0) {
        await emailService.sendProductMaterials(
          userEmail,
          productTitleResult.rows[0]?.product_title ?? '',
          filesResult.rows,
        );
      }
    } catch (emailErr) {
      logger.warn('Could not send product materials email', {
        requestId, userId, productId, error: emailErr.message,
      });
    }
  } else if (liqpayOrderId.startsWith('cart_')) {
    const parts = liqpayOrderId.split('_');
    const productIds = parts[1].split('-').map(Number);
    const isGuest = parts[2] === 'guest';

    if (isGuest) {
      // Guest cart: cart_{ids}_guest_{base64url(email)}_{timestamp}
      const guestEmail = Buffer.from(parts[3], 'base64url').toString();
      for (const productId of productIds) {
        await query(
          'INSERT INTO GuestPurchases (guest_email, product_id, order_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [guestEmail, productId, liqpayOrderId],
        );
      }
      // Notify guest that purchase is confirmed, then send material download links
      let productsResult;
      try {
        productsResult = await query(
          'SELECT product_id, product_title FROM Products WHERE product_id = ANY($1::int[])',
          [productIds],
        );
        const productNames = productsResult.rows.map((r) => r.product_title);
        await emailService.sendGuestPurchaseConfirmation(guestEmail, productNames);
      } catch (emailErr) {
        logger.warn('Could not send guest purchase confirmation email', { requestId, guestEmail, error: emailErr.message });
      }

      // Send per-product material download links to guest
      try {
        const filesResult = await query(
          `SELECT pf.product_id AS "productId", f.file_name AS "fileName", f.file_url AS "fileUrl"
             FROM Files f
             JOIN ProductFiles pf ON pf.file_id = f.file_id
            WHERE pf.product_id = ANY($1::int[])
            ORDER BY pf.product_id, f.file_id`,
          [productIds],
        );
        const filesByProduct = {};
        for (const row of filesResult.rows) {
          if (!filesByProduct[row.productId]) { filesByProduct[row.productId] = []; }
          filesByProduct[row.productId].push({ fileName: row.fileName, fileUrl: row.fileUrl });
        }
        for (const product of (productsResult?.rows ?? [])) {
          const files = filesByProduct[product.product_id];
          if (files?.length) {
            await emailService.sendProductMaterials(guestEmail, product.product_title, files);
          }
        }
      } catch (emailErr) {
        logger.warn('Could not send guest product materials email', { requestId, guestEmail, productIds, error: emailErr.message });
      }

      logger.info('Guest cart purchase recorded', { requestId, productIds, guestEmail, liqpayOrderId });
    } else {
      // Authenticated user cart: cart_{ids}_{userId}_{timestamp}
      const userId = Number(parts[2]);
      for (const productId of productIds) {
        await query(
          'INSERT INTO BoughtUserProducts (user_id, product_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [userId, productId],
        );
      }
      logger.info('Cart purchase recorded', { requestId, productIds, userId, liqpayOrderId });

      // Auto-send product materials to the authenticated user (one email per product)
      try {
        const [userResult, productsResult, filesResult] = await Promise.all([
          query('SELECT user_email FROM Users WHERE user_id = $1', [userId]),
          query(
            'SELECT product_id, product_title FROM Products WHERE product_id = ANY($1::int[])',
            [productIds],
          ),
          query(
            `SELECT pf.product_id AS "productId", f.file_name AS "fileName", f.file_url AS "fileUrl"
               FROM Files f
               JOIN ProductFiles pf ON pf.file_id = f.file_id
              WHERE pf.product_id = ANY($1::int[])
              ORDER BY pf.product_id, f.file_id`,
            [productIds],
          ),
        ]);
        const userEmail = userResult.rows[0]?.user_email;
        if (userEmail) {
          const filesByProduct = {};
          for (const row of filesResult.rows) {
            if (!filesByProduct[row.productId]) { filesByProduct[row.productId] = []; }
            filesByProduct[row.productId].push({ fileName: row.fileName, fileUrl: row.fileUrl });
          }
          for (const product of productsResult.rows) {
            const files = filesByProduct[product.product_id];
            if (files?.length) {
              await emailService.sendProductMaterials(userEmail, product.product_title, files);
            }
          }
        }
      } catch (emailErr) {
        logger.warn('Could not send cart materials email (auth user)', {
          requestId, userId, productIds, error: emailErr.message,
        });
      }
    }
  } else if (liqpayOrderId.startsWith('personalorder_')) {
    const orderId = Number(liqpayOrderId.replace('personalorder_', ''));
    await query(
      'UPDATE PersonalOrders SET order_status = $1 WHERE order_id = $2',
      ['paid', orderId],
    );
    logger.info('Personal order marked paid', { requestId, orderId, liqpayOrderId });

    // Auto-send order materials if files are already attached (silent if none yet)
    try {
      const [orderDataResult, filesResult] = await Promise.all([
        query(
          `SELECT po.order_title, u.user_email
             FROM PersonalOrders po
             JOIN Users u ON u.user_id = po.user_id
            WHERE po.order_id = $1`,
          [orderId],
        ),
        query(
          `SELECT f.file_name AS "fileName", f.file_url AS "fileUrl"
             FROM Files f
             JOIN PersonalOrderFiles pof ON pof.file_id = f.file_id
            WHERE pof.order_id = $1
            ORDER BY f.file_id`,
          [orderId],
        ),
      ]);
      const { order_title, user_email } = orderDataResult.rows[0] ?? {};
      if (user_email && filesResult.rows.length > 0) {
        await emailService.sendOrderMaterials(user_email, order_title, filesResult.rows);
      }
    } catch (emailErr) {
      logger.warn('Could not send personal order materials email at payment', {
        requestId, orderId, error: emailErr.message,
      });
    }
  } else {
    logger.warn('Unrecognised order_id format', { requestId, liqpayOrderId });
    return false;
  }
  return true;
}

// ── POST /api/payments/result  &  GET /api/payments/result ───────────────────
/**
 * Shared logic for both the POST (auto-redirect) and GET (manual button)
 * LiqPay result handlers.  Extracts data + signature from wherever LiqPay
 * put them (body for POST, query string for GET), verifies the signature,
 * processes the payment, and redirects the browser to the frontend result page.
 * @param req
 * @param res
 * @param root0
 * @param root0.data
 * @param root0.signature
 */
async function handleLiqPayResult(req, res, { data, signature }) {
  const failureRedirect = `${FRONTEND_URL}/payment/result?status=failure`;

  if (!data || !signature) {
    // No payment data — user may have navigated here manually or LiqPay
    // sent only a bare redirect.  Treat as pending; frontend shows neutral message.
    logger.info('LiqPay result: no data/signature (bare redirect)', { requestId: req.requestId });
    return res.redirect(`${FRONTEND_URL}/payment/result`);
  }

  if (!verifyCallback(data, signature)) {
    logger.warn('LiqPay result: signature mismatch', { requestId: req.requestId });
    return res.redirect(failureRedirect);
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(data, 'base64').toString('utf-8'));
  } catch {
    logger.warn('LiqPay result: payload is not valid JSON', { requestId: req.requestId });
    return res.redirect(failureRedirect);
  }

  logger.info('LiqPay result received', {
    requestId: req.requestId,
    liqpayOrderId: payload.order_id,
    status: payload.status,
  });

  const successStatuses = ['success', 'sandbox'];
  if (!successStatuses.includes(payload.status)) {
    return res.redirect(failureRedirect);
  }

  try {
    await processVerifiedPayload(payload, req.requestId);
  } catch (err) {
    logger.error('LiqPay result: DB update failed', {
      requestId: req.requestId,
      liqpayOrderId: payload.order_id,
      error: err.message,
    });
    return res.redirect(failureRedirect);
  }

  return res.redirect(`${FRONTEND_URL}/payment/result?status=success`);
}

router.post('/result', async (req, res) => {
  return handleLiqPayResult(req, res, { data: req.body.data, signature: req.body.signature });
});

/**
 * GET handler for the LiqPay "Повернутись на сайт" button.
 *
 * LiqPay sends a GET redirect when the user manually clicks the return button
 * on the payment page.  Some LiqPay integrations also pass `data` and
 * `signature` as query parameters; this handler processes them when present.
 */
router.get('/result', async (req, res) => {
  return handleLiqPayResult(req, res, { data: req.query.data, signature: req.query.signature });
});

// ── POST /api/payments/callback ───────────────────────────────────────────────
/**
 * Handles LiqPay server-to-server payment callbacks.
 *
 * This endpoint is public — no JWT is required.  Authenticity is verified
 * by checking the LiqPay signature against our private key.  On successful
 * payment the appropriate DB record is updated:
 * - `product_*` orders insert a row into `BoughtUserProducts`.
 * - `personalorder_*` orders set `order_status = 'paid'` on the
 *   corresponding `PersonalOrders` row.
 *
 * LiqPay retries callbacks until it receives HTTP 200, so this handler always
 * responds 200 even when the DB update fails (failures are logged for manual
 * investigation).
 *
 * **Auth:** none (verified via LiqPay signature)
 *
 * **Body (form-encoded or JSON):**
 * - `data`      {string} - Base64-encoded JSON payload from LiqPay.
 * - `signature` {string} - Base64-encoded SHA1 signature from LiqPay.
 * @returns {object} 200 - Always returned once the signature check passes.
 * @returns {object} 400 - Returned when `data`/`signature` are missing or invalid.
 */
router.post('/callback', async (req, res) => {
  const { data, signature } = req.body;

  if (!data || !signature) {
    logger.warn('LiqPay callback missing data or signature', {
      requestId: req.requestId,
    });
    return res.status(400).json({
      error: 'MISSING_PAYLOAD',
      message: { uk: 'Відсутні обов\'язкові поля', en: 'Missing data or signature' },
    });
  }

  if (!verifyCallback(data, signature)) {
    logger.warn('LiqPay callback signature mismatch', {
      requestId: req.requestId,
    });
    return res.status(400).json({
      error: 'INVALID_SIGNATURE',
      message: { uk: 'Невірний підпис', en: 'Invalid signature' },
    });
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(data, 'base64').toString('utf-8'));
  } catch {
    logger.warn('LiqPay callback payload is not valid JSON', {
      requestId: req.requestId,
    });
    return res.status(400).json({
      error: 'INVALID_ENCODING',
      message: { uk: 'Невірне кодування даних', en: 'Invalid data encoding' },
    });
  }

  logger.info('LiqPay callback received', {
    requestId: req.requestId,
    liqpayOrderId: payload.order_id,
    status: payload.status,
    amount: payload.amount,
    currency: payload.currency,
  });

  // LiqPay sends 'success' for live payments and 'sandbox' for test payments.
  const successStatuses = ['success', 'sandbox'];

  if (successStatuses.includes(payload.status)) {
    try {
      await processVerifiedPayload(payload, req.requestId);
    } catch (err) {
      // Log but still return 200 so LiqPay does not retry indefinitely.
      logger.error('LiqPay callback: DB update failed', {
        requestId: req.requestId,
        liqpayOrderId: payload.order_id,
        error: err.message,
      });
    }
  }

  res.status(200).json({ received: true });
});

export default router;
