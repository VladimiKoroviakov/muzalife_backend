/**
 * @fileoverview MuzaLife backend server entry point.
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
 *
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

// Import routes
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import faqRoutes from './routes/faqs.js';
import { productFilesRoutes } from './routes/productFiles.js';
import reviewRoutes from './routes/reviews.js';
import productsRouter from './routes/products.js';
import savedProductsRoutes from './routes/savedProducts.js';
import pollRoutes from './routes/polls.js';
import analytics from './routes/analytics.js';
import personalOrdersRoutes from './routes/personalOrders.js';
import boughtProductsRoutes from './routes/boughtProducts.js';
import clientErrorsRouter from './routes/clientErrors.js';

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

// ── Request logging (replaces the old console.log debug middleware) ───────────
// Attaches req.requestId (UUID) and logs every request/response pair.
app.use(requestLogger);

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
    path: `/api/docs`,
  });
}

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/product-files', productFilesRoutes);
app.use('/api/faqs', faqRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/products', productsRouter);
app.use('/api/saved-products', savedProductsRoutes);
app.use('/api/polls', pollRoutes);
app.use('/api/analytics', analytics);
app.use('/api/personal-orders', personalOrdersRoutes);
app.use('/api/bought-products', boughtProductsRoutes);
app.use('/api/errors/client', clientErrorsRouter);

logger.info('All API route modules mounted', { module: 'server' });

// ── Server info endpoint ──────────────────────────────────────────────────────
app.get('/api/info', (req, res) => {
  logger.debug('Server info requested', { module: 'server', requestId: req.requestId });
  res.json({
    name: 'Muza Life Backend API',
    version: '1.0.0',
    description: 'Muza Life backend for authentication, user management, products, reviews, polls, FAQs, analytics, personal orders.',
    endpoints: {
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        google: 'POST /api/auth/google',
        facebook: 'POST /api/auth/facebook',
      },
      users: {
        getAllUsers: 'GET /api/users (admin only)',
        getUserById: 'GET /api/users/:id (protected)',
        updateUser: 'PUT /api/users/:id (protected)',
        deleteUser: 'DELETE /api/users/:id (admin only)',
        profile: 'GET /api/users/profile (protected)',
      },
      products: {
        getAllProducts: 'GET /api/products',
        getProductById: 'GET /api/products/:id',
        createProduct: 'POST /api/products (protected)',
        updateProduct: 'PUT /api/products/:id (protected)',
        deleteProduct: 'DELETE /api/products/:id (protected)',
      },
      savedProducts: {
        getSavedProducts: 'GET /api/saved-products (protected)',
        getSavedProductIds: 'GET /api/saved-products/ids (protected)',
        saveProduct: 'POST /api/saved-products (protected)',
        unsaveProduct: 'DELETE /api/saved-products/:productId (protected)',
        checkSaved: 'GET /api/saved-products/check/:productId (protected)'
      },
      boughtProducts: {
        getBoughtProducts: 'GET /api/bought-products (protected)',
        addBoughtProduct: 'POST /api/bought-products (protected)',
        removeBoughtProduct: 'DELETE /api/bought-products/:productId (protected)'
      },
      productFiles: {
        uploadFile: 'POST /api/product-files/:productId/upload (protected)',
        getProductFiles: 'GET /api/product-files/:productId',
        deleteFile: 'DELETE /api/product-files/:fileId (protected)'
      },
      reviews: {
        getAllReviews: 'GET /api/reviews',
        getProductReviews: 'GET /api/reviews/product/:productId',
        getUserReviews: 'GET /api/reviews/user/:userId (protected)',
        createReview: 'POST /api/reviews (protected)',
        updateReview: 'PUT /api/reviews/:id (protected)',
        deleteReview: 'DELETE /api/reviews/:id (protected)'
      },
      faqs: {
        getAll: 'GET /api/faqs',
        getById: 'GET /api/faqs/:id',
        create: 'POST /api/faqs (protected)',
        update: 'PUT /api/faqs/:id (protected)',
        delete: 'DELETE /api/faqs/:id (protected)',
      },
      polls: {
        getAllPolls: 'GET /api/polls',
        getPoll: 'GET /api/polls/:pollId (protected)',
        createPoll: 'POST /api/polls (admin only)',
        vote: 'POST /api/polls/:pollId/vote (protected)',
        getResults: 'GET /api/polls/:pollId/results',
        updateStatus: 'PUT /api/polls/:pollId/status (admin only)'
      },
      personalOrders: {
        getOrders: 'GET /api/personal-orders (protected)',
        createOrder: 'POST /api/personal-orders (protected)',
        updateOrder: 'PUT /api/personal-orders/:orderId (protected)',
        deleteOrder: 'DELETE /api/personal-orders/:orderId (protected)'
      },
      analytics: {
        getStats: 'GET /api/analytics/stats/:productId (admin only)',
      },
      system: {
        health: 'GET /api/health',
        database: 'GET /api/test-db',
        info: 'GET /api/info'
      }
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
  console.log(`   📁 Product Files: https://localhost:${PORT}/api/product-files`);
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
