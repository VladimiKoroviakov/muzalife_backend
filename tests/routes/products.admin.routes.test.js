/**
 * @file Admin operation tests for the Products API.
 *
 * Tests the write endpoints in `routes/products.js`:
 *   POST /api/products         — create product (admin only)
 *   GET  /api/products/:id/files — list product files (admin only)
 *   PUT  /api/products/:id      — update product (admin only)
 *
 * Multer file parsing is mocked so tests control req.files directly.
 * @module tests/routes/products.admin.routes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Multer mock: middleware can be configured per-test via multerMiddleware
const { multerMiddleware } = vi.hoisted(() => {
  const fn = vi.fn((_req, _res, cb) => cb(null));
  return { multerMiddleware: fn };
});

vi.mock('multer', () => {
  /**
   *
   */
  class MulterError extends Error {
    /**
     *
     * @param code
     */
    constructor(code) {
      super(code);
      this.code = code;
    }
  }
  const multerFn = vi.fn(() => ({ fields: vi.fn(() => multerMiddleware) }));
  multerFn.MulterError = MulterError;
  multerFn.diskStorage = vi.fn(() => ({}));
  return { default: multerFn };
});

vi.mock('../../config/database.js', () => ({
  query: vi.fn(),
  default: { query: vi.fn(), connect: vi.fn() },
}));

vi.mock('../../utils/cache.js', () => ({
  appCache: { get: vi.fn(() => null), set: vi.fn(), del: vi.fn(), invalidate: vi.fn() },
  TTL_PRODUCTS_LIST: 300,
  TTL_PRODUCT_SINGLE: 300,
}));

vi.mock('../../utils/watermark.js', () => ({
  applyWatermark: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: {
      ...actual.default,
      existsSync: vi.fn().mockReturnValue(false),
      mkdirSync: vi.fn(),
      rmSync: vi.fn(),
      renameSync: vi.fn(),
      unlinkSync: vi.fn(),
      readdirSync: vi.fn().mockReturnValue([]),
    },
  };
});

vi.mock('../../utils/logger.js', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import db from '../../config/database.js';
import productsRouter from '../../routes/products.js';
import { makeApp } from '../helpers/makeApp.js';
import { makeUserToken } from '../helpers/makeToken.js';

const app = makeApp({ '/api/products': productsRouter });

const adminToken = makeUserToken(1);
const userToken = makeUserToken(42);

const mockProductRow = {
  id: 10,
  title: 'Test Product',
  description: 'Desc',
  price: '150.00',
  rating: '4.0',
  image: '/uploads/products/10/main.jpg',
  type: 'Сценарій',
  type_id: 1,
  createdat: '2024-01-01T00:00:00.000Z',
  updatedat: '2024-01-01T00:00:00.000Z',
  agecategories: [],
  events: [],
  additionalimages: [],
};

let mockClient;

beforeEach(() => {
  vi.clearAllMocks();
  mockClient = { query: vi.fn(), release: vi.fn() };
  db.connect.mockResolvedValue(mockClient);
  multerMiddleware.mockImplementation((_req, _res, cb) => cb(null));
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/products — create product
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/products — create product', () => {
  it('403 — non-admin user', async () => {
    multerMiddleware.mockImplementationOnce((req, _res, cb) => {
      req.files = { mainImage: [{ filename: 'main.jpg', path: '/tmp/main.jpg', originalname: 'main.jpg', mimetype: 'image/jpeg', size: 100 }] };
      cb(null);
    });
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [{ is_admin: false }] }); // admin check

    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'T', description: 'D', price: '100', typeId: '1' });

    expect(res.status).toBe(403);
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('400 — missing required fields', async () => {
    multerMiddleware.mockImplementationOnce((req, _res, cb) => {
      req.files = { mainImage: [{ filename: 'main.jpg', path: '/tmp/main.jpg', originalname: 'main.jpg', mimetype: 'image/jpeg', size: 100 }] };
      cb(null);
    });
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [{ is_admin: true }] }); // admin check

    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'T' }); // missing description, price, typeId

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Missing required fields');
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('400 — invalid price (NaN)', async () => {
    multerMiddleware.mockImplementationOnce((req, _res, cb) => {
      req.files = { mainImage: [{ filename: 'main.jpg', path: '/tmp/main.jpg', originalname: 'main.jpg', mimetype: 'image/jpeg', size: 100 }] };
      cb(null);
    });
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [{ is_admin: true }] }); // admin check

    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'T', description: 'D', price: 'not-a-number', typeId: '1' });

    expect(res.status).toBe(400);
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('400 — missing mainImage', async () => {
    multerMiddleware.mockImplementationOnce((req, _res, cb) => {
      req.files = {}; // no mainImage
      cb(null);
    });
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [{ is_admin: true }] }); // admin check

    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'T', description: 'D', price: '100', typeId: '1' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('mainImage');
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('201 — creates product successfully', async () => {
    multerMiddleware.mockImplementationOnce((req, _res, cb) => {
      req.files = {
        mainImage: [{ filename: 'main.jpg', path: '/tmp/main.jpg', originalname: 'main.jpg', mimetype: 'image/jpeg', size: 100 }],
      };
      cb(null);
    });

    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [{ is_admin: true }] }) // admin check
      .mockResolvedValueOnce({ rows: [{ product_id: 10 }] }) // INSERT product
      .mockResolvedValueOnce(undefined) // UPDATE main image URL
      .mockResolvedValueOnce(undefined) // COMMIT
      .mockResolvedValueOnce({ rows: [mockProductRow] }); // final SELECT

    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Test Product', description: 'Desc', price: '150', typeId: '1' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('201 — creates product with ageCategoryIds and eventIds', async () => {
    multerMiddleware.mockImplementationOnce((req, _res, cb) => {
      req.files = {
        mainImage: [{ filename: 'main.jpg', path: '/tmp/main.jpg', originalname: 'main.jpg', mimetype: 'image/jpeg', size: 100 }],
      };
      cb(null);
    });

    mockClient.query
      .mockResolvedValue({ rows: [{ is_admin: true }] }); // catch-all mock
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [{ is_admin: true }] }) // admin check
      .mockResolvedValueOnce({ rows: [{ product_id: 10 }] }) // INSERT
      .mockResolvedValueOnce(undefined) // UPDATE image
      .mockResolvedValueOnce(undefined) // INSERT age category
      .mockResolvedValueOnce(undefined) // INSERT event
      .mockResolvedValueOnce(undefined) // COMMIT
      .mockResolvedValueOnce({ rows: [mockProductRow] }); // SELECT

    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'T', description: 'D', price: '100', typeId: '1', ageCategoryIds: ['2'], eventIds: ['3'] });

    expect(res.status).toBe(201);
  });

  it('500 — DB error triggers ROLLBACK', async () => {
    multerMiddleware.mockImplementationOnce((req, _res, cb) => {
      req.files = {
        mainImage: [{ filename: 'main.jpg', path: '/tmp/main.jpg', originalname: 'main.jpg', mimetype: 'image/jpeg', size: 100 }],
      };
      cb(null);
    });

    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [{ is_admin: true }] }) // admin check
      .mockRejectedValueOnce(new Error('DB insert failed')); // INSERT throws

    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'T', description: 'D', price: '100', typeId: '1' });

    expect(res.status).toBe(500);
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('400 — multer MulterError', async () => {
    const { default: multer } = await import('multer');
    multerMiddleware.mockImplementationOnce((_req, _res, cb) => {
      cb(new multer.MulterError('LIMIT_FILE_SIZE'));
    });

    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('File upload error');
  });

  it('400 — multer generic error (invalid file type)', async () => {
    multerMiddleware.mockImplementationOnce((_req, _res, cb) => {
      cb(new Error('File type not allowed: application/exe'));
    });

    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('File type not allowed');
  });

  it('401 — no auth token', async () => {
    const res = await request(app).post('/api/products').send({});
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/products/:id/files — list product files (admin only)
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/products/:id/files', () => {
  it('400 — invalid product ID', async () => {
    const res = await request(app)
      .get('/api/products/abc/files')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
  });

  it('403 — non-admin user', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ is_admin: false }] }); // admin check

    const res = await request(app)
      .get('/api/products/5/files')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
  });

  it('200 — returns file list for admin', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ is_admin: true }] }) // admin check
      .mockResolvedValueOnce({ rows: [{ fileId: 1, fileName: 'script.pdf', fileUrl: '/uploads/products/5/script.pdf', fileSize: 1024 }] });

    const res = await request(app)
      .get('/api/products/5/files')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.files).toHaveLength(1);
    expect(res.body.files[0].fileName).toBe('script.pdf');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('200 — returns empty file list', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ is_admin: true }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/products/5/files')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.files).toEqual([]);
  });

  it('401 — no token', async () => {
    const res = await request(app).get('/api/products/5/files');
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/products/:id — update product
// ─────────────────────────────────────────────────────────────────────────────
describe('PUT /api/products/:id — update product', () => {
  it('400 — invalid product ID', async () => {
    const res = await request(app)
      .put('/api/products/abc')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('403 — non-admin user', async () => {
    multerMiddleware.mockImplementationOnce((req, _res, cb) => {
      req.files = {};
      cb(null);
    });
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [{ is_admin: false }] }); // admin check

    const res = await request(app)
      .put('/api/products/5')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ title: 'New' });

    expect(res.status).toBe(403);
  });

  it('404 — product not found', async () => {
    multerMiddleware.mockImplementationOnce((req, _res, cb) => {
      req.files = {};
      cb(null);
    });
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [{ is_admin: true }] }) // admin check
      .mockResolvedValueOnce({ rows: [] }); // exists check → not found

    const res = await request(app)
      .put('/api/products/999')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'New' });

    expect(res.status).toBe(404);
  });

  it('200 — updates title only', async () => {
    multerMiddleware.mockImplementationOnce((req, _res, cb) => {
      req.files = {};
      cb(null);
    });
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [{ is_admin: true }] }) // admin check
      .mockResolvedValueOnce({ rows: [{ product_id: 5 }] }) // exists
      .mockResolvedValueOnce(undefined) // UPDATE
      .mockResolvedValueOnce(undefined) // COMMIT
      .mockResolvedValueOnce({ rows: [mockProductRow] }); // final SELECT

    const res = await request(app)
      .put('/api/products/5')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'New Title' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('200 — removes main image (removeMainImage=true)', async () => {
    multerMiddleware.mockImplementationOnce((req, _res, cb) => {
      req.files = {};
      cb(null);
    });
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [{ is_admin: true }] }) // admin
      .mockResolvedValueOnce({ rows: [{ product_id: 5 }] }) // exists
      .mockResolvedValueOnce({ rows: [{ product_main_img_url: 'https://localhost:5001/uploads/products/5/main.jpg' }] }) // current image
      .mockResolvedValueOnce(undefined) // UPDATE
      .mockResolvedValueOnce(undefined) // COMMIT
      .mockResolvedValueOnce({ rows: [mockProductRow] }); // final SELECT

    const res = await request(app)
      .put('/api/products/5')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ removeMainImage: 'true' });

    expect(res.status).toBe(200);
  });

  it('200 — removes files by ID', async () => {
    multerMiddleware.mockImplementationOnce((req, _res, cb) => {
      req.files = {};
      cb(null);
    });
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [{ is_admin: true }] }) // admin
      .mockResolvedValueOnce({ rows: [{ product_id: 5 }] }) // exists
      .mockResolvedValueOnce(undefined) // UPDATE (no setClauses except timestamp)
      .mockResolvedValueOnce({ rows: [{ file_url: '/uploads/products/5/f.pdf' }] }) // get file url
      .mockResolvedValueOnce(undefined) // DELETE ProductFiles
      .mockResolvedValueOnce(undefined) // DELETE Files
      .mockResolvedValueOnce(undefined) // COMMIT
      .mockResolvedValueOnce({ rows: [mockProductRow] }); // SELECT

    const res = await request(app)
      .put('/api/products/5')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ removeFileIds: ['10'] });

    expect(res.status).toBe(200);
  });

  it('200 — updates ageCategoryIds', async () => {
    multerMiddleware.mockImplementationOnce((req, _res, cb) => {
      req.files = {};
      cb(null);
    });
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [{ is_admin: true }] }) // admin
      .mockResolvedValueOnce({ rows: [{ product_id: 5 }] }) // exists
      .mockResolvedValueOnce(undefined) // UPDATE
      .mockResolvedValueOnce(undefined) // DELETE old age categories
      .mockResolvedValueOnce(undefined) // INSERT new age category
      .mockResolvedValueOnce(undefined) // COMMIT
      .mockResolvedValueOnce({ rows: [mockProductRow] }); // SELECT

    const res = await request(app)
      .put('/api/products/5')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ageCategoryIds: ['3'] });

    expect(res.status).toBe(200);
  });

  it('500 — DB error triggers ROLLBACK', async () => {
    multerMiddleware.mockImplementationOnce((req, _res, cb) => {
      req.files = {};
      cb(null);
    });
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [{ is_admin: true }] }) // admin
      .mockRejectedValueOnce(new Error('DB error')); // exists check throws

    const res = await request(app)
      .put('/api/products/5')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'X' });

    expect(res.status).toBe(500);
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('401 — no token', async () => {
    const res = await request(app).put('/api/products/5').send({});
    expect(res.status).toBe(401);
  });
});
