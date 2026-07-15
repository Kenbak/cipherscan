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

test('current sitemap shares one bounded ZNS refresh and preserves name URLs', async (t) => {
  const refreshCache = loadTypeScriptModule('lib/refresh-cache.ts');
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async () => ({ ok: true, json: async () => ({}) });

  let statusCalls = 0;
  let registrationCalls = 0;
  const signals = [];
  const sitemapModule = loadTypeScriptModule('app/sitemap.ts', {
    'next/cache': { unstable_cache: (callback) => callback },
    '@/lib/newsletter': { getAllNewsletters: () => [] },
    '@/lib/refresh-cache': refreshCache,
    '@/lib/seo': {
      getApiUrl: () => 'https://api.mainnet.cipherscan.app',
      getBaseUrl: () => 'https://cipherscan.app',
      getNetwork: () => 'mainnet',
    },
    '@/lib/zns': {
      getZnsStatus: async (signal) => {
        statusCalls += 1;
        signals.push(signal);
        return { registered: 5000 };
      },
      isValidName: (name) => /^[a-z0-9]{1,62}$/.test(name),
      listZnsRegistrations: async (limit, offset, signal) => {
        registrationCalls += 1;
        signals.push(signal);
        return Array.from({ length: limit }, (_, index) => ({ name: `name${offset + index}` }));
      },
    },
  });

  const results = await Promise.all([
    sitemapModule.default(),
    sitemapModule.default(),
    sitemapModule.default(),
  ]);

  assert.equal(statusCalls, 1);
  assert.equal(registrationCalls, 10);
  assert.equal(signals.length, 11);
  assert.ok(signals.every((signal) => signal instanceof AbortSignal));
  assert.ok(results.every((entries) => entries.some(
    (entry) => entry.url === 'https://cipherscan.app/name/name4999',
  )));
  assert.ok(results.every((entries) => entries.some(
    (entry) => entry.url === 'https://cipherscan.app/ironwood',
  )));
  assert.ok(results.every((entries) => {
    const ironwood = entries.find((entry) => entry.url === 'https://cipherscan.app/ironwood');
    return ironwood?.lastModified?.toISOString() === '2026-07-14T00:00:00.000Z';
  }));
  assert.ok(results.every((entries) => entries.every(
    (entry) => entry.url !== 'https://cipherscan.app/migration',
  )));
});

test('legacy migration and swap routes permanently consolidate authority', async () => {
  const configModule = loadTypeScriptModule('next.config.ts');
  const redirects = await configModule.default.redirects();

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
});

test('testnet keeps its homepage-only sitemap without contacting ZNS', async () => {
  const refreshCache = loadTypeScriptModule('lib/refresh-cache.ts');
  let znsCalls = 0;
  const sitemapModule = loadTypeScriptModule('app/sitemap.ts', {
    'next/cache': { unstable_cache: (callback) => callback },
    '@/lib/newsletter': { getAllNewsletters: () => [] },
    '@/lib/refresh-cache': refreshCache,
    '@/lib/seo': {
      getApiUrl: () => 'https://api.testnet.cipherscan.app',
      getBaseUrl: () => 'https://testnet.cipherscan.app',
      getNetwork: () => 'testnet',
    },
    '@/lib/zns': {
      getZnsStatus: async () => {
        znsCalls += 1;
        return { registered: 1 };
      },
      isValidName: () => true,
      listZnsRegistrations: async () => {
        znsCalls += 1;
        return [{ name: 'shouldnotappear' }];
      },
    },
  });

  const entries = await sitemapModule.default();
  assert.equal(znsCalls, 0);
  assert.deepEqual(entries, [{
    url: 'https://testnet.cipherscan.app/',
    changeFrequency: 'daily',
    priority: 1,
  }]);
});

test('Crosslink sitemap stays empty without contacting chain or name services', async () => {
  const refreshCache = loadTypeScriptModule('lib/refresh-cache.ts');
  let externalCalls = 0;
  const sitemapModule = loadTypeScriptModule('app/sitemap.ts', {
    'next/cache': { unstable_cache: (callback) => callback },
    '@/lib/newsletter': { getAllNewsletters: () => [] },
    '@/lib/refresh-cache': refreshCache,
    '@/lib/seo': {
      getApiUrl: () => {
        externalCalls += 1;
        return 'https://api.crosslink.cipherscan.app';
      },
      getBaseUrl: () => {
        externalCalls += 1;
        return 'https://crosslink.cipherscan.app';
      },
      getNetwork: () => 'crosslink-testnet',
    },
    '@/lib/zns': {
      getZnsStatus: async () => {
        externalCalls += 1;
        return { registered: 0 };
      },
      isValidName: () => true,
      listZnsRegistrations: async () => {
        externalCalls += 1;
        return [];
      },
    },
  });

  assert.deepEqual(await sitemapModule.default(), []);
  assert.equal(externalCalls, 0);
});
