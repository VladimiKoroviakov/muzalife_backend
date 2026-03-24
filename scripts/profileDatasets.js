#!/usr/bin/env node
/**
 * @file Multi-dataset profiling script for MuzaLife backend.
 *
 * Runs the benchmark across three dataset-size scenarios — small, medium,
 * and large — by varying the number of requests sent to key endpoints.
 * Results are printed to stdout in a comparison table.
 *
 * This script satisfies the bonus lab requirement: "profiling on different
 * data volumes".
 *
 * **Usage:**
 * ```bash
 * node scripts/profileDatasets.js
 * ```
 * @module scripts/profileDatasets
 */

import https from 'https';

const BASE_URL = process.env.BASE_URL || 'https://localhost:5001';
const agent    = new https.Agent({ rejectUnauthorized: false });

/**
 * @typedef {'small'|'medium'|'large'} DatasetSize
 * @typedef {{ iterations: number, concurrency: number }} ScenarioConfig
 */

/** @type {Record<DatasetSize, ScenarioConfig>} */
const SCENARIOS = {
  small:  { iterations: 10,  concurrency: 2  },
  medium: { iterations: 50,  concurrency: 5  },
  large:  { iterations: 200, concurrency: 20 },
};

const ENDPOINTS = [
  { name: 'Products list (heavy JOIN)', path: '/api/products' },
  { name: 'Single product',            path: '/api/products/1' },
  { name: 'FAQs list',                 path: '/api/faqs' },
];

const timedRequest = (path) => new Promise((resolve) => {
  const start = Date.now();
  https.get(`${BASE_URL}${path}`, { agent }, (res) => {
    res.resume();
    res.on('end', () => resolve(Date.now() - start));
    res.on('error', () => resolve(-1));
  }).on('error', () => resolve(-1));
});

const runBatch = async (path, { iterations, concurrency }) => {
  const samples = [];
  let issued = 0;
  const worker = async () => {
    while (issued < iterations) { issued++; samples.push(await timedRequest(path)); }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return samples.filter((v) => v >= 0).sort((a, b) => a - b);
};

const summary = (sorted) => {
  const avg = sorted.reduce((s, v) => s + v, 0) / (sorted.length || 1);
  const pct = (p) => sorted[Math.ceil((p / 100) * sorted.length) - 1] ?? 0;
  return { avg: avg.toFixed(1), p50: pct(50), p95: pct(95) };
};

const main = async () => {
  console.log('\n  MuzaLife — Multi-Dataset Profiling\n');

  /** @type {Map<string, Record<DatasetSize, object>>} */
  const table = new Map();

  for (const ep of ENDPOINTS) {
    table.set(ep.name, {});
    for (const [size, cfg] of Object.entries(SCENARIOS)) {
      process.stdout.write(`  [${size.padEnd(6)}] ${ep.name.padEnd(36)} `);
      const samples = await runBatch(ep.path, cfg);
      const s = summary(samples);
      table.get(ep.name)[size] = s;
      console.log(`avg=${s.avg}ms  p50=${s.p50}ms  p95=${s.p95}ms`);
    }
  }

  console.log('\n  ── Summary table (avg / p95 in ms) ──────────────────────────────');
  console.log('  Endpoint                              │  Small        │  Medium       │  Large');
  console.log('  ───────────────────────────────────────┼───────────────┼───────────────┼───────────────');
  for (const [name, sizes] of table.entries()) {
    const fmt = (s) => `avg=${s.avg} p95=${s.p95}`.padEnd(13);
    console.log(`  ${name.padEnd(38)} │ ${fmt(sizes.small)} │ ${fmt(sizes.medium)} │ ${fmt(sizes.large)}`);
  }
  console.log('');
};

main().catch((e) => { console.error(e.message); process.exit(1); });
