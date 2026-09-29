const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { Pool } = require('pg');
const express = require('express');
const router = require('../routes/crosslink');
const { reportTimestamps } = require('../routes/crosslink/_helpers');

test('concurrent registrations preserve capacity and ownership in PostgreSQL', {
  skip: !process.env.TEST_FORK_MONITOR_DATABASE_URL,
}, async t => {
  const connectionString = process.env.TEST_FORK_MONITOR_DATABASE_URL;
  const schema = `fork_test_${randomBytes(8).toString('hex')}`;
  const admin = new Pool({ connectionString });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ connectionString, options: `-c search_path=${schema}` });
  t.after(async () => {
    reportTimestamps.clear();
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  });
  await pool.query(`CREATE TABLE fork_monitor_nodes (
    name text PRIMARY KEY, tip bigint, tip_hash text, sample_hashes jsonb,
    peers int, mining boolean, ttl text, reported_at bigint, owner_token_hash text
  )`);
  const app = express();
  app.use(express.json());
  Object.assign(app.locals, { pool, writePool: pool, redisClient: null });
  app.use(router);
  const server = await new Promise(resolve => {
    const candidate = app.listen(0, '127.0.0.1', () => resolve(candidate));
  });
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}/api/crosslink/fork-monitor/report`;
  const send = (name, tip, token) => fetch(url, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { 'x-node-token': token } : {}) },
    body: JSON.stringify({ name, tip }),
  });
  // The losing claimant must never modify a registration created concurrently.
  const claims = await Promise.all([send('shared', 1), send('shared', 2)]);
  assert.deepEqual(claims.map(r => r.status).sort(), [200, 409]);
  const winner = claims[0].status === 200 ? 1 : 2;
  const ownership = await claims.find(r => r.status === 200).json();
  assert.equal((await pool.query("SELECT tip FROM fork_monitor_nodes WHERE name='shared'")).rows[0].tip, String(winner));

  await pool.query(`INSERT INTO fork_monitor_nodes (name,tip,ttl,reported_at,owner_token_hash)
    SELECT 'seed-' || n, 1, '24h', $1, 'protected' FROM generate_series(1,98) n`, [Date.now()]);
  const competing = await Promise.all([send('last-a', 1), send('last-b', 1)]);
  assert.deepEqual(competing.map(r => r.status).sort(), [200, 409]);
  assert.equal(Number((await pool.query('SELECT count(*) FROM fork_monitor_nodes')).rows[0].count), 100);
  reportTimestamps.clear();
  assert.equal((await send('shared', 9, ownership.ownershipToken)).status, 200);
  assert.equal((await pool.query("SELECT tip FROM fork_monitor_nodes WHERE name='shared'")).rows[0].tip, '9');

  await pool.query("UPDATE fork_monitor_nodes SET reported_at=0 WHERE name='seed-1'");
  assert.equal((await send('after-expiry', 1)).status, 200);
  assert.equal(Number((await pool.query('SELECT count(*) FROM fork_monitor_nodes')).rows[0].count), 100);
});
