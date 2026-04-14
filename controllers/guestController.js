/**
 * @file Guest checkout controller — email OTP verification without account creation.
 *
 * Provides three handlers for the guest checkout flow:
 * 1. {@link initiateGuestVerification} — sends a 6-digit OTP to the supplied email.
 * 2. {@link confirmGuestEmail}         — verifies the OTP and returns a short-lived guest JWT.
 * 3. {@link resendGuestVerification}   — re-sends a fresh OTP.
 *
 * No user account is created at any point.  The guest JWT returned by
 * {@link confirmGuestEmail} is used solely to authorise the cart payment
 * initiation endpoint.
 * @module controllers/guestController
 */

import { verificationService } from '../services/verificationService.js';
import { emailService } from '../services/emailService.js';
import { generateGuestToken } from '../utils/jwt.js';
import logger from '../utils/logger.js';
import { ValidationError } from '../utils/AppError.js';

/**
 * Sends a 6-digit OTP to the given email address for guest checkout.
 *
 * Unlike the registration flow, this handler does **not** check whether the
 * email already belongs to a registered user — any email that can receive mail
 * is valid for guest checkout.
 *
 * **Request body:** `{ email: string }`
 *
 * **Response:** `{ success: true, message: { uk, en } }`
 * @param {object} req - Express request.
 * @param {object} res - Express response.
 * @param {Function} next - Express next middleware.
 * @returns {Promise<void>}
 */
export const initiateGuestVerification = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      throw new ValidationError('Valid email address is required', {});
    }

    const normalizedEmail = email.trim().toLowerCase();
    const code = await verificationService.createVerificationCode(normalizedEmail, 'guest_checkout');
    await emailService.sendVerificationEmail(normalizedEmail, code, 'guest_checkout');

    logger.info('Guest verification code sent', {
      requestId: req.requestId,
      email: normalizedEmail,
    });

    res.status(200).json({
      success: true,
      message: {
        uk: 'Код підтвердження надіслано на вашу електронну пошту.',
        en: 'Verification code sent to your email.',
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Verifies the OTP and returns a short-lived guest JWT.
 *
 * On success the caller receives a `token` valid for 30 minutes.  This token
 * must be passed as `Authorization: Bearer <token>` to
 * `POST /api/payments/cart/initiate`.
 *
 * **Request body:** `{ email: string, code: string }`
 *
 * **Response:** `{ success: true, token: string }`
 * @param {object} req - Express request.
 * @param {object} res - Express response.
 * @param {Function} next - Express next middleware.
 * @returns {Promise<void>}
 */
export const confirmGuestEmail = async (req, res, next) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      throw new ValidationError('email and code are required', {});
    }

    const normalizedEmail = email.trim().toLowerCase();
    const { isValid, message } = await verificationService.verifyCode(normalizedEmail, code);

    if (!isValid) {
      logger.warn('Guest email verification failed', {
        requestId: req.requestId,
        email: normalizedEmail,
        reason: message,
      });
      return res.status(400).json({
        error: 'INVALID_CODE',
        message: {
          uk: 'Невірний або застарілий код підтвердження.',
          en: 'Invalid or expired verification code.',
        },
      });
    }

    const token = generateGuestToken(normalizedEmail);

    logger.info('Guest email verified, guest token issued', {
      requestId: req.requestId,
      email: normalizedEmail,
    });

    res.status(200).json({ success: true, token });
  } catch (err) {
    next(err);
  }
};

/**
 * Re-generates and re-sends a fresh OTP for guest checkout.
 *
 * The previous code is automatically invalidated by the verification service.
 *
 * **Request body:** `{ email: string }`
 *
 * **Response:** `{ success: true, message: { uk, en } }`
 * @param {object} req - Express request.
 * @param {object} res - Express response.
 * @param {Function} next - Express next middleware.
 * @returns {Promise<void>}
 */
export const resendGuestVerification = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      throw new ValidationError('email is required', {});
    }

    const normalizedEmail = email.trim().toLowerCase();
    const code = await verificationService.createVerificationCode(normalizedEmail, 'guest_checkout');
    await emailService.sendVerificationEmail(normalizedEmail, code, 'guest_checkout');

    logger.info('Guest verification code resent', {
      requestId: req.requestId,
      email: normalizedEmail,
    });

    res.status(200).json({
      success: true,
      message: {
        uk: 'Новий код підтвердження надіслано.',
        en: 'New verification code sent.',
      },
    });
  } catch (err) {
    next(err);
  }
};
