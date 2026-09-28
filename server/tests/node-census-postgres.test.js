'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');

test('all census routes exclude legacy/stale rows and incompatible history against PostgreSQL', {
  skip: process.env.NODE_CENSUS_POSTGRES !== '1',
}, async () => {
  process.env.NODE_SOURCE = 'crawl';
  const db = new Client({ host: process.env.DB_HOST, port: process.env.DB_PORT,
    database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
  await db.connect();
  try {
    await db.query('BEGIN');
    await db.query("SET LOCAL statement_timeout='10s'");
    // Temporary tables shadow names; no production records or sequences are changed.
    for (const table of ['nodes', 'node_snapshots', 'topology_nodes', 'topology_edges']) {
      await db.query(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING DEFAULTS) ON COMMIT DROP`);
    }
    await db.query('ALTER TABLE nodes ADD COLUMN IF NOT EXISTS last_verified_at timestamptz');
    await db.query('ALTER TABLE node_snapshots ADD COLUMN IF NOT EXISTS census_version smallint NOT NULL DEFAULT 0');
    await db.query(`INSERT INTO nodes (id, ip, observed_via, is_active, last_seen, last_verified_at,
      client_impl, client_version, protocol_version, country, country_code, lat, lon, degree, services, crawl_seen_count)
      VALUES (1,'192.0.2.1','crawl',true,now(),now()-interval '2 minutes','Zebra','6.4.2',170160,'Japan','JP',35,139,8,1,3),
      (2,'192.0.2.2','crawl',true,now(),now()-interval '2 hours','Zakura','1.5.0',170160,'Japan','JP',35,139,8,1,3),
      (3,'192.0.2.3','peer',true,now(),NULL,'Zakura','1.5.0',170160,'Japan','JP',35,139,8,1,3),
      (4,'192.0.2.4','dns',true,now(),NULL,'Unknown',NULL,NULL,'Japan','JP',35,139,0,NULL,0)`);
    await db.query(`INSERT INTO node_snapshots(id,snapshot_time,active_nodes,total_nodes,census_version)
      VALUES (1,now()-interval '2 minutes',644,2069,0),(2,now()-interval '1 minute',1,4,1)`);
    await db.query(`INSERT INTO topology_nodes(addr,ip,reachable) VALUES
      ('192.0.2.1:8233','192.0.2.1',true),('192.0.2.2:8233','192.0.2.2',true)`);
    const router = require('../api/routes/network');
    const req = { app: { locals: { pool: db } }, query: {}, headers: {} };
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
    assert.equal(responses['/api/network/nodes/list'].total, 1);
    assert.equal(responses['/api/network/node-history'].snapshots.length, 1);
    assert.equal(responses['/api/network/topology'].nodes.filter(n => n.reachable).length, 1);
    assert.equal(responses['/api/network/nodes/upgrade-readiness'].totalActive, 1);
    await db.query("UPDATE nodes SET last_verified_at=now()-interval '2 hours' WHERE id=1");
    const res = { set() {}, setHeader() {}, json(body) { responses.expired=body; }, status() { return this; } };
    await router.stack.find(l=>l.route?.path==='/api/network/nodes/stats').route.stack[0].handle(req,res);
    assert.equal(responses.expired.stats.activeNodes, 0, 'expiry works with is_active still true and no ingester run');
  } finally {
    await db.query('ROLLBACK');
    await db.end();
  }
});
