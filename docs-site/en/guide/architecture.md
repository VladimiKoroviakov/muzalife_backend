# Architecture

## Project Structure

MuzaLife Backend is a REST API built with **Node.js + Express**, serving the React SPA (MuzaLife Frontend). It uses PostgreSQL as its primary data store and implements authentication via JWT and OAuth 2.0.

```
muzalife-backend/
├── config/
│   └── database.js        # Singleton PostgreSQL connection pool
├── controllers/           # Route handlers (auth, products, reviews, …)
├── services/
│   └── verificationService.js  # OTP generation & validation
├── middleware/
│   └── authMiddleware.js  # JWT verification middleware
├── utils/
│   ├── jwt.js             # generateToken / verifyToken
│   └── urlHelper.js       # constructFullUrl
├── routes/
├── docs/
│   ├── api/openapi.yaml   # OpenAPI 3.0 specification
│   └── jsdoc/             # Generated JSDoc HTML
└── tests/docs/            # Living documentation tests
```

## Key Architectural Decisions

### Singleton DB Connection Pool

`config/database.js` exports a single shared `pg.Pool`. This prevents exhausting PostgreSQL's connection limit under high traffic.

```js
import { query } from '../config/database.js';
const result = await query('SELECT * FROM products WHERE id = $1', [id]);
```

### Two-Step Registration

1. `POST /auth/register` — validates email uniqueness, generates OTP, sends email
2. `POST /auth/verify` — validates OTP, only then creates the user account

This prevents fake email registrations and allows resending the code without creating duplicate users.

### Minimal JWT Payload

Tokens carry only `userId`. This avoids stale-data problems — if a user changes their email, old tokens remain valid but the next DB query returns fresh data.

### Structured Error Responses

All controllers return structured errors:
```json
{ "error": "ValidationError", "message": "...", "code": "..." }
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20 |
| Framework | Express 4 |
| Database | PostgreSQL 14+ via `pg` |
| Auth | JWT, Google OAuth, Facebook OAuth |
| Email | Nodemailer |
| API Docs | OpenAPI 3.0 + Swagger UI |
| Testing | Vitest 2 |
| Documentation | JSDoc 3 |
