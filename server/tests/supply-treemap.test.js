const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../components/pools/supply-treemap-layout.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const loaded = { exports: {} };
new Function('module', 'exports', compiled)(loaded, loaded.exports);
const { buildTopLevelSegments, layoutSupplyMap, MAX_SUPPLY_ZAT } = loaded.exports;
const colors = { transparent: '#888', shielded: '#fa0', otherIssued: '#666', unmined: '#aaa' };
const snapshot = {
  // Direct mainnet getblockchaininfo, height 3479100, 2026-09-11.
  transparent: 1196843012781938,
  shielded: 2259146261837 + 51331359519078 + 42201499563024 + 393699510928603,
  chainSupply: 1692572672804480,
  colors,
};

test('node snapshot partitions the cap and keeps issued lockbox out of unmined', () => {
  const segments = buildTopLevelSegments(snapshot);
  assert.equal(segments.find(s => s.key === 'otherIssued').zat, 6238143750000);
  assert.equal(segments.find(s => s.key === 'unmined').zat, MAX_SUPPLY_ZAT - snapshot.chainSupply);
  assert.equal(segments.reduce((sum, s) => sum + s.zat, 0), MAX_SUPPLY_ZAT);
  const { topLevel } = layoutSupplyMap(segments, [], 1000, 200, 0);
  assert.ok(Math.abs(topLevel.reduce((sum, s) => sum + s.supplyPct, 0) - 100) < 1e-12);
  for (const rect of topLevel) assert.ok(Math.abs(rect.w / 1000 - rect.zat / MAX_SUPPLY_ZAT) < 1e-12);
});

test('historical supply without a remainder does not invent other issuance', () => {
  const segments = buildTopLevelSegments({ transparent: 80e8, shielded: 20e8, chainSupply: 100e8, colors });
  assert.equal(segments.find(s => s.key === 'otherIssued').zat, 0);
  assert.equal(layoutSupplyMap(segments, [], 1000, 200).topLevel.length, 3);
});

test('unavailable, negative, fractional and contradictory totals do not render a fabricated partition', () => {
  for (const patch of [
    { chainSupply: 0 }, { chainSupply: null }, { chainSupply: NaN },
    { chainSupply: MAX_SUPPLY_ZAT + 1 }, { transparent: -1 },
    { transparent: Infinity }, { shielded: 0.5 },
    { chainSupply: snapshot.transparent + snapshot.shielded - 1 },
  ]) assert.deepEqual(buildTopLevelSegments({ ...snapshot, ...patch }), [], JSON.stringify(patch));
});

test('fully issued cap has no unmined area', () => {
  const segments = buildTopLevelSegments({ ...snapshot, chainSupply: MAX_SUPPLY_ZAT });
  assert.equal(segments.find(s => s.key === 'unmined').zat, 0);
  assert.equal(layoutSupplyMap(segments, [], 1000, 200).topLevel.some(s => s.key === 'unmined'), false);
});
