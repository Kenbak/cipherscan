'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {advance,priceUnits,usd,CREATIONS_SQL,SPENDS_SQL,dateOf}=require('../lib/analytics-history');
const {options,writeResult,readSources}=require('../jobs/backfill-analytics-history');
const databaseUrl=process.env.TEST_ANALYTICS_DATABASE_URL || process.env.TEST_UTXO_DATABASE_URL;
const day=20000,date=dateOf(day),prices=new Map([[date,'10.0000'],[dateOf(day+1),'20.0000']]);
const creation=(v,n)=>({value_zat:String(v),output_count:String(n),invalid:0});
test('replay reconstructs historical holdings, exact cost basis and genuine SOPR',()=>{
 const first=advance([],date,creation(300000000,2),[],prices);
 assert.equal(first.total,300000000n);assert.equal(usd(first.cap),'30.000000000000');assert.equal(first.sopr,null);
 const next=advance(first.cohorts,dateOf(day+1),creation(50000000,1),[{created_day:day,value_zat:'100000000',output_count:'1',cdd:'1',dormancy_sum:'1',invalid:0}],prices);
 assert.equal(next.total,250000000n);assert.equal(next.count,2n);assert.equal(usd(next.cap),'30.000000000000');assert.equal(next.sopr,2);assert.equal(next.spentCount,1n);
 // Historic row and persisted input checkpoint stay unchanged.
 assert.equal(first.total,300000000n);assert.equal(first.cohorts[0][1],'300000000');
});
test('missing source rows, prices and inconsistent cohorts cannot be published',()=>{
 assert.throws(()=>advance([],date,{...creation(1,1),invalid:1},[],prices));
 assert.throws(()=>advance([],date,creation(1,1),[],new Map()));
 assert.throws(()=>advance([],date,creation(1,1),[{created_day:day,value_zat:'2',output_count:'1',invalid:0}],prices));
 for(const value of [null,undefined,'',0,'0.0000','1.00001',-1]) assert.throws(()=>priceUnits(value));
 assert.equal(priceUnits('123.4567'),1234567n);
 assert.throws(()=>options(['--max-days=10000']));assert.throws(()=>options(['--pause-ms=0']));
});
test('cohort age boundaries and values beyond floating-point precision remain exact',()=>{
 const cohorts=[29,30,90,180,365,730].map(age=>[day-age,'9007199254740993','1']);
 const p=new Map([...cohorts.map(([d])=>[dateOf(d),'1.0000']),[date,'1.0000']]);
 const r=advance(cohorts,date,creation(0,0),[],p);
 for(const b of ['lt_1m','b_1_3m','b_3_6m','b_6_12m','b_1_2y','gt_2y'])assert.equal(r[b],9007199254740993n);
});
test('daily SQL reconciles actual indexed outputs and spends with transaction counts', {skip:!databaseUrl},async()=>{
 const {Client}=require('pg');const c=new Client({connectionString:databaseUrl});await c.connect();
 try {
  await c.query('BEGIN');await c.query(`CREATE TEMP TABLE transactions(txid text PRIMARY KEY,block_time bigint,vin_count int,vout_count int,is_coinbase boolean);
 CREATE TEMP TABLE transaction_outputs(txid text,vout_index int,value bigint,spent boolean,spent_txid text,PRIMARY KEY(txid,vout_index));
 CREATE TEMP TABLE transaction_inputs(txid text,prev_txid text,prev_vout int);`);
  const start=day*86400;
  await c.query(`INSERT INTO transactions VALUES('a',$1,0,2,true),('b',$2,1,1,false),('shielded',$2,0,0,false)`,[start,start+86400]);
  await c.query("INSERT INTO transaction_outputs VALUES('a',0,100000000,true,'b'),('a',1,200000000,false,NULL),('b',0,50000000,false,NULL)");
  await c.query("INSERT INTO transaction_inputs VALUES('b','a',0)");
  let cohorts=[];
  for(let d=day;d<=day+1;d++) {
   const cr=(await c.query(CREATIONS_SQL,[d*86400,(d+1)*86400])).rows[0];
   const sp=(await c.query(SPENDS_SQL,[d*86400,(d+1)*86400])).rows;
   const r=advance(cohorts,dateOf(d),cr,sp,prices);cohorts=r.cohorts;
   assert.equal(r.total,d===day?300000000n:250000000n);
   if(d===day+1)assert.equal(r.sopr,2);
  }
  await c.query("UPDATE transaction_outputs SET spent_txid='wrong' WHERE txid='a' AND vout_index=0");
  assert.ok((await c.query(SPENDS_SQL,[start+86400,start+172800])).rows.some(r=>r.invalid>0));
  await c.query("DELETE FROM transaction_outputs WHERE txid='b'");
  assert.equal((await c.query(CREATIONS_SQL,[start+86400,start+172800])).rows[0].invalid,1);
 }finally{await c.query('ROLLBACK');await c.end();}
});
test('all public daily writes participate in caller transaction and preserve integer zatoshis',async()=>{
 const calls=[];const c={query:async(sql,params)=>{calls.push({sql,params});return {rows:[],rowCount:1};}};
 const r=advance([],date,creation(123456789,1),[],prices);
 await writeResult(c,r,{height:1,hash:'h'},{txCount:0},{});
 assert.equal(calls[0].params[5],'123456789');
 assert.ok(calls.some(c=>c.sql.includes('INSERT INTO utxo_age_daily')));
 assert.ok(calls.some(c=>c.sql.includes('DELETE FROM miner_destination_daily')));
 assert.ok(!calls.some(c=>/^COMMIT|^BEGIN/.test(c.sql)));
});
test('daily write is atomic across checkpoint, ages, valuation and destinations', {skip:!databaseUrl},async()=>{
 const {Client}=require('pg');const c=new Client({connectionString:databaseUrl});await c.connect();
 try {
  await c.query('BEGIN');await c.query(`CREATE TEMP TABLE analytics_history_daily(date date PRIMARY KEY,anchor_height bigint,anchor_hash text,method text,cohorts jsonb,transparent_supply_zat bigint,transparent_realized_cap_usd numeric,spent_value_zat bigint,spent_creation_value_usd numeric,sopr numeric,fees jsonb,mining_pool_blocks jsonb,computed_at timestamptz DEFAULT now());
 CREATE TEMP TABLE utxo_age_daily(date date PRIMARY KEY,lt_1m_zat bigint,b_1_3m_zat bigint,b_3_6m_zat bigint,b_6_12m_zat bigint,b_1_2y_zat bigint,gt_2y_zat bigint,total_unspent_zat bigint,utxo_count int,cdd float8,avg_dormancy_days float8,spent_count int,created_at timestamptz DEFAULT now());
 CREATE TEMP TABLE transparent_realized_cap_daily(date date PRIMARY KEY,realized_cap_usd numeric,unspent_count bigint,avg_cost_basis_usd numeric);
 CREATE TEMP TABLE mvrv_daily(date date PRIMARY KEY,transparent_realized_cap_usd numeric,shielded_realized_cap_usd numeric,realized_cap_usd numeric,market_cap_usd numeric,mvrv numeric,realized_price numeric,nupl numeric,sopr numeric);
 CREATE TEMP TABLE privacy_trends_daily(date date PRIMARY KEY,chain_supply bigint);
 CREATE TEMP TABLE miner_destination_daily(date date,pool_name text,shielded_zat bigint,exchange_zat bigint,bridge_zat bigint,other_zat bigint CHECK(other_zat>=0),updated_at timestamptz,PRIMARY KEY(date,pool_name));`);
  const r=advance([],date,creation(123456789,1),[],prices);
  await c.query('SAVEPOINT daily');
  await assert.rejects(writeResult(c,r,{height:1,hash:'h'},{txCount:0},{pool:{shielded:0n,exchange:0n,bridge:0n,other:-1n}}));
  await c.query('ROLLBACK TO SAVEPOINT daily');
  assert.equal((await c.query('SELECT * FROM analytics_history_daily')).rowCount,0);
  await writeResult(c,r,{height:1,hash:'h'},{txCount:0},{});
  assert.equal((await c.query('SELECT transparent_supply_zat FROM analytics_history_daily')).rows[0].transparent_supply_zat,'123456789');
  await writeResult(c,r,{height:1,hash:'h'},{txCount:0},{});
  assert.equal((await c.query('SELECT * FROM analytics_history_daily')).rowCount,1);
 }finally{await c.query('ROLLBACK');await c.end();}
});

test('backward block timestamps defer a future creation debit without negative holdings',()=>{
 const spend={created_day:day+1,value_zat:'100000000',output_count:'1',cdd:'0',dormancy_sum:'0',invalid:0};
 const r=advance([],date,creation(300000000,2),[spend],prices);
 assert.equal(r.total,300000000n);assert.equal(r.count,2n);assert.equal(r.sopr,0.5);
 assert.deepEqual(r.cohorts.at(-1),[day+1,'-100000000','-1']);
 const next=advance(r.cohorts,dateOf(day+1),creation(150000000,2),[],prices);
 assert.equal(next.total,350000000n);assert.equal(next.count,3n);
 assert.equal(usd(next.cap),'40.000000000000');
 assert.throws(()=>advance(r.cohorts,dateOf(day+1),creation(0,0),[],prices));
});

test('timed-out source windows split under one transaction and preserve exact sums',async()=>{
 const calls=[];const reader={query:async(sql,args)=>{
  calls.push(sql);
  if(sql===CREATIONS_SQL) {
   if(args[1]-args[0]>43200)throw Object.assign(new Error('canceling statement due to statement timeout'),{code:'57014'});
   return {rows:[creation('9007199254740993',1)]};
  }
  if(sql===SPENDS_SQL)return {rows:[{created_day:1,value_zat:'1',output_count:'1',invalid:0}]};
  return {rows:[]};
 }};
 const r=await readSources(reader,0,86400);
 assert.equal(r.creation.value_zat,'18014398509481986');assert.equal(r.creation.output_count,'2');
 assert.equal(r.spends.length,2);assert.ok(calls.includes('ROLLBACK TO SAVEPOINT analytics_sources'));
 assert.ok(!calls.includes('COMMIT'));
});
