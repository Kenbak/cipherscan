const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const repositoryRoot = path.resolve(__dirname, '../..');

function loadTypeScriptModule(relativePath, imports = {}) {
  const filename = path.join(repositoryRoot, relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  const module = { exports: {} };
  const localRequire = (specifier) => {
    if (Object.prototype.hasOwnProperty.call(imports, specifier)) {
      return imports[specifier];
    }
    return require(specifier);
  };
  const evaluate = new Function('exports', 'require', 'module', '__filename', '__dirname', output);
  evaluate(module.exports, localRequire, module, filename, path.dirname(filename));
  return module.exports;
}

function loadJavaScriptModule(relativePath, imports = {}) {
  const filename = path.join(repositoryRoot, relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const module = { exports: {} };
  const localRequire = (specifier) => {
    if (Object.prototype.hasOwnProperty.call(imports, specifier)) {
      return imports[specifier];
    }
    return require(specifier);
  };
  const evaluate = new Function('exports', 'require', 'module', '__filename', '__dirname', source);
  evaluate(module.exports, localRequire, module, filename, path.dirname(filename));
  return module.exports;
}

function captureSitemapApiRoutes() {
  const handlers = new Map();
  let middleware;
  const router = {
    use(callback) { middleware = callback; },
    get(route, callback) { handlers.set(route, callback); },
  };
  loadJavaScriptModule('server/api/routes/sitemaps.js', {
    express: { Router: () => router },
  });

  return async (route, query, pool) => {
    const response = {
      statusCode: 200,
      headers: new Map(),
      body: undefined,
      set(name, value) { this.headers.set(name.toLowerCase(), value); return this; },
      status(value) { this.statusCode = value; return this; },
      json(value) { this.body = value; return this; },
    };
    const request = { query, app: { locals: { pool } } };
    middleware(request, response, () => {});
    await handlers.get(route)(request, response);
    return response;
  };
}

function captureBlockApiRoute() {
  const handlers = new Map();
  let middleware;
  const router = {
    use(callback) { middleware = callback; },
    get(route, callback) { handlers.set(route, callback); },
  };
  loadJavaScriptModule('server/api/routes/blocks.js', {
    express: { Router: () => router },
    '../mining-pools': {
      getPoolName: () => null,
      getPoolInfo: () => ({ name: 'Example Pool', url: 'https://pool.invalid', region: 'US' }),
    },
    '../coinbase-data': { decodeCoinbaseText: () => null },
  });

  return async (identifier, query, pool) => {
    const response = {
      statusCode: 200,
      headers: new Map(),
      body: undefined,
      set(name, value) { this.headers.set(name.toLowerCase(), value); return this; },
      status(value) { this.statusCode = value; return this; },
      json(value) { this.body = value; return this; },
    };
    const request = {
      params: { heightOrHash: identifier },
      query,
      app: { locals: { pool, redisClient: null, callZebraRPC: null } },
    };
    middleware(request, response, () => {});
    await handlers.get('/api/block/:heightOrHash')(request, response);
    return response;
  };
}

test('refresh cache coalesces misses and retains stale data during retry backoff', async () => {
  const { createRefreshCache } = loadTypeScriptModule('lib/refresh-cache.ts');
  let now = 0;
  let calls = 0;
  let fail = false;
  let releaseFirst;
  const firstLoad = new Promise((resolve) => { releaseFirst = resolve; });
  const getValue = createRefreshCache({
    maxAgeMs: 100,
    retryAfterMs: 10,
    now: () => now,
    load: async () => {
      calls += 1;
      if (calls === 1) return firstLoad;
      if (fail) throw new Error('upstream unavailable');
      return `value-${calls}`;
    },
  });

  const pending = [getValue('mainnet'), getValue('mainnet'), getValue('mainnet')];
  assert.equal(calls, 1);
  releaseFirst('value-1');
  assert.deepEqual(await Promise.all(pending), ['value-1', 'value-1', 'value-1']);

  now = 101;
  fail = true;
  assert.equal(await getValue('mainnet'), 'value-1');
  assert.equal(calls, 2);

  now = 105;
  assert.equal(await getValue('mainnet'), 'value-1');
  assert.equal(calls, 2, 'failure backoff should prevent another refresh');

  now = 112;
  fail = false;
  assert.equal(await getValue('mainnet'), 'value-3');
  assert.equal(calls, 3);
});

test('refresh cache applies a bounded fallback after an initial failure', async () => {
  const { createRefreshCache } = loadTypeScriptModule('lib/refresh-cache.ts');
  let now = 0;
  let calls = 0;
  const getValue = createRefreshCache({
    maxAgeMs: 100,
    retryAfterMs: 10,
    now: () => now,
    load: async () => {
      calls += 1;
      throw new Error('upstream unavailable');
    },
    fallback: () => [],
  });

  assert.deepEqual(await getValue('mainnet'), []);
  now = 5;
  assert.deepEqual(await getValue('mainnet'), []);
  assert.equal(calls, 1);
});

test('ZNS JSON-RPC passes the abort signal to the underlying fetch', async () => {
  const { callZnsRpc } = loadTypeScriptModule('lib/zns-rpc.ts');
  const controller = new AbortController();
  let request;
  const result = await callZnsRpc(
    'https://zns.invalid',
    'status',
    {},
    controller.signal,
    async (url, init) => {
      request = { url, init };
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { registered: 7 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  );

  assert.deepEqual(result, { registered: 7 });
  assert.equal(request.url, 'https://zns.invalid');
  assert.equal(request.init.signal, controller.signal);
  assert.equal(request.init.cache, 'no-store');
});

test('ZNS JSON-RPC terminates when its deadline signal aborts', async () => {
  const { callZnsRpc } = loadTypeScriptModule('lib/zns-rpc.ts');
  const controller = new AbortController();
  const request = callZnsRpc(
    'https://zns.invalid',
    'status',
    {},
    controller.signal,
    async (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
    }),
  );

  controller.abort(new DOMException('refresh deadline exceeded', 'TimeoutError'));
  await assert.rejects(request, (error) => error.name === 'TimeoutError');
});

test('API base normalization prevents duplicated API path segments', () => {
  const { normalizeApiBaseUrl } = loadTypeScriptModule('lib/network.ts');

  assert.equal(
    normalizeApiBaseUrl('https://api.crosslink.cipherscan.app'),
    'https://api.crosslink.cipherscan.app',
  );
  assert.equal(
    normalizeApiBaseUrl('https://crosslink.cipherscan.app/api'),
    'https://crosslink.cipherscan.app',
  );
  assert.equal(
    normalizeApiBaseUrl('  https://crosslink.cipherscan.app/API/  '),
    'https://crosslink.cipherscan.app',
  );
});

test('block resolution is shared, cached, and preserves unavailable states', async (t) => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });

  const requests = [];
  global.fetch = async (url, init) => {
    const identifier = new URL(url).pathname.split('/').pop();
    requests.push({ url: String(url), identifier, init });

    if (identifier === '404') return new Response(null, { status: 404 });
    if (identifier === '410') return new Response(null, { status: 410 });
    if (identifier === '503') return new Response(null, { status: 503 });
    if (identifier === '504') throw new Error('network unavailable');
    if (identifier === '505') {
      return new Response('{', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (identifier === '506') {
      return new Response(JSON.stringify({ height: 506 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      height: '123',
      hash: 'b'.repeat(64),
      transactionCount: '1',
      isOrphaned: true,
      canonicalBlock: { hash: 'c'.repeat(64) },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const fakeCache = (callback) => {
    const entries = new Map();
    return (...args) => {
      const key = JSON.stringify(args);
      if (!entries.has(key)) entries.set(key, callback(...args));
      return entries.get(key);
    };
  };
  const { getBlockResolution } = loadTypeScriptModule('lib/seo.ts', {
    react: { cache: fakeCache },
    '@/lib/network': {
      getConfiguredNetwork: () => 'mainnet',
      normalizeApiBaseUrl: (url) => url,
    },
    '@/lib/server-fetch': {
      fetchWithDeadline: (url, init) => global.fetch(url, init),
    },
  });

  assert.deepEqual(await getBlockResolution('not-a-block'), { state: 'absent' });
  assert.equal(requests.length, 0, 'invalid identifiers must not reach the API');
  assert.deepEqual(await getBlockResolution('404'), { state: 'absent' });
  assert.deepEqual(await getBlockResolution('410'), { state: 'absent' });
  assert.deepEqual(await getBlockResolution('503'), { state: 'unavailable' });
  assert.deepEqual(await getBlockResolution('504'), { state: 'unavailable' });
  assert.deepEqual(await getBlockResolution('505'), { state: 'unavailable' });
  assert.deepEqual(await getBlockResolution('506'), { state: 'unavailable' });

  const uppercaseHash = 'A'.repeat(64);
  const first = await getBlockResolution(uppercaseHash);
  const second = await getBlockResolution(uppercaseHash);
  assert.equal(first, second, 'the request cache should return one shared resolution');
  assert.equal(first.state, 'found');
  assert.equal(first.block.canonicalBlock.hash, 'c'.repeat(64));
  const hashRequests = requests.filter(({ identifier }) => identifier === uppercaseHash.toLowerCase());
  assert.equal(hashRequests.length, 1, 'metadata and page consumers should share one API request');
  assert.equal(hashRequests[0].init.next.revalidate, 30);
  assert.equal(new URL(requests.at(-1).url || 'https://invalid').searchParams.get('summary'), '1');
});

test('block summary feed avoids transaction detail fan-out', async () => {
  const callRoute = captureBlockApiRoute();
  const queries = [];
  const pool = {
    query: async (sql, params) => {
      queries.push({ sql, params });
      return {
        rows: [{
          height: '3413458',
          hash: 'a'.repeat(64),
          timestamp: '1784150000',
          transaction_count: '7',
          size: '4096',
          miner_address: 't1example',
        }],
      };
    },
  };

  const response = await callRoute('3413458', { summary: '1' }, pool);
  assert.equal(response.statusCode, 200);
  assert.equal(queries.length, 1, 'summary lookup should perform only the bounded block query');
  assert.match(queries[0].sql, /FROM blocks/);
  assert.deepEqual(queries[0].params, [3413458]);
  assert.equal(queries.some(({ sql }) => /FROM transactions|transaction_inputs|transaction_outputs/.test(sql)), false);
  assert.deepEqual(response.body, {
    height: 3413458,
    hash: 'a'.repeat(64),
    timestamp: 1784150000,
    transaction_count: 7,
    transactionCount: 7,
    size: 4096,
    isOrphaned: false,
    miner_address: 't1example',
    miner_pool: 'Example Pool',
    miner_pool_url: 'https://pool.invalid',
    miner_pool_region: 'US',
  });
  assert.equal(
    response.headers.get('cache-control'),
    'public, s-maxage=30, stale-while-revalidate=300',
  );
});

test('block metadata uses resolved canonical identity through the shared builder', async () => {
  let resolution;
  let fetchTip = async () => new Response(JSON.stringify({ height: 1_000 }), {
    headers: { 'content-type': 'application/json' },
  });
  const metadataCalls = [];
  const blockHash = 'd'.repeat(64);
  const layoutModule = loadTypeScriptModule('app/block/[height]/layout.tsx', {
    '@/lib/isr-fallback': {
      retainLastGoodOrBuildFallback: (fallback) => fallback,
    },
    '@/lib/server-fetch': {
      fetchWithDeadline: (...args) => fetchTip(...args),
    },
    '@/lib/seo': {
      buildPageMetadata: (options) => {
        metadataCalls.push(options);
        return options;
      },
      formatNumber: (value) => Number(value).toLocaleString('en-US'),
      getApiUrl: () => 'https://api.invalid',
      getBlockResolution: async () => resolution,
      truncateHash: (value) => value,
    },
  });

  resolution = {
    state: 'found',
    block: {
      height: 123,
      hash: blockHash,
      timestamp: 0,
      transactionCount: '1',
      size: 1024,
      isOrphaned: false,
    },
  };
  await layoutModule.generateMetadata({ params: Promise.resolve({ height: blockHash }) });
  assert.equal(metadataCalls.at(-1).path, '/block/123');
  assert.equal(metadataCalls.at(-1).index, true);
  assert.equal(metadataCalls.at(-1).indexOnTestnet, undefined);
  assert.equal(metadataCalls.at(-1).description.includes('Contains 1 transaction'), true);

  resolution = {
    state: 'found',
    block: {
      height: 123,
      hash: blockHash,
      timestamp: 0,
      transactionCount: 2,
      isOrphaned: true,
      canonicalBlock: { hash: 'e'.repeat(64) },
    },
  };
  await layoutModule.generateMetadata({ params: Promise.resolve({ height: blockHash }) });
  assert.equal(metadataCalls.at(-1).path, `/block/${blockHash}`);
  assert.equal(metadataCalls.at(-1).index, true);

  resolution = { state: 'absent' };
  await layoutModule.generateMetadata({ params: Promise.resolve({ height: '999' }) });
  assert.equal(metadataCalls.at(-1).path, '/block/999');
  assert.equal(metadataCalls.at(-1).index, false);
  assert.equal(metadataCalls.at(-1).canonical, false);
  assert.equal(metadataCalls.at(-1).imageAlt, metadataCalls.at(-1).title);

  fetchTip = async () => new Response(null, { status: 503 });
  await assert.rejects(
    layoutModule.generateMetadata({ params: Promise.resolve({ height: '1001' }) }),
    /Chain tip returned HTTP 503/,
  );

  resolution = { state: 'unavailable' };
  await layoutModule.generateMetadata({ params: Promise.resolve({ height: '1000' }) });
  assert.equal(metadataCalls.at(-1).path, '/block/1000');
  assert.equal(metadataCalls.at(-1).index, false);
  assert.equal(metadataCalls.at(-1).canonical, undefined);
});

test('shared metadata policy indexes blocks only on mainnet', () => {
  const cases = [
    { network: 'mainnet', baseUrl: 'https://cipherscan.app', index: true },
    { network: 'testnet', baseUrl: 'https://testnet.cipherscan.app', index: false },
    { network: 'crosslink-testnet', baseUrl: 'https://crosslink.cipherscan.app', index: false },
  ];

  for (const testCase of cases) {
    const seoModule = loadTypeScriptModule('lib/seo.ts', {
      react: { cache: (callback) => callback },
      '@/lib/network': {
        getConfiguredNetwork: () => testCase.network,
        normalizeApiBaseUrl: (url) => url,
      },
      '@/lib/server-fetch': {
        fetchWithDeadline: (url, init) => global.fetch(url, init),
      },
    });
    const metadata = seoModule.buildPageMetadata({
      title: 'Zcash Block #123 | CipherScan',
      description: 'Block metadata policy test.',
      path: '/block/123',
      index: true,
    });

    assert.equal(metadata.robots.index, testCase.index);
    assert.equal(metadata.robots.follow, true);
    assert.equal(metadata.alternates.canonical, `${testCase.baseUrl}/block/123`);
    assert.equal(metadata.openGraph.url, `${testCase.baseUrl}/block/123`);
  }
});

test('block consumers share one resolver and transaction JSON-LD escapes opening tags', () => {
  const blockLayout = fs.readFileSync(
    path.join(repositoryRoot, 'app/block/[height]/layout.tsx'),
    'utf8',
  );
  const blockPage = fs.readFileSync(
    path.join(repositoryRoot, 'app/block/[height]/page.tsx'),
    'utf8',
  );
  const txLayout = fs.readFileSync(
    path.join(repositoryRoot, 'app/tx/[txid]/layout.tsx'),
    'utf8',
  );

  assert.equal(blockLayout.includes('getBlockResolution(height)'), true);
  assert.equal(blockPage.includes('getBlockResolution(identifier)'), true);
  assert.equal(blockLayout.includes("from 'react'"), false);
  assert.equal(blockPage.includes("from 'react'"), false);
  assert.equal(blockLayout.includes('fetch('), false);
  assert.equal(blockPage.includes('fetch('), false);
  assert.equal(
    txLayout.includes("JSON.stringify(transactionJsonLd).replace(/</g, '\\\\u003c')"),
    true,
  );
});

test('sitemap serializers escape, deduplicate, bound, and omit ignored fields', () => {
  const sitemap = loadTypeScriptModule('lib/sitemaps.ts');
  const xml = sitemap.serializeUrlSet([
    { url: 'https://cipherscan.app/a?x=1&y=<two>', lastModified: '2026-07-15' },
    { url: 'https://cipherscan.app/a?x=1&y=<two>' },
  ]);

  assert.equal((xml.match(/<url>/g) || []).length, 1);
  assert.match(xml, /x=1&amp;y=&lt;two&gt;/);
  assert.match(xml, /<lastmod>2026-07-15T00:00:00.000Z<\/lastmod>/);
  assert.equal(xml.includes('<priority>'), false);
  assert.equal(xml.includes('<changefreq>'), false);

  const tooMany = Array.from({ length: sitemap.MAX_SITEMAP_URLS + 1 }, (_, index) => ({
    url: `https://cipherscan.app/block/${index}`,
  }));
  assert.throws(() => sitemap.serializeUrlSet(tooMany), /cannot contain more than/);
});

test('sitemap cohorts are disjoint and block ranges require aligned explicit configuration', () => {
  const sitemap = loadTypeScriptModule('lib/sitemaps.ts');
  const ranges = sitemap.getConfiguredBlockSitemapRanges('3350000', '3449999');
  assert.deepEqual(ranges, [
    { start: 3350000, end: 3399999, slug: 'blocks-3350000-3399999' },
    { start: 3400000, end: 3449999, slug: 'blocks-3400000-3449999' },
  ]);
  assert.deepEqual(sitemap.getConfiguredBlockSitemapRanges(undefined, undefined), []);
  assert.deepEqual(sitemap.getConfiguredBlockSitemapRanges('3350001', '3449999'), []);
  assert.equal(sitemap.getBlockSitemapRange('blocks-1-50000', ranges), null);

  const newsletters = [{
    slug: '2026-07-15', title: 'Issue', summary: '', date: '2026-07-15', issue: 1, content: '',
  }];
  const core = sitemap.getStaticSitemapEntries('core', 'https://cipherscan.app', newsletters);
  const content = sitemap.getStaticSitemapEntries('content', 'https://cipherscan.app', newsletters);
  const tools = sitemap.getStaticSitemapEntries('tools', 'https://cipherscan.app', newsletters);
  const allUrls = [...core, ...content, ...tools].map((entry) => entry.url);

  assert.equal(new Set(allUrls).size, allUrls.length);
  assert.ok(allUrls.includes('https://cipherscan.app/privacy/wallets'));
  assert.ok(allUrls.includes('https://cipherscan.app/newsletter/2026-07-15'));
  assert.ok(allUrls.includes('https://cipherscan.app/tools/unit-converter'));
  assert.equal(allUrls.includes('https://cipherscan.app/migration'), false);

  const indexEntries = sitemap.getMainnetSitemapIndexEntries('https://cipherscan.app', ranges);
  assert.ok(indexEntries.some(({ url }) => url === 'https://cipherscan.app/sitemap-core.xml'));
  assert.ok(indexEntries.some(({ url }) => (
    url === 'https://cipherscan.app/sitemap-blocks-3400000-3449999.xml'
  )));
});

test('legacy migration and swap routes permanently consolidate authority', async () => {
  const configModule = loadTypeScriptModule('next.config.ts');
  const redirects = await configModule.default.redirects();
  const rewrites = await configModule.default.rewrites();

  assert.ok(redirects.some((redirect) => (
    redirect.source === '/migration'
    && redirect.destination === '/ironwood'
    && redirect.permanent === true
  )));
  assert.ok(redirects.some((redirect) => (
    redirect.source === '/swap'
    && redirect.destination === 'https://cipherswap.app/'
    && redirect.permanent === true
  )));
  assert.deepEqual(rewrites.afterFiles, [{
    source: '/sitemap-:slug.xml',
    destination: '/sitemaps/:slug',
  }]);
  assert.deepEqual(rewrites.fallback, []);

  const latestRoutes = [
    ['/blocks', '/blocks/latest', ['cursor', 'direction', 'page']],
    ['/txs', '/txs/latest', ['cursor', 'cursor_idx', 'direction', 'page', 'type']],
    [
      '/txs/shielded',
      '/txs/shielded/latest',
      ['cursor', 'cursor_id', 'direction', 'page', 'flow_type', 'pool', 'min_zec'],
    ],
  ];
  for (const [source, destination, queryKeys] of latestRoutes) {
    const rewrite = rewrites.beforeFiles.find((candidate) => candidate.source === source);
    assert.equal(rewrite.destination, destination);
    assert.deepEqual(rewrite.missing, queryKeys.map((key) => ({ type: 'query', key })));
  }
});

test('root sitemap is a mainnet index, a testnet homepage set, and an empty Crosslink set', async () => {
  const sitemap = loadTypeScriptModule('lib/sitemaps.ts');
  const cases = [
    { network: 'mainnet', baseUrl: 'https://cipherscan.app', root: 'sitemapindex' },
    { network: 'testnet', baseUrl: 'https://testnet.cipherscan.app', root: 'urlset' },
    { network: 'crosslink-testnet', baseUrl: null, root: 'urlset' },
  ];

  for (const testCase of cases) {
    let baseUrlCalls = 0;
    const route = loadTypeScriptModule('app/sitemap.xml/route.ts', {
      '@/lib/seo': {
        getNetwork: () => testCase.network,
        getBaseUrl: () => {
          baseUrlCalls += 1;
          return testCase.baseUrl;
        },
      },
      '@/lib/sitemaps': sitemap,
    });
    const response = route.GET();
    const xml = await response.text();
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /application\/xml/);
    assert.match(xml, new RegExp(`<${testCase.root}`));

    if (testCase.network === 'mainnet') {
      assert.match(xml, /https:\/\/cipherscan\.app\/sitemap-core\.xml/);
      assert.equal(xml.includes('<priority>'), false);
    } else if (testCase.network === 'testnet') {
      assert.match(xml, /https:\/\/testnet\.cipherscan\.app\//);
      assert.equal(xml.includes('/blocks'), false);
    } else {
      assert.equal(baseUrlCalls, 0);
      assert.equal(xml.includes('<url>'), false);
    }
  }
});

test('child sitemap isolates static cohorts and returns explicit 404/503 failures', async (t) => {
  const sitemap = loadTypeScriptModule('lib/sitemaps.ts');
  const refreshCache = loadTypeScriptModule('lib/refresh-cache.ts');
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });

  const loadRoute = (network = 'mainnet') => loadTypeScriptModule('app/sitemaps/[slug]/route.ts', {
    'next/cache': { unstable_cache: (callback) => callback },
    '@/lib/newsletter': { getAllNewsletters: () => [] },
    '@/lib/refresh-cache': refreshCache,
    '@/lib/seo': {
      getApiUrl: () => 'https://api.mainnet.cipherscan.app',
      getBaseUrl: () => 'https://cipherscan.app',
      getNetwork: () => network,
    },
    '@/lib/sitemaps': sitemap,
    '@/lib/zns': {
      getZnsStatus: async () => ({ registered: 0 }),
      isValidName: () => true,
      listZnsRegistrations: async () => [],
    },
  });

  global.fetch = async () => new Response(null, { status: 503 });
  const route = loadRoute();
  const core = await route.GET(new Request('https://cipherscan.app/sitemaps/core'), {
    params: Promise.resolve({ slug: 'core' }),
  });
  assert.equal(core.status, 200);
  assert.match(await core.text(), /https:\/\/cipherscan\.app\/privacy\/wallets/);

  const unavailable = await route.GET(new Request('https://cipherscan.app/sitemaps/addresses'), {
    params: Promise.resolve({ slug: 'addresses' }),
  });
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.get('retry-after'), '60');

  const unknown = await route.GET(new Request('https://cipherscan.app/sitemaps/blocks-1-50000'), {
    params: Promise.resolve({ slug: 'blocks-1-50000' }),
  });
  assert.equal(unknown.status, 404);

  const testnetRoute = loadRoute('testnet');
  const testnetChild = await testnetRoute.GET(new Request('https://testnet.cipherscan.app/sitemaps/core'), {
    params: Promise.resolve({ slug: 'core' }),
  });
  assert.equal(testnetChild.status, 404);
});

test('ZNS child sitemap coalesces one bounded registration refresh', async () => {
  const sitemap = loadTypeScriptModule('lib/sitemaps.ts');
  const refreshCache = loadTypeScriptModule('lib/refresh-cache.ts');
  let statusCalls = 0;
  let registrationCalls = 0;
  const route = loadTypeScriptModule('app/sitemaps/[slug]/route.ts', {
    'next/cache': { unstable_cache: (callback) => callback },
    '@/lib/newsletter': { getAllNewsletters: () => [] },
    '@/lib/refresh-cache': refreshCache,
    '@/lib/seo': {
      getApiUrl: () => 'https://api.mainnet.cipherscan.app',
      getBaseUrl: () => 'https://cipherscan.app',
      getNetwork: () => 'mainnet',
    },
    '@/lib/sitemaps': sitemap,
    '@/lib/zns': {
      getZnsStatus: async () => {
        statusCalls += 1;
        return { registered: 5000 };
      },
      isValidName: (name) => /^name\d+$/.test(name),
      listZnsRegistrations: async (limit, offset) => {
        registrationCalls += 1;
        return Array.from({ length: limit }, (_, index) => ({ name: `name${offset + index}` }));
      },
    },
  });

  const responses = await Promise.all(Array.from({ length: 3 }, () => route.GET(
    new Request('https://cipherscan.app/sitemaps/names'),
    { params: Promise.resolve({ slug: 'names' }) },
  )));
  const bodies = await Promise.all(responses.map((response) => response.text()));
  assert.equal(statusCalls, 1);
  assert.equal(registrationCalls, 10);
  assert.ok(bodies.every((body) => body.includes('https://cipherscan.app/name/name4999')));
});

test('transaction archive metadata indexes only unfiltered first pages', async () => {
  const jsxRuntime = { jsx: () => null, jsxs: () => null, Fragment: Symbol('Fragment') };
  const loadPage = (relativePath, componentSpecifier) => loadTypeScriptModule(relativePath, {
    'react/jsx-runtime': jsxRuntime,
    [componentSpecifier]: { __esModule: true, default: () => null },
    '@/lib/api-config': { API_CONFIG: { POSTGRES_API_URL: 'https://api.mainnet.cipherscan.app' } },
    '@/lib/isr-fallback': {
      retainLastGoodOrBuildFallback: (fallback) => fallback,
    },
    '@/lib/seo': {
      buildPageMetadata: (options) => options,
      getBaseUrl: () => 'https://cipherscan.app',
    },
    '@/lib/server-fetch': {
      fetchWithDeadline: (url, init) => global.fetch(url, init),
    },
  });
  const txs = loadPage('app/txs/page.tsx', './TxsClient');
  const shielded = loadPage('app/txs/shielded/page.tsx', './ShieldedTxsClient');

  const txFirst = await txs.generateMetadata({ searchParams: Promise.resolve({}) });
  const txArchive = await txs.generateMetadata({
    searchParams: Promise.resolve({ cursor: '100', cursor_idx: '1', direction: 'next', page: '2' }),
  });
  const txFilter = await txs.generateMetadata({ searchParams: Promise.resolve({ type: 'coinbase' }) });
  assert.equal(txFirst.index, true);
  assert.equal(txArchive.index, false);
  assert.match(txArchive.path, /^\/txs\?cursor=/);
  assert.equal(txFilter.index, false);
  assert.equal(txFilter.path, '/txs');

  const shieldedFirst = await shielded.generateMetadata({ searchParams: Promise.resolve({}) });
  const shieldedArchive = await shielded.generateMetadata({
    searchParams: Promise.resolve({ cursor: '100', cursor_id: '1', direction: 'next', page: '2' }),
  });
  const shieldedFilter = await shielded.generateMetadata({
    searchParams: Promise.resolve({ pool: 'orchard' }),
  });
  assert.equal(shieldedFirst.index, true);
  assert.equal(shieldedArchive.index, false);
  assert.match(shieldedArchive.path, /^\/txs\/shielded\?cursor=/);
  assert.equal(shieldedFilter.index, false);
  assert.equal(shieldedFilter.path, '/txs/shielded');
});

test('sitemap API feeds enforce bounds and canonical transaction identity', async () => {
  const callRoute = captureSitemapApiRoutes();
  const queries = [];
  const pool = {
    query: async (sql, params) => {
      queries.push({ sql, params });
      if (sql.includes('MAX(height)')) return { rows: [{ tip: 3_450_001 }] };
      if (sql.includes('FROM blocks')) {
        return { rows: [{ height: 3_400_000, timestamp: 1_784_000_000 }] };
      }
      return {
        rows: Array.from({ length: 100 }, (_, index) => ({
          txid: index.toString(16).padStart(64, '0'),
          block_time: 1_784_000_000 - index,
        })),
      };
    },
  };

  const invalid = await callRoute('/api/sitemaps/blocks', {
    start: '0',
    end: '50000',
  }, pool);
  assert.equal(invalid.statusCode, 400);
  assert.equal(queries.length, 0, 'invalid ranges must not query PostgreSQL');

  const blocks = await callRoute('/api/sitemaps/blocks', {
    start: '3400000',
    end: '3449999',
  }, pool);
  assert.equal(blocks.statusCode, 200);
  assert.deepEqual(blocks.body.blocks, [{ height: 3_400_000, timestamp: 1_784_000_000 }]);
  assert.equal(blocks.body.complete, true);
  assert.deepEqual(queries[0].params, [3_400_000, 3_449_999]);

  queries.length = 0;
  const transactions = await callRoute('/api/sitemaps/transactions/recent', {}, pool);
  assert.equal(transactions.statusCode, 200);
  assert.equal(transactions.body.transactions.length, 100);
  assert.match(queries[0].sql, /JOIN blocks b ON b\.height = t\.block_height AND b\.hash = t\.block_hash/);
  assert.match(queries[0].sql, /ORDER BY t\.block_height DESC, t\.tx_index DESC/);
  assert.deepEqual(queries[0].params, [100]);
  assert.equal(queries[0].sql.includes('mempool'), false);
});

test('crawl graph avoids canonical block aliases and known shared redirect targets', () => {
  const blocksClient = fs.readFileSync(
    path.join(repositoryRoot, 'app/blocks/BlocksClient.tsx'),
    'utf8',
  );
  const reorgs = fs.readFileSync(path.join(repositoryRoot, 'app/reorgs/page.tsx'), 'utf8');
  const footer = fs.readFileSync(path.join(repositoryRoot, 'components/Footer.tsx'), 'utf8');
  const sitemapDefinitions = fs.readFileSync(
    path.join(repositoryRoot, 'lib/sitemaps.ts'),
    'utf8',
  );
  const richListPage = fs.readFileSync(path.join(repositoryRoot, 'app/rich-list/page.tsx'), 'utf8');
  const richListClient = fs.readFileSync(
    path.join(repositoryRoot, 'app/rich-list/RichListClient.tsx'),
    'utf8',
  );

  assert.equal(blocksClient.includes('href={`/block/${block.hash.toLowerCase()}`'), false);
  assert.equal(reorgs.includes('href={`/block/${block.canonicalBlock?.hash || block.canonicalHash}`'), false);
  assert.match(footer, /href="https:\/\/www\.cipherpay\.app\/"/);
  assert.equal(footer.includes('https://www.cipherpay.app/en'), false);
  assert.match(footer, /href="\/charts"/);
  assert.match(sitemapDefinitions, /['"]\/usage-clock['"]/);
  assert.match(richListPage, /next: \{ revalidate: 60 \}/);
  assert.match(richListClient, /initialAddresses/);
  assert.match(richListClient, /href=\{`\/address\/\$\{entry\.address\}`\}/);

  const content = fs.readFileSync(
    path.join(repositoryRoot, 'content/newsletter/weekly-2026-05-03.md'),
    'utf8',
  );
  assert.equal(content.includes('github.com/ZcashFoundation/zebra/security/advisories/GHSA-28xj-328h-72vm'), false);
  assert.equal(content.includes('github.com/ZcashFoundation/zebra/security/advisories/GHSA-jg86-rwhm-fhg4'), false);
});
