import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import https from 'https';

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

import { query } from './config/database.js';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5001;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SSL_KEY_PATH = path.join(__dirname, 'certs', 'localhost-key.pem');
const SSL_CERT_PATH = path.join(__dirname, 'certs', 'localhost-cert.pem');

if (!fs.existsSync(SSL_KEY_PATH) || !fs.existsSync(SSL_CERT_PATH)) {
  console.error('\n Missing HTTPS certificates!');
  process.exit(1);
}

const sslOptions = {
  key: fs.readFileSync(SSL_KEY_PATH),
  cert: fs.readFileSync(SSL_CERT_PATH),
};

// Middleware
app.use(cors({
  origin: 'https://localhost:3000',
  credentials: true,
}));
app.use(express.json());

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Debug middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/product-files', productFilesRoutes);
app.use('/api/faqs', faqRoutes);
app.use('/api/users', userRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/products', productsRouter);
app.use('/api/saved-products', savedProductsRoutes);
app.use('/api/polls', pollRoutes);
app.use('/api/analytics', analytics);
app.use('/api/personal-orders', personalOrdersRoutes);
app.use('/api/bought-products', boughtProductsRoutes);

// Server info endpoint
app.get('/api/info', (req, res) => {
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
      timestamp: new Date().toISOString()
    }
  });
});

// Database connection test endpoint
app.get('/api/test-db', async (req, res) => {
  try {
    const result = await query('SELECT NOW() as current_time');
    res.json({ 
      status: 'Database connected successfully',
      currentTime: result.rows[0].current_time 
    });
  } catch (error) {
    console.error('Database connection error:', error);
    res.status(500).json({ 
      error: 'Database connection failed',
      details: error.message 
    });
  }
});

// Basic health check route
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Muza Life Backend Server is running!',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// 404 handler for undefined routes
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: `The route ${req.originalUrl} does not exist`,
    availableRoutes: [
      'GET /api/health',
      'GET /api/info',
      'GET /api/test-db',
      'POST /api/auth/register',
      'POST /api/auth/login',
      'POST /api/auth/google',
      'POST /api/auth/facebook',
      'GET /api/auth/me',
      'GET /api/users/profile',
      'GET /api/saved-products',
      'GET /api/saved-products/ids',
      'POST /api/saved-products',
      'DELETE /api/saved-products/:productId',
      'GET /api/saved-products/check/:productId',
      'POST /api/products/:productId/upload',
      'GET /api/products/:productId/files',
      'DELETE /api/products/files/:fileId',
      'GET /api/polls',
      'GET /api/polls/:pollId',
      'POST /api/polls',
      'POST /api/polls/:pollId/vote',
      'GET /api/polls/:pollId/results',
      'PUT /api/polls/:pollId/status',
    ]
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  
  // Handle multer file upload errors
  if (error.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      error: 'File too large',
      message: 'File size must be less than 50MB'
    });
  }
  
  if (error.message.includes('Invalid file type')) {
    return res.status(400).json({
      error: 'Invalid file type',
      message: error.message
    });
  }

  res.status(500).json({
    error: 'Internal server error',
    message: 'Something went wrong on the server'
  });
});

https.createServer(sslOptions, app).listen(PORT, () => {
  console.log(`🚀 Muza Life Backend Server running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
  console.log(`📍 API Documentation: http://localhost:${PORT}/api/info`);
  console.log(`📍 Database test: http://localhost:${PORT}/api/test-db`);
  console.log(`📍 Available endpoints:`);
  console.log(`   🔐 Auth: http://localhost:${PORT}/api/auth`);
  console.log(`   👥 Users: http://localhost:${PORT}/api/users`);
  console.log(`   📦 Products: http://localhost:${PORT}/api/products`);
  console.log(`   💾 Saved Products: http://localhost:${PORT}/api/saved-products`);
  console.log(`   📁 Product Files: http://localhost:${PORT}/api/product-files`);
  console.log(`   ⭐ Reviews: http://localhost:${PORT}/api/reviews`);
  console.log(`   ❓ FAQs: http://localhost:${PORT}/api/faqs`);
  console.log(`   📊 Polls: http://localhost:${PORT}/api/polls`);
  console.log(`📍 Static files serving from: http://localhost:${PORT}/uploads/`);
  console.log('══════════════════════════════════════════════════');
});