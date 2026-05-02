---
layout: home
title: MuzaLife Backend
hero:
  name: MuzaLife Backend
  text: REST API Documentation
  tagline: Documentation for the REST API of the creative scripts and materials platform
  actions:
    - theme: brand
      text: Get Started
      link: /en/guide/getting-started
    - theme: alt
      text: API Reference
      link: /en/api/overview
    - theme: alt
      text: Swagger UI
      link: https://localhost:5001/api/docs

features:
  - icon: 🔐
    title: JWT + OAuth Authentication
    details: Two-step OTP registration, Google and Facebook login, JWT Bearer tokens, and guest checkout support.
  - icon: 📦
    title: Full REST API
    details: 50+ endpoints for products, reviews, polls, personal orders, payments, and analytics.
  - icon: 💳
    title: LiqPay Integration
    details: Pay for individual products, a cart, and personal orders. Server-to-server webhook support with signature verification.
  - icon: 🖋️
    title: File Watermarking
    details: Automatic watermarking of PDF, DOCX, PPTX, images, and ZIP/RAR archives on upload via the admin panel.
  - icon: 📖
    title: JSDoc Reference
    details: Auto-generated HTML documentation for all backend modules.
  - icon: 🔬
    title: Living Documentation Tests
    details: Every public function has a corresponding test in tests/docs/ that serves as an executable specification.
---

## Quick Start

```bash
# Clone the repository
git clone https://github.com/VladimiKoroviakov/muzalife_backend.git
cd muzalife_backend

# Install dependencies
npm install

# Generate HTTPS certificates (required — server won't start without them)
mkcert -cert-file certs/localhost-cert.pem -key-file certs/localhost-key.pem localhost 127.0.0.1

# Set up the database
npm run setup-db

# Start the development server
npm run dev

# Open the documentation
open https://localhost:5001/api/docs
```

## Project Structure

```
MuzaLife Backend/
├── certs/            — HTTPS certificates (not committed)
├── config/           — DB and Multer configuration
├── controllers/      — HTTP request handlers
├── middleware/       — auth, APM, logging, error handling
├── routes/           — 15 Express route modules
├── services/         — external integrations (email, OAuth, LiqPay)
├── utils/            — JWT, cache, logger, AppError, watermark
├── scripts/          — setupDatabase.js
├── logs/             — Winston log files (not committed)
├── uploads/          — uploaded files (not committed)
├── docs/
│   ├── api/          — OpenAPI 3.0 specification
│   ├── jsdoc/        — generated JSDoc documentation
│   ├── scripts/      — shell scripts (backup, start-dev)
│   └── i18n/         — bilingual documentation
├── docs-site/        — this VitePress site
└── tests/docs/       — living documentation tests
```
