const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const ts=require('typescript');
function load(file){const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const m={exports:{}};new Function('module','exports','require',code)(m,m.exports,name=>load(path.resolve(path.dirname(file),name+'.ts')));return m.exports;}
const {CHART_CATALOG,catalogRows,formatCatalogValue}=load('lib/chart-catalog.ts');const chart=id=>CHART_CATALOG.find(c=>c.id===id);
test('pool balances require verified balance history; flow responses cannot become pool balances',()=>{
 assert.deepEqual(catalogRows(chart('pool-balances'),{points:[{date:'2026-01-01',shield:50}]}),[]);
 const rows=catalogRows(chart('pool-balances'),{hasVerifiedPerPoolBreakdown:true,points:[{date:'2026-01-01',orchard:100,ironwood:0,sapling:null}]});
 assert.equal(rows[0].orchard,100);assert.equal(rows[0].ironwood,0);assert.equal(rows[0].sapling,null);
});
test('gaps are not zero; dates sort chronologically and retain elapsed time',()=>{
 const rows=catalogRows(chart('network-hashrate'),{points:[{date:'2026-01-05',hashrate:25e9},{date:'2026-01-01',hashrate:null}]});
 assert.equal(rows[1].hashrate,25);assert.equal(rows[0].hashrate,null);assert.equal(rows[1].x-rows[0].x,4*86400000);
 assert.deepEqual(catalogRows(chart('network-hashrate'),{success:false,points:[{date:'2026-01-01',hashrate:1}]}),[]);
});
test('fee percentiles convert zatoshis to mZEC, rewards convert zatoshis to ZEC',()=>{
 assert.equal(catalogRows(chart('fees'),{daily:[{date:'2026-01-01',median:10000}]})[0].median,.1);
 assert.equal(catalogRows(chart('miner-rewards'),{series:[{date:'2026-01-01',earnedZat:'156250000'}]})[0].earnedZat,1.5625);
 assert.notEqual(formatCatalogValue(.00001,'ZEC',true),'0');
});
test('SOPR requires transparent-spend authority, never the legacy proxy',()=>{
 const rows=catalogRows(chart('sopr'),{points:[{date:'2026-01-01',sopr:3},{date:'2026-01-02',sopr:1.1,soprSource:'transparent_spends'}]});
 assert.equal(rows[0].sopr,null);assert.equal(rows[1].sopr,1.1);
});
test('block intervals preserve negative values, outliers and missing predecessors',()=>{
 const rows=catalogRows(chart('block-time'),{blocks:[{height:1,timestamp:1000},{height:2,timestamp:900},{height:3,timestamp:1800},{height:5,timestamp:1900}]});
 assert.deepEqual(rows.map(r=>r.seconds),[-100,900,null]);
});
test('search attention excludes incomplete weeks and never combines snapshots',()=>{
 const rows=catalogRows(chart('search-interest'),{snapshot:{points:[{date:'2026-01-01',value:50,partial:false},{date:'2026-01-08',value:100,partial:true}]}});
 assert.equal(rows.length,1);assert.equal(rows[0].value,50);
});
test('leading pool shares are fractions; derived rows do not mutate shared responses',()=>{
 const response={series:[{date:'2026-01-01',pools:{A:.3,B:.7}},{date:'2026-01-02',pools:{}}]};
 const rows=catalogRows(chart('pool-share'),response);assert.equal(rows[0].largestShare,70);assert.equal(rows[1].largestShare,null);assert.equal(response.series[0].largestShare,undefined);
});
test('catalogue identifiers are unique and all entries have source contracts',()=>{
 assert.equal(new Set(CHART_CATALOG.map(c=>c.id)).size,CHART_CATALOG.length);
 for(const c of CHART_CATALOG){assert.ok(c.endpoint.startsWith('/api/'));assert.ok(c.unit&&c.description&&c.window&&c.series.length);}
});
