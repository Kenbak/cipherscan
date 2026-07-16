import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import {
  median,
  percentile,
  readSlowPageExport,
  routeGroup,
  sampleAcrossRoutes,
} from './slow-page-utils.mjs';

export async function probePageLoad(url, {
  timeoutMs = 5_000,
  fetchImpl = fetch,
  now = () => performance.now(),
} = {}) {
  const started = now();

  try {
    const response = await fetchImpl(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': 'CipherScan-performance-regression/1.0' },
    });
    const ttfb = Math.round(now() - started);
    await response.arrayBuffer();
    const load = Math.round(now() - started);

    return {
      ttfb,
      load,
      afterTtfb: load - ttfb,
      status: response.status,
      ok: response.ok,
    };
  } catch (error) {
    return {
      ttfb: null,
      load: Math.round(now() - started),
      afterTtfb: null,
      status: error.name,
      ok: false,
    };
  }
}

async function main(args = process.argv.slice(2)) {
  const filename = args.find((arg) => !arg.startsWith('--'));
  const option = (name, fallback) => {
    const raw = args.find((arg) => arg.startsWith(`--${name}=`));
    return raw ? raw.slice(name.length + 3) : fallback;
  };

  if (!filename) {
    console.error('Usage: npm run perf:probe -- export.csv [--limit=20] [--load-threshold-ms=2000] [--ttfb-threshold-ms=2000] [--timeout-ms=5000] [--base-url=http://localhost:3000]');
    process.exitCode = 2;
    return;
  }

  const limit = Number(option('limit', '20'));
  const legacyThresholdMs = option('threshold-ms', '');
  const loadThresholdMs = Number(option('load-threshold-ms', legacyThresholdMs || '2000'));
  const ttfbThresholdMs = Number(option('ttfb-threshold-ms', legacyThresholdMs || '2000'));
  const timeoutMs = Number(option('timeout-ms', '5000'));
  const baseUrl = option('base-url', '');
  const rows = sampleAcrossRoutes(readSlowPageExport(filename), limit);
  const results = [];

  for (const row of rows) {
    const sourceUrl = new URL(row.URL);
    const url = baseUrl
      ? new URL(`${sourceUrl.pathname}${sourceUrl.search}`, baseUrl).toString()
      : sourceUrl.toString();
    const measurement = await probePageLoad(url, { timeoutMs });
    const failed = !measurement.ok
      || measurement.load > loadThresholdMs
      || (measurement.ttfb !== null && measurement.ttfb > ttfbThresholdMs);

    results.push({
      route: routeGroup(row.URL),
      path: `${sourceUrl.pathname}${sourceUrl.search}`,
      ...measurement,
      failed,
    });
  }

  for (const result of results) {
    console.log(
      `${result.route.padEnd(24)} status=${String(result.status).padEnd(12)}`
      + ` ttfb_ms=${String(result.ttfb ?? 'n/a').padEnd(6)}`
      + ` load_ms=${String(result.load).padEnd(6)}`
      + ` after_ttfb_ms=${result.afterTtfb ?? 'n/a'}`
      + (result.failed ? ` path=${result.path}` : ''),
    );
  }

  const ttfbTimings = results
    .map((result) => result.ttfb)
    .filter((value) => value !== null);
  const loadTimings = results.map((result) => result.load);
  const afterTtfbTimings = results
    .map((result) => result.afterTtfb)
    .filter((value) => value !== null);
  const failures = results.filter((result) => result.failed).length;
  console.log(
    `probed=${results.length}`
    + ` load_threshold_ms=${loadThresholdMs}`
    + ` ttfb_threshold_ms=${ttfbThresholdMs}`
    + ` failures=${failures}`
    + ` median_load_ms=${median(loadTimings)}`
    + ` p95_load_ms=${percentile(loadTimings, 0.95)}`
    + ` median_ttfb_ms=${median(ttfbTimings)}`
    + ` p95_ttfb_ms=${percentile(ttfbTimings, 0.95)}`
    + ` median_after_ttfb_ms=${median(afterTtfbTimings)}`,
  );
  if (failures > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
