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
