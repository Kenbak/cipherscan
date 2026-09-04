#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

function parseArgs(argv) {
  const values = { runs: 30, variant: 'legacy', output: null };
  for (const arg of argv) {
    if (arg.startsWith('--api=')) values.api = arg.slice(6).replace(/\/$/, '');
    else if (arg.startsWith('--runs=')) values.runs = Number(arg.slice(7));
    else if (arg.startsWith('--variant=')) values.variant = arg.slice(10);
    else if (arg.startsWith('--output=')) values.output = arg.slice(9);
  }
  if (!values.api) throw new Error('--api=https://api.example is required');
  if (!Number.isInteger(values.runs) || values.runs < 1 || values.runs > 100) {
    throw new Error('--runs must be an integer from 1 to 100');
  }
  if (!['legacy', 'optimized'].includes(values.variant)) {
    throw new Error('--variant must be legacy or optimized');
  }
  return values;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1);
  return sorted[index];
}

function summarize(samples) {
  const totals = samples.map((sample) => sample.totalMs).sort((a, b) => a - b);
  const ttfb = samples.map((sample) => sample.ttfbMs).sort((a, b) => a - b);
  const bytes = samples.map((sample) => sample.decodedBytes).sort((a, b) => a - b);
  return {
    runs: samples.length,
    totalMs: {
      p50: percentile(totals, 0.5),
      p95: percentile(totals, 0.95),
    },
    ttfbMs: {
      p50: percentile(ttfb, 0.5),
      p95: percentile(ttfb, 0.95),
    },
    decodedBytes: {
      p50: percentile(bytes, 0.5),
      p95: percentile(bytes, 0.95),
    },
  };
}

async function measure(url) {
  const startedAt = performance.now();
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'cache-control': 'no-cache' },
  });
  const headersAt = performance.now();
  const body = await response.arrayBuffer();
  const finishedAt = performance.now();
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return {
    status: response.status,
    ttfbMs: Number((headersAt - startedAt).toFixed(1)),
    totalMs: Number((finishedAt - startedAt).toFixed(1)),
    decodedBytes: body.byteLength,
    serverTiming: response.headers.get('server-timing'),
    cache: response.headers.get('x-cipherscan-cache'),
    etag: response.headers.get('etag'),
  };
}

const options = parseArgs(process.argv.slice(2));
const scatterPath = options.variant === 'optimized'
  ? '/api/migration/scatter/compact?range=7d'
  : '/api/migration/scatter';
const fixtures = [
  { id: 'network-nodes', path: '/api/network/nodes' },
  { id: 'network-node-stats', path: '/api/network/nodes/stats' },
  { id: 'ironwood-initial-scatter', path: scatterPath },
];

const results = {};
for (const fixture of fixtures) {
  const samples = [];
  for (let run = 0; run < options.runs; run++) {
    samples.push(await measure(`${options.api}${fixture.path}`));
  }
  results[fixture.id] = {
    path: fixture.path,
    summary: summarize(samples),
    samples,
  };
}

const artifact = {
  schemaVersion: 1,
  measuredAt: new Date().toISOString(),
  variant: options.variant,
  api: new URL(options.api).host,
  runs: options.runs,
  results,
};

const output = options.output
  ? resolve(options.output)
  : resolve(`benchmarks/query-acceleration-${options.variant}-${Date.now()}.json`);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify({ output, results: Object.fromEntries(
  Object.entries(results).map(([id, value]) => [id, value.summary]),
) }, null, 2));

