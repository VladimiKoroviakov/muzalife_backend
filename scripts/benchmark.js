#!/usr/bin/env node
/**
 * @file HTTP performance benchmark script for MuzaLife backend.
 *
 * Sends N concurrent requests to a set of endpoints and reports latency
 * statistics: min, max, average, p50, p95, p99.
 *
 * **Usage:**
 * ```bash
 * # Run against the local dev server (default)
 * node scripts/benchmark.js
 *
 * # Override base URL or concurrency
 * BASE_URL=https://localhost:5001 CONCURRENCY=20 node scripts/benchmark.js
 * ```
 *
 * The script uses Node's built-in `https` module — no external dependencies.
 * @module scripts/benchmark
 */

import https from 'https';

const BASE_URL   = process.env.BASE_URL   || 'https://localhost:5001';
const ITERATIONS = parseInt(process.env.ITERATIONS || '30', 10);
const CONCURRENCY= parseInt(process.env.CONCURRENCY || '5',  10);
const TOKEN      = process.env.AUTH_TOKEN || '';

// Ignore self-signed dev cert
const agent = new https.Agent({ rejectUnauthorized: false });

/** @type {Array<{name: string, path: string, method?: string}>} */
const ENDPOINTS = [
  { name: 'Health check',        path: '/api/health' },
  { name: 'Products list',       path: '/api/products' },
  { name: 'Single product',      path: '/api/products/1' },
  { name: 'FAQs list',           path: '/api/faqs' },
  { name: 'Reviews (product 1)', path: '/api/reviews/product/1' },
];

/**
 * Issues a single HTTPS GET request and resolves with the elapsed time in ms.
 * @param {string} path - URL path (appended to BASE_URL).
 * @returns {Promise<number>} Duration in milliseconds.
 */
const timedRequest = (path) => new Promise((resolve, reject) => {
  const url = `${BASE_URL}${path}`;
  const options = {
    agent,
    headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {},
  };
  const start = Date.now();
  https.get(url, options, (res) => {
    // Drain response body so the connection can be reused
    res.resume();
    res.on('end', () => resolve(Date.now() - start));
    res.on('error', reject);
  }).on('error', reject);
});

/**
 * Runs `total` requests against `path` with at most `concurrency` in flight
 * at once and returns all latency samples.
 * @param {string} path
 * @param {number} total
 * @param {number} concurrency
 * @returns {Promise<number[]>}
 */
const runBatch = async (path, total, concurrency) => {
  const samples = [];
  let issued = 0;

  const worker = async () => {
    while (issued < total) {
      issued++;
      try {
        const ms = await timedRequest(path);
        samples.push(ms);
      } catch {
        samples.push(-1); // mark errors
      }
    }
  };

  const workers = Array.from({ length: concurrency }, worker);
  await Promise.all(workers);
  return samples;
};

/**
 * Computes summary statistics from a latency sample array.
 * @param {number[]} raw
 * @returns {object}
 */
const stats = (raw) => {
  const samples = raw.filter((v) => v >= 0).sort((a, b) => a - b);
  const errors  = raw.filter((v) => v < 0).length;
  const avg     = samples.reduce((s, v) => s + v, 0) / (samples.length || 1);
  const pct     = (p) => samples[Math.ceil((p / 100) * samples.length) - 1] ?? 0;
  return {
    count: raw.length,
    errors,
    avg:   avg.toFixed(1),
    min:   samples[0] ?? 0,
    max:   samples[samples.length - 1] ?? 0,
    p50:   pct(50),
    p95:   pct(95),
    p99:   pct(99),
  };
};

/** Entry point. */
const main = async () => {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║          MuzaLife Backend — Performance Benchmark     ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`  Base URL    : ${BASE_URL}`);
  console.log(`  Iterations  : ${ITERATIONS} per endpoint`);
  console.log(`  Concurrency : ${CONCURRENCY} parallel requests`);
  console.log('');

  const results = [];

  for (const ep of ENDPOINTS) {
    process.stdout.write(`  Benchmarking: ${ep.name.padEnd(28)} `);
    const samples = await runBatch(ep.path, ITERATIONS, CONCURRENCY);
    const s       = stats(samples);
    results.push({ endpoint: ep.name, ...s });
    console.log(`avg=${s.avg}ms  p95=${s.p95}ms  p99=${s.p99}ms  errors=${s.errors}`);
  }

  console.log('');
  console.log('┌─────────────────────────────────┬───────┬──────┬──────┬──────┬──────┬────────┐');
  console.log('│ Endpoint                        │  Avg  │  Min │  Max │  p50 │  p95 │ Errors │');
  console.log('├─────────────────────────────────┼───────┼──────┼──────┼──────┼──────┼────────┤');
  for (const r of results) {
    const name = r.endpoint.padEnd(31);
    console.log(
      `│ ${name} │ ${String(r.avg).padStart(5)} │ ${String(r.min).padStart(4)} │ ${String(r.max).padStart(4)} │ ${String(r.p50).padStart(4)} │ ${String(r.p95).padStart(4)} │ ${String(r.errors).padStart(6)} │`
    );
  }
  console.log('└─────────────────────────────────┴───────┴──────┴──────┴──────┴──────┴────────┘');
  console.log('  (all times in milliseconds)');
};

main().catch((err) => {
  console.error('Benchmark failed:', err.message);
  process.exit(1);
});
