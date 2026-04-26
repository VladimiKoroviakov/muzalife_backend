# MuzaLife Backend — Documentation (English)

> This folder contains documentation in English.
> Ukrainian version is at `docs/i18n/uk/`.

## Contents

- [Documentation Standards](#documentation-standards)
- [Project Structure](#project-structure)
- [Authentication](#authentication)
- [API Overview](#api-overview)
- [Tooling](#tooling)
- [Contributing](#contributing)

---

## Documentation Standards

| Level | Standard | Tool |
|-------|----------|------|
| Module / file | JSDoc 3 `@fileoverview` | JSDoc |
| Function / class | JSDoc 3 `@param`, `@returns`, `@throws`, `@example` | JSDoc |
| REST API | OpenAPI 3.0 | swagger-ui-express |
| Quality | eslint-plugin-jsdoc | ESLint |
| Living examples | Vitest living docs | Vitest |

---

## Project Structure

```
MuzaLife Backend/
├── certs/             — HTTPS certificates (not committed)
├── config/
│   ├── database.js    — PostgreSQL connection pool (singleton)
│   └── multer.js      — file upload config (50 MB limit)
├── controllers/       — request handlers (business logic + DB queries)
├── middleware/
│   ├── auth.js        — JWT verification (user, guest, any)
│   ├── errorHandler.js
│   ├── performanceMonitor.js
│   └── requestLogger.js
├── routes/            — 15 Express route modules
├── services/          — external integrations (email, OAuth, LiqPay)
├── utils/
│   ├── AppError.js    — custom error classes (400–502)
│   ├── cache.js       — in-memory TTL cache
│   ├── jwt.js         — token generation and verification
│   ├── logger.js      — Winston logger wrapper
│   ├── urlHelper.js   — relative → absolute URL construction
│   └── watermark.js   — file watermarking (PDF, DOCX, PPTX, images)
├── scripts/
│   └── setupDatabase.js
├── tests/docs/        — living documentation tests
└── docs/
    ├── api/openapi.yaml  — OpenAPI 3.0 specification
    ├── jsdoc/            — HTML reference (auto-generated)
    ├── jsdoc.zip         — documentation archive
    └── i18n/             — this folder
```

---

## Authentication

### Two-step Email Registration

1. `POST /api/auth/register/initiate` — sends a 6-digit OTP to the email (15 min TTL)
2. `POST /api/auth/register/verify` — validates OTP, creates user, returns JWT

### JWT

- Signing algorithm: **HS256**
- Payload claims: `userId`, `iat`, `exp`
- Lifetime: `JWT_EXPIRES_IN` (default 7 days)
- Transport: `Authorization: Bearer <token>`

### OAuth

- Google: `POST /api/auth/google` with a Google Access Token
- Facebook: `POST /api/auth/facebook` with a Facebook Access Token

### Guest Tokens

- `POST /api/auth/guest/verify/initiate` — initiate guest email verification
- `POST /api/auth/guest/verify/confirm` — confirm guest email, returns guest JWT
- Guest JWT is accepted by payment endpoints via `authenticateAnyToken`

---

## API Overview

Base URL: `https://localhost:5001/api`

Interactive docs: [Swagger UI](https://localhost:5001/api/docs)

Full spec: `docs/api/openapi.yaml`

| Group | Prefix | Auth |
|-------|--------|------|
| Auth | `/auth` | Public |
| Users | `/users` | JWT |
| Products | `/products` | GET public; mutations — admin |
| Saved Products | `/saved-products` | JWT |
| Bought Products | `/bought-products` | JWT |
| Reviews | `/reviews` | Read public; write — JWT |
| FAQs | `/faqs` | Public |
| Polls | `/polls` | Voting — JWT |
| Personal Orders | `/personal-orders` | JWT (owner or admin) |
| Payments | `/payments` | JWT or guest token |
| Analytics | `/analytics` | JWT + Admin |
| Metadata | `/metadata` | Public (cached 1 h) |
| APM | `/apm` | Public |
| Client Errors | `/errors/client` | Public |
| Facebook Admin | `/admin` | JWT + Admin |

---

## Tooling

```bash
npm run docs            # generate JSDoc HTML → docs/jsdoc/
npm run docs:clean      # clean and regenerate
npm run docs:archive    # create docs/jsdoc.zip
npm run docs:site       # serve VitePress docs locally
npm run lint:docs       # check JSDoc coverage with ESLint
npm run test:docs       # run living-documentation tests
```

---

## Contributing

1. Every new public function must have a JSDoc comment with `@param`, `@returns`, `@example`
2. Every new module file must have `@fileoverview`
3. New API endpoints must be added to `docs/api/openapi.yaml`
4. New utilities must have a corresponding test in `tests/docs/`
