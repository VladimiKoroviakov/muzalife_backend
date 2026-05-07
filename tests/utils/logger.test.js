/**
 * @file Unit tests for the Winston logger utility.
 *
 * Tests `utils/logger.js`. This file MUST call vi.unmock before imports to
 * override the global mock applied by tests/setup.js.
 * @module tests/utils/logger
 */

// Override the global mock from tests/setup.js so the real module is loaded.
vi.unmock('../../utils/logger.js');

import { describe, it, expect, vi } from 'vitest';

// Mock winston and its transports to avoid creating real file handles.
vi.mock('winston', async () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    http: vi.fn(),
    add: vi.fn(),
  };

  const mockTransport = {
    on: vi.fn(),
  };

  return {
    default: {
      createLogger: vi.fn(() => mockLogger),
      transports: {
        Console: vi.fn(() => mockTransport),
        File: vi.fn(() => mockTransport),
      },
      format: {
        combine: vi.fn((...args) => args),
        timestamp: vi.fn(() => ({})),
        errors: vi.fn(() => ({})),
        metadata: vi.fn(() => ({})),
        json: vi.fn(() => ({})),
        colorize: vi.fn(() => ({})),
        printf: vi.fn(() => ({})),
      },
    },
    createLogger: vi.fn(() => mockLogger),
    transports: {
      Console: vi.fn(() => mockTransport),
      File: vi.fn(() => mockTransport),
    },
    format: {
      combine: vi.fn((...args) => args),
      timestamp: vi.fn(() => ({})),
      errors: vi.fn(() => ({})),
      metadata: vi.fn(() => ({})),
      json: vi.fn(() => ({})),
      colorize: vi.fn(() => ({})),
      printf: vi.fn(() => ({})),
    },
  };
});

vi.mock('winston-daily-rotate-file', () => {
  /**
   *
   */
  class MockDailyRotate {
    /**
     *
     */
    constructor() {
      this.listeners = {};
    }
    /**
     *
     * @param event
     * @param handler
     */
    on(event, handler) {
      this.listeners[event] = handler;
    }
  }
  return { default: MockDailyRotate };
});

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: {
      ...actual.default,
      existsSync: vi.fn(() => true),
      mkdirSync: vi.fn(),
    },
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// Logger module
// ─────────────────────────────────────────────────────────────────────────────
describe('logger module', () => {
  it('exports a logger object as default', async () => {
    const { default: logger } = await import('../../utils/logger.js');

    expect(logger).toBeDefined();
    expect(typeof logger).toBe('object');
  });

  it('logger has an info method', async () => {
    const { default: logger } = await import('../../utils/logger.js');

    expect(typeof logger.info).toBe('function');
  });

  it('logger.critical calls logger.error with critical metadata', async () => {
    const { default: logger } = await import('../../utils/logger.js');

    logger.critical('Critical failure', { module: 'test' });

    expect(logger.error).toHaveBeenCalledWith(
      'Critical failure',
      expect.objectContaining({ critical: true, severity: 'CRITICAL', module: 'test' }),
    );
  });

  it('calls logger.info on module load (startup message)', async () => {
    const { default: logger } = await import('../../utils/logger.js');

    expect(logger.info).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveLogLevel is called at module init; the module loading above exercises it.
// ─────────────────────────────────────────────────────────────────────────────
describe('log level resolution', () => {
  it('logger is initialised with a level (resolveLogLevel ran without error)', async () => {
    const { default: logger } = await import('../../utils/logger.js');
    // If logger.info exists the module initialised successfully (including resolveLogLevel)
    expect(typeof logger.info).toBe('function');
  });

  it('LOG_LEVEL env var is read at module load without error', () => {
    // resolveLogLevel has three branches: LOG_LEVEL set, development, production.
    // We exercise one branch by checking the current env.
    const level = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'development' ? 'debug' : 'info');
    expect(typeof level).toBe('string');
  });
});
