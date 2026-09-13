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

test('Sluicey coinbase tag identifies a pool without inventing a payout address', () => {
  const { getPoolTag } = require('../api/mining-pools');
  const tag = Buffer.from('Get Sluicey Yall sluicey.xyz').toString('hex');
  assert.equal(getPoolName(null, `1d00${tag}`), 'Sluicey Pool');
  assert.equal(getPoolInfo(null, tag).url, 'https://sluicey.xyz/');
  assert.equal(getPoolTag(tag.toUpperCase()), 'sluicey');
  for (const invalid of [`a${tag}0`, tag+'z', null, Buffer.from('sluicey.xyz').toString('hex')]) {
    assert.equal(getPoolTag(invalid), null);
  }
  assert.equal(getPoolName('t1MKn34KBa8Xh4g8qU8psibBXvURafphVn7', tag), 'ViaBTC');
});
