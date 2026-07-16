import { performance } from 'node:perf_hooks';
import {
  median,
  percentile,
  readSlowPageExport,
  routeGroup,
  sampleAcrossRoutes,
} from './slow-page-utils.mjs';

const args = process.argv.slice(2);
const filename = args.find((arg) => !arg.startsWith('--'));
const option = (name, fallback) => {
  const raw = args.find((arg) => arg.startsWith(`--${name}=`));
  return raw ? raw.slice(name.length + 3) : fallback;
};

if (!filename) {
  console.error('Usage: npm run perf:probe -- export.csv [--limit=20] [--threshold-ms=2000] [--timeout-ms=5000] [--base-url=http://localhost:3000]');
  process.exit(2);
}

const limit = Number(option('limit', '20'));
const thresholdMs = Number(option('threshold-ms', '2000'));
const timeoutMs = Number(option('timeout-ms', '5000'));
const baseUrl = option('base-url', '');
const rows = sampleAcrossRoutes(readSlowPageExport(filename), limit);
const results = [];

for (const row of rows) {
  const sourceUrl = new URL(row.URL);
  const url = baseUrl
    ? new URL(`${sourceUrl.pathname}${sourceUrl.search}`, baseUrl).toString()
    : sourceUrl.toString();
  const started = performance.now();

  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': 'CipherScan-performance-regression/1.0' },
    });
    const elapsed = Math.round(performance.now() - started);
    await response.body?.cancel();
    results.push({
      route: routeGroup(row.URL),
      elapsed,
      status: response.status,
      failed: !response.ok || elapsed > thresholdMs,
    });
  } catch (error) {
    results.push({
      route: routeGroup(row.URL),
      elapsed: Math.round(performance.now() - started),
      status: error.name,
      failed: true,
    });
  }
}

for (const result of results) {
  console.log(`${result.route.padEnd(24)} status=${String(result.status).padEnd(12)} ttfb_ms=${result.elapsed}`);
}

const timings = results.map((result) => result.elapsed);
const failures = results.filter((result) => result.failed).length;
console.log(`probed=${results.length} threshold_ms=${thresholdMs} failures=${failures} median_ttfb_ms=${median(timings)} p95_ttfb_ms=${percentile(timings, 0.95)}`);
if (failures > 0) process.exitCode = 1;
