/**
 * VitePress configuration for the MuzaLife Backend documentation site.
 *
 * Deployed to GitHub Pages via .github/workflows/deploy-docs.yml.
 * Live at: https://vladimikoroviakov.github.io/muzalife_backend/
 *
 * Structure:
 *   /             — landing page (docs-site/index.md)
 *   /api/         — OpenAPI reference (rendered from openapi.yaml)
 *   /jsdoc/       — linked JSDoc HTML site
 *   /guide/       — developer guides
 */

import { defineConfig } from 'vitepress';

export default defineConfig({
  // localhost links in API docs are intentional (dev server URLs) — skip check
  ignoreDeadLinks: true,

  // ── Site metadata ─────────────────────────────────────────────────────────
  title: 'MuzaLife Backend',
  description: 'REST API documentation for the MuzaLife platform',
  lang: 'uk',                     // primary language: Ukrainian
  base: '/muzalife_backend/',     // must match GitHub repo name exactly

  // ── Head tags ─────────────────────────────────────────────────────────────
  head: [
    ['meta', { name: 'theme-color', content: '#646cff' }],
  ],

  // ── Localisation ──────────────────────────────────────────────────────────
  locales: {
    root: {
      label: 'Українська',
      lang: 'uk',
      title: 'MuzaLife Backend',
      description: 'Документація REST API платформи MuzaLife',
    },
    en: {
      label: 'English',
      lang: 'en',
      title: 'MuzaLife Backend',
      description: 'REST API documentation for the MuzaLife platform',
      themeConfig: {
        nav: [
          { text: 'Guide',     link: '/en/guide/getting-started' },
          { text: 'API Docs',  link: '/en/api/overview' },
          { text: 'JSDoc',     link: '/jsdoc/index.html', target: '_blank' },
          { text: 'Swagger',   link: 'https://localhost:5001/api/docs', target: '_blank' },
        ],
        sidebar: [
          {
            text: 'Guide',
            items: [
              { text: 'Getting Started', link: '/en/guide/getting-started' },
              { text: 'Authentication',  link: '/en/guide/authentication' },
              { text: 'Architecture',    link: '/en/guide/architecture' },
            ],
          },
          {
            text: 'API Reference',
            items: [
              { text: 'Overview',        link: '/en/api/overview' },
              { text: 'Auth',            link: '/en/api/auth' },
              { text: 'Products',        link: '/en/api/products' },
            ],
          },
        ],
      },
    },
  },

  // ── Default (Ukrainian) theme config ──────────────────────────────────────
  themeConfig: {
    nav: [
      { text: 'Посібник',       link: '/guide/getting-started' },
      { text: 'API довідник',   link: '/api/overview' },
      { text: 'JSDoc',          link: '/jsdoc/index.html', target: '_blank' },
      { text: 'Swagger UI',     link: 'https://localhost:5001/api/docs', target: '_blank' },
    ],

    sidebar: [
      {
        text: 'Посібник',
        items: [
          { text: 'Початок роботи',  link: '/guide/getting-started' },
          { text: 'Автентифікація',  link: '/guide/authentication' },
          { text: 'Архітектура',     link: '/guide/architecture' },
        ],
      },
      {
        text: 'API довідник',
        items: [
          { text: 'Огляд',           link: '/api/overview' },
          { text: 'Auth',            link: '/api/auth' },
          { text: 'Продукти',        link: '/api/products' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/VladimiKoroviakov/muzalife_backend' },
    ],

    footer: {
      message: 'Документація MuzaLife Backend',
      copyright: 'Copyright © 2025 Vladymir Koroviakov',
    },

    search: {
      provider: 'local',
    },
  },
});
