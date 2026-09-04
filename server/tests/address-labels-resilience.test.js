const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function loadAddressLabels() {
  const filename = path.resolve(__dirname, '../../lib/address-labels.ts');
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
    if (specifier === 'react') return { useEffect: () => {}, useState: () => [null, () => {}] };
    return require(specifier);
  };
  new Function('exports', 'require', 'module', '__filename', '__dirname', output)(
    module.exports,
    localRequire,
    module,
    filename,
    path.dirname(filename),
  );
  return module.exports;
}

test('concurrent official-label consumers share one request', async (t) => {
  const originalFetch = global.fetch;
  let requests = 0;
  global.fetch = async () => {
    requests += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { ok: true, json: async () => ({ labels: [] }) };
  };
  t.after(() => { global.fetch = originalFetch; });

  const labels = loadAddressLabels();
  labels.__resetOfficialLabelsForTests();
  await Promise.all(Array.from({ length: 100 }, () => labels.fetchOfficialLabels()));
  assert.equal(requests, 1);
});

test('a failed labels request backs off instead of retrying in a tight loop', async (t) => {
  const originalFetch = global.fetch;
  const originalWarn = console.warn;
  let requests = 0;
  let warnings = 0;
  global.fetch = async () => {
    requests += 1;
    throw new Error(`sensitive-${'a'.repeat(64)}`);
  };
  console.warn = () => { warnings += 1; };
  t.after(() => {
    global.fetch = originalFetch;
    console.warn = originalWarn;
  });

  const labels = loadAddressLabels();
  labels.__resetOfficialLabelsForTests();
  await labels.fetchOfficialLabels();
  await Promise.all(Array.from({ length: 100 }, () => labels.fetchOfficialLabels()));
  assert.equal(requests, 1);
  assert.equal(warnings, 1);
});
