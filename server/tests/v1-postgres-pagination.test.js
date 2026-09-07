// Opt-in integration test. Uses only session-local PostgreSQL temporary tables.
const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { Client } = require('pg');
const express = require('express');
const createV1Router = require('../api/v1');
const { injectDependencies } = require('../api/routes/transactions/_helpers');
const txLists = require('../api/routes/transactions/tx-lists');

test('real PostgreSQL flow pagination has no gaps or repeats across timestamp ties', { skip: process.env.V1_TEST_POSTGRES !== '1' }, async t => {
  const db = new Client({ host: process.env.PGHOST || '/tmp', database: process.env.PGDATABASE || 'postgres' });
  await db.connect();
  t.after(() => db.end());
  await db.query(`SET statement_timeout = '5s'; SET search_path = pg_temp;
    CREATE TEMP TABLE transactions (txid text, block_height int, block_time bigint, vin_count int DEFAULT 0, vout_count int DEFAULT 0,
      is_coinbase bool DEFAULT false, has_sapling bool DEFAULT false, has_orchard bool DEFAULT true, has_ironwood bool DEFAULT false,
      orchard_actions int DEFAULT 2, ironwood_actions int DEFAULT 0, sapling_spend_count int DEFAULT 0, sapling_output_count int DEFAULT 0, fee bigint DEFAULT 10000);
    CREATE TEMP TABLE shielded_flows (id bigint, txid text, block_height int, block_time bigint, flow_type text, amount_zat bigint, pool text, transparent_addresses text[]);
    INSERT INTO transactions(txid, block_height, block_time) SELECT lpad(to_hex(i),64,'0'), 42, 1700000000 FROM generate_series(1,205) i;
    INSERT INTO transactions(txid, block_height, block_time, vin_count) SELECT lpad(to_hex(i),64,'0'),42,1700000000,1 FROM generate_series(206,212) i;
    INSERT INTO shielded_flows SELECT i-205,lpad(to_hex(i),64,'0'),42,1700000000,'shield',100000000,'orchard',ARRAY[]::text[] FROM generate_series(206,212) i;`);
  const source = express(); source.locals.pool = db; source.locals.chainTip = { height: 42 };
  source.use(injectDependencies, txLists);
  const upstream = source.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  const router = createV1Router({ API_V1_ENABLED:'true', API_V1_LAUNCHED:'true', NEXT_PUBLIC_NETWORK:'mainnet', V1_INTERNAL_API_BASE_URL:`http://127.0.0.1:${upstream.address().port}` });
  const app = express(); app.locals.chainTip = { height: 42 }; app.use('/v1',router);
  const server = app.listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(() => { router.__stopRateLimiters(); server.closeAllConnections(); upstream.closeAllConnections(); server.close(); upstream.close(); });
  for (const flow of ['fully_shielded','all','shield']) for (const limit of [1,25,100]) {
    await t.test(`${flow}, limit ${limit}`, async () => {
      let cursor = null; const pages = []; const seen = [];
      const get = async cursor => {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/transactions/shielded?flow_type=${flow}&limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`);
        const body = await response.json(); assert.equal(response.status,200,JSON.stringify(body)); return body;
      };
      do {
        const body = await get(cursor); pages.push(body); seen.push(...body.data.map(r=>r.txid)); cursor = body.meta.page.nextCursor;
        assert(pages.length < 220, 'pagination must terminate');
      } while(cursor);
      assert.equal(seen.length, flow === 'all' ? 212 : flow === 'shield' ? 7 : 205);
      assert.equal(new Set(seen).size, seen.length);
      for(let i=pages.length-1;i>0;i--){
        const previous = await get(pages[i].meta.page.prevCursor);
        assert.deepEqual(previous.data.map(r=>r.txid),pages[i-1].data.map(r=>r.txid));
      }
    });
  }
});
