'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
async function request(available,history=[]) {
 const queries=[];const app=express();app.locals.redisClient=null;
 app.locals.pool={query:async(sql,params)=>{
  queries.push({sql,params});
  if(sql.includes('to_regclass'))return {rows:[{available}]};
  if(sql.includes('analytics_history_daily'))return {rows:history};
  return {rows:[{day:'2026-10-02',p10:1000,p25:2000,median:3000,p75:4000,p90:5000,avg_fee:3000,tx_count:7}]};
 }};
 app.use(require('../api/routes/analytics'));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 try{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/network/fee-distribution?period=all`);return {status:r.status,body:await r.json(),queries};}
 finally{await new Promise(resolve=>server.close(resolve));}
}
test('missing historical table returns a labeled bounded recent range instead of HTTP 500',async()=>{
 const {status,body,queries}=await request(false);
 assert.equal(status,200);assert.equal(body.requestedPeriod,'all');assert.equal(body.period,'30d');
 assert.equal(body.historyStatus,'unavailable');assert.equal(body.daily[0].median,3000);
 const raw=queries.find(q=>q.sql.includes('FROM transactions'));assert.ok(raw.params[0]>Date.now()/1000-31*86400);
 assert.match(raw.sql,/fee > 0 AND is_coinbase = false/);
 assert.ok(!queries.some(q=>q.sql.includes('FROM analytics_history_daily')));
});
test('empty all-time summaries also retain usable recent observations',async()=>{
 assert.equal((await request(true)).body.historyStatus,'unavailable');
});
test('available all-time fees keep their full canonical completed-day coverage',async()=>{
 const fees={p10:1,p25:2,median:3,p75:4,p90:5,avgFee:3,txCount:8};
 const {body,queries}=await request(true,[{date:'2016-10-28',fees}]);
 assert.equal(body.period,'all');assert.equal(body.daily[0].date,'2016-10-28');
 assert.equal(body.daily[0].median,3);assert.equal(body.historyStatus,undefined);
 assert.match(queries[1].sql,/b.height=a.anchor_height AND b.hash=a.anchor_hash/);
 assert.ok(!queries.some(q=>q.sql.includes('FROM transactions')));
});
