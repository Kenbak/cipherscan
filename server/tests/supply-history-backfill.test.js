'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {validateRange,parseBlock,buildPlan,applyPlan}=require('../scripts/backfill-supply-history');
const hash='a'.repeat(64);const anchor={date:'2026-01-01',height:'1',hash,timestamp:1767225601};
const block={hash,height:1,time:1767225601,chainSupply:{chainValueZat:62500,monitored:true}};
test('historical supply requires exact canonical RPC fields, including a real zero only at genesis',()=>{
 assert.equal(parseBlock(block,anchor),'62500');
 for(const bad of [{...block,hash:'b'.repeat(64)},{...block,time:0},{...block,chainSupply:{chainValueZat:0,monitored:true}},{...block,chainSupply:{chainValueZat:62500,monitored:false}},{...block,chainSupply:{chainValueZat:1.5,monitored:true}}])assert.throws(()=>parseBlock(bad,anchor));
 assert.equal(parseBlock({...block,height:0,chainSupply:{chainValueZat:0,monitored:false}},{...anchor,height:0}),'0');
});
test('repair excludes current UTC days and rejects invalid calendar ranges',()=>{
 for(const pair of [['2026-02-30','2026-03-01'],['2010-01-01','2026-01-01'],['2026-02-02','2026-02-01'],['2026-01-01',new Date().toISOString().slice(0,10)]])assert.throws(()=>validateRange(...pair));
});
const rpc=async(method)=>method==='getblockchaininfo'?{chain:'test',blocks:2}:method==='getblockhash'?hash:block;
function db({changed=false,recovery=false}={}){
 const writes=[];
 return {writes,async query(sql){
  if(sql==='SELECT hash FROM blocks WHERE height=0')return{rows:[{hash}]};
  if(sql.startsWith('SELECT height,timestamp'))return{rows:[{height:2,timestamp:1767484801}]};
  if(sql.startsWith('WITH dates'))return{rows:[anchor,{...anchor,date:'2026-01-02'}]};
  if(sql.includes('pg_try_advisory'))return{rows:[{acquired:true}]};
  if(sql.includes('pg_is_in_recovery'))return{rows:[{recovery}]};
  if(sql.includes('FOR SHARE'))return{rows:[{...anchor,hash:changed?'b'.repeat(64):hash}]};
  if(sql.startsWith('INSERT')){writes.push(sql);return{rowCount:1};}
  return{rows:[]};
 }};
}
test('idle days are reconstructed from the same verified block state, not interpolated amounts',async()=>{
 let calls=0;const plan=await buildPlan(db(),async(m,p)=>{if(m==='getblock')calls++;return rpc(m,p)},'2026-01-01','2026-01-02');
 assert.equal(calls,1);assert.equal(plan.points.length,2);assert.equal(plan.points[1].circulatingZat,'62500');
 assert.equal((await applyPlan(db(),rpc,plan)).changed,2);
 for(const options of [{changed:true},{recovery:true}]){const target=db(options);const changedRpc=options.changed?async(m,p)=>m==='getblockhash'&&p[0]===2?'b'.repeat(64):rpc(m,p):rpc;await assert.rejects(applyPlan(target,changedRpc,plan));assert.equal(target.writes.length,0);}
 const invalid=structuredClone(plan);invalid.points[1].date='2026-01-03';await assert.rejects(applyPlan(db(),rpc,invalid));
});

test('a stale indexed fork hint resolves to the serving node canonical day boundary',async()=>{
 const actualHash='c'.repeat(64),nextHash='d'.repeat(64);
 const target=db();const baseQuery=target.query.bind(target);
 target.query=async(sql,params)=>sql.startsWith('WITH dates')?{rows:[{...anchor,hash:'b'.repeat(64)}]}:sql.startsWith('SELECT hash,timestamp FROM blocks')?{rows:[{hash:nextHash,timestamp:1767312001}]}:baseQuery(sql,params);
 const source=async(m,p)=>m==='getblock'?p[0]==='1'?{...block,hash:actualHash}:{height:2,hash:nextHash,time:1767312001,chainSupply:{chainValueZat:125000,monitored:true}}:rpc(m,p);
 const plan=await buildPlan(target,source,'2026-01-01','2026-01-01');
 assert.equal(plan.points[0].blockHash,actualHash);
 assert.equal(plan.points[0].circulatingZat,'62500');
 assert.equal(plan.corrections.length,1);
 assert.equal(plan.corrections[0].indexedHash,'b'.repeat(64));
});
