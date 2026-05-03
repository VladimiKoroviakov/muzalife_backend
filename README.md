![License](https://img.shields.io/badge/License-MIT-green)
![Node.js](https://img.shields.io/badge/Node.js-20.x-green)
![Express](https://img.shields.io/badge/Express-4.x-lightgrey)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-blue)

# MuzaLife Back End

Backend API for the MuzaLife application — a modern web ecosystem supporting the frontend with scalable REST endpoints.

This repository contains the source code for the server-side of the MuzaLife project. It handles API routes, authentication, business logic, database interactions, and integrations used by the MuzaLife ecosystem.


## Features

- Express.js for fast and flexible REST API development
- Modular architecture with 15 route modules, controllers, and services
- Environment-based configuration for easy deployment
- JWT authentication & OAuth (Google, Facebook) + guest checkout tokens
- Two-step email OTP registration (6-digit code, 15 min TTL)
- Database integration (PostgreSQL 15+, port 5433 in dev)
- LiqPay payment integration with server-to-server webhook
- File delivery system with automatic watermarking (PDF, DOCX, PPTX, images, ZIP/RAR)
- HTTPS-only server (self-signed certs for local development)
- Swagger UI for interactive API documentation at `/api/docs`
- In-memory TTL cache for products, FAQs, and metadata
- Application Performance Monitoring (APM) via `/api/apm/stats`
- Admin panel: product & user management, Facebook posting, analytics
- Structured logging (Winston) with per-request correlation IDs
- Living-documentation tests (`tests/docs/`) enforced in CI


## Getting Started

Follow these steps to run the backend locally from a **fresh OS installation**.

### 1. Install Prerequisites

| Tool | Version | Download |
|---|---|---|
| Node.js | v20 LTS | https://nodejs.org |
| npm | comes with Node.js | — |
| PostgreSQL | v15+ | https://www.postgresql.org/download |
| Git | latest | https://git-scm.com |
| mkcert *(optional, for HTTPS)* | latest | https://github.com/FiloSottile/mkcert |

> **Windows users:** install Node.js via the official installer or `winget install OpenJS.NodeJS.LTS`. Install PostgreSQL via the official installer and add `psql` to your PATH.

> **macOS users:** `brew install node postgresql@15 mkcert`

> **Linux (Ubuntu/Debian):** `sudo apt install nodejs npm postgresql`

---

### 2. Clone the Repository

```bash
git clone https://github.com/VladimiKoroviakov/muzalife_backend.git
cd muzalife_backend
```

---

### 3. Install Dependencies

```bash
npm install
```

---

### 4. Configure Environment Variables

Copy the example below and create a `.env` file in the project root:

```bash
# Server
PORT=5001

# Database
DB_HOST=localhost
DB_PORT=5433
DB_NAME=muzalife
DB_USER=postgres
DB_PASSWORD=your_db_password_here

# Security
JWT_SECRET=your_long_random_secret_here

# URLs (must match your local setup)
FRONTEND_URL=https://localhost:3000
BACKEND_URL=https://localhost:5001

# Payment (use sandbox keys for development)
LIQPAY_PUBLIC_KEY=sandbox_your_public_key
LIQPAY_PRIVATE_KEY=sandbox_your_private_key

# SMTP (Gmail example — use App Password if 2FA is enabled)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_app_password_here
EMAIL_FROM="Muza Life" <noreply@muzalife.com>

# Optional
LOG_LEVEL=info            # debug | info | warn | error (default: info)
NODE_ENV=development
JWT_EXPIRES_IN=7d         # default: 7d

# OAuth
FACEBOOK_APP_ID=your_facebook_app_id_here
FACEBOOK_APP_SECRET=your_facebook_app_secret_here
```

> **Note:** Never commit `.env` to version control. It is already listed in `.gitignore`.

---

### 5. Set Up HTTPS Certificates

The backend **requires** HTTPS even locally. Generate self-signed certificates for `localhost`:

**Option A — using mkcert (recommended):**

```bash
# Install mkcert's local CA
mkcert -install

# Generate certs for localhost and place them in the certs/ directory
mkcert -cert-file certs/localhost-cert.pem -key-file certs/localhost-key.pem localhost 127.0.0.1
```

**Option B — using OpenSSL:**

```bash
mkdir -p certs
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout certs/localhost-key.pem \
  -out certs/localhost-cert.pem \
  -subj "/CN=localhost"
```

> The server checks for `certs/localhost-key.pem` and `certs/localhost-cert.pem` at startup and exits if they are missing.

---

### 6. Set Up the Database

**Step 6.1 — Start PostgreSQL**

- **Windows:** PostgreSQL service usually starts automatically. Check via *Services* or run `pg_ctl start`.
- **macOS:** `brew services start postgresql@15`
- **Linux:** `sudo systemctl start postgresql`

**Step 6.2 — Create the database**

Connect to PostgreSQL as the superuser and create a database:

```bash
psql -U postgres -c "CREATE DATABASE muzalife;"
```

**Step 6.3 — Run the schema setup script**

This creates all tables, indexes, and relationships defined in `scripts/setupDatabase.js`:

```bash
npm run setup-db
```

Expected output:
```
Connected to PostgreSQL
Database 'muzalife' ensured
Complete database schema created successfully
Uploads directory created: .../uploads/products
```

---

### 7. Run in Development Mode

```bash
npm run dev
```

The server starts at **https://localhost:5001** using `nodemon` (auto-restarts on file changes).

Expected output:
```
🚀 Muza Life Backend Server running on port 5001
📖 Swagger UI available at: https://localhost:5001/api/docs
📍 Health check: https://localhost:5001/api/health
```

> Your browser may warn about the self-signed certificate. Accept the exception to proceed.

---

### 8. Verify the Installation

Open the following endpoints to confirm everything works:

| Endpoint | Expected response |
|---|---|
| `GET https://localhost:5001/api/health` | `{"status":"OK"}` |
| `GET https://localhost:5001/api/test-db` | `{"status":"Database connected successfully",...}` |
| `GET https://localhost:5001/api/docs` | Swagger UI |


## Project Structure

```
/
├── certs/             # HTTPS certificates (not committed to git)
├── config/
│   ├── database.js    # PostgreSQL connection pool (singleton)
│   └── multer.js      # File upload config (50 MB limit)
├── controllers/       # Request handlers (business logic + DB queries)
├── docs/              # Project documentation
│   ├── api/           # OpenAPI 3.0 spec (openapi.yaml)
│   ├── jsdoc/         # Auto-generated JSDoc HTML reference
│   ├── i18n/          # Docs in Ukrainian and English
│   ├── scripts/       # Shell scripts (backup, start-dev, start-prod)
│   ├── deployment.md
│   ├── update.md
│   ├── backup.md
│   ├── performance.md
│   ├── linting.md
│   └── generate_docs.md
├── docs-site/         # VitePress documentation site (GitHub Pages)
├── logs/              # Winston log files (not committed to git)
├── middleware/
│   ├── auth.js        # JWT verification (user, guest, any)
│   ├── errorHandler.js
│   ├── performanceMonitor.js
│   └── requestLogger.js
├── routes/            # 15 API route modules
│   ├── auth.js        # /auth — registration, login, OAuth
│   ├── users.js       # /users — profile, password, email change
│   ├── products.js    # /products — catalogue, CRUD (admin)
│   ├── savedProducts.js    # /saved-products
│   ├── boughtProducts.js   # /bought-products
│   ├── reviews.js     # /reviews
│   ├── faqs.js        # /faqs
│   ├── polls.js       # /polls
│   ├── personalOrders.js   # /personal-orders
│   ├── payments.js    # /payments — LiqPay integration
│   ├── analytics.js   # /analytics — admin stats
│   ├── metadata.js    # /metadata — types, age categories, events
│   ├── apm.js         # /apm — performance monitoring
│   ├── clientErrors.js     # /errors/client — frontend error logging
│   └── facebookAdmin.js    # /admin — Facebook posting (admin)
├── scripts/
│   └── setupDatabase.js    # DB schema initialisation
├── services/          # External integrations (email, OAuth, payments)
├── tests/
│   ├── docs/          # Living-documentation tests (Vitest)
│   ├── unit/          # Unit tests for utils, middleware, error handling
│   ├── routes/        # HTTP-level route tests (supertest + mocked DB)
│   └── helpers/       # Shared test factories (makeToken, makeApp)
├── uploads/           # User-uploaded files (not committed to git)
├── utils/
│   ├── AppError.js    # Custom error classes (400–502)
│   ├── cache.js       # In-memory TTL cache
│   ├── jwt.js         # Token generation and verification
│   ├── logger.js      # Winston logger wrapper
│   ├── urlHelper.js   # Relative → absolute URL construction
│   └── watermark.js   # File watermarking (PDF, DOCX, PPTX, images)
└── server.js          # Application entry point
```


## NPM Scripts Reference

| Command | Description |
|---|---|
| `npm run dev` | Start development server with hot-reload (nodemon) |
| `npm start` | Start production server |
| `npm run setup-db` | Create all database tables and indexes |
| `npm test` | Run all Vitest tests |
| `npm run test:docs` | Run living-documentation tests only (`tests/docs/`) |
| `npm run test:unit` | Run unit tests only (`tests/unit/`) |
| `npm run test:routes` | Run route integration tests only (`tests/routes/`) |
| `npm run test:coverage` | Run tests with v8 coverage report |
| `npm run lint` | Run ESLint check |
| `npm run lint:fix` | Run ESLint with auto-fix |
| `npm run lint:docs` | Check JSDoc coverage with ESLint |
| `npm run docs` | Generate JSDoc HTML → `docs/jsdoc/` |
| `npm run docs:clean` | Clean and regenerate JSDoc |
| `npm run docs:archive` | Create `docs/jsdoc.zip` archive |
| `npm run docs:site` | Serve VitePress docs site locally |
| `npm run check` | Run lint + test:docs (CI gate) |


## Configuration

### Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Server port (default: 5001) |
| `DB_HOST` | Yes | PostgreSQL host |
| `DB_PORT` | Yes | PostgreSQL port (**5433** in dev, not 5432) |
| `DB_NAME` | Yes | Database name |
| `DB_USER` | Yes | Database user |
| `DB_PASSWORD` | Yes | Database password |
| `JWT_SECRET` | Yes | Secret for signing JWT tokens (min 64 hex chars) |
| `JWT_EXPIRES_IN` | No | JWT lifetime (default: `7d`) |
| `FRONTEND_URL` | Yes | Frontend origin for CORS (e.g. `https://localhost:3000`) |
| `BACKEND_URL` | Yes | Backend base URL (e.g. `https://localhost:5001`) |
| `SMTP_HOST` | Yes | SMTP server hostname |
| `SMTP_PORT` | Yes | SMTP port (typically 587) |
| `SMTP_SECURE` | Yes | `false` for STARTTLS, `true` for SSL/465 |
| `SMTP_USER` | Yes | SMTP username/email |
| `SMTP_PASSWORD` | Yes | SMTP password or App Password |
| `EMAIL_FROM` | Yes | Sender display name and address |
| `FACEBOOK_APP_ID` | No | Facebook OAuth App ID |
| `FACEBOOK_APP_SECRET` | No | Facebook OAuth App Secret |
| `LIQPAY_PUBLIC_KEY` | No | LiqPay payment public key |
| `LIQPAY_PRIVATE_KEY` | No | LiqPay payment private key |
| `LOG_LEVEL` | No | Winston log level: `debug`, `info`, `warn`, `error` (default: `info`) |
| `NODE_ENV` | No | `development` or `production` |


## Documentation

### Documentation Standard

All public modules, controllers, services, middleware, and utility functions use **JSDoc 3** comments. Every contributor must follow the same standard to keep the generated reference up-to-date.

**Minimum required tags for every exported symbol:**

| Tag | Purpose |
|---|---|
| `@fileoverview` / `@module` | File-level description and module name |
| `@param {Type} name` | Each function parameter |
| `@returns {Type}` | Return value |
| `@throws {Type}` | Exceptions the function may throw |
| `@example` | At least one usage example |

### Generating HTML Docs

```bash
npm run docs        # Generate to docs/jsdoc/
npm run docs:clean  # Clean and regenerate
```

Open `docs/jsdoc/index.html` in a browser to browse the reference.

### API Documentation (Swagger UI)

The full OpenAPI 3.0 specification lives in `docs/api/openapi.yaml`.

When the server is running, browse the **interactive Swagger UI** at:
```
https://localhost:5001/api/docs
```

### Linting Docs Quality

```bash
npm run lint
```

JSDoc-related warnings indicate missing documentation. Fix all warnings before opening a Pull Request.

### Detailed Guide

See [`docs/generate_docs.md`](./docs/generate_docs.md) for the full documentation guide.

---

## Deployment

See [`docs/deployment.md`](./docs/deployment.md) for the production deployment guide.

See [`docs/update.md`](./docs/update.md) for the update and rollback procedures.

See [`docs/backup.md`](./docs/backup.md) for the backup and restore procedures.

---

## Contributing

Contributions are welcome! Follow these steps:
1. Fork it
2. Create your feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes
4. Push to your branch
5. Open a Pull Request

Please make sure your code follows existing style conventions and includes relevant tests when applicable.


## Contact

If you want to reach out:
- GitHub: https://github.com/VladimiKoroviakov
- Email: v.korovyakov@student.sumdu.edu.ua


## License

This project is licensed under the MIT License - see the LICENSE file for details.


## Support

If you found this project useful, give it a ⭐ on GitHub!
