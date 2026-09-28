const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function render(data, { network = 'mainnet', error = null } = {}) {
  const exports = {};
  const calls = [];
  const jsx = (type, props) => ({ type, props });
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/network/NetworkAccounting.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require(name) {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'react') return { useState: value => [value, () => {}] };
    if (name === 'recharts') return {};
    if (name === '@/lib/config') return { NETWORK: network, CURRENCY: 'ZEC' };
    if (name === '@/components/ui/Card') return { Card: 'Card', CardBody: 'CardBody' };
    if (name === '@/hooks/useApiQuery') return { useApiQuery(url, params, options) {
      calls.push({ url, options });
      return url.endsWith('/history') ? { data: undefined } : { data, error, loading: !data };
    } };
    throw new Error(`Unexpected import ${name}`);
  } });
  return { tree: exports.NetworkAccounting(), historyEnabled: calls.find(c => c.url.endsWith('/history')).options.enabled };
}
const snapshot = (height, activation = 4000000, chain = 'main') => ({ success: true, nodeHeight: height,
  schedule: { network: chain, nu7Height: activation }, block: null });

test('accounting is hidden and history is not requested before or without confirmed activation', () => {
  for (const data of [undefined, snapshot(3999999), snapshot(5000000, null), { ...snapshot(5000000), schedule: null },
    snapshot(5000000, -1), snapshot(5000000, 1.5), snapshot(5000000, 500000000), snapshot(NaN),
    { ...snapshot(5000000), success: false }]) {
    const result = render(data);
    assert.equal(result.tree, null);
    assert.equal(result.historyEnabled, false);
  }
});
test('each network becomes visible at its own node-announced activation boundary', () => {
  for (const [network, chain, activation] of [['mainnet', 'main', 4000000], ['testnet', 'test', 4400000]]) {
    assert.equal(render(snapshot(activation - 1, activation, chain), { network }).tree, null);
    const result = render(snapshot(activation, activation, chain), { network });
    assert.equal(result.tree.type, 'Card');
    assert.equal(result.historyEnabled, true);
    assert.equal(render(snapshot(activation - 1, activation, chain), { network }).tree, null, 'reorg below activation hides accounting');
  }
});
test('wrong-network, Crosslink and failed-refresh snapshots cannot expose NU7 accounting', () => {
  for (const options of [{ network: 'testnet' }, { network: 'crosslink' }, { error: new Error('unavailable') }]) {
    const result = render(snapshot(5000000), options);
    assert.equal(result.tree, null);
    assert.equal(result.historyEnabled, false);
  }
});
