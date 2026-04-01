# Architecture

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20 LTS |
| Framework | Express.js 4 (ES6 modules) |
| Database | PostgreSQL 15+ |
| Auth | JWT + OAuth 2.0 (Google, Facebook) |
| File uploads | Multer (50 MB limit) |
| Email | Nodemailer (SMTP) |
| Logging | Winston + daily-rotate-file |
| Tests | Vitest |

## Middleware Order

```
CORS → express.json() → requestLogger → performanceMonitor
  → static /uploads/ → Swagger UI → API routes
  → 404 handler → globalErrorHandler
```

`globalErrorHandler` must remain last — it catches all errors that bubble up from the route handlers.

## Application Layers

```
routes/          — HTTP routes and input validation
controllers/     — business logic and DB queries
services/        — external integrations (Email, OAuth)
middleware/      — auth, logging, error handling
utils/           — JWT, cache, logger, AppError
config/          — DB connection pool, Multer config
```

## Database

A single connection pool (`config/database.js`) is shared across all routes. All queries use parameterized statements (SQL injection protection).

Core tables: `Users`, `Products`, `ProductTypes`, `Reviews`, `Files`, `FAQs`, `Polls`, `PersonalOrders`, `ProductViews`.

## Error Handling

Throw `AppError` subclasses (`NotFoundError`, `ConflictError`, `ForbiddenError`, etc.) — `globalErrorHandler` automatically classifies them and maps them to the appropriate HTTP response with bilingual error messages (Ukrainian + English).

## Caching

`utils/cache.js` is a simple in-memory TTL cache. Currently used for the product catalogue (`"products:all"` and `"products:<id>"` keys, 5-minute TTL). The cache is invalidated on every write operation.
