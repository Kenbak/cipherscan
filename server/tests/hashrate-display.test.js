const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const ts = require('typescript');
const fs = require('node:fs');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/hashrate.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: exportsObject });
const { hashrateChartPoints } = exportsObject;
const current = { windowEnd: '2026-09-24T05:06:07.000Z', hashrate: 100, blockCount: 123 };
const snapshot = { windows: { '24h': current, '7d': { ...current, hashrate: 200 } } };
test('live chart endpoint uses the identical shared headline sample', () => {
  const data = { method: 'target-work-v1', window: '24h', points: [{ date: '2026-09-24T00:00:00.000Z', hashrate: 50 }] };
  const points = hashrateChartPoints(data, '24h', snapshot);
  assert.equal(points.at(-1).hashrate, current.hashrate);
  assert.equal(points.at(-1).windowEnd, current.windowEnd);
  assert.equal(points.length, 2);
});
test('retained daily/24h responses are never presented as seven-day estimates', () => {
  assert.equal(hashrateChartPoints({ window: '24h', method: 'target-work-v1', points: [] }, '7d', snapshot).length, 0);
  assert.equal(hashrateChartPoints({ points: [{ date: '2026-09-24', hashrate: 5 }] }, '24h', snapshot).length, 0);
});
