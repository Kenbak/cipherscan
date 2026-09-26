const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exportsMap = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/block-timing.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: exportsMap });
const { scheduledSeconds } = exportsMap;
const { networkSchedule, targetSeconds } = require('../api/lib/network-schedule');

test('future estimates use the serving network schedule across historical and NU7 eras', () => {
  for (const [chain, blossom] of [['main', 653600], ['test', 584000]]) {
    const schedule = networkSchedule({ chain, upgrades: {
      blossom: { name: 'Blossom', activationheight: blossom },
      nu7: { name: 'NU7', activationheight: 4000000 },
    } });
    assert.equal(scheduledSeconds(schedule, blossom - 2, blossom + 2), 450);
    assert.equal(scheduledSeconds(schedule, 3999998, 4000002), 200);
    assert.equal(scheduledSeconds(schedule, 4000000, 4000003), 75);
    for (const [from, to] of [[0, 1], [blossom - 1, blossom + 1], [3999999, 4000001], [4500000, 4500000]]) {
      assert.equal(scheduledSeconds(schedule, from, to), targetSeconds(schedule, from, to));
    }
  }
});
test('unscheduled upgrades do not invent a 25-second activation', () => {
  const schedule = networkSchedule({ chain: 'main', upgrades: { blossom: { name: 'Blossom', activationheight: 653600 } } });
  assert.equal(scheduledSeconds(schedule, 3999999, 4000001), 150);
});
test('missing and malformed schedules and heights are unavailable', () => {
  for (const schedule of [null, {}, { eras: [] }, { eras: [null] }, { eras: [{ height: 0, seconds: 0 }] }, { eras: [{ height: 0, seconds: 75 }, { height: 0, seconds: 25 }] }]) {
    assert.equal(scheduledSeconds(schedule, 1, 2), null);
  }
  const schedule = { eras: [{ height: 0, seconds: 75 }] };
  for (const [from, to] of [[-1, 2], [1, 0], [1.5, 2], [1, Infinity], [1, 500000000]]) {
    assert.equal(scheduledSeconds(schedule, from, to), null);
  }
});
