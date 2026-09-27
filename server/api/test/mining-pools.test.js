const assert = require('node:assert/strict');
const test = require('node:test');
const { getPoolName, getPoolTag, getPoolInfo } = require('../mining-pools');
const hex = text => Buffer.from(text).toString('hex');
const address = 't1Yw8NGbPDs7fgpxzJ8gzCgurAQ8GFQBkk2';
const tagged = '14f09fa6933a204d79736f6c6f706f6f6c2e636f6d';

test('attributes both MySoloPool example blocks and tag-only payouts', () => {
  for (const coinbase of [tagged, '04f09fa693', null]) {
    assert.equal(getPoolName(address, coinbase), 'MySoloPool');
  }
  assert.equal(getPoolTag(tagged), 'mysolopool');
  assert.equal(getPoolName(null, tagged), 'MySoloPool');
  assert.equal(getPoolInfo(null, tagged).url, 'https://zcash.mysolopool.com');
});

test('matches full byte-aligned tags without confusing Solopool or malformed hex', () => {
  for (const value of [null, '', 'zz', hex('solopool'), hex('solopool.org'),
    `0${tagged}`, `${tagged}0`, `0${tagged}0`, `${tagged}zz`]) {
    assert.equal(getPoolTag(value), null, String(value));
  }
  assert.equal(getPoolTag(tagged.toUpperCase()), 'mysolopool');
  assert.equal(getPoolTag(hex('Get Sluicey Yall sluicey.xyz')), 'sluicey');
  assert.equal(getPoolName('t1MKn34KBa8Xh4g8qU8psibBXvURafphVn7', tagged), 'ViaBTC');
});

test('does not treat funding streams as miners', () => {
  for (const funding of ['t3cFfPt1Bcvgez9ZbMBFWeZsskxTkPzGCow', 't2HifwjUj9uyxr9bknR8LFuQbc98c3vkXtu']) {
    assert.equal(getPoolInfo(funding).isFundingStream, true);
    assert.equal(getPoolName(funding), null);
    assert.equal(getPoolName(funding, tagged), 'MySoloPool');
  }
});
