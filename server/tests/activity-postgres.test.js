'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { readActivity, repairTrendCounts, addDays, HISTORY_START } = require('../lib/transaction-activity');
const { run } = require('../jobs/draft-activity-milestones');

test('UTC counts, completeness, count-only repair and draft deduplication against PostgreSQL', { skip: process.env.ACTIVITY_TEST_POSTGRES !== '1' && !process.env.TEST_ACTIVITY_DATABASE_URL }, async () => {
  const database = `activity_test_${process.pid}_${Date.now()}`;
  const connection = process.env.TEST_ACTIVITY_DATABASE_URL;
  const admin = new Pool(connection ? { connectionString: connection, max: 1 } : { host: '/tmp', database: 'postgres', max: 1 });
  let db;
  try {
    await admin.query(`CREATE DATABASE ${database}`);
    const url = connection ? new URL(connection) : null;
    if (url) url.pathname = `/${database}`;
    db = new Pool({ ...(url ? { connectionString: url.toString() } : { host: '/tmp', database }), max: 2, options: '-c timezone=Asia/Tokyo' });
    await db.query(`CREATE TABLE blocks (height bigint PRIMARY KEY, hash text, timestamp bigint, transaction_count integer);
      CREATE TABLE transactions (block_time bigint, is_coinbase boolean DEFAULT false,
        has_sprout boolean DEFAULT false,has_sapling boolean DEFAULT false,has_orchard boolean DEFAULT false,has_ironwood boolean DEFAULT false,
        vin_count integer DEFAULT 0,vout_count integer DEFAULT 0);
      CREATE TABLE privacy_trends_daily (date date PRIMARY KEY, shielded_count bigint,transparent_count bigint,shielded_percentage numeric,pool_size bigint,privacy_score integer,created_at timestamptz);
      CREATE TABLE social_post_outbox (id bigserial,post_type text,dedup_key text UNIQUE,content text,metadata jsonb,status text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
      INSERT INTO transactions(block_time,has_sprout) VALUES (extract(epoch FROM timestamptz '2026-09-14T00:00:00Z'),true);
      INSERT INTO transactions(block_time,has_orchard,has_ironwood) VALUES (extract(epoch FROM timestamptz '2026-09-14T23:59:59Z'),true,true);
      INSERT INTO transactions(block_time,is_coinbase,has_ironwood) VALUES (extract(epoch FROM timestamptz '2026-09-14T00:00:00Z'),true,true);
      INSERT INTO transactions(block_time,vin_count,vout_count) VALUES (extract(epoch FROM timestamptz '2026-09-14T00:00:00Z'),1,1);
      INSERT INTO transactions(block_time,has_sapling,vin_count) VALUES (extract(epoch FROM timestamptz '2026-09-15T00:00:00Z'),true,1);
      INSERT INTO blocks VALUES (0,'a',extract(epoch FROM timestamptz '2026-09-14T00:00:00Z'),3),
        (1,'b',extract(epoch FROM timestamptz '2026-09-14T23:59:59Z'),1),
        (2,'c',extract(epoch FROM timestamptz '2026-09-15T00:00:00Z'),1);
      INSERT INTO privacy_trends_daily VALUES ('2026-09-14',999,888,42,123456,72,'2026-09-14T23:00:00Z');`);
    const now = new Date('2026-09-15T00:10:00Z');
    const result = await readActivity(db, '2026-09-14', '2026-09-16', { now, requireGenesis: true });
    assert.deepEqual(result.days.map(d => [d.date,d.shielded,d.transparent,d.fully_shielded]), [
      ['2026-09-14',2,1,2], ['2026-09-15',1,0,0],
    ]);
    assert.equal(await repairTrendCounts(db, result.days), 1);
    const row = (await db.query('SELECT * FROM privacy_trends_daily')).rows[0];
    assert.equal(row.shielded_count,'2'); assert.equal(row.pool_size,'123456');
    assert.equal(row.privacy_score,72); assert.equal(row.created_at.toISOString(),'2026-09-14T23:00:00.000Z');
    // Exercise the actual API query/serialization against PostgreSQL. Only the
    // unrelated lifetime snapshot is stubbed; dates must remain calendar dates.
    const express = require('express');
    const app = express();
    app.locals.pool = { query: (sql, args) => sql.includes('FROM privacy_stats')
      ? Promise.resolve({ rows: [{ updated_at: now, privacy_score_breakdown: {} }] }) : db.query(sql, args) };
    app.use(require('../api/routes/stats'));
    const server = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
    try {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/privacy-stats?days=7`);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.trends.daily[0].date, '2026-09-14');
      assert.equal(body.trends.daily[0].shielded, 2);
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await assert.rejects(readActivity(db, '2026-09-14', '2026-09-15', { now: new Date('2026-09-16') }), /stale/);
    await db.query('UPDATE blocks SET transaction_count=4 WHERE height=0');
    await assert.rejects(readActivity(db, '2026-09-14', '2026-09-15', { now }), /Incomplete transaction/);
    await db.query('UPDATE blocks SET transaction_count=3 WHERE height=0; DELETE FROM blocks WHERE height=1');
    await assert.rejects(readActivity(db, '2026-09-14', '2026-09-15', { now, requireGenesis:true }), /Incomplete block/);

    // A year of complete indexed history and a current tip; a large final week
    // must create exactly one draft, and never promote a reviewed row to pending.
    await db.query('TRUNCATE blocks,transactions');
    const end = addDays(HISTORY_START, 53*7);
    const weekNow = new Date(`${end}T03:00:00Z`);
    await db.query(`INSERT INTO blocks SELECT i,'hash-'||i,extract(epoch FROM timestamptz '2016-10-31T00:00:00Z')+i*86400,
      CASE WHEN i>=364 AND i<371 THEN 1000 ELSE 1 END FROM generate_series(0,371) i;
      INSERT INTO transactions(block_time,has_ironwood)
      SELECT timestamp,true FROM blocks CROSS JOIN LATERAL generate_series(1,transaction_count);
      UPDATE blocks SET timestamp=timestamp+10800 WHERE height=371;
      UPDATE transactions SET block_time=block_time+10800 WHERE block_time=extract(epoch FROM timestamptz '2016-10-31T00:00:00Z')+371*86400;`);
    // Only the network identity probe is stubbed; all activity and writes execute SQL.
    const mainnetReader = { connect: () => db.connect(), query: sql => sql === 'SELECT current_database() AS name' ? Promise.resolve({ rows:[{name:'zcash_explorer_mainnet'}] }) : db.query(sql) };
    const options = { now: weekNow, logger: { info() {} } };
    await run(db, mainnetReader, { ...options, preview:true });
    assert.equal((await db.query('SELECT * FROM social_post_outbox')).rowCount,0);
    await run(db, mainnetReader, options); await run(db, mainnetReader, options);
    const drafts = (await db.query('SELECT * FROM social_post_outbox')).rows;
    assert.equal(drafts.length,1); assert.equal(drafts[0].status,'draft');
    assert.equal(drafts[0].metadata.metrics[0].value,7000);
    await db.query("UPDATE social_post_outbox SET status='reviewed',content='human edit'");
    await run(db, mainnetReader, options);
    assert.equal((await db.query('SELECT content FROM social_post_outbox')).rows[0].content,'human edit');
    assert.equal(await run(db, db, options),null); // No testnet/unknown-network drafts.
  } finally {
    if (db) await db.end();
    await admin.query(`DROP DATABASE IF EXISTS ${database}`);
    await admin.end();
  }
});
