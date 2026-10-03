'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { networkSchedule } = require('../api/lib/network-schedule');
const { issuanceBetween, supplyProjection } = require('../api/lib/issuance-projection');
const schedule = networkSchedule({ chain: 'test', upgrades: { b: { name: 'Blossom', activationheight: 584000 }, n: { name: 'NU7', activationheight: 4465026 } } });

test('projection uses exact zatoshis across serving-node NU7 and third-halving boundaries', () => {
  assert.equal(issuanceBetween(schedule, 4465024, 4465026), 156250000n + 52083333n);
  assert.equal(issuanceBetween(schedule, 4497946, 4497948), 52083333n + 26041666n);
  assert.equal(issuanceBetween(schedule, 4475999, 4476000), 52083333n);
  assert.equal(issuanceBetween(schedule, 4497948, 4497951), 3n * 26041666n);
});
const options = { schedule, currentHeight: 4435663, cadence: { intervalSeconds: 75 },
  latest: { height: 4435660, date: '2026-10-03T00:00:00Z', circulatingZat: 1831136106585043 } };
test('curve starts at observed supply and marks the actual future halvings', () => {
  const p = supplyProjection(options);
  assert.equal(p.points[0].circulatingZat, '1831136106585043');
  const third = p.points.find(p => p.halving === 3);
  assert.equal(third.height, 4497948);
  assert.equal(Date.parse(third.date) - Date.parse(options.latest.date), (4465026 - 4435660) * 75000 + (4497948 - 4465026) * 25000);
  assert.equal(third.circulatingZat, (1831136106585043n + issuanceBetween(schedule,4435660,4497948)).toString());
  assert.equal(p.points.filter(p => p.halving).length, 4);
  assert.ok(p.points.length < 170);
  assert.deepEqual(p.excludes, ['future-supply-removals', 'nsm-reissuance']);
});
test('missing baseline height, supply or schedule never creates a projection', () => {
  for (const overrides of [{schedule:null}, {latest:{...options.latest,height:null}}, {latest:{...options.latest,circulatingZat:null}}, {latest:{...options.latest,date:'bad'}}, {latest:{...options.latest,height:4435664}}])
    assert.equal(supplyProjection({...options,...overrides}),null);
});
const ts = require('typescript'), fs = require('node:fs'), vm = require('node:vm');
const exp = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/issuance-curve.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:exp,Date,Map,Number});
test('chart preserves observed decreases, unavailable days and historical gaps', () => {
  const points=exp.issuanceChartPoints({supplyHistory:[
    {date:'2026-01-01T01:00:00Z',circulating:100},
    {date:'2026-01-01T23:00:00Z',circulating:99},
    {date:'2026-01-02T00:00:00Z',circulating:null},
    {date:'2026-01-06T00:00:00Z',circulating:98},
  ]});
  assert.equal(points[0].observed,99);assert.equal(points[1].observed,null);
  assert.equal(points[2].observed,null);assert.equal(points[3].observed,98);
});

test('missing observed cadence keeps a target-spacing projection without inventing measured timing', () => {
 const p = supplyProjection({...options,cadence:null});
 assert.equal(p.dateBasis,'consensus-target-spacing');
 assert.equal(p.points.find(p=>p.halving===3).date,supplyProjection(options).points.find(p=>p.halving===3).date);
});

test('mainnet uses its own unannounced-NU7 schedule and subsidy units', () => {
 const main = networkSchedule({chain:'main',upgrades:{b:{name:'Blossom',activationheight:653600}}});
 const p = supplyProjection({...options,schedule:main,currentHeight:3500000,latest:{...options.latest,height:3500000,circulatingZat:1700000000000000}});
 assert.equal(p.points.find(p=>p.halving===3).height,4406400);
 assert.equal(issuanceBetween(main,4406398,4406400),156250000n+78125000n);
});
