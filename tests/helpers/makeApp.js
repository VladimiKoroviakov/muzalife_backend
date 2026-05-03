/**
 * @file Minimal Express app factory for route integration tests.
 *
 * Creates a fresh Express instance per test suite so route tests never share
 * state. The caller provides a map of `{ mountPath: router }` pairs; the factory
 * attaches `express.json()`, mounts the routers, then appends the global error
 * handlers from `middleware/errorHandler.js`.
 *
 * **Usage in a route test file:**
 * ```js
 * import faqRouter from '../../routes/faqs.js';
 * import { makeApp } from '../helpers/makeApp.js';
 *
 * const app = makeApp({ '/api/faqs': faqRouter });
 * ```
 * @module tests/helpers/makeApp
 */

import express from 'express';
import { globalErrorHandler, notFoundHandler } from '../../middleware/errorHandler.js';

/**
 * Creates a test Express application with the provided routers mounted.
 * @param {Record<string, import('express').Router>} routes - Map of path → router.
 * @returns {import('express').Application}
 */
export function makeApp(routes = {}) {
  const app = express();
  app.use(express.json());

  for (const [path, router] of Object.entries(routes)) {
    app.use(path, router);
  }

  app.use(notFoundHandler);
  app.use(globalErrorHandler);
  return app;
}
