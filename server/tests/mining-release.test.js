// Local-only release acceptance. Never accepts a remote PostgreSQL connection.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');
const { once } = require('node:events');
const express = require('../api/node_modules/express');
const { Pool } = require('../api/node_modules/pg');
const { backfill } = require('../scripts/backfill-mining-software');
const { classifyMiningSoftware } = require('../../lib/mining-software');
const BASE = 'bf623604e5f02954a207be80dcedddcf4e0c703d';
const root = path.resolve(__dirname, '../..');
function baselineRouter(name) {
  const filename = path.join(root, 'server/api/routes', name + '.js');
  const code = execFileSync('git', ['show', `${BASE}:server/api/routes/${name}.js`], { cwd: root, encoding: 'utf8' });
  const m = new Module(filename, module);
  m.filename = filename;
  m.paths = Module._nodeModulePaths(path.dirname(filename));
  m._compile(code, filename);
  return m.exports;
}
async function serve(routers, db, tip) {
  const app = express();
  app.locals.pool = db;
  app.locals.redisClient = null;
  app.locals.chainTip = { height: tip, hash: 'snapshot' };
  app.locals.callZebraRPC = async () => null;
  for (const router of routers) app.use(router);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {server, url: `http://127.0.0.1:${server.address().port}`};
}
async function request(base, route) {
  const res = await fetch(base + route);
  const body = await res.json();
  delete body.generatedAt; // Wall-clock metadata is expected to differ between requests.
  return {status: res.status, body, cacheControl: res.headers.get('cache-control')};
}
test('backend release: legacy parity, production-type sample, grants and canonical maintenance',
  {skip: process.env.MINING_RELEASE_POSTGRES !== '1'}, async t => {
  const schema = `mining_release_${process.pid}`;
  const role = `${schema}_writer`;
  const admin = new Pool({host:'/tmp',database:'postgres',max:1});
  const db = new Pool({host:'/tmp',database:'postgres',max:2,options:`-c search_path=${schema} -c statement_timeout=30000`});
  const servers = [];
  t.after(async () => {
    for (const server of servers) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await db.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE; DROP ROLE IF EXISTS ${role}`);
    await admin.end();
  });
  await admin.query(`CREATE SCHEMA ${schema}; CREATE ROLE ${role} NOLOGIN; GRANT USAGE ON SCHEMA ${schema} TO ${role}`);
  // Mainnet columns are bigint/numeric, unlike the earlier synthetic integer fixture.
  await db.query(`CREATE TABLE blocks(height bigint PRIMARY KEY,hash text NOT NULL,timestamp bigint NOT NULL,coinbase_hex text,miner_address text,transaction_count integer,size integer,difficulty numeric,total_fees bigint);
    GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON blocks TO ${role}`);
  const sample = process.env.MINING_RELEASE_SAMPLE
    ? JSON.parse(fs.readFileSync(process.env.MINING_RELEASE_SAMPLE,'utf8'))
    : Array.from({length:300},(_,height)=>({height,hash:height.toString(16).padStart(64,'0'),timestamp:1788220800+height*75,coinbase_hex:height%2?'f09fa693':'f09f8cb8',miner_address:'unknown',transaction_count:1,size:100,difficulty:1,total_fees:'0'}));
  await db.query(`INSERT INTO blocks SELECT * FROM json_populate_recordset(NULL::blocks,$1::json)`,[JSON.stringify(sample)]);
  const tip = Math.max(...sample.map(b=>Number(b.height)));
  const original = await serve([baselineRouter('blocks'),baselineRouter('mining')],db,tip);
  const candidate = await serve([require('../api/routes/blocks'),require('../api/routes/mining')],db,tip);
  servers.push(original.server,candidate.server);
  const routes = ['/api/blocks','/api/blocks?limit=25&offset=10','/api/blocks?offset=100001',
    '/api/blocks/list','/api/blocks/list?limit=1','/api/blocks/list?limit=100',
    `/api/blocks/list?limit=25&cursor=${tip-40}`,`/api/blocks/list?limit=25&cursor=${tip-40}&direction=prev`,
    '/api/blocks/list?limit=bad&direction=bad','/api/blocks/list?unused=ignored',
    '/api/mining/pool-distribution?period=7d','/api/mining/pool-ranking?period=30d','/api/mining/hashrate-share?period=30d'];
  async function parity() {
    for (const route of routes) {
      const expected = await request(original.url,route);
      assert.ok(expected.status===200 || expected.status===400,`${route}: baseline must not fail`);
      assert.deepEqual(await request(candidate.url,route),expected,route);
    }
  }
  await t.test('13 legacy requests preserve body/status/cache policy before migration',parity);
  await t.test('new reads return 503 before migration; invalid filters return 400',async()=>{
    assert.equal((await request(candidate.url,'/api/mining/software')).status,503);
    assert.equal((await request(candidate.url,'/api/blocks/list?software=zebra')).status,503);
    assert.equal((await request(candidate.url,'/api/blocks/list?software=invalid')).status,400);
  });
  let migration=fs.readFileSync(path.join(root,'server/deploy/migrations/023_mining_software.sql'),'utf8').replaceAll('public.',`${schema}.`);
  // Keep concurrent index creation in separate statements, as in production.
  const chunks = migration.split(/(?=CREATE INDEX CONCURRENTLY)/);
  await db.query(chunks.shift());
  for (const sql of chunks) await db.query(sql);
  await t.test('migration copies writer privileges before trigger writes',async()=>{
    const client=await db.connect();
    try {
      await client.query(`SET ROLE ${role}`);
      await client.query(`INSERT INTO blocks(height,hash,timestamp,coinbase_hex) VALUES($1,'qa-insert',1788307200,'f09fa693')`,[tip+1]);
      await client.query(`UPDATE blocks SET coinbase_hex='f09f8cb8',hash='qa-reorg' WHERE height=$1`,[tip+1]);
      assert.equal((await client.query('SELECT software FROM block_software WHERE height=$1',[tip+1])).rows[0].software,'zakura');
      await client.query('DELETE FROM blocks WHERE height=$1',[tip+1]);
    } finally { await client.query('RESET ROLE'); client.release(); }
    assert.equal((await db.query('SELECT COALESCE(sum(blocks),0)::int AS n FROM block_software_daily')).rows[0].n,0);
  });
  await t.test('backfill is restartable and classifies actual public coinbase samples',async()=>{
    await backfill(db,250); await backfill(db,250);
    const result=await db.query('SELECT b.coinbase_hex,s.software FROM blocks b JOIN block_software s USING(height)');
    assert.equal(result.rows.length,sample.length);
    for(const row of result.rows)assert.equal(row.software,classifyMiningSoftware(row.coinbase_hex));
    assert.equal((await db.query('SELECT sum(blocks)::int AS n FROM block_software_daily')).rows[0].n,sample.length);
  });
  await t.test('13 legacy requests preserve body/status/cache policy after migration',parity);
  await t.test('software shares retain every category and both filtered pagination orders work',async()=>{
    const result=await request(candidate.url,'/api/mining/software?period=all');
    assert.equal(result.status,200);assert.equal(result.body.totalBlocks,sample.length);
    assert.equal(result.body.categories.reduce((n,c)=>n+c.blocks,0),sample.length);
    assert.ok(Math.abs(result.body.categories.reduce((n,c)=>n+c.share,0)-1)<1e-10);
    for(const software of ['all','zebra','zakura','unknown','missing','other','conflicting']) {
      for(const order of ['oldest','newest']) {
        const expected=sample.filter(b=>software==='all'||classifyMiningSoftware(b.coinbase_hex)===software).map(b=>Number(b.height)).sort((a,b)=>order==='oldest'?a-b:b-a);
        const seen=[];let cursor=null;
        do {
          const r=await request(candidate.url,`/api/blocks/list?software=${software}&order=${order}&limit=25${cursor===null?'':`&cursor=${cursor}`}`);
          assert.equal(r.status,200);
          seen.push(...r.body.blocks.map(b=>Number(b.height)));
          cursor=r.body.pagination.hasNext?r.body.pagination.nextCursor:null;
          assert.ok(seen.length<=sample.length,'pagination must advance');
        }while(cursor!==null);
        assert.deepEqual(seen,expected,`${software} ${order}`);
      }
    }
  });
  await t.test('rollback transaction rolls back block and aggregates; disable flag preserves legacy reads',async()=>{
    const c=await db.connect();try {
      await c.query('BEGIN');
      await c.query(`INSERT INTO blocks(height,hash,timestamp,coinbase_hex) VALUES($1,'rollback',1788307200,'f09fa693')`,[tip+1]);
      await c.query('ROLLBACK');
    }finally{c.release();}
    assert.equal((await db.query('SELECT sum(blocks)::int AS n FROM block_software_daily')).rows[0].n,sample.length);
    await db.query('UPDATE block_software_state SET ready=false');
    assert.equal((await request(candidate.url,'/api/mining/software')).status,503);
    assert.equal((await request(candidate.url,'/api/blocks/list')).status,200);
  });
  await t.test('emergency detach removes both maintenance triggers and keeps canonical writes possible',async()=>{
    await db.query(fs.readFileSync(path.join(root,'server/deploy/mining-backend-detach.sql'),'utf8').replaceAll('public.',`${schema}.`));
    const c=await db.connect();try {
      await c.query(`SET ROLE ${role}`);
      await c.query(`INSERT INTO blocks(height,hash,timestamp,coinbase_hex) VALUES($1,'detached',1788307200,'f09fa693')`,[tip+1]);
      assert.equal((await c.query('SELECT * FROM block_software WHERE height=$1',[tip+1])).rowCount,0);
      await c.query('DELETE FROM blocks WHERE height=$1',[tip+1]);
    }finally{await c.query('RESET ROLE');c.release();}
    assert.equal((await request(candidate.url,'/api/mining/software')).status,503);
    assert.equal((await request(candidate.url,'/api/blocks/list')).status,200);
  });
});
