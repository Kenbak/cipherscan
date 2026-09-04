const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const repositoryRoot = path.resolve(__dirname, '..', '..');

/**
 * Transpiles and evaluates a TS route module with `imports` substituted for
 * any `require()` specifier it uses — mirrors the loader already used by
 * server/tests/sitemap-security.test.js for testing app/ route handlers
 * without a full Next.js runtime.
 */
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
  const moduleObj = { exports: {} };
  const localRequire = (specifier) => {
    if (Object.prototype.hasOwnProperty.call(imports, specifier)) return imports[specifier];
    return require(specifier);
  };
  const evaluate = new Function('exports', 'require', 'module', '__filename', '__dirname', output);
  evaluate(moduleObj.exports, localRequire, moduleObj, filename, path.dirname(filename));
  return moduleObj.exports;
}

function loadRevalidateRoute({ revalidatedTags = [] } = {}) {
  return loadTypeScriptModule('app/api/revalidate/route.ts', {
    'next/cache': {
      revalidateTag: (tag, options) => revalidatedTags.push({ tag, options }),
    },
    // next/server's NextRequest/NextResponse work fine standalone (thin
    // wrappers over the platform Request/Response); no mock needed.
  });
}

function postRequest({ secret, body, invalidJson = false }) {
  const headers = {};
  if (secret !== undefined) headers['x-revalidate-secret'] = secret;
  return new Request('https://api.mainnet.cipherscan.app/api/revalidate', {
    method: 'POST',
    headers,
    body: invalidJson ? '{not-json' : JSON.stringify(body ?? {}),
  });
}

test('rejects requests with a missing, wrong, or unconfigured secret without ever calling revalidateTag', async (t) => {
  const originalSecret = process.env.REVALIDATE_SECRET;
  process.env.REVALIDATE_SECRET = 'correct-secret-value';
  t.after(() => {
    if (originalSecret === undefined) delete process.env.REVALIDATE_SECRET;
    else process.env.REVALIDATE_SECRET = originalSecret;
  });

  const revalidatedTags = [];
  const route = loadRevalidateRoute({ revalidatedTags });

  const missing = await route.POST(postRequest({ body: { tag: 'chain-tip' } }));
  assert.equal(missing.status, 401);

  const wrong = await route.POST(postRequest({ secret: 'guessed-secret', body: { tag: 'chain-tip' } }));
  assert.equal(wrong.status, 401);

  // A secret that is merely a different LENGTH must still be rejected
  // (guards against a naive fixed-length comparison bypass) and must not
  // throw (crypto.timingSafeEqual requires equal-length buffers — the
  // implementation must hash first, not compare raw byte lengths).
  const shorter = await route.POST(postRequest({ secret: 'x', body: { tag: 'chain-tip' } }));
  assert.equal(shorter.status, 401);
  const longer = await route.POST(postRequest({ secret: 'x'.repeat(500), body: { tag: 'chain-tip' } }));
  assert.equal(longer.status, 401);

  assert.equal(revalidatedTags.length, 0, 'an unauthorized caller must never trigger a cache revalidation');
});

test('fails closed when REVALIDATE_SECRET is not configured, even with a matching empty secret', async (t) => {
  const originalSecret = process.env.REVALIDATE_SECRET;
  delete process.env.REVALIDATE_SECRET;
  t.after(() => {
    if (originalSecret === undefined) delete process.env.REVALIDATE_SECRET;
    else process.env.REVALIDATE_SECRET = originalSecret;
  });

  const revalidatedTags = [];
  const route = loadRevalidateRoute({ revalidatedTags });
  const response = await route.POST(postRequest({ secret: '', body: { tag: 'chain-tip' } }));
  assert.equal(response.status, 401);
  assert.equal(revalidatedTags.length, 0);
});

test('accepts a correct secret and an allow-listed tag, and revalidates exactly that tag', async (t) => {
  const originalSecret = process.env.REVALIDATE_SECRET;
  process.env.REVALIDATE_SECRET = 'correct-secret-value';
  t.after(() => {
    if (originalSecret === undefined) delete process.env.REVALIDATE_SECRET;
    else process.env.REVALIDATE_SECRET = originalSecret;
  });

  const revalidatedTags = [];
  const route = loadRevalidateRoute({ revalidatedTags });
  const response = await route.POST(postRequest({ secret: 'correct-secret-value', body: { tag: 'chain-tip' } }));

  assert.equal(response.status, 200);
  const json = await response.json();
  assert.deepEqual(json, { revalidated: true, tag: 'chain-tip' });
  assert.equal(revalidatedTags.length, 1);
  assert.equal(revalidatedTags[0].tag, 'chain-tip');
});

test('rejects a valid secret paired with a tag outside the allow-list — this is the P0 "restrict tags" requirement', async (t) => {
  const originalSecret = process.env.REVALIDATE_SECRET;
  process.env.REVALIDATE_SECRET = 'correct-secret-value';
  t.after(() => {
    if (originalSecret === undefined) delete process.env.REVALIDATE_SECRET;
    else process.env.REVALIDATE_SECRET = originalSecret;
  });

  const revalidatedTags = [];
  const route = loadRevalidateRoute({ revalidatedTags });

  for (const tag of ['*', 'privacy-stats', '__proto__', 'chain-tip-typo', '', 'ADDRESSES']) {
    const response = await route.POST(postRequest({ secret: 'correct-secret-value', body: { tag } }));
    assert.equal(response.status, 400, `tag "${tag}" must be rejected`);
  }

  const missingTag = await route.POST(postRequest({ secret: 'correct-secret-value', body: {} }));
  assert.equal(missingTag.status, 400);

  const nonStringTag = await route.POST(postRequest({ secret: 'correct-secret-value', body: { tag: 123 } }));
  assert.equal(nonStringTag.status, 400);

  assert.equal(revalidatedTags.length, 0, 'no out-of-allow-list tag may ever reach revalidateTag');
});

test('accepts the other known allow-listed tag (sitemap-zns-registrations)', async (t) => {
  const originalSecret = process.env.REVALIDATE_SECRET;
  process.env.REVALIDATE_SECRET = 'correct-secret-value';
  t.after(() => {
    if (originalSecret === undefined) delete process.env.REVALIDATE_SECRET;
    else process.env.REVALIDATE_SECRET = originalSecret;
  });

  const revalidatedTags = [];
  const route = loadRevalidateRoute({ revalidatedTags });
  const response = await route.POST(postRequest({
    secret: 'correct-secret-value',
    body: { tag: 'sitemap-zns-registrations' },
  }));
  assert.equal(response.status, 200);
  assert.equal(revalidatedTags[0].tag, 'sitemap-zns-registrations');
});

test('rejects invalid JSON bodies with 400 before touching the secret-gated tag logic', async (t) => {
  const originalSecret = process.env.REVALIDATE_SECRET;
  process.env.REVALIDATE_SECRET = 'correct-secret-value';
  t.after(() => {
    if (originalSecret === undefined) delete process.env.REVALIDATE_SECRET;
    else process.env.REVALIDATE_SECRET = originalSecret;
  });

  const route = loadRevalidateRoute();
  const response = await route.POST(postRequest({ secret: 'correct-secret-value', invalidJson: true }));
  assert.equal(response.status, 400);
});
