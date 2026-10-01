const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const reference = require('../../lib/generated/api-reference.json');
const source = fs.readFileSync(require.resolve('../../app/docs/endpoints.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const loaded = { exports: {} };
new Function('require', 'module', 'exports', code)(name => name.includes('api-reference') ? reference : require('../../app/docs/anchors.json'), loaded, loaded.exports);
const docs = loaded.exports;

test('reference puts list and detail before specialized reads and writes without losing endpoints', () => {
  const categories = docs.getEndpointsByCategory('https://example.com');
  const all = categories.flatMap(c => c.endpoints);
  assert.equal(all.length, reference.length);
  assert.equal(new Set(all.map(e => e.id)).size, reference.length);
  for (const name of ['blocks', 'transactions', 'names']) {
    const endpoints = categories.find(c => c.key === name).endpoints;
    assert.equal(endpoints[0].path, `/v1/${name}`);
    assert.match(endpoints[1].path, new RegExp(`^/v1/${name}/:[^/]+$`));
    const firstWrite = endpoints.findIndex(e => e.method !== 'GET');
    if (firstWrite >= 0) assert(endpoints.slice(firstWrite).every(e => e.method !== 'GET'));
  }
});

test('parameter and JSON examples preserve types and leave credentials and identifiers as placeholders', () => {
  const endpoints = docs.getEndpoints('https://example.com');
  for (const endpoint of endpoints.filter(e => e.method === 'POST')) {
    const body = JSON.parse(endpoint.bodyExample);
    for (const field of endpoint.requestBody.required) assert(Object.hasOwn(body, field), `${endpoint.path}: ${field}`);
  }
  assert.deepEqual(JSON.parse(endpoints.find(e => e.path === '/v1/scan/orchard').bodyExample), {startHeight:3000000, endHeight:3000009});
  assert.deepEqual(JSON.parse(endpoints.find(e => e.path === '/v1/transactions/raw/batch').bodyExample), {txids:['<txid>']});
  assert.equal(docs.parameterUsage({name:'heightOrHash',in:'path',schema:{}},'/v1/blocks/:heightOrHash'),'/v1/blocks/3000000');
  assert.equal(docs.parameterUsage({name:'direction',in:'query',schema:{enum:['inflow','outflow']}},''),'direction=inflow');
  assert.equal(docs.parameterValue({name:'cursor',in:'query',schema:{}}),'<cursor-from-meta.page>');
  assert.match(endpoints.find(e => e.path === '/v1/privacy/blend-check').example,/amount=1/);
});
