'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { selectDays, parseDay, computeDays, CURRENT_UNSPENT_SQL, RECENT_SPENDS_SQL } = require('../lib/utxo-age');

test('selects only completed UTC days and repairs a rolling seven-day window', () => {
  assert.deepEqual(selectDays(['--days=2'], new Date('2026-09-09T00:00:00Z')), ['2026-09-07', '2026-09-08']);
  assert.equal(selectDays([], new Date('2026-01-01T00:01:00Z'))[0], '2025-12-25');
  assert.deepEqual(selectDays(['--from=2024-02-28', '--to=2024-03-01'], new Date('2024-03-02')), ['2024-02-28', '2024-02-29', '2024-03-01']);
});
test('rejects malformed, partial, reversed, duplicate and unbounded ranges', () => {
  for (const args of [['--days=0'], ['--days=367'], ['--days=NaN'], ['--days=1.5'], ['--days=1','--days=2'], ['--from=2026-02-30','--to=2026-03-01'], ['--from=2026-09-08'], ['--from=2026-09-09','--to=2026-09-09'], ['--from=2026-09-08','--to=2026-09-07']]) assert.throws(() => selectDays(args, new Date('2026-09-09T12:00:00Z')));
});

test('keeps zatoshis exact above Number precision and handles all age boundaries', () => {
  const day = parseDay('2026-09-08');
  const ages = [0,29,30,89,90,179,180,364,365,729,730];
  const value = 9007199254740993n;
  const rows = ages.map(age => ({created_day: day-age, value_zat:String(value), output_count:'1'}));
  rows.push({created_day:day+1,value_zat:'100',output_count:'1'});
  const [r] = computeDays(['2026-09-08'],rows,[]);
  for (const key of ['lt_1m','b_1_3m','b_3_6m','b_6_12m','b_1_2y']) assert.equal(r[key],value*2n);
  assert.equal(r.gt_2y,value);assert.equal(r.total,value*11n);assert.equal(r.utxo_count,11n);
});

test('reconstructs historical unspent state and counts midnight/last-second spends exactly once', () => {
  const day=parseDay('2026-09-08');
  const rows=[{created_day:day-1,spent_day:day,value_zat:'200000000',output_count:'2',cdd:'2.5',dormancy_sum:'2'}, {created_day:day,spent_day:day+1,value_zat:'300000000',output_count:'1',cdd:'0',dormancy_sum:'0'}];
  const [a,b]=computeDays(['2026-09-07','2026-09-08'],[],rows);
  assert.equal(a.total,200000000n);assert.equal(a.cdd,0);
  assert.equal(b.total,300000000n);assert.equal(b.spent_count,2n);assert.equal(b.cdd,2.5);assert.equal(b.avg_dormancy,1);
});

test('SQL cohorts match a direct per-output oracle on a real PostgreSQL fixture', {skip: !process.env.TEST_UTXO_DATABASE_URL}, async () => {
  const {Client}=require('pg');const c=new Client({connectionString:process.env.TEST_UTXO_DATABASE_URL});await c.connect();
  try {
    await c.query('BEGIN');
    await c.query('CREATE TEMP TABLE transactions(txid text PRIMARY KEY,block_time bigint); CREATE TEMP TABLE transaction_outputs(txid text,vout_index int,value bigint,spent boolean,spent_txid text,PRIMARY KEY(txid,vout_index)); CREATE TEMP TABLE transaction_inputs(txid text,vout_index int,prev_txid text,prev_vout int,PRIMARY KEY(txid,vout_index))');
    const day=parseDay('2026-09-08'), cutoff=(day+1)*86400;
    const fixtures=[];
    const offsets=[-86400,-1,0,1];
    for(let n=0;n<40;n++) {
      const age=[0,29,30,89,90,179,180,364,365,729,730][n%11];
      const created=(day-age)*86400+(n%2?86399:0);
      const spent=n%3===0?null:cutoff+offsets[n%4];
      const value=100000000n+BigInt(n);
      const id=`o${n}`, spender=`s${n}`;
      await c.query('INSERT INTO transactions VALUES($1,$2)',[id,created]);
      if(spent!==null) await c.query('INSERT INTO transactions VALUES($1,$2)',[spender,spent]);
      await c.query('INSERT INTO transaction_outputs VALUES($1,0,$2,$3,$4)',[id,value.toString(),spent!==null,spent!==null?spender:null]);
      if(spent!==null) await c.query('INSERT INTO transaction_inputs VALUES($1,0,$2,0)',[spender,id]);
      fixtures.push({created,spent,value});
    }
    // A late-created output must not leak into the previous day's snapshot.
    await c.query('INSERT INTO transactions VALUES($1,$2)', ['future',cutoff]);
    await c.query("INSERT INTO transaction_outputs VALUES('future',0,900000000,false,NULL)");
    fixtures.push({created:cutoff,spent:null,value:900000000n});
    // Obsolete input from a different spend must not double-count an output.
    await c.query('INSERT INTO transactions VALUES($1,$2)', ['obsolete',cutoff-1]);
    await c.query("INSERT INTO transaction_inputs VALUES('obsolete',0,'o1',0)");
    const dates=['2026-09-07','2026-09-08'];
    const u=await c.query(CURRENT_UNSPENT_SQL),s=await c.query(RECENT_SPENDS_SQL,[parseDay(dates[0])*86400]);
    const results=computeDays(dates,u.rows,s.rows);
    for(const result of results) {
      const start=parseDay(result.date)*86400,end=start+86400;
      const unspent=fixtures.filter(o=>o.created<end&&(o.spent===null||o.spent>=end));
      const spent=fixtures.filter(o=>o.spent!==null&&o.spent>=start&&o.spent<end);
      assert.equal(result.total,unspent.reduce((a,o)=>a+o.value,0n));
      assert.equal(result.utxo_count,BigInt(unspent.length));assert.equal(result.spent_count,BigInt(spent.length));
      const cdd=spent.reduce((a,o)=>a+Number(o.value)/1e8*(o.spent-o.created)/86400,0);
      assert.ok(Math.abs(result.cdd-cdd)<1e-8);
      for(const [key,min,max] of [['lt_1m',0,30],['b_1_3m',30,90],['b_3_6m',90,180],['b_6_12m',180,365],['b_1_2y',365,730],['gt_2y',730,Infinity]]) assert.equal(result[key],unspent.filter(o=>{const age=Math.floor((end-1-o.created)/86400);return age>=min&&age<max;}).reduce((a,o)=>a+o.value,0n));
    }
    await c.query('ROLLBACK');
  }finally{await c.end();}
});

test('job writes complete days atomically and preserves old rows on a failed batch', {skip: !process.env.TEST_UTXO_DATABASE_URL}, async () => {
  const {Client}=require('pg');const {spawnSync}=require('node:child_process');const path=require('node:path');
  const url=new URL(process.env.TEST_UTXO_DATABASE_URL),db=`utxo_fixture_${process.pid}`;
  const admin=new Client({connectionString:url.toString()});await admin.connect();
  let c;
  try {
    await admin.query(`CREATE DATABASE ${db}`);
    url.pathname='/'+db;c=new Client({connectionString:url.toString()});await c.connect();
    await c.query(`CREATE TABLE blocks(height bigint PRIMARY KEY,hash text,timestamp bigint);
      INSERT INTO blocks VALUES(1,'canonical',1788998400);
      CREATE TABLE transactions(txid text PRIMARY KEY,block_time bigint);
      CREATE TABLE transaction_outputs(txid text,vout_index int,value bigint,spent boolean,spent_txid text,PRIMARY KEY(txid,vout_index));
      CREATE TABLE transaction_inputs(txid text,vout_index int,prev_txid text,prev_vout int,PRIMARY KEY(txid,vout_index));
      CREATE TABLE utxo_age_daily(date date PRIMARY KEY,lt_1m_zat bigint,b_1_3m_zat bigint,b_3_6m_zat bigint,b_6_12m_zat bigint,b_1_2y_zat bigint,gt_2y_zat bigint,total_unspent_zat bigint,utxo_count bigint,cdd numeric,avg_dormancy_days numeric,spent_count bigint,created_at timestamptz DEFAULT NOW(),CONSTRAINT reject_second CHECK(date <> '2026-09-08'));
      INSERT INTO transactions VALUES('origin',1788739200);
      INSERT INTO transaction_outputs VALUES('origin',0,123456789,false,NULL);
      INSERT INTO utxo_age_daily(date,total_unspent_zat) VALUES('2026-09-07',999);`);
    const env={...process.env,DB_HOST:url.hostname,DB_PORT:url.port,DB_NAME:db,DB_USER:decodeURIComponent(url.username),DB_PASSWORD:decodeURIComponent(url.password),REPLICA_DB_HOST:''};
    const run=()=>spawnSync(process.execPath,[path.join(__dirname,'../jobs/compute-utxo-age.js'),'--from=2026-09-07','--to=2026-09-08'],{env,encoding:'utf8',timeout:15000});
    const failed=run();assert.equal(failed.status,1,failed.stderr);
    assert.equal((await c.query('SELECT total_unspent_zat FROM utxo_age_daily')).rows[0].total_unspent_zat,'999');
    await c.query('ALTER TABLE utxo_age_daily DROP CONSTRAINT reject_second');
    const success=run();assert.equal(success.status,0,success.stderr);
    const rows=(await c.query('SELECT total_unspent_zat,utxo_count FROM utxo_age_daily ORDER BY date')).rows;
    assert.equal(rows.length,2);for(const row of rows){assert.equal(row.total_unspent_zat,'123456789');assert.equal(row.utxo_count,'1');}
    await c.query("SET TIME ZONE 'Europe/Berlin'");
    const express=require('express');const app=express();app.locals.pool={query:(...args)=>c.query(...args)};
    app.use(require('../api/routes/valuation'));
    const server=await new Promise(resolve=>{const listening=app.listen(0,'127.0.0.1',()=>resolve(listening));});
    try {
      for(const route of ['hodl-waves','dormancy']) {
        const response=await fetch(`http://127.0.0.1:${server.address().port}/api/valuation/${route}?period=all`);
        const body=await response.json();assert.equal(response.status,200);
        assert.deepEqual(body.points.map(p=>p.date),['2026-09-07','2026-09-08']);
      }
    }finally{await new Promise(resolve=>server.close(resolve));}

  }finally{
    if(c)await c.end();await admin.query(`DROP DATABASE IF EXISTS ${db}`);await admin.end();
  }
});
