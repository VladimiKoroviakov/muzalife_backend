# Architecture

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20 LTS |
| Framework | Express.js 4 (ES Modules) |
| Database | PostgreSQL 15+ (port 5433 in dev) |
| Auth | JWT + OAuth 2.0 (Google, Facebook) + guest tokens |
| File uploads | Multer (50 MB limit) |
| File processing | sharp (images), pdf-lib (PDF), adm-zip (ZIP/RAR) |
| Email | Nodemailer (SMTP) |
| Payments | LiqPay |
| Logging | Winston |
| Tests | Vitest |

## Middleware Order

```
CORS → express.json() → requestLogger → performanceMonitor
  → static /uploads/ → Swagger UI → API routes
  → 404 handler → globalErrorHandler
```

`globalErrorHandler` must remain last — it catches all errors that bubble up from the route handlers.

## API Routes

| Prefix | File | Access |
|--------|------|--------|
| `/auth` | `routes/auth.js` | Public |
| `/users` | `routes/users.js` | JWT |
| `/products` | `routes/products.js` | GET public; mutations — admin |
| `/saved-products` | `routes/savedProducts.js` | JWT |
| `/bought-products` | `routes/boughtProducts.js` | JWT |
| `/reviews` | `routes/reviews.js` | GET public; write — JWT |
| `/faqs` | `routes/faqs.js` | Public |
| `/polls` | `routes/polls.js` | Voting — JWT |
| `/personal-orders` | `routes/personalOrders.js` | JWT (owner or admin) |
| `/payments` | `routes/payments.js` | JWT or guest token |
| `/analytics` | `routes/analytics.js` | JWT + admin |
| `/metadata` | `routes/metadata.js` | Public (cached 1 h) |
| `/apm` | `routes/apm.js` | Public |
| `/errors/client` | `routes/clientErrors.js` | Public |
| `/admin` | `routes/facebookAdmin.js` | JWT + admin |

## Application Layers

```
routes/          — HTTP routes and input validation
controllers/     — business logic and DB queries
services/        — external integrations (Email, OAuth, LiqPay)
middleware/      — auth, logging, error handling, APM
utils/           — JWT, cache, logger, AppError, watermark, urlHelper
config/          — DB connection pool, Multer config
```

## Authentication

`middleware/auth.js` exposes three strategies:

| Function | Purpose |
|----------|---------|
| `authenticateToken` | Regular user JWT → `req.userId` |
| `authenticateGuestToken` | Guest JWT → `req.guestEmail` |
| `authenticateAnyToken` | Accepts user or guest JWT (payment endpoints) |

Token is extracted from `Authorization: Bearer <token>`. Returns 401 (missing) or 403 (invalid / expired).

## Database

A single connection pool (`config/database.js`) is shared across all routes. All queries use parameterized statements (`$1`, `$2`…) for SQL injection protection.

**Core tables:** `Users`, `Products`, `ProductTypes`, `AgeCategories`, `Events`, `Images`, `Files`, `Reviews`, `FAQs`, `Polls`, `PollVotes`, `PersonalOrders`, `PersonalOrderFiles`, `EmailVerificationCodes`, `ProductViews`.

**Junction tables:** `ProductAgeCategories`, `ProductEvents`, `ProductImages`, `ProductFiles`, `SavedUserProducts`, `BoughtUserProducts`, `GuestPurchases`, `PollUserVotes`, `ProductReviews`.

## Error Handling

Always throw `AppError` subclasses (`NotFoundError`, `ConflictError`, `ForbiddenError`, etc.) — never `new Error()`. `globalErrorHandler` automatically classifies and maps them to the appropriate HTTP response with bilingual messages (`uk`/`en`).

Available error classes: `ValidationError` (400), `UnauthorizedError` (401), `ForbiddenError` (403), `NotFoundError` (404), `ConflictError` (409), `UnprocessableError` (422), `RateLimitError` (429), `InternalError` (500), `ExternalServiceError` (502).

## Caching

`utils/cache.js` is a simple in-memory TTL cache. Current keys:

| Key | TTL |
|-----|-----|
| `"products:all"` | 5 minutes |
| `"products:<id>"` | 5 minutes |
| `"faqs:all"` | 10 minutes |
| `"metadata:types"`, `"metadata:age-categories"`, `"metadata:events"` | 1 hour |

The cache is invalidated on every write operation.

## Payments (LiqPay)

Three payment channels:

1. **Single product** — `POST /api/payments/product/:productId/initiate` (JWT)
2. **Personal order** — `POST /api/payments/order/:orderId/initiate` (JWT)
3. **Cart** — `POST /api/payments/cart/initiate` (user or guest JWT)

After a successful payment LiqPay calls `POST /api/payments/callback` (signature-verified webhook). The server automatically sends purchased materials to the buyer's email.

## File Delivery & Watermarking

When files are uploaded via the admin panel (`POST /api/products` or `/personal-orders/:id/files`), `utils/watermark.js` automatically applies a watermark to supported formats: PDF, DOCX, PPTX, JPEG, PNG, ZIP, RAR. A watermark failure is non-fatal — the file is saved without it.

After payment confirmation the server emails download links to the buyer.

## Application Performance Monitoring (APM)

`middleware/performanceMonitor.js` tracks per-route latency in a rolling window (last 500 requests). Available endpoints:

- `GET /api/apm/stats` — p50/p95/p99 + cache stats + memory
- `GET /api/apm/health` — liveness check with uptime
