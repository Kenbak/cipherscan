'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');

test('all census routes exclude legacy/stale rows and incompatible history against PostgreSQL', {
  skip: !process.env.TEST_NODE_CENSUS_DATABASE_URL && process.env.NODE_CENSUS_POSTGRES !== '1',
}, async () => {
  process.env.NODE_SOURCE = 'crawl';
  const db = new Client({ connectionString: process.env.TEST_NODE_CENSUS_DATABASE_URL, host: process.env.DB_HOST, port: process.env.DB_PORT,
    database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
  await db.connect();
  try {
    await db.query('BEGIN');
    await db.query("SET LOCAL statement_timeout='10s'");
    await db.query(require('node:fs').readFileSync(require('node:path').join(__dirname, 'fixtures/node-census.sql'), 'utf8'));
    await db.query('CREATE UNIQUE INDEX ON nodes(ip)');
    await db.query('ALTER TABLE nodes ADD COLUMN IF NOT EXISTS last_verified_at timestamptz');
    await db.query('ALTER TABLE node_snapshots ADD COLUMN IF NOT EXISTS census_version smallint NOT NULL DEFAULT 0');
    await db.query(`INSERT INTO nodes (id, ip, observed_via, is_active, last_seen, last_verified_at,
      client_impl, client_version, protocol_version, country, country_code, lat, lon, degree, services, crawl_seen_count)
      VALUES (1,'192.0.2.1','crawl',true,now(),now()-interval '2 minutes','Zebra','6.4.2',170160,'Japan','JP',35,139,8,1,3),
      (2,'192.0.2.2','crawl',true,now(),now()-interval '2 hours','Zakura','1.5.0',170160,'Japan','JP',35,139,8,1,3),
      (3,'192.0.2.3','peer',true,now(),NULL,'Zakura','1.5.0',170160,'Japan','JP',35,139,8,1,3),
      (4,'192.0.2.4','dns',true,now(),NULL,'Unknown',NULL,NULL,'Japan','JP',35,139,0,NULL,0)`);
    await db.query(`INSERT INTO node_snapshots(id,snapshot_time,active_nodes,total_nodes,census_version)
      VALUES (1,now()-interval '2 minutes',644,2069,0),(2,now()-interval '1 minute',1,4,2)`);
    await db.query(`INSERT INTO topology_nodes(addr,ip,reachable) VALUES
      ('192.0.2.1:8233','192.0.2.1',true),('192.0.2.2:8233','192.0.2.2',true)`);
    const router = require('../api/routes/network');
    const { createListCache } = require('../api/list-cache');
    const req = { app: { locals: { pool: db, listCache: createListCache({ enabled: false }) } }, query: {}, headers: {} };
    router.stack[0].handle(req, {}, () => {});
    const responses = {};
    for (const path of ['/api/network/nodes', '/api/network/nodes/stats', '/api/network/nodes/list',
      '/api/network/node-history', '/api/network/topology', '/api/network/nodes/health-score',
      '/api/network/nodes/reliability', '/api/network/nodes/upgrade-readiness', '/api/network/nodes/concentration']) {
      let status = 200;
      const res = { set() { return this; }, setHeader() {}, status(code) { status = code; return this; }, json(body) { responses[path] = body; } };
      const route = router.stack.find(layer => layer.route?.path === path);
      await route.route.stack[0].handle(req, res);
      assert.equal(status, 200, path);
    }
    assert.equal(responses['/api/network/nodes/stats'].stats.activeNodes, 1);
    assert.equal(responses['/api/network/nodes/stats'].stats.totalNodes, 4);
    assert.equal(responses['/api/network/nodes/stats'].clients.observedNodes, 1);
    assert.deepEqual(responses['/api/network/nodes/stats'].trends,
      { change24h: null, change7d: null, change30d: null },
      'minutes of repaired history cannot stand in for day/week/month baselines');
    assert.equal(responses['/api/network/nodes/list'].total, 1);
    assert.equal(responses['/api/network/node-history'].snapshots.length, 1);
    assert.equal(responses['/api/network/topology'].nodes.filter(n => n.reachable).length, 1);
    assert.equal(responses['/api/network/nodes/upgrade-readiness'].totalActive, 1);
    await db.query(`INSERT INTO node_snapshots(id,snapshot_time,active_nodes,total_nodes,census_version)
      VALUES (3,now()-interval '24 hours 5 minutes',2,4,2),
      (4,now()-interval '7 days 5 minutes',4,4,2),
      (5,now()-interval '30 days 2 hours',4,4,2)`);
    const baselineRes = { set() {}, setHeader() {}, json(body) { responses.baselines=body; }, status() { return this; } };
    await router.stack.find(l=>l.route?.path==='/api/network/nodes/stats').route.stack[0].handle(req,baselineRes);
    assert.deepEqual(responses.baselines.trends, { change24h: -50, change7d: -75, change30d: null },
      'use comparable baselines near the requested age and reject stale baselines');
    await db.query("UPDATE nodes SET last_verified_at=now()-interval '2 hours' WHERE id=1");
    const res = { set() {}, setHeader() {}, json(body) { responses.expired=body; }, status() { return this; } };
    await router.stack.find(l=>l.route?.path==='/api/network/nodes/stats').route.stack[0].handle(req,res);
    assert.equal(responses.expired.stats.activeNodes, 0, 'expiry works with is_active still true and no ingester run');
    // Run the real writer against the same temporary tables and deterministic RPCs.
    // All transaction statements stay within the fixture's outer rollback.
    const writerClient = {
      async query(sql, params) {
        if (sql === 'BEGIN') return db.query('SAVEPOINT ingest_fixture');
        if (sql === 'COMMIT') return db.query('RELEASE SAVEPOINT ingest_fixture');
        if (sql === 'ROLLBACK') return db.query('ROLLBACK TO SAVEPOINT ingest_fixture');
        // Simulate refresh-turnstile holding its lock during the same cron tick.
        if (sql.includes('pg_try_advisory_lock')) return { rows: [{ acquired: params[0] !== 839271 }] };
        if (sql.includes('pg_advisory_unlock')) return { rows: [{}] };
        return db.query(sql, params);
      }, release() {},
    };
    // LIKE copies serial defaults; remove them so fixture INSERTs cannot advance
    // production sequences. Temporary identity sequences are created instead.
    await db.query('ALTER TABLE node_snapshots ALTER COLUMN id DROP DEFAULT');
    await db.query('ALTER TABLE node_snapshots ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (START WITH 100)');
    await db.query('ALTER TABLE nodes ALTER COLUMN id DROP DEFAULT');
    await db.query('ALTER TABLE nodes ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (START WITH 100)');
    const verifiedAt = Date.now() - 5000;
    const metrics = { generated_at_ms: Date.now(), num_good_nodes: 1, num_known_nodes: 1,
      node_info: [{ addr: '192.0.2.1:8233', last_verified_at_ms: verifiedAt, user_agent: '/Zebra:6.4.2/' }] };
    const { ingestCrawl } = require('../jobs/ingest-crawl');
    const options = { rpc: async () => metrics, peerRpc: async () => [],
      crunch: async input => ({ nodes: input.node_info.map(n => ({ ...n, geo: {} })) }),
      torExits: async () => new Set(), dbPool: { connect: async () => writerClient } };
    await ingestCrawl(options);
    const firstWrite = (await db.query('SELECT last_verified_at, last_seen, crawl_seen_count FROM nodes WHERE id=1')).rows[0];
    assert.equal(firstWrite.last_seen.getTime(), verifiedAt);
    assert.equal(firstWrite.last_verified_at.getTime(), verifiedAt);
    await ingestCrawl(options);
    const secondWrite = (await db.query('SELECT last_verified_at, last_seen, crawl_seen_count FROM nodes WHERE id=1')).rows[0];
    assert.deepEqual(secondWrite, firstWrite, 'replaying a snapshot must not refresh time or add successes');
    const older = { ...metrics, node_info: [{ ...metrics.node_info[0], last_verified_at_ms: verifiedAt - 1000 }] };
    await ingestCrawl({ ...options, rpc: async () => older });
    const afterOlder = (await db.query('SELECT last_verified_at, last_seen, crawl_seen_count FROM nodes WHERE id=1')).rows[0];
    assert.deepEqual(afterOlder, firstWrite, 'a lagging path cannot replace a newer verification already stored');
    assert.equal((await db.query('SELECT count(*)::int AS count FROM nodes WHERE is_active')).rows[0].count, 1);
    assert.equal((await db.query('SELECT census_version FROM node_snapshots ORDER BY id DESC LIMIT 1')).rows[0].census_version, 2);
    await assert.rejects(ingestCrawl({ ...options, peerRpc: async () => { throw new Error('offline'); }, rpc: async () => ({ ...metrics, generated_at_ms: Date.now()-200000 }) }), /All node observation/);

    // Combined ingestion counts real connected peers without turning discovery
    // into evidence, refreshing crawler timestamps, or manufacturing graph links.
    const combinedOptions = { ...options, now: () => verifiedAt,
      peerRpc: async () => [
        { addr: '192.0.2.1:40000', version: 170160, subver: '/Zebra:6.4.2/', inbound: true },
        { addr: '192.0.2.5:40001', version: 170160, subver: '/Zakura:1.5.0/', inbound: true },
        { addr: '192.0.2.5:8233', version: 170160, subver: '/Zakura:1.5.0/' },
        { addr: '[2001:db8::5]:8233', version: 170160, subver: '/Zebra:6.4.2/' },
        { addr: '192.0.2.6:8233', version: 0 },
      ] };
    await ingestCrawl(combinedOptions);
    const rows = (await db.query('SELECT ip,last_verified_at,last_peer_seen_at,crawl_seen_count FROM nodes WHERE is_active ORDER BY ip')).rows;
    assert.equal(rows.length, 3);
    assert.equal(rows[0].last_verified_at.getTime(), verifiedAt, 'peer polling never rewrites the actual crawler handshake time');
    assert.equal(rows[1].last_verified_at, null, 'peer-only node has no fabricated crawler handshake');
    assert.equal(rows[1].crawl_seen_count, 0, 'peer observation is not a crawler success');
    assert.equal(rows[1].last_peer_seen_at.getTime(), verifiedAt);
    const combined = {};
    for (const path of ['/api/network/nodes/stats', '/api/network/nodes/list', '/api/network/topology']) {
      const res = { set() {}, setHeader() {}, status(code) { assert.equal(code, 200); return this; }, json(body) { combined[path] = body; } };
      await router.stack.find(l => l.route?.path === path).route.stack[0].handle(req, res);
    }
    assert.equal(combined['/api/network/nodes/stats'].stats.activeNodes, 3);
    assert.equal(combined['/api/network/nodes/stats'].clients.observedNodes, 3);
    assert.equal(combined['/api/network/nodes/list'].total, 3);
    assert.equal(combined['/api/network/topology'].counts.reachable, 3, 'peer-only nodes survive an absent gossip-graph row');
    assert.equal(combined['/api/network/topology'].edges.length, 0, 'no invented edges');
    assert.equal(combined['/api/network/nodes/stats'].stats.censusVersion, 2);
    assert.equal(JSON.stringify(combined).includes('192.0.2.'), false, 'raw IPs remain private');
    // A failed peer poll retains the observation time; expiry removes it at read time.
    await ingestCrawl({ ...options, peerRpc: async () => { throw new Error('offline'); } });
    assert.equal((await db.query("SELECT last_peer_seen_at FROM nodes WHERE ip='192.0.2.5'")).rows[0].last_peer_seen_at.getTime(), verifiedAt);
    await db.query("UPDATE nodes SET last_peer_seen_at=now()-interval '16 minutes'");
    assert.equal((await db.query(`SELECT count(*)::int n FROM ${require('../lib/node-census').censusTable('crawl')} n WHERE census_active`)).rows[0].n, 1);
    // Both crawlers can fail while fresh live peers still get recorded.
    await ingestCrawl({ ...combinedOptions, rpc: async () => { throw new Error('offline'); } });
    assert.equal((await db.query(`SELECT count(*)::int n FROM ${require('../lib/node-census').censusTable('crawl')} n WHERE census_active`)).rows[0].n, 3);

  } finally {
    await db.query('ROLLBACK');
    await db.end();
  }
});


test('migration 031 is additive and idempotent without inventing peer observations', {
  skip: !process.env.TEST_NODE_CENSUS_DATABASE_URL,
}, async () => {
  const db = new Client({ connectionString: process.env.TEST_NODE_CENSUS_DATABASE_URL });
  await db.connect();
  try {
    await db.query('CREATE TEMP TABLE nodes(id int); CREATE TEMP TABLE nodes_crawl(id int); CREATE TEMP TABLE node_snapshots(census_version smallint); INSERT INTO nodes VALUES(1)');
    const migration = require('node:fs').readFileSync(require('node:path').join(__dirname, '../deploy/sql/031_combined_node_census.sql'), 'utf8');
    await db.query(migration);
    await db.query(migration);
    assert.equal((await db.query('SELECT last_peer_seen_at FROM nodes')).rows[0].last_peer_seen_at, null);
  } finally { await db.end(); }
});
