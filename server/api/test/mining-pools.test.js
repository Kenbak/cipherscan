const assert = require('node:assert/strict');
const test = require('node:test');
const { getPoolName, getPoolTag, getPoolInfo } = require('../mining-pools');

test('attributes MySoloPool by payout address', () => {
  assert.equal(getPoolName('t1Yw8NGbPDs7fgpxzJ8gzCgurAQ8GFQBkk2'), 'MySoloPool');
});

test('attributes MySoloPool by coinbase tag Mysolopool.com', () => {
  const hex = '14f09fa6933a204d79736f6c6f706f6f6c2e636f6d';
  assert.equal(getPoolTag(hex), 'mysolopool');
  assert.equal(getPoolName(null, hex), 'MySoloPool');
  assert.equal(getPoolInfo(null, hex).url, 'https://zcash.mysolopool.com');
});

test('does not treat the ZIP-207 funding stream as a miner', () => {
  const info = getPoolInfo('t3cFfPt1Bcvgez9ZbMBFWeZsskxTkPzGCow');
  assert.equal(info.isFundingStream, true);
  assert.equal(getPoolName('t3cFfPt1Bcvgez9ZbMBFWeZsskxTkPzGCow'), null);
});
