/**
 * @fileoverview Vitest configuration for MuzaLife Backend.
 *
 * Two test suites are defined:
 *  - `unit`  — fast isolated unit tests in tests/unit/
 *  - `docs`  — living-documentation tests in tests/docs/
 *
 * Run all:          npm test
 * Run docs only:    npm run test:docs
 * Run with UI:      npm run test:ui
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use Node environment (no DOM)
    environment: 'node',

    // Pattern for test files
    include: ['tests/**/*.test.js'],

    // Separate reporters for CI vs local
    reporters: process.env.CI ? ['verbose', 'junit'] : ['verbose'],

    outputFile: {
      junit: './docs/test-results/junit.xml',
    },

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './docs/coverage',
      include: ['utils/**', 'services/**', 'middleware/**', 'config/**'],
      exclude: ['node_modules/**', 'docs/**'],
    },

    // Test timeout (ms)
    testTimeout: 10000,
  },
});
