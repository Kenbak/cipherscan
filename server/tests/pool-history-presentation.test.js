const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../../components/pools/supply-history.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const loaded = { exports: {} };
new Function('exports', compiled)(loaded.exports);
const { completeSupplyHistory } = loaded.exports;
const valid = { date: '2020-01-01', sprout: 1, sapling: 2, orchard: 0, ironwood: 0, transparent: 97, shielded: 3, chainSupply: 100, hasPoolBreakdown: true };
test('historical maps skip missing totals or breakdowns instead of using present-day supply', () => {
  for (const invalid of [{ chainSupply: null }, { chainSupply: 21_000_001 }, { chainSupply: 99 }, { hasPoolBreakdown: undefined }, { chainSupply: 0 }, { chainSupply: NaN }, { hasPoolBreakdown: false }, { transparent: undefined }, { shielded: -1 }, { date: 'invalid' }]) {
    assert.deepEqual(completeSupplyHistory([{ ...valid, ...invalid }, valid]), [valid]);
  }
});
test('zero balances before pool activation remain valid historical observations', () => {
  assert.deepEqual(completeSupplyHistory([valid]), [valid]);
  assert.deepEqual(completeSupplyHistory([]), []);
});
