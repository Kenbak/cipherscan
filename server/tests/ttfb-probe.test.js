const assert = require('node:assert/strict');
const fs = require('node:fs');
const { mkdtemp, readFile, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const repositoryRoot = path.resolve(__dirname, '../..');
const libraryUrl = pathToFileURL(
  path.join(repositoryRoot, 'scripts/perf/ttfb-probe-lib.mjs'),
).href;
const library = import(libraryUrl);

function cacheResult({ edge = 'UNKNOWN', durable = 'UNKNOWN', application = 'UNKNOWN' } = {}) {
  return {
    raw: null,
    netlify: {
      edge: { state: edge, forward: null, hit: edge.includes('HIT'), raw: null, params: {} },
      durable: {
        state: durable,
        forward: null,
        hit: durable.includes('HIT'),
        raw: null,
        params: {},
      },
    },
    application,
    vercel: 'UNKNOWN',
  };
}

function observation(overrides = {}) {
  return {
    routeGroup: '/',
    core: false,
    pairPosition: 1,
    headersReceived: true,
    completed: true,
    timedOut: false,
    redirected: false,
    status: 200,
    ok: true,
    ttfbMs: 100,
    cache: cacheResult(),
    targetId: 'home',
    ...overrides,
  };
}

test('classifies Netlify edge and durable cache members independently', async () => {
  const { classifyCache } = await library;
  const cache = classifyCache({
    age: '11',
    'cache-status': '"Netlify Durable"; fwd=bypass, "Netlify Edge"; fwd=miss',
  });

  assert.equal(cache.netlify.edge.state, 'MISS');
  assert.equal(cache.netlify.edge.forward, 'miss');
  assert.equal(cache.netlify.durable.state, 'BYPASS');
  assert.equal(cache.application, 'UNKNOWN');
});

test('distinguishes a served stale hit from a stale miss', async () => {
  const { classifyCache } = await library;
  const served = classifyCache({
    'cache-status': '"Netlify Edge"; hit; fwd=stale',
  });
  const forwarded = classifyCache({
    'cache-status': '"Netlify Edge"; fwd=stale',
  });

  assert.equal(served.netlify.edge.state, 'STALE_HIT');
  assert.equal(forwarded.netlify.edge.state, 'STALE_MISS');
});

test('normalizes durable URI and variation misses and durable hits', async () => {
  const { classifyCache } = await library;
  const uriMiss = classifyCache({
    'cache-status': '"Netlify Edge"; fwd=miss, "Netlify Durable"; fwd=uri-miss; stored=true',
  });
  const varyMiss = classifyCache({
    'cache-status': '"Netlify Durable"; fwd=vary-miss; ttl=3600, "Netlify Edge"; fwd=miss',
  });
  const durableHit = classifyCache({
    'cache-status': '"Netlify Edge"; fwd=miss, "Netlify Durable"; hit; ttl=1234',
  });

  assert.equal(uriMiss.netlify.durable.state, 'MISS');
  assert.equal(varyMiss.netlify.durable.state, 'MISS');
  assert.equal(durableHit.netlify.durable.state, 'HIT');
});

test('does not let application state, Age, or cache policy override edge state', async () => {
  const { classifyCache } = await library;
  const layered = classifyCache({
    age: '99',
    'cache-control': 'public, s-maxage=60',
    'cache-status': '"Netlify Edge"; fwd=miss',
    'x-cipherscan-cache': 'HIT',
  });
  const policyOnly = classifyCache({
    age: '99',
    'netlify-cdn-cache-control': 'public, max-age=60',
  });

  assert.equal(layered.netlify.edge.state, 'MISS');
  assert.equal(layered.application, 'HIT');
  assert.equal(policyOnly.netlify.edge.state, 'UNKNOWN');
  assert.equal(policyOnly.netlify.durable.state, 'UNKNOWN');
});

test('measures header arrival and cancels the body without reading it', async () => {
  const { measureTtfb } = await library;
  let clock = 0;
  let cancelCalls = 0;
  let bodyRead = false;
  const result = await measureTtfb({ url: 'https://cipherscan.invalid/blocks' }, {
    now: () => clock,
    signalFactory: () => undefined,
    wallNow: () => new Date('2026-07-16T00:00:00.000Z'),
    fetchImpl: async () => {
      clock = 20;
      return {
        ok: true,
        status: 200,
        redirected: false,
        url: 'https://cipherscan.invalid/blocks',
        headers: new Headers({
          'Cache-Status': '"Netlify Edge"; hit',
          'X-Nextjs-Cache': 'HIT',
          'X-Nextjs-Prerender': '1',
        }),
        body: {
          async cancel() { cancelCalls += 1; },
          async arrayBuffer() { bodyRead = true; throw new Error('body must not be read'); },
          async text() { bodyRead = true; throw new Error('body must not be read'); },
        },
      };
    },
  });

  assert.equal(result.ttfbMs, 20);
  assert.equal(result.cache.netlify.edge.state, 'HIT');
  assert.equal(result.headers['x-nextjs-cache'], 'HIT');
  assert.equal(result.headers['x-nextjs-prerender'], '1');
  assert.deepEqual(result.bodyCancellation, { state: 'cancelled', error: null });
  assert.equal(cancelCalls, 1);
  assert.equal(bodyRead, false);
  assert.equal(Object.hasOwn(result, 'loadMs'), false);
  assert.equal(Object.hasOwn(result, 'afterTtfbMs'), false);
});

test('retains HTTP error TTFB but never records a pre-header timeout as TTFB', async () => {
  const { measureTtfb } = await library;
  let clock = 0;
  const httpError = await measureTtfb('https://cipherscan.invalid/error', {
    now: () => clock,
    signalFactory: () => undefined,
    fetchImpl: async () => {
      clock = 35;
      return {
        ok: false,
        status: 500,
        redirected: false,
        url: 'https://cipherscan.invalid/error',
        headers: new Headers(),
        body: { async cancel() {} },
      };
    },
  });
  const timeout = await measureTtfb('https://cipherscan.invalid/timeout', {
    now: () => clock,
    signalFactory: () => undefined,
    fetchImpl: async () => {
      clock = 535;
      const error = new Error('The operation timed out');
      error.name = 'TimeoutError';
      throw error;
    },
  });

  assert.equal(httpError.ttfbMs, 35);
  assert.equal(httpError.status, 500);
  assert.equal(httpError.ok, false);
  assert.equal(timeout.ttfbMs, null);
  assert.equal(timeout.elapsedUntilErrorMs, 500);
  assert.equal(timeout.headersReceived, false);
  assert.equal(timeout.timedOut, true);
});

test('records a redirect response without following its Location', async () => {
  const { measureTtfb } = await library;
  let fetchCalls = 0;
  let requestInit;
  const result = await measureTtfb('https://cipherscan.invalid/old', {
    signalFactory: () => undefined,
    fetchImpl: async (_url, init) => {
      fetchCalls += 1;
      requestInit = init;
      return {
        ok: false,
        status: 302,
        redirected: false,
        url: 'https://cipherscan.invalid/old',
        headers: new Headers({ location: 'https://example.com/elsewhere' }),
        body: { async cancel() {} },
      };
    },
  });

  assert.equal(fetchCalls, 1);
  assert.equal(requestInit.redirect, 'manual');
  assert.equal(result.redirected, true);
  assert.equal(result.status, 302);
  assert.equal(result.headers.location, 'https://example.com/elsewhere');
});

test('runs identical target URLs as immediate serial pairs', async () => {
  const { runPairedProbe } = await library;
  const calls = [];
  const targets = [
    { id: 'a', routeGroup: '/a', core: true, url: 'https://example.test/a?x=1' },
    { id: 'b', routeGroup: '/b', core: false, url: 'https://example.test/b' },
  ];
  const observations = await runPairedProbe(targets, {
    rounds: 1,
    scheduling: 'serial',
    measureImpl: async (target, options) => {
      calls.push(`${target.id}${options.pairPosition}:${target.url}`);
      return observation({ requestedUrl: target.url });
    },
  });

  assert.deepEqual(calls, [
    'a1:https://example.test/a?x=1',
    'a2:https://example.test/a?x=1',
    'b1:https://example.test/b',
    'b2:https://example.test/b',
  ]);
  assert.deepEqual(observations.map((row) => row.sequence), [1, 2, 3, 4]);
  assert.deepEqual(observations.map((row) => row.pairPosition), [1, 2, 1, 2]);
});

test('uses a strict threshold and keeps errors in the percentage denominator', async () => {
  const { summarizeTtfb } = await library;
  const rows = [
    observation({ ttfbMs: 199.9, core: true, cache: cacheResult({ edge: 'HIT' }) }),
    observation({ ttfbMs: 200, core: true, pairPosition: 2 }),
    observation({ ttfbMs: 50, status: 500, ok: false }),
    observation({
      headersReceived: false,
      completed: false,
      timedOut: true,
      status: null,
      ok: false,
      ttfbMs: null,
    }),
  ];
  const summary = summarizeTtfb(rows, { thresholdMs: 200 });

  assert.equal(summary.overall.observations, 4);
  assert.equal(summary.overall.successfulDirectResponses, 2);
  assert.equal(summary.overall.failedResponses, 2);
  assert.equal(summary.overall.underThreshold, 1);
  assert.equal(summary.overall.underThresholdPct, 25);
  assert.equal(summary.overall.p95Ms, 200);
  assert.equal(summary.core.underThresholdPct, 50);
  assert.equal(summary.confirmedNetlifyCacheHits.underThresholdPct, 100);
  assert.equal(summary.byTarget.home.observations, 4);
});

test('validates target manifests without changing query identity', async () => {
  const { resolveTargets } = await library;
  const targets = resolveTargets({
    schemaVersion: 1,
    targets: [{
      id: 'archive',
      routeGroup: '/blocks',
      path: '/blocks?cursor=123&direction=next',
      core: false,
    }],
  }, 'https://cipherscan.app');

  assert.equal(targets[0].path, '/blocks?cursor=123&direction=next');
  assert.equal(targets[0].url, 'https://cipherscan.app/blocks?cursor=123&direction=next');
  assert.throws(() => resolveTargets({ schemaVersion: 1, targets: [] }, 'https://cipherscan.app/path'), /origin/i);
  assert.throws(() => resolveTargets({ schemaVersion: 1, targets: [] }, 'https://cipherscan.app/?x=1'), /origin/i);
  assert.throws(() => resolveTargets({
    schemaVersion: 1,
    targets: [
      { id: 'same', routeGroup: '/', path: '/' },
      { id: 'same', routeGroup: '/', path: '/' },
    ],
  }, 'https://cipherscan.app'), /Duplicate TTFB target id/);
});

test('the TTFB core population covers every core sitemap path', () => {
  const manifest = JSON.parse(fs.readFileSync(
    path.join(repositoryRoot, 'scripts/perf/ttfb-targets.json'),
    'utf8',
  ));
  const sitemapSource = fs.readFileSync(path.join(repositoryRoot, 'lib/sitemaps.ts'), 'utf8');
  const coreLiteral = sitemapSource.match(
    /export const CORE_PATHS = \[([\s\S]*?)\] as const;/,
  );
  assert.ok(coreLiteral, 'Unable to locate CORE_PATHS in lib/sitemaps.ts');
  const sitemapCorePaths = [...coreLiteral[1].matchAll(/['"]([^'"]+)['"]/g)]
    .map((match) => match[1]);
  const probedCorePaths = new Set(
    manifest.targets.filter((target) => target.core === true).map((target) => target.path),
  );

  assert.deepEqual(
    sitemapCorePaths.filter((route) => !probedCorePaths.has(route)),
    [],
  );
});

test('writes artifacts atomically and requires force to overwrite', async () => {
  const { writeArtifactAtomic } = await library;
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cipherscan-ttfb-'));
  const filename = path.join(directory, 'result.json');

  try {
    await writeArtifactAtomic(filename, { version: 1 });
    assert.deepEqual(JSON.parse(await readFile(filename, 'utf8')), { version: 1 });
    await assert.rejects(writeArtifactAtomic(filename, { version: 2 }), (error) => error.code === 'EEXIST');
    await writeArtifactAtomic(filename, { version: 2 }, { force: true });
    assert.deepEqual(JSON.parse(await readFile(filename, 'utf8')), { version: 2 });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
