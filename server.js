/**
 * @file MuzaLife backend server entry point.
 *
 * Configures and starts an HTTPS Express server.  All route modules are
 * mounted here and a Swagger UI is exposed at `/api/docs` for interactive
 * API testing.
 *
 * **Architecture overview:**
 * - All routes are prefixed with `/api/`.
 * - Authentication is enforced per-route via the `authenticateToken`
 *   middleware (see `middleware/auth.js`).
 * - Static product files are served from the `uploads/` directory.
 * - HTTPS is mandatory even in development; certificates must exist in
 *   `certs/` before the server can start.
 * - All HTTP traffic is logged via {@link module:middleware/requestLogger}.
 * - All errors are handled by {@link module:middleware/errorHandler}.
 *
 * **Log level** is controlled via the `LOG_LEVEL` environment variable
 * (e.g. `LOG_LEVEL=debug node server.js`) — no recompilation needed.
 * @module server
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import https from 'https';
import swaggerUi from 'swagger-ui-express';
import YAML from 'js-yaml';

import logger from './utils/logger.js';
import { requestLogger } from './middleware/requestLogger.js';
import { globalErrorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { performanceMonitor } from './middleware/performanceMonitor.js';

// Import routes
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import faqRoutes from './routes/faqs.js';
import reviewRoutes from './routes/reviews.js';
import productsRouter from './routes/products.js';
import savedProductsRoutes from './routes/savedProducts.js';
import pollRoutes from './routes/polls.js';
import analytics from './routes/analytics.js';
import personalOrdersRoutes from './routes/personalOrders.js';
import boughtProductsRoutes from './routes/boughtProducts.js';
import clientErrorsRouter from './routes/clientErrors.js';
import apmRouter from './routes/apm.js';
import metadataRouter from './routes/metadata.js';
import facebookAdminRouter from './routes/facebookAdmin.js';
import paymentsRouter from './routes/payments.js';


import { query } from './config/database.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SSL_KEY_PATH = path.join(__dirname, 'certs', 'localhost-key.pem');
const SSL_CERT_PATH = path.join(__dirname, 'certs', 'localhost-cert.pem');

// ── SSL certificate guard ─────────────────────────────────────────────────────
if (!fs.existsSync(SSL_KEY_PATH) || !fs.existsSync(SSL_CERT_PATH)) {
  logger.critical('Missing HTTPS certificates — server cannot start', {
    module: 'server',
    keyPath: SSL_KEY_PATH,
    certPath: SSL_CERT_PATH,
  });
  process.exit(1);
}

const sslOptions = {
  key: fs.readFileSync(SSL_KEY_PATH),
  cert: fs.readFileSync(SSL_CERT_PATH),
};

logger.info('SSL certificates loaded', { module: 'server' });

// ── Core middleware ───────────────────────────────────────────────────────────
app.use(cors({
  origin: 'https://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ── Request logging (replaces the old console.log debug middleware) ───────────
// Attaches req.requestId (UUID) and logs every request/response pair.
app.use(requestLogger);

// ── Performance monitoring ────────────────────────────────────────────────────
// Measures per-endpoint latency and records samples for the APM stats endpoint.
app.use(performanceMonitor);

// ── Static files ──────────────────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Swagger UI ────────────────────────────────────────────────────────────────
const swaggerSpecPath = path.join(__dirname, 'docs', 'api', 'openapi.yaml');
if (fs.existsSync(swaggerSpecPath)) {
  const swaggerDocument = YAML.load(fs.readFileSync(swaggerSpecPath, 'utf8'));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
    customSiteTitle: 'MuzaLife API Docs',
    swaggerOptions: { persistAuthorization: true },
  }));
  logger.info('Swagger UI mounted', {
    module: 'server',
    path: '/api/docs',
  });
}

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/faqs', faqRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/products', productsRouter);
app.use('/api/metadata', metadataRouter);
app.use('/api/saved-products', savedProductsRoutes);
app.use('/api/polls', pollRoutes);
app.use('/api/analytics', analytics);
app.use('/api/personal-orders', personalOrdersRoutes);
app.use('/api/bought-products', boughtProductsRoutes);
app.use('/api/errors/client', clientErrorsRouter);
app.use('/api/apm', apmRouter);
app.use('/api/admin', facebookAdminRouter);
app.use('/api/payments', paymentsRouter);

logger.info('All API route modules mounted', { module: 'server' });

// ── Server info endpoint ──────────────────────────────────────────────────────
app.get('/api/info', (req, res) => {
  logger.debug('Server info requested', { module: 'server', requestId: req.requestId });
  res.json({
    name: 'Muza Life Backend API',
    version: '1.0.0',
    description: 'Muza Life backend for authentication, user management, products, reviews, polls, FAQs, analytics, personal orders, payments, and admin tools.',
    endpoints: {
      auth: {
        registerInitiate: 'POST /api/auth/register/initiate',
        registerVerify: 'POST /api/auth/register/verify',
        registerResend: 'POST /api/auth/register/resend-code',
        login: 'POST /api/auth/login',
        google: 'POST /api/auth/google',
        facebook: 'POST /api/auth/facebook',
        guestVerifyInitiate: 'POST /api/auth/guest/verify/initiate',
        guestVerifyConfirm: 'POST /api/auth/guest/verify/confirm',
        guestVerifyResend: 'POST /api/auth/guest/verify/resend',
      },
      users: {
        getProfile: 'GET /api/users/profile (authenticated)',
        updateName: 'PUT /api/users/profile/name (authenticated)',
        changePassword: 'POST /api/users/change-password (authenticated)',
        uploadProfileImage: 'POST /api/users/profile/image (authenticated)',
        deleteProfileImage: 'DELETE /api/users/profile/image (authenticated)',
        deleteAccount: 'DELETE /api/users/account (authenticated)',
        emailChangeInitiate: 'POST /api/users/email/change/initiate (authenticated)',
        emailChangeVerify: 'POST /api/users/email/change/verify (authenticated)',
        emailChangeResend: 'POST /api/users/email/change/resend-code (authenticated)',
      },
      products: {
        getAll: 'GET /api/products',
        getById: 'GET /api/products/:id',
        getFiles: 'GET /api/products/:id/files (authenticated)',
        create: 'POST /api/products (admin)',
        update: 'PUT /api/products/:id (admin)',
        delete: 'DELETE /api/products/:id (admin)',
      },
      metadata: {
        getTypes: 'GET /api/metadata/types',
        getAgeCategories: 'GET /api/metadata/age-categories',
        getEvents: 'GET /api/metadata/events',
      },
      savedProducts: {
        getIds: 'GET /api/saved-products/ids (authenticated)',
        save: 'POST /api/saved-products (authenticated)',
        unsave: 'DELETE /api/saved-products/:productId (authenticated)',
      },
      boughtProducts: {
        getAll: 'GET /api/bought-products (authenticated)',
        add: 'POST /api/bought-products (authenticated)',
        sendMaterials: 'POST /api/bought-products/:productId/send-materials (authenticated)',
        remove: 'DELETE /api/bought-products/:productId (authenticated)',
      },
      personalOrders: {
        getOwn: 'GET /api/personal-orders (authenticated)',
        getAll: 'GET /api/personal-orders/all (admin)',
        create: 'POST /api/personal-orders (authenticated)',
        getById: 'GET /api/personal-orders/:orderId (authenticated)',
        update: 'PUT /api/personal-orders/:orderId (authenticated)',
        delete: 'DELETE /api/personal-orders/:orderId (authenticated)',
        getFiles: 'GET /api/personal-orders/:orderId/files (admin)',
        uploadFiles: 'POST /api/personal-orders/:orderId/files (admin)',
        sendMaterials: 'POST /api/personal-orders/:orderId/send-materials (admin)',
        deleteFile: 'DELETE /api/personal-orders/:orderId/files/:fileId (admin)',
      },
      reviews: {
        getByProduct: 'GET /api/reviews/product/:productId',
        getByUser: 'GET /api/reviews/user/:userId',
        create: 'POST /api/reviews (authenticated)',
        delete: 'DELETE /api/reviews/:reviewId (authenticated)',
      },
      faqs: {
        getAll: 'GET /api/faqs',
        getById: 'GET /api/faqs/:id',
        create: 'POST /api/faqs (admin)',
        update: 'PUT /api/faqs/:id (admin)',
        delete: 'DELETE /api/faqs/:id (admin)',
      },
      polls: {
        getAll: 'GET /api/polls (authenticated)',
        getById: 'GET /api/polls/:pollId (authenticated)',
        getAdminResults: 'GET /api/polls/results (admin)',
        getPollResults: 'GET /api/polls/:pollId/results',
        create: 'POST /api/polls (admin)',
        vote: 'POST /api/polls/:pollId/vote (authenticated)',
        updateStatus: 'PUT /api/polls/:pollId/status (admin)',
        delete: 'DELETE /api/polls/:pollId (admin)',
      },
      analytics: {
        getStatsByProduct: 'GET /api/analytics/stats/:productId (admin)',
        getProductsStats: 'GET /api/analytics/products (admin)',
      },
      payments: {
        initiateProduct: 'POST /api/payments/product/:productId/initiate (authenticated)',
        initiateOrder: 'POST /api/payments/order/:orderId/initiate (authenticated)',
        initiateCart: 'POST /api/payments/cart/initiate (authenticated or guest)',
        verify: 'POST /api/payments/verify (authenticated or guest)',
        result: 'POST /api/payments/result (public — LiqPay callback)',
        resultRedirect: 'GET /api/payments/result (public)',
        callback: 'POST /api/payments/callback (public — signature-verified)',
      },
      admin: {
        facebookPost: 'POST /api/admin/facebook/post (admin)',
      },
      apm: {
        getStats: 'GET /api/apm/stats',
        health: 'GET /api/apm/health',
        reset: 'POST /api/apm/reset',
      },
      clientErrors: {
        report: 'POST /api/errors/client',
      },
      system: {
        health: 'GET /api/health',
        database: 'GET /api/test-db',
        info: 'GET /api/info',
        swagger: 'GET /api/docs',
      },
    },
    staticFiles: {
      uploads: 'GET /uploads/products/{productId}/{filename}'
    },
    metadata: {
      environment: process.env.NODE_ENV || 'development',
      port: PORT,
      logLevel: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'development' ? 'debug' : 'info'),
      timestamp: new Date().toISOString()
    }
  });
});

// ── Database connection test endpoint ─────────────────────────────────────────
app.get('/api/test-db', async (req, res) => {
  logger.debug('Database connectivity test requested', {
    module: 'server',
    requestId: req.requestId,
  });
  try {
    const result = await query('SELECT NOW() as current_time');
    logger.info('Database connectivity test passed', {
      module: 'server',
      requestId: req.requestId,
      dbTime: result.rows[0].current_time,
    });
    res.json({
      status: 'Database connected successfully',
      currentTime: result.rows[0].current_time
    });
  } catch (error) {
    logger.error('Database connectivity test failed', {
      module: 'server',
      requestId: req.requestId,
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      error: 'Database connection failed',
      details: error.message
    });
  }
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  logger.debug('Health check requested', { module: 'server', requestId: req.requestId });
  res.json({
    status: 'OK',
    message: 'Muza Life Backend Server is running!',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// ── 404 handler (must be before globalErrorHandler) ───────────────────────────
app.use('*', notFoundHandler);

// ── Global error handler (must be last) ───────────────────────────────────────
app.use(globalErrorHandler);

// ── Start server ──────────────────────────────────────────────────────────────
const server = https.createServer(sslOptions, app);

server.listen(PORT, () => {
  logger.info('MuzaLife backend server started', {
    module: 'server',
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'development' ? 'debug' : 'info'),
    https: true,
    swagger: fs.existsSync(swaggerSpecPath),
  });

  /* eslint-disable no-console */
  console.log(`🚀 Muza Life Backend Server running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📍 Log level: ${process.env.LOG_LEVEL || (process.env.NODE_ENV === 'development' ? 'debug' : 'info')} (override with LOG_LEVEL=<level>)`);
  console.log(`📍 Health check: https://localhost:${PORT}/api/health`);
  console.log(`📍 API Documentation: https://localhost:${PORT}/api/info`);
  console.log(`📍 Database test: https://localhost:${PORT}/api/test-db`);
  console.log('📍 Available endpoints:');
  console.log(`   🔐 Auth: https://localhost:${PORT}/api/auth`);
  console.log(`   👥 Users: https://localhost:${PORT}/api/users`);
  console.log(`   📦 Products: https://localhost:${PORT}/api/products`);
  console.log(`   💾 Saved Products: https://localhost:${PORT}/api/saved-products`);
  console.log(`   ⭐ Reviews: https://localhost:${PORT}/api/reviews`);
  console.log(`   ❓ FAQs: https://localhost:${PORT}/api/faqs`);
  console.log(`   📊 Polls: https://localhost:${PORT}/api/polls`);
  console.log(`📍 Static files serving from: https://localhost:${PORT}/uploads/`);
  console.log('══════════════════════════════════════════════════');
  /* eslint-enable no-console */
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
const shutdown = (signal) => {
  logger.info(`Received ${signal} — shutting down gracefully`, { module: 'server' });
  server.close(() => {
    logger.info('HTTPS server closed', { module: 'server' });
    process.exit(0);
  });

  // Force-exit if graceful shutdown takes too long
  setTimeout(() => {
    logger.critical('Graceful shutdown timed out — forcing exit', { module: 'server' });
    process.exit(1);
  }, 10_000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  logger.critical('Uncaught exception — server will exit', {
    module: 'server',
    error: err.message,
    stack: err.stack,
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.critical('Unhandled promise rejection', {
    module: 'server',
    reason: String(reason),
  });
});
