const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file, imports = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, '../../app/address/[address]/components', file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => imports[name] || require(name), module, module.exports);
  return module.exports;
}
const { connectionNodes } = load('address-connections.ts');
const peer = { address: 'peer', balanceZec: 120, txCount: 50, label: null };
const cp = { address: 'peer', sentZec: 3, receivedZec: 8, txCount: 2, sameEntity: true, label: null };
const response = { address: 'self', cluster: { clusterId: 1, memberCount: 2 }, peers: [peer], counterparties: [cp, { ...cp, address: 'outside', sameEntity: false }] };
test('a co-spend peer retains its recent associations instead of losing them during graph deduplication', () => {
  const recent = connectionNodes(response, 'recent');
  assert.equal(recent.length, 2);
  assert.equal(recent[0].counterparty.receivedZec, 8);
  assert.equal(recent[0].peer.balanceZec, 120);
  assert.equal(recent[1].peer, undefined);
  assert.deepEqual(connectionNodes(response, 'cluster').map(node => node.id), ['peer']);
});
test('duplicate entries and the center address never become extra connected nodes', () => {
  assert.deepEqual(connectionNodes({ ...response, counterparties: [cp, cp, { ...cp, address: 'self' }] }, 'recent').map(node => node.id), ['peer']);
});
test('address transaction adapter retains pool evidence and public zero changes', () => {
  const { transformTransactions } = load('helpers.ts', { '@/lib/format-numbers': { zatToZec: v => Number(v) / 1e8 } });
  const [tx] = transformTransactions({ address: 'self' }, [{ txid: 'hash', blockTime: 100, netChange: '0', hasIronwood: true, inputValue: 100, outputValue: 100 }]);
  assert.equal(tx.amount, 0);
  assert.equal(tx.hasIronwood, true);
  assert.equal(tx.isShielded, false);
});

test('private address routing uses the typed family rather than fragile API note text', () => {
  const { isShieldedAddress } = load('helpers.ts', { '@/lib/format-numbers': { zatToZec: v => Number(v) / 1e8 } });
  assert.equal(isShieldedAddress({ type: 'unified', balance: null, transactions: [] }), true);
  assert.equal(isShieldedAddress({ type: 'shielded', note: 'new wording' }), true);
  assert.equal(isShieldedAddress({ type: 'transparent', balance: 0, transactions: [] }), false);
});
