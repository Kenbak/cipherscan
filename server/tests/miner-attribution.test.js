const test = require('node:test');
const assert = require('node:assert/strict');
const { getPoolName, getPoolInfo } = require('../api/mining-pools');

test('funding-stream identities remain available without being mining pools', () => {
  for (const address of ['t3cFfPt1Bcvgez9ZbMBFWeZsskxTkPzGCow', 't2HifwjUj9uyxr9bknR8LFuQbc98c3vkXtu']) {
    assert.equal(getPoolName(address), null);
    assert.equal(getPoolInfo(address).isFundingStream, true);
  }
});
test('real mining pool identities and unknown recipients are preserved', () => {
  assert.equal(getPoolName('t1MKn34KBa8Xh4g8qU8psibBXvURafphVn7'), 'ViaBTC');
  assert.equal(getPoolName(null), null);
  assert.equal(getPoolName('unrecognized'), null);
});
