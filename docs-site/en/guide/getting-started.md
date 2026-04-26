# Getting Started

## Requirements

| Dependency | Minimum Version |
|-----------|----------------|
| Node.js   | 20.x           |
| PostgreSQL | 15+           |
| npm       | 10+            |
| mkcert    | latest (for HTTPS) |

## Installation

```bash
git clone https://github.com/VladimiKoroviakov/muzalife_backend.git
cd muzalife_backend
npm install
```

## HTTPS Certificates

The server **requires** HTTPS even locally and will not start without certificates.

**Option A — mkcert (recommended):**

```bash
# Install local CA (once)
mkcert -install

# Generate certificates for localhost
mkcert -cert-file certs/localhost-cert.pem -key-file certs/localhost-key.pem localhost 127.0.0.1
```

**Option B — OpenSSL:**

```bash
mkdir -p certs
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout certs/localhost-key.pem \
  -out certs/localhost-cert.pem \
  -subj "/CN=localhost"
```

## Environment Variables

Create a `.env` file in the project root:

```dotenv
# Server
PORT=5001

# Database (port 5433 in dev)
DB_HOST=localhost
DB_PORT=5433
DB_NAME=muzalife
DB_USER=postgres
DB_PASSWORD=your_password

# JWT
JWT_SECRET=your_64_byte_hex_secret
JWT_EXPIRES_IN=7d

# URLs (must match your local setup)
FRONTEND_URL=https://localhost:3000
BACKEND_URL=https://localhost:5001

# Email (Nodemailer)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your@gmail.com
SMTP_PASSWORD=your_app_password
EMAIL_FROM="Muza Life" <noreply@muzalife.com>

# OAuth
FACEBOOK_APP_ID=your_facebook_app_id
FACEBOOK_APP_SECRET=your_facebook_app_secret

# Payments (LiqPay)
LIQPAY_PUBLIC_KEY=sandbox_your_public_key
LIQPAY_PRIVATE_KEY=sandbox_your_private_key

# Optional
LOG_LEVEL=info
NODE_ENV=development
```

> Never commit `.env` — it is already listed in `.gitignore`.

## Running

```bash
# Initialise database schema (once)
npm run setup-db

# Start development server with hot-reload
npm run dev

# Start production server
npm start
```

Server is available at **https://localhost:5001**.

Expected startup output:
```
🚀 Muza Life Backend Server running on port 5001
📖 Swagger UI available at: https://localhost:5001/api/docs
📍 Health check: https://localhost:5001/api/health
```

> Your browser may warn about the self-signed certificate — accept the exception to proceed.

## Documentation

```bash
npm run docs          # generate JSDoc HTML → docs/jsdoc/
npm run test:docs     # run living-documentation tests
npm run docs:site     # serve VitePress docs locally
npm run docs:archive  # create docs/jsdoc.zip

# Once the server is running:
open https://localhost:5001/api/docs
```

## Verifying the Installation

| Endpoint | Expected Response |
|----------|-------------------|
| `GET /api/health` | `{"status":"OK"}` |
| `GET /api/test-db` | `{"status":"Database connected successfully",...}` |
| `GET /api/docs` | Swagger UI |
