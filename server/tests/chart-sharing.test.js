const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const ts=require('typescript');
function load(file){const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const m={exports:{}};new Function('module','exports','require',code)(m,m.exports,name=>load(path.resolve(path.dirname(file),name+'.ts')));return m.exports;}
const {CHART_CATALOG}=load('lib/chart-catalog.ts');
const sharing=load('lib/chart-sharing.ts');const {chartGeometry}=load('lib/chart-geometry.ts');
const chart=CHART_CATALOG.find(c=>c.id==='shielded-supply');
test('every catalog chart has one base sitemap URL and no range variants',()=>{
 const source=fs.readFileSync('lib/sitemaps.ts','utf8');
 for(const chart of CHART_CATALOG) assert.ok(source.includes(`'/charts/${chart.id}'`),chart.id);
 assert.doesNotMatch(source,/['"]\/charts\/[^'"\n]+\?/);
 assert.equal(sharing.findShareChart('../secrets'),undefined);
});
test('share selections are allowlisted, canonical path independent of filters',()=>{
 assert.equal(sharing.normalizeChartRange('https://evil.test'),'all');
 assert.equal(sharing.chartSharePath('shielded-supply','1y'),'/charts/shielded-supply?range=1y');
 assert.equal(sharing.chartImagePath('/charts/supply?range=1y'),'/charts/supply/image?range=1y');
 const source=CHART_CATALOG.find(c=>c.id==='supply');
 assert.deepEqual(sharing.selectedChartSeries(source,'shielded,other').series.map(s=>s.key),['shielded']);
 assert.equal(sharing.selectedChartSeries(source,'other'),source);
});
test('range filtering follows observations, retaining zero and missing values',()=>{
 const rows=[{x:Date.parse('2026-01-01'),shieldedSupplyPct:5},{x:Date.parse('2026-01-24'),shieldedSupplyPct:0},{x:Date.parse('2026-01-30'),shieldedSupplyPct:null}];
 assert.deepEqual(sharing.chartRangeRows(chart,rows,'7d'),rows.slice(1));
 assert.equal(sharing.chartRangeRows(chart,rows,'all'),rows);
});
test('line and area geometry leave missing points as gaps, with isolated observations visible',()=>{
 const rows=[{x:1,shieldedSupplyPct:0},{x:2,shieldedSupplyPct:null},{x:3,shieldedSupplyPct:5}];
 const g=chartGeometry(chart,rows);
 assert.equal(g.paths[0].segments.length,2);assert.equal(g.paths[0].segments[0][0].top,310);
 assert.equal(g.paths[0].segments[1].length,1);assert.equal(g.paths[0].line.includes('L'),false);
});
test('stacked incomplete rows do not look like a sudden collapse',()=>{
 const c=CHART_CATALOG.find(c=>c.id==='supply');
 const g=chartGeometry(c,[{x:1,shielded:5,transparent:10},{x:2,shielded:null,transparent:10}]);
 assert.equal(g.paths[0].segments[0].length,1);assert.equal(g.paths[1].segments[0].length,1);
});
test('CSV retains numeric precision, quotes values, distinguishes missing, neutralizes formulas',()=>{
 const c={...chart,axis:'category',series:[{key:'value',label:'Value',color:'gold'}]};
 const csv=sharing.chartCsv({chart:c,rows:[{x:'=HYPERLINK("evil")',value:0},{x:'missing',value:null},{x:'exact',value:.00000001}]});
 assert.ok(csv.includes('"\'=HYPERLINK(""evil"")"'));assert.ok(csv.includes('"missing",""'));assert.ok(csv.includes('"exact","1e-8"'));assert.ok(csv.includes('"0"'));
});
test('relative turnstile endpoint is computed at request time',()=>{
 const c=CHART_CATALOG.find(c=>c.id==='turnstile');
 assert.notEqual(sharing.chartEndpoint(c,Date.parse('2026-01-31')),sharing.chartEndpoint(c,Date.parse('2026-02-28')));
});

test('category snapshot labels use the source timestamp, never the current time',()=>{
 assert.equal(sharing.chartSnapshotLabel({generatedAt:'2026-01-01T12:34:56.789Z'}),'Source snapshot · 2026-01-01 12:34:56 UTC');
 assert.equal(sharing.chartSnapshotLabel({generatedAt:'invalid'}),undefined);
 assert.equal(sharing.chartSource(CHART_CATALOG.find(c=>c.id==='search-interest')),'Google Trends CSV · imported by ZecBlock');
});

function loadRoute(file, overrides={}) {
 const {createRequire}=require('node:module');const filename=path.resolve(file);
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const m={exports:{}};new Function('module','exports','require',code)(m,m.exports,name=>{
  if(name in overrides)return overrides[name];
  if(name==='server-only')return {};
  if(name.startsWith('@/components/')||name==='../ChartsClient')return new Proxy({},{get:()=>()=>null});
  if(name.startsWith('@/')||name.startsWith('.')){const base=name.startsWith('@/')?path.resolve(name.slice(2)):path.resolve(path.dirname(filename),name);return loadRoute(base+(fs.existsSync(base+'.ts')?'.ts':'.tsx'),overrides);}
  return createRequire(filename)(name);
 });return m.exports;
}
test('range and series social URLs retain the variant while canonical and robots follow network policy',async()=>{
 const previous=process.env.NEXT_PUBLIC_NETWORK;
 try {
  for(const network of ['mainnet','testnet','crosslink-testnet']) {
   process.env.NEXT_PUBLIC_NETWORK=network;
   const page=loadRoute('app/charts/[slug]/page.tsx',{'@/lib/chart-share-server':{loadShareChart:async()=>null}});
   assert.equal(page.dynamicParams,false);
   assert.deepEqual(page.generateStaticParams().map(p=>p.slug),CHART_CATALOG.map(c=>c.id));
   const metadata=await page.generateMetadata({params:Promise.resolve({slug:'supply'}),searchParams:Promise.resolve({range:'1y',series:'shielded'})});
   assert.ok(String(metadata.alternates.canonical).endsWith('/charts/supply'));assert.equal(String(metadata.alternates.canonical).includes('?'),false);
   assert.ok(metadata.openGraph.images[0].url.endsWith('/charts/supply/image?range=1y&series=shielded'));
   assert.equal(metadata.robots.index,network==='mainnet');assert.equal(metadata.robots.follow,true);
   assert.equal(metadata.openGraph.images[0].height,675);
  }
 } finally {if(previous===undefined)delete process.env.NEXT_PUBLIC_NETWORK;else process.env.NEXT_PUBLIC_NETWORK=previous;}
});
test('image route returns real 404 and uncached 503 for invalid or unavailable charts',async()=>{
 const route=loadRoute('app/charts/[slug]/image/route.tsx',{'next/og':{ImageResponse:class{}},'@/lib/chart-share-server':{loadShareChart:async()=>null}});
 const unknown=await route.GET(new Request('http://localhost/charts/unknown/image'),{params:Promise.resolve({slug:'unknown'})});assert.equal(unknown.status,404);
 const unavailable=await route.GET(new Request('http://localhost/charts/supply/image'),{params:Promise.resolve({slug:'supply'})});assert.equal(unavailable.status,503);assert.equal(unavailable.headers.get('Cache-Control'),'no-store');
});
