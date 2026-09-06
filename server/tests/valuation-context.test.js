const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { valuationRow } = require('../api/lib/valuation-values');
const { parseZcashTrends, importSnapshot } = require('../lib/google-trends');
const code = ts.transpileModule(fs.readFileSync('lib/valuation.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const m = {exports:{}};new Function('module','exports',code)(m,m.exports);
const { dailyMarketContext, quoteIsFresh, modeledPremium } = m.exports;
const now=Date.parse('2026-09-07T00:00:00Z');
const quote={price:100,timestamp:now,sourceUpdatedAt:now};
test('missing actual SOPR stays unavailable even when the pool proxy exists; zero survives',()=>{
  const r=valuationRow({sopr:null,shielded_sopr:'3.2',nupl:'0',mvrv:null});
  assert.equal(r.sopr,null);assert.equal(r.soprSource,'unavailable');assert.equal(r.shieldedCostBasisRatio,3.2);assert.equal(r.nupl,0);assert.equal(r.mvrv,null);
  assert.equal(valuationRow({sopr:0}).soprSource,'transparent_spends');
});
test('freshness checks reject stale provider data, unknown source times and future quotes',()=>{
  assert.equal(quoteIsFresh(quote,now),true);
  for(const q of [{...quote,sourceUpdatedAt:now-301000},{...quote,sourceUpdatedAt:null},{...quote,timestamp:now+1},{...quote,price:NaN}]) assert.equal(quoteIsFresh(q,now),false);
  assert.equal(modeledPremium({date:'2026-09-01',realizedPrice:10},quote,now),null);
  assert.equal(modeledPremium({date:'2026-09-06',realizedPrice:10},quote,now),10);
});
test('daily price windows require consecutive calendar days; missing is not zero',()=>{
  const points=Array.from({length:365},(_,i)=>({date:new Date(now-(364-i)*86400000).toISOString(),priceUsd:100+i}));
  assert.equal(dailyMarketContext(points).ma200,364.5);
  assert.equal(dailyMarketContext(points).high365,464);
  const gaps=points.filter((_,i)=>i!==334);
  assert.equal(dailyMarketContext(gaps).change30d,null);
  assert.equal(dailyMarketContext(gaps).ma200,null);
  assert.equal(dailyMarketContext([]).price,null);
});
const csv='Category: All categories\n\nWeek,zcash: (Worldwide)\n2026-08-30,0\n2026-09-06,<1\n';
test('CSV preserves censored <1, real zero, and incomplete week',()=>{
  const p=parseZcashTrends(csv,'2026-09-07T00:00:00Z').points;
  assert.equal(p[0].value,0);assert.equal(p[0].partial,false);
  assert.equal(p[1].value,null);assert.equal(p[1].belowOne,true);assert.equal(p[1].partial,true);
});
test('reject comparison scales, bad values, gaps and duplicate weeks before DB writes',()=>{
  for(const invalid of [csv.replace('Worldwide)','Worldwide),bitcoin: (Worldwide)'),csv.replace(',0',',101'),csv.replace('2026-09-06','2026-08-30'),csv.replace('2026-08-30','2026-08-23')]) assert.throws(()=>parseZcashTrends(invalid,'2026-09-07T00:00:00Z'));
});
test('failed point import rolls back whole snapshot and releases connection',async()=>{
  const calls=[];const client={query:async(sql)=>{calls.push(sql);if(sql.startsWith('INSERT INTO search_interest_points'))throw new Error('write failed');return {rowCount:1};},release:()=>calls.push('released')};
  await assert.rejects(importSnapshot({connect:async()=>client},csv,'2026-09-07T00:00:00Z'));
  assert.deepEqual(calls.slice(-2),['ROLLBACK','released']);assert.ok(!calls.includes('COMMIT'));
});
test('reimporting identical values does not fabricate a fresher timestamp',async()=>{
  const calls=[];const client={query:async(sql)=>{calls.push(sql);return {rowCount:0};},release:()=>{}};
  const result=await importSnapshot({connect:async()=>client},csv,'2026-09-07T00:00:00Z');
  assert.equal(result.imported,false);assert.equal(calls.length,3);assert.ok(calls[1].includes('DO NOTHING'));
});
