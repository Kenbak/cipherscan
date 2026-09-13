const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

test('migration repairs attribution and guards old writers without changing payments', {skip: process.env.MINER_TEST_POSTGRES !== '1'}, async () => {
  const database = `miner_attribution_test_${process.pid}_${Date.now()}`;
  const admin = new Pool({host: '/tmp', database: 'postgres', max: 1});
  let db;
  try {
    await admin.query(`CREATE DATABASE ${database}`);
    db = new Pool({host: '/tmp', database, max: 1});
    await db.query(`
      CREATE TABLE blocks (height bigint PRIMARY KEY, miner_address text);
      CREATE TABLE orphaned_blocks (height bigint PRIMARY KEY, miner_address text);
      CREATE TABLE transaction_outputs (address text, value bigint);
      CREATE TABLE mining_behavior_daily (miner_address text, pool_name text);
      CREATE TABLE miner_destination_daily (pool_name text);
      INSERT INTO blocks VALUES (1,'t3cFfPt1Bcvgez9ZbMBFWeZsskxTkPzGCow'), (2,'t2HifwjUj9uyxr9bknR8LFuQbc98c3vkXtu'), (3,'real-miner');
      INSERT INTO orphaned_blocks SELECT * FROM blocks;
      INSERT INTO transaction_outputs VALUES ('t3cFfPt1Bcvgez9ZbMBFWeZsskxTkPzGCow',12500000);
      INSERT INTO mining_behavior_daily VALUES ('t3cFfPt1Bcvgez9ZbMBFWeZsskxTkPzGCow','Dev Fund'),('real-miner','ViaBTC');
      INSERT INTO miner_destination_daily VALUES ('Dev Fund'),('ViaBTC');
    `);
    const migration = fs.readFileSync(path.join(__dirname, '../deploy/migrations/024_exclude_funding_stream_miner_attribution.sql'),'utf8');
    await db.query(migration);
    await db.query(migration); // Safe to replay.
    for (const table of ['blocks','orphaned_blocks']) {
      assert.deepEqual((await db.query(`SELECT miner_address FROM ${table} ORDER BY height`)).rows.map(r=>r.miner_address),[null,null,'real-miner']);
      await db.query(`INSERT INTO ${table} VALUES (4,'t3cFfPt1Bcvgez9ZbMBFWeZsskxTkPzGCow'); UPDATE ${table} SET miner_address='t2HifwjUj9uyxr9bknR8LFuQbc98c3vkXtu' WHERE height=3; INSERT INTO ${table} VALUES (4,'t3cFfPt1Bcvgez9ZbMBFWeZsskxTkPzGCow') ON CONFLICT(height) DO UPDATE SET miner_address=EXCLUDED.miner_address;`);
      assert.equal((await db.query(`SELECT count(*) FROM ${table} WHERE miner_address IS NOT NULL`)).rows[0].count,'0');
    }
    assert.deepEqual((await db.query('SELECT * FROM transaction_outputs')).rows,[{address:'t3cFfPt1Bcvgez9ZbMBFWeZsskxTkPzGCow',value:'12500000'}]);
    for (const table of ['mining_behavior_daily','miner_destination_daily']) {
      assert.deepEqual((await db.query(`SELECT pool_name FROM ${table}`)).rows,[{pool_name:'ViaBTC'}]);
    }
    // Exercise the actual statistics queries against PostgreSQL: tag grouping
    // must retain unknown blocks and never group funding outputs as a pool.
    await db.query(`ALTER TABLE blocks ADD COLUMN timestamp bigint DEFAULT EXTRACT(EPOCH FROM now()), ADD COLUMN total_fees bigint DEFAULT 0, ADD COLUMN coinbase_hex text;`);
    const tag = Buffer.from('Get Sluicey Yall sluicey.xyz').toString('hex');
    await db.query('UPDATE blocks SET coinbase_hex=$1 WHERE height=4',[tag]);
    const {getPoolTagSql} = require('../api/mining-pools');
    assert.equal((await db.query(`SELECT ${getPoolTagSql()} AS tag FROM blocks WHERE height=4`)).rows[0].tag,'sluicey');
    const express = require('express');
    const app = express(); app.locals.pool = db;
    app.use(require('../api/routes/mining'));
    const server = await new Promise(resolve => { const srv=app.listen(0,'127.0.0.1',()=>resolve(srv)); });
    try {
      for (const route of ['pool-distribution','pool-ranking','hashrate-share']) {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/api/mining/${route}?period=7d`);
        assert.equal(response.status,200,route);
        const body=await response.json();
        assert.match(JSON.stringify(body),/Sluicey Pool/,route);
        assert.doesNotMatch(JSON.stringify(body),/Dev Fund|FPF/,route);
      }
    } finally { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }
    await db.query('DROP TABLE mining_behavior_daily, miner_destination_daily');
    await db.query(migration); // Minimal networks need no snapshot tables.
  } finally {
    if (db) await db.end();
    await admin.query(`DROP DATABASE IF EXISTS ${database}`);
    await admin.end();
  }
});
