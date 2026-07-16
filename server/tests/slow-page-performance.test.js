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
    if (Object.prototype.hasOwnProperty.call(imports, specifier)) return imports[specifier];
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
    if (Object.prototype.hasOwnProperty.call(imports, specifier)) return imports[specifier];
    return require(specifier);
  };
  const evaluate = new Function('exports', 'require', 'module', '__filename', '__dirname', source);
  evaluate(module.exports, localRequire, module, filename, path.dirname(filename));
  return module.exports;
}

function captureTransactionRoutes() {
  const handlers = new Map();
  let middleware;
  const router = {
    use(callback) { middleware = callback; },
    get(route, ...callbacks) { handlers.set(route, callbacks.at(-1)); },
    post(route, ...callbacks) { handlers.set(route, callbacks.at(-1)); },
  };
  loadJavaScriptModule('server/api/routes/transactions.js', {
    express: { Router: () => router },
    '../validation': { validate: () => (_req, _res, next) => next() },
    '../coinbase-data': { decodeCoinbaseText: () => null },
  });
  return { handlers, middleware };
}

function responseRecorder() {
  return {
    statusCode: 200,
    headers: new Map(),
    body: undefined,
    set(name, value) { this.headers.set(name.toLowerCase(), value); return this; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  };
}

test('server-render fetches abort a hung origin inside their deadline', async () => {
  const {
    fetchWithDeadline,
    isServerRenderDeadlineError,
    SERVER_RENDER_FETCH_TIMEOUT_MS,
  } = loadTypeScriptModule('lib/server-fetch.ts');
  assert.ok(
    SERVER_RENDER_FETCH_TIMEOUT_MS <= 1_000,
    'the production page budget must stay below the 2s TTFB target',
  );
  const started = performance.now();

  let deadlineError;
  await assert.rejects(
    fetchWithDeadline(
      'https://api.invalid/hangs',
      {},
      30,
      (_url, init) => new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
      }),
    ),
    (error) => {
      deadlineError = error;
      return error.name === 'TimeoutError';
    },
  );
  assert.equal(isServerRenderDeadlineError(deadlineError), true);

  assert.ok(
    performance.now() - started < 250,
    'a hung origin must not consume a multi-second page budget',
  );
});

test('all archive SSR fetches are cached and deadline-bound', async () => {
  const requests = [];
  const fetchWithDeadline = async (url, init) => {
    requests.push({ url: String(url), init });
    return new Response(JSON.stringify({
      success: true,
      blocks: [],
      transactions: [],
      flows: [],
      pagination: {},
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const jsxRuntime = {
    jsx: (type, props) => ({ type, props }),
    jsxs: (type, props) => ({ type, props }),
    Fragment: Symbol('Fragment'),
  };
  const commonImports = {
    'react/jsx-runtime': jsxRuntime,
    '@/lib/api-config': { API_CONFIG: { POSTGRES_API_URL: 'https://api.invalid' } },
    '@/lib/seo': {
      buildPageMetadata: (options) => options,
      getBaseUrl: () => 'https://cipherscan.app',
    },
    '@/lib/server-fetch': { fetchWithDeadline },
  };
  const pages = [
    loadTypeScriptModule('app/blocks/page.tsx', {
      ...commonImports,
      './BlocksClient': { __esModule: true, default: () => null },
    }),
    loadTypeScriptModule('app/txs/page.tsx', {
      ...commonImports,
      './TxsClient': { __esModule: true, default: () => null },
    }),
    loadTypeScriptModule('app/txs/shielded/page.tsx', {
      ...commonImports,
      './ShieldedTxsClient': { __esModule: true, default: () => null },
    }),
  ];

  for (const page of pages) {
    await page.default({ searchParams: Promise.resolve({}) });
  }

  assert.equal(requests.length, 3);
  assert.ok(requests.some(({ url }) => url.includes('/api/blocks/list?')));
  assert.ok(requests.some(({ url }) => url.includes('/api/transactions/list?')));
  assert.ok(requests.some(({ url }) => url.includes('/api/shielded/list?')));
  assert.ok(requests.every(({ init }) => init.next.revalidate === 30));
  assert.ok(requests.every(({ init }) => init.cache !== 'no-store'));
});

test('server metadata uses lightweight endpoints with deadlines', async () => {
  const requests = [];
  const transactionId = 'a'.repeat(64);
  const fetchWithDeadline = async (url, init) => {
    const requestUrl = String(url);
    requests.push({ url: requestUrl, init });

    if (requestUrl.includes('/api/block/')) {
      return new Response(JSON.stringify({
        height: 123,
        hash: 'b'.repeat(64),
        timestamp: 1_700_000_000,
        transactionCount: 2,
        size: 1024,
      }));
    }
    if (requestUrl.includes('/api/seo/tx/')) {
      return new Response(JSON.stringify({
        txid: transactionId,
        blockHeight: 123,
        blockTime: 1_700_000_000,
        confirmations: 10,
        isCanonical: true,
        status: 'confirmed',
        hasOrchard: true,
      }));
    }
    return new Response(JSON.stringify({
      address: 't1example',
      balance: 100_000_000,
      type: 'transparent',
      txCount: 1,
    }));
  };
  const seo = loadTypeScriptModule('lib/seo.ts', {
    react: { cache: (callback) => callback },
    '@/lib/network': {
      getConfiguredNetwork: () => 'mainnet',
      normalizeApiBaseUrl: (url) => url,
    },
    '@/lib/server-fetch': { fetchWithDeadline },
  });

  const block = await seo.getBlockResolution('123');
  const transaction = await seo.getTxResolution(transactionId);
  const address = await seo.getAddressResolution('t1example');

  assert.equal(block.state, 'found');
  assert.equal(transaction.state, 'found');
  assert.equal(transaction.meta.hasShielded, true);
  assert.equal(address.state, 'found');
  assert.match(requests[0].url, /\/api\/block\/123\?summary=1$/);
  assert.match(requests[1].url, /\/api\/seo\/tx\/[a-f0-9]{64}$/);
  assert.match(requests[2].url, /\/api\/address\/t1example\?limit=1$/);
  assert.deepEqual(requests.map(({ init }) => init.next.revalidate), [30, 30, 60]);
});

test('transaction SEO summary performs one bounded database query', async () => {
  const { handlers, middleware } = captureTransactionRoutes();
  const queries = [];
  const pool = {
    async query(sql, params) {
      queries.push({ sql, params });
      return { rows: [{
        txid: 'a'.repeat(64),
        block_height: '123',
        block_hash: 'b'.repeat(64),
        block_time: '1700000000',
        is_coinbase: false,
        has_sapling: false,
        has_orchard: true,
        has_ironwood: false,
        orchard_actions: '2',
        shielded_spends: '0',
        shielded_outputs: '0',
        fee: '10000',
        is_canonical: true,
        confirmations: '10',
      }] };
    },
  };
  const req = {
    params: { txid: 'a'.repeat(64) },
    app: { locals: { pool } },
  };
  const res = responseRecorder();
  middleware(req, res, () => {});
  await handlers.get('/api/seo/tx/:txid')(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0].params, ['a'.repeat(64)]);
  assert.doesNotMatch(
    queries[0].sql,
    /transaction_(inputs|outputs)|cross_chain_swaps|information_schema/i,
  );
  assert.equal(res.body.hasShielded, true);
  assert.equal(res.body.confirmations, 10);
  assert.equal(
    res.headers.get('cache-control'),
    'public, s-maxage=30, stale-while-revalidate=300',
  );
});
