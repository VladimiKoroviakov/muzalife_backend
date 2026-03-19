---
layout: home
title: MuzaLife Backend
hero:
  name: MuzaLife Backend
  text: REST API Documentation
  tagline: REST API documentation for the MuzaLife creative scenarios platform
  actions:
    - theme: brand
      text: Getting Started
      link: /en/guide/getting-started
    - theme: alt
      text: API Reference
      link: /en/api/overview

features:
  - icon: 🔐
    title: JWT + OAuth Authentication
    details: Two-step OTP registration, Google and Facebook login, JWT Bearer token protection.
  - icon: 📦
    title: Full REST API
    details: 40+ endpoints for products, reviews, polls, personal orders and analytics.
  - icon: 📖
    title: JSDoc Reference
    details: Auto-generated HTML documentation for all backend modules.
  - icon: 🔬
    title: Living Documentation Tests
    details: Every public function has a matching test in tests/docs/ serving as an executable specification.
---

## Quick Start

```bash
git clone https://github.com/VladimiKoroviakov/muzalife_backend.git
cd muzalife_backend
npm install
npm run dev
```

## Project Structure

```
MuzaLife Backend/
├── config/           — database configuration
├── controllers/      — HTTP request handlers
├── middleware/       — middleware (auth, etc.)
├── routes/           — Express routes
├── services/         — business logic
├── utils/            — helpers (JWT, URL)
├── docs/
│   ├── api/          — OpenAPI 3.0 specification
│   ├── jsdoc/        — generated JSDoc documentation
│   └── i18n/         — bilingual documentation
├── docs-site/        — this VitePress site
└── tests/docs/       — living documentation tests
```
