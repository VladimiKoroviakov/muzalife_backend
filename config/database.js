/**
 * @fileoverview PostgreSQL database connection pool configuration.
 *
 * This module creates and exports a shared PostgreSQL connection pool used
 * throughout the application. All database credentials are loaded from
 * environment variables so that no secrets are hard-coded in source control.
 *
 * **Architectural decision:** a single shared pool is used (singleton pattern)
 * to limit the total number of open connections and avoid connection exhaustion
 * under high concurrency.
 *
 * @module config/database
 * @see {@link https://node-postgres.com/apis/pool|node-postgres Pool docs}
 */

import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import logger from '../utils/logger.js';

dotenv.config();

/**
 * Shared PostgreSQL connection pool.
 *
 * The pool automatically manages a set of reusable database connections.
 * Connection limits and idle timeouts are governed by `pg` defaults unless
 * explicitly overridden via environment variables.
 *
 * @type {Object}
 */
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'muzalife',
  password: process.env.DB_PASSWORD || 'password',
  port: process.env.DB_PORT || 5433,
});

// ── Pool event logging ────────────────────────────────────────────────────────
pool.on('connect', () => {
  logger.debug('New PostgreSQL connection acquired from pool', { module: 'config/database' });
});

pool.on('error', (err) => {
  logger.error('Unexpected error on idle PostgreSQL client', {
    module: 'config/database',
    error: err.message,
    stack: err.stack,
  });
});

/**
 * Executes a parameterised SQL query against the shared connection pool.
 *
 * This is the primary way every module in the application talks to the
 * database. Parameterised queries (`$1`, `$2`, …) are used exclusively to
 * prevent SQL-injection attacks.
 *
 * @param {string} text     - The SQL statement, e.g. `'SELECT * FROM users WHERE id = $1'`.
 * @param {Array}  [params] - Optional array of parameter values bound to the
 *                            placeholders in `text`.
 * @returns {Promise<Object>} Resolves with the `pg` QueryResult
 *   object which exposes `rows`, `rowCount`, `fields`, etc.
 *
 * @example
 * import { query } from './config/database.js';
 *
 * const result = await query('SELECT * FROM Users WHERE user_id = $1', [42]);
 * console.log(result.rows[0]);
 */
export const query = (text, params) => pool.query(text, params);
export default pool;
