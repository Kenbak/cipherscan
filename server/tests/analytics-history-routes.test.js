'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
async function withRouter(file,query,fn) {
 const app=express();app.locals.pool={query};app.locals.redisClient=null;app.use(require(file));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 try{await fn(`http://127.0.0.1:${server.address().port}`);}finally{await new Promise(r=>server.close(r));}
}
test('mining all-history never silently becomes seven days or one year',async()=>{
 const queries=[];
 await withRouter('../api/routes/mining',async(sql)=>{queries.push(sql);if(sql.includes('information_schema'))return {rows:[{exists:true}]};return {rows:[]};},async(base)=>{
  for(const route of ['miner-behavior','hashrate-share']) {
   const r=await fetch(`${base}/api/mining/${route}?period=all`);assert.equal(r.status,200);
  }
 });
 const reads=queries.filter(q=>q.includes('FROM mining_behavior_daily')||q.includes('FROM blocks')||q.includes('FROM analytics_history_daily'));
 assert.ok(reads.length>=2);for(const sql of reads)assert.doesNotMatch(sql,/INTERVAL '(7|365) days'/);
});
test('all valuation history has no artificial day cap and returns the price calendar',async()=>{
 const queries=[];
 await withRouter('../api/routes/valuation',async(sql,params)=>{queries.push({sql,params});return {rows:[{date:'2016-10-28',price_usd:'100',sopr:null,shielded_sopr:'4',transparent_method:null}]};},async(base)=>{
  const r=await fetch(`${base}/api/valuation/history?period=all`);assert.equal(r.status,200);const data=await r.json();
  assert.equal(data.period,'all');assert.equal(data.points[0].date,'2016-10-28');assert.equal(data.points[0].sopr,null);assert.equal(data.points[0].shieldedCostBasisRatio,4);
 });
 assert.deepEqual(queries[0].params,[null]);assert.match(queries[0].sql,/FROM zec_price_daily p/);assert.doesNotMatch(queries[0].sql,/COALESCE\(.*sopr/);
});
test('verified SOPR and zero are preserved separately from the modeled shielded ratio',async()=>{
 await withRouter('../api/routes/valuation',async()=>({rows:[{date:'2020-01-01',price_usd:'10',sopr:'0',shielded_sopr:'3',transparent_method:'transparent-utxo-day-close-v1',nupl:'0'}]}),async(base)=>{
  const data=await (await fetch(`${base}/api/valuation/snapshot`)).json();assert.equal(data.sopr,0);assert.equal(data.soprSource,'transparent_spends');assert.equal(data.transparentMethod,'transparent-utxo-day-close-v1');assert.equal(data.shieldedCostBasisRatio,3);assert.equal(data.nupl,0);
 });
});

test('all-history mining SQL reads canonical daily summaries and UTC date strings', {skip:!(process.env.TEST_ANALYTICS_DATABASE_URL||process.env.TEST_UTXO_DATABASE_URL)},async()=>{
 const {Client}=require('pg');const c=new Client({connectionString:process.env.TEST_ANALYTICS_DATABASE_URL||process.env.TEST_UTXO_DATABASE_URL});await c.connect();
 try {
  await c.query(`BEGIN; SET LOCAL TIME ZONE 'Pacific/Auckland';
   CREATE TEMP TABLE blocks(height bigint,hash text);
   CREATE TEMP TABLE analytics_history_daily(date date,anchor_height bigint,anchor_hash text,mining_pool_blocks jsonb);
   INSERT INTO blocks VALUES(1,'canonical');
   INSERT INTO analytics_history_daily VALUES('2016-10-28',1,'canonical','{"Pool":3,"Unknown":1}'),('2016-10-29',2,'orphan','{"Pool":9}');`);
  await withRouter('../api/routes/mining',c.query.bind(c),async(base)=>{
   const r=await fetch(`${base}/api/mining/hashrate-share?period=all`);assert.equal(r.status,200);
   const data=await r.json();assert.equal(data.series.length,1);assert.equal(data.series[0].date,'2016-10-28');
   assert.equal(data.series[0].totalBlocks,4);assert.equal(data.series[0].pools.Pool,0.75);
  });
 }finally{await c.query('ROLLBACK');await c.end();}
});
