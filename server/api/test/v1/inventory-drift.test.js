const test = require('node:test');
const assert = require('node:assert/strict');
const { buildQueryInventory } = require('../../v1/tools/query-inventory');
const { buildReference } = require('../../v1/tools/write-reference');
test('query inventory and frontend reference match authoritative route sources', () => {
  assert.deepEqual(require('../../v1/inventory/query-parameters.json'), buildQueryInventory());
  assert.deepEqual(require('../../../../lib/generated/api-reference.json'), buildReference());
});
test('shared page helpers retain limit/page for address metadata and cross-chain history', () => {
  const inventory = buildQueryInventory();
  for (const route of ['GET /v1/addresses/:address', 'GET /v1/crosschain/history']) {
    assert(inventory[route].includes('limit'), route);
    assert(inventory[route].includes('page'), route);
  }
});

test('downloadable spec contains exactly the public operations and stays in sync', () => {
  const { buildPublicSpec } = require('../../v1/tools/write-reference');
  const { MANIFEST } = require('../../v1/inventory/manifest');
  const spec = require('../../../../public/openapi-v1.json');
  assert.deepEqual(spec, buildPublicSpec());
  const operations = Object.entries(spec.paths).flatMap(([path, methods]) => Object.keys(methods).map(method => `${method.toUpperCase()} ${path}`));
  const expected = MANIFEST.filter(e => e.classification === 'public').map(e => `${e.method} ${e.v1.path.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, '{$1}')}`);
  assert.deepEqual(operations.sort(), expected.sort());
});

test('docs retain request bodies, ownership requirements and real pagination bounds', () => {
  const reference = buildReference();
  for (const route of reference.filter(e => e.method === 'POST')) assert(route.requestBody?.required?.length, route.path);
  const names = reference.find(e => e.path === '/v1/names');
  assert.equal(names.pagination, 'cursor');
  assert.equal(names.parameters.find(p => p.name === 'limit').schema.maximum, 500);
  assert.equal(names.parameters.find(p => p.name === 'limit').schema.default, 100);
  const blocks = reference.find(e => e.path === '/v1/blocks');
  assert.equal(blocks.parameters.find(p => p.name === 'limit').schema.default, 25);
  const deletion = reference.find(e => e.method === 'DELETE');
  assert.equal(deletion.parameters.find(p => p.name === 'X-Node-Token').required, true);
  for (const [path, field] of [['/v1/privacy/blend-check','amount'], ['/v1/network/price/at','date'], ['/v1/stats/shielded-daily','since'], ['/v1/privacy/recommended-swap-amounts','chain']]) {
    assert.equal(reference.find(e => e.path === path).parameters.find(p => p.name === field).required, true, path);
  }
  assert.deepEqual(reference.find(e => e.path === '/v1/crosschain/history').parameters.find(p => p.name === 'direction').schema.enum, ['inflow', 'outflow']);
});

test('existing public endpoint permalinks remain complete and unique', () => {
  const anchors = require('../../../../app/docs/anchors.json');
  const routes = buildReference().map(e => `${e.method} ${e.path}`);
  assert.deepEqual(Object.keys(anchors).sort(), routes.sort());
  assert.equal(new Set(Object.values(anchors)).size, routes.length);
});
