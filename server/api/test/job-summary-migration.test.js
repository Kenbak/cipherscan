const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

test('summary migration preserves materialized rows, permissions, unknown history and is repeatable', {
  skip: !process.env.TEST_ACTIVITY_DATABASE_URL,
}, async () => {
  const client = new Client({ connectionString: process.env.TEST_ACTIVITY_DATABASE_URL });
  await client.connect();
  const schema = `repair_030_${process.pid}`;
  try {
    await client.query('BEGIN');
    await client.query(`CREATE SCHEMA ${schema}; SET LOCAL search_path=${schema},public`);
    await client.query('CREATE TABLE node_snapshots(id integer); INSERT INTO node_snapshots VALUES(1)');
    await client.query(`CREATE MATERIALIZED VIEW turnstile_daily AS
      SELECT '2026-07-26'::date date, 'sapling'::text pool, 123::numeric deshielded_zat`);
    // PUBLIC grant avoids requiring privileged role creation in test runners.
    await client.query('GRANT SELECT ON turnstile_daily TO PUBLIC');
    const sql = fs.readFileSync(path.join(__dirname, '../../deploy/sql/030_job_summary_compatibility.sql'), 'utf8')
      .replace('BEGIN;', '').replace('COMMIT;', '').replaceAll('public.', `${schema}.`);
    await client.query(sql);
    await client.query(sql);
    assert.equal((await client.query('SELECT deshielded_zat FROM turnstile_daily')).rows[0].deshielded_zat, '123');
    assert.equal((await client.query('SELECT count(*) FROM turnstile_daily_legacy_030')).rows[0].count, '1');
    assert.deepEqual((await client.query('SELECT identified_client_nodes,client_counts FROM node_snapshots')).rows[0], {
      identified_client_nodes: null, client_counts: null,
    });
    assert.equal((await client.query(`SELECT EXISTS (SELECT 1 FROM pg_class c, LATERAL aclexplode(c.relacl) a
      WHERE c.oid='turnstile_daily'::regclass AND a.grantee=0 AND a.privilege_type='SELECT') AS ok`)).rows[0].ok, true);
    await client.query("INSERT INTO turnstile_daily VALUES('2026-09-29','orchard',456)");
    assert.equal((await client.query('SELECT count(*) FROM turnstile_daily')).rows[0].count, '2');
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
});
