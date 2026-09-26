const test = require('node:test');
const assert = require('node:assert/strict');
const { parseNodeSnapshot, readNodeSnapshot } = require('../lib/zakura-dashboard');
process.env.ZCASH_NETWORK = 'mainnet';
const { ForkMonitor } = require('../fork-monitor');
const hash = '0'.repeat(63) + '1';
const otherHash = '0'.repeat(63) + '2';
const nodeName = 'Zakura europe-west-0 (dashboard)';
const config = { name: nodeName, host: '159.65.183.89', port: 8090, dashboard: 'europe-west-0' };
function fixture(now = Date.now() / 1000) {
  return { network: 'mainnet', generated_at: now, last_poll: now - 10, node: {
    name: 'europe-west-0', rpc_chain: 'main', rpc_testnet: false, client_name: 'zakurad',
    client_version: 'v1.5.0+g4870bc77121e', active_state: 'active', rpc_ok: true,
    last_seen_at: now - 15, height: 3_496_810, block_hash: hash,
  } };
}

test('dashboard tip preserves source observation time and only exposes required fields', () => {
  const data = fixture(1000);
  data.node.ssh = 'private operational details';
  const tip = parseNodeSnapshot(data, 'europe-west-0', 1000);
  assert.deepEqual(tip, { height: 3496810, hash, nodeImpl: 'Zakura', version: 'v1.5.0+g4870bc77121e', observedAt: '1970-01-01T00:16:25.000Z' });
});

test('stale probes, wrong identity/network, unavailable RPC and malformed tips are rejected', () => {
  for (const mutate of [
    d => { d.last_poll = 699; }, d => { d.node.last_seen_at = 699; },
    d => { d.node.last_seen_at = 1061; }, d => { d.last_poll = null; },
    d => { d.network = 'testnet'; }, d => { d.node.rpc_chain = 'test'; },
    d => { d.node.rpc_testnet = true; }, d => { d.node.name = 'us-0'; },
    d => { d.node.client_name = 'zcashd'; }, d => { d.node.rpc_ok = false; },
    d => { d.node.active_state = 'inactive'; }, d => { d.node.height = '3496810'; },
    d => { d.node.height = -1; }, d => { d.node.height = 100_000_001; },
    d => { d.node.block_hash = null; }, d => { d.node.block_hash = 'invalid'; },
  ]) {
    const data = fixture(1000); mutate(data);
    assert.throws(() => parseNodeSnapshot(data, 'europe-west-0', 1000));
  }
});

test('HTTP reader bounds the body, rejects HTTP errors and requests no redirects', async t => {
  let mode = 'ok';
  t.mock.method(global, 'fetch', async (url, options) => {
    assert.equal(url, 'http://159.65.183.89:8090/data/node/europe-west-0');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    if (mode === 'error') return new Response('{}', { status: 503 });
    if (mode === 'large') return new Response(' '.repeat(1024 * 1024 + 1));
    if (mode === 'invalid') return new Response('not JSON');
    return new Response(JSON.stringify(fixture()));
  });
  assert.equal((await readNodeSnapshot(config)).hash, hash);
  for (mode of ['error', 'large', 'invalid']) await assert.rejects(readNodeSnapshot(config));
});

test('monitor compares dashboard tips, records only verified mismatches and clears failed-fork status', async t => {
  let data = fixture();
  t.mock.method(global, 'fetch', async () => new Response(JSON.stringify(data)));
  const writes = [];
  const monitor = new ForkMonitor({ pool: { query: async (sql, params) => {
    if (sql.includes('INSERT INTO tip_reports')) { writes.push(params); return { rows: [] }; }
    return { rows: [{ hash }] };
  } } });
  const status = () => monitor.getStatus().find(n => n.name === 'Zakura europe-west-0');
  assert.equal(status().source, 'zakura-dashboard');
  await monitor._checkNode(config, { height: data.node.height, hash });
  assert.equal(status().status, 'agree');
  assert.equal(status().nodeImpl, 'Zakura');
  await monitor._checkNode(config, { height: data.node.height + 1, hash });
  assert.equal(status().status, 'behind');
  await monitor._checkNode(config, { height: data.node.height - 1, hash });
  assert.equal(status().status, 'ahead');
  assert.equal(writes.length, 0);
  data.node.block_hash = otherHash;
  await monitor._checkNode(config, { height: data.node.height, hash });
  assert.equal(status().status, 'fork');
  assert.deepEqual(writes, [[data.node.height, otherHash, 'monitor:' + nodeName]]);
  assert.equal(status().forkHeight, null); // Dashboard cannot establish an exact ancestor.
  data.node.last_seen_at -= 301;
  await monitor._checkNode(config, { height: data.node.height, hash });
  assert.equal(status().status, 'offline');
  assert.equal(writes.length, 1); // Never record a stale tip as new fork evidence.
});
