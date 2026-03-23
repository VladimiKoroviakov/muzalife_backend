/**
 * @file Client-side error reporting endpoint.
 *
 * Receives structured error reports from the frontend JavaScript logger
 * and writes them to the server-side Winston logger under the 'client-error'
 * module tag.  This enables all frontend crashes to appear in the same
 * centralised log stream as backend errors.
 *
 * **Endpoint:** `POST /api/errors/client`
 * **Auth:**     None required — errors can occur before the user is logged in.
 * **Rate limit:** Consider adding express-rate-limit in production.
 * @module routes/clientErrors
 */

import { Router } from 'express';
import logger from '../utils/logger.js';

const router = Router();

/**
 * POST /api/errors/client
 *
 * Accepts a JSON body with any shape; required fields are `level` and `message`.
 * All fields are forwarded to the server logger with `module: 'client-error'`.
 */
router.post('/', (req, res) => {
  const {
    level = 'error',
    message = 'Unknown client error',
    sessionId,
    url,
    userAgent,
    ...rest
  } = req.body ?? {};

  const logLevel = ['debug', 'info', 'warn', 'error'].includes(level) ? level : 'error';

  logger[logLevel](`[CLIENT] ${message}`, {
    module: 'client-error',
    requestId: req.requestId,
    sessionId,
    clientUrl: url,
    userAgent,
    ...rest,
  });

  // Always return 204 so the browser does not retry on network hiccups
  res.status(204).end();
});

export default router;
