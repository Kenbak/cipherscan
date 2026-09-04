#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

function parseArgs(argv) {
  const options = {
    runs: 30,
    output: null,
    executable: process.env.CHROME_PATH
      || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  };
  for (const arg of argv) {
    if (arg.startsWith('--base=')) options.base = arg.slice(7).replace(/\/$/, '');
    else if (arg.startsWith('--runs=')) options.runs = Number(arg.slice(7));
    else if (arg.startsWith('--output=')) options.output = arg.slice(9);
    else if (arg.startsWith('--chrome=')) options.executable = arg.slice(9);
  }
  if (!options.base) throw new Error('--base=https://example.com is required');
  if (!Number.isInteger(options.runs) || options.runs < 1 || options.runs > 100) {
    throw new Error('--runs must be an integer from 1 to 100');
  }
  return options;
}

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] ?? 0;
}

function summarize(samples) {
  const readiness = samples.map((sample) => sample.readyMs).sort((a, b) => a - b);
  const bytes = samples.map((sample) => sample.apiEncodedBytes).sort((a, b) => a - b);
  const requests = samples.map((sample) => sample.apiRequests).sort((a, b) => a - b);
  return {
    runs: samples.length,
    readyMs: { p50: percentile(readiness, 0.5), p95: percentile(readiness, 0.95) },
    apiEncodedBytes: { p50: percentile(bytes, 0.5), p95: percentile(bytes, 0.95) },
    apiRequests: { p50: percentile(requests, 0.5), p95: percentile(requests, 0.95) },
  };
}

const readinessExpressions = {
  network: `Boolean(
    document.querySelector('[data-node-map-ready="true"]')
    || [...document.querySelectorAll('span')].some((node) => node.textContent?.includes('Last sync:'))
  )`,
  ironwood: `Boolean(
    document.querySelector('[data-scatter-ready="true"]')
    || (
      document.querySelector('#privacy-score canvas')
      && ![...document.querySelectorAll('*')].some(
        (node) => node.textContent === 'Loading transaction-level privacy data…'
      )
    )
  )`,
};

async function measurePage(browser, base, fixture, cacheDisabled) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const session = await page.createCDPSession();
  await session.send('Network.enable');
  await session.send('Network.setCacheDisabled', { cacheDisabled });

  const apiRequests = new Set();
  let apiEncodedBytes = 0;
  session.on('Network.requestWillBeSent', ({ requestId, request }) => {
    if (request.url.includes('/api/')) apiRequests.add(requestId);
  });
  session.on('Network.loadingFinished', ({ requestId, encodedDataLength }) => {
    if (apiRequests.has(requestId)) apiEncodedBytes += encodedDataLength;
  });

  const navigateUntilReady = async () => {
    await page.goto(`${base}${fixture.path}`, {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    });
    if (fixture.id === 'ironwood') {
      await page.evaluate(() => {
        document.querySelector('#privacy-score')?.scrollIntoView({ block: 'center' });
      });
    }
    await page.waitForFunction(readinessExpressions[fixture.id], { timeout: 120_000 });
  };

  if (!cacheDisabled) {
    // Warm static page assets without requiring the data endpoint itself to
    // finish; the measured navigation below still owns the readiness result.
    await page.goto(`${base}${fixture.path}`, {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    });
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    await page.evaluate(() => window.stop());
    apiRequests.clear();
    apiEncodedBytes = 0;
    await page.evaluate(() => performance.clearResourceTimings());
  }

  const startedAt = performance.now();
  await navigateUntilReady();
  const readyMs = Number((performance.now() - startedAt).toFixed(1));
  const resources = await page.evaluate(() => performance.getEntriesByType('resource')
    .filter((entry) => entry.name.includes('/api/'))
    .map((entry) => entry.name));
  await context.close();

  return {
    readyMs,
    apiRequests: apiRequests.size,
    uniqueApiUrls: new Set(resources).size,
    duplicateApiRequests: Math.max(0, resources.length - new Set(resources).size),
    apiEncodedBytes: Math.round(apiEncodedBytes),
  };
}

const options = parseArgs(process.argv.slice(2));
const browser = await puppeteer.launch({
  executablePath: options.executable,
  headless: true,
  timeout: 60_000,
  protocolTimeout: 180_000,
  args: [
    '--no-first-run',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-background-networking',
    '--disable-gpu',
  ],
});
const fixtures = [
  { id: 'network', path: '/network' },
  { id: 'ironwood', path: '/ironwood' },
];
const results = {};

try {
  for (const fixture of fixtures) {
    const cold = [];
    const warm = [];
    for (let run = 0; run < options.runs; run++) {
      console.log(`[${fixture.id}] run ${run + 1}/${options.runs} cold`);
      cold.push(await measurePage(browser, options.base, fixture, true));
      console.log(`[${fixture.id}] run ${run + 1}/${options.runs} warm`);
      warm.push(await measurePage(browser, options.base, fixture, false));
    }
    results[fixture.id] = {
      path: fixture.path,
      cold: { summary: summarize(cold), samples: cold },
      warm: { summary: summarize(warm), samples: warm },
    };
  }
} finally {
  await browser.close();
}

const artifact = {
  schemaVersion: 1,
  measuredAt: new Date().toISOString(),
  base: new URL(options.base).host,
  runsPerCacheMode: options.runs,
  results,
};
const output = resolve(options.output || `benchmarks/component-readiness-${Date.now()}.json`);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify({
  output,
  results: Object.fromEntries(Object.entries(results).map(([id, value]) => [
    id,
    { cold: value.cold.summary, warm: value.warm.summary },
  ])),
}, null, 2));

