/**
 * @file Centralized Winston-based logging utility for MuzaLife backend.
 *
 * Provides a configured logger with multiple transports:
 *   - Console output (colorized, human-readable)
 *   - Combined log file (all levels)
 *   - Error-only log file
 *   - Daily rotating log files (by date, max 14 days retention)
 *
 * **Log level** is controlled at runtime via the `LOG_LEVEL` environment
 * variable — no recompilation required.  Falls back to `'info'` in
 * production and `'debug'` in development if the variable is not set.
 *
 * **Log format** (JSON lines in files, colorized text in console):
 * ```
 * {"timestamp":"…","level":"info","module":"server","message":"…","requestId":"…"}
 * ```
 * @module utils/logger
 */

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Log directory ─────────────────────────────────────────────────────────────
const LOG_DIR = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// ── Resolve log level ─────────────────────────────────────────────────────────
// Priority: LOG_LEVEL env var → NODE_ENV default → 'info'
// This allows changing log verbosity WITHOUT recompiling or restarting the
// service in many deployment models (e.g. re-export and SIGHUP).
const resolveLogLevel = () => {
  if (process.env.LOG_LEVEL) {return process.env.LOG_LEVEL.toLowerCase();}
  return process.env.NODE_ENV === 'development' ? 'debug' : 'info';
};

const LOG_LEVEL = resolveLogLevel();

// ── Custom log levels (npm defaults + custom CRITICAL alias) ──────────────────
// Winston npm levels: error(0) warn(1) info(2) http(3) verbose(4) debug(5) silly(6)
// We expose: ERROR, WARN, INFO, HTTP, DEBUG — matching the lab requirement.
// CRITICAL is mapped to 'error' with a severity tag in metadata.

// ── Formats ───────────────────────────────────────────────────────────────────
const { combine, timestamp, errors, json, colorize, printf, metadata } = winston.format;

/** JSON format used for log files — machine-parseable. */
const fileFormat = combine(
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  errors({ stack: true }),
  metadata({ fillExcept: ['message', 'level', 'timestamp', 'label'] }),
  json()
);

/** Human-readable colorized format for the console. */
const consoleFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'HH:mm:ss.SSS' }),
  errors({ stack: true }),
  printf(({ timestamp: ts, level, message, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length
      ? ` ${  JSON.stringify(meta, null, 0)}`
      : '';
    return `[${ts}] ${level}: ${stack || message}${metaStr}`;
  })
);

// ── Transports ────────────────────────────────────────────────────────────────

/**
 * Console transport — always active.
 * In production the level is capped at 'info' unless LOG_LEVEL overrides it.
 */
const consoleTransport = new winston.transports.Console({
  level: LOG_LEVEL,
  format: consoleFormat,
});

/**
 * Combined file — all messages at or above LOG_LEVEL.
 * Not rotated; suitable for short-lived containers or manual archiving.
 */
const combinedFileTransport = new winston.transports.File({
  filename: path.join(LOG_DIR, 'combined.log'),
  level: LOG_LEVEL,
  format: fileFormat,
  maxsize: 10 * 1024 * 1024, // 10 MB per file before rollover
  maxFiles: 5,               // keep last 5 rolled files
  tailable: true,
});

/**
 * Error-only file — only 'error' level messages.
 * Allows quick inspection of failures without grepping.
 */
const errorFileTransport = new winston.transports.File({
  filename: path.join(LOG_DIR, 'error.log'),
  level: 'error',
  format: fileFormat,
  maxsize: 10 * 1024 * 1024,
  maxFiles: 5,
  tailable: true,
});

/**
 * Daily rotating transport — one file per day, retained for 14 days.
 * Filenames: logs/muzalife-YYYY-MM-DD.log
 * Compression: gzip on rotation.
 *
 * Log rotation strategy:
 *   - By time: new file every day at midnight UTC
 *   - By size: if a single day's file exceeds 20 MB it is rotated mid-day
 *   - Retention: files older than 14 days are deleted automatically
 *
 * In containerised deployments (Docker) log rotation is typically handled by
 * the container runtime (e.g. Docker's `--log-opt max-size`).  This in-process
 * rotation provides an additional safety net for bare-metal or VM deployments.
 */
const dailyRotateTransport = new DailyRotateFile({
  dirname: LOG_DIR,
  filename: 'muzalife-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,       // gzip rotated files
  maxSize: '20m',            // rotate mid-day if file exceeds 20 MB
  maxFiles: '14d',           // keep 14 days of logs
  level: LOG_LEVEL,
  format: fileFormat,
});

dailyRotateTransport.on('rotate', (oldFile, newFile) => {
  // This event fires when a rotation happens; useful for external monitoring
  logger.info('Log file rotated', { oldFile, newFile, module: 'logger' });
});

// ── Logger instance ───────────────────────────────────────────────────────────
const logger = winston.createLogger({
  level: LOG_LEVEL,
  transports: [
    consoleTransport,
    combinedFileTransport,
    errorFileTransport,
    dailyRotateTransport,
  ],
  // Uncaught exceptions and unhandled rejections are written to the error log
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'exceptions.log'),
      format: fileFormat,
    }),
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'rejections.log'),
      format: fileFormat,
    }),
  ],
  exitOnError: false,
});

// ── Convenience helpers ───────────────────────────────────────────────────────

/**
 * Logs a CRITICAL severity error (mapped to the 'error' level with a
 * `critical: true` metadata flag).  Use for unrecoverable application states.
 * @param {string} message - Human-readable description of the critical event.
 * @param {object} [meta]  - Additional metadata (module, errorId, context…).
 */
logger.critical = (message, meta = {}) => {
  logger.error(message, { ...meta, critical: true, severity: 'CRITICAL' });
};

// ── Startup info ──────────────────────────────────────────────────────────────
logger.info('Logger initialised', {
  module: 'logger',
  level: LOG_LEVEL,
  logDir: LOG_DIR,
  transports: ['console', 'combined.log', 'error.log', 'daily-rotate'],
});

export default logger;
