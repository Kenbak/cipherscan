// Opt-in: isolated schema only, never mainnet tables or credentials.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");
const express = require("express");
const { once } = require("node:events");
const { fixtures } = require("./mining-software.test");
const { backfill } = require("../scripts/backfill-mining-software");
const { softwareHistory } = require("../api/lib/mining-software");
const createV1Router = require("../api/v1");
const blocks = require("../api/routes/blocks");
const mining = require("../api/routes/mining");

test(
  "real PostgreSQL software migration, history and v1 filtered cursors",
  { skip: process.env.V1_TEST_POSTGRES !== "1" },
  async (t) => {
    const schema = `mining_software_test_${process.pid}`;
    const admin = new Pool({ host: "/tmp", database: "postgres", max: 1 });
    await admin.query(`CREATE SCHEMA ${schema}`);
    const db = new Pool({
      host: "/tmp",
      database: "postgres",
      max: 2,
      options: `-c search_path=${schema} -c statement_timeout=30000`,
    });
    t.after(async () => {
      await db.end();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    });
    await db.query(`CREATE TABLE blocks(height integer PRIMARY KEY,hash text,timestamp bigint,coinbase_hex text,miner_address text,transaction_count integer DEFAULT 1,size integer DEFAULT 100,difficulty double precision DEFAULT 1,total_fees bigint DEFAULT 0);
    INSERT INTO blocks(height,hash,timestamp,coinbase_hex,miner_address) SELECT i,lpad(to_hex(i),64,'0'),1788220800+i*75,
      CASE WHEN i%5=0 THEN 'f09f8cb8' WHEN i%5=1 THEN 'f09fa693' WHEN i%5=2 THEN NULL ELSE '00' END,
      CASE WHEN i%2=0 THEN 't1MKn34KBa8Xh4g8qU8psibBXvURafphVn7' ELSE 'unknown' END FROM generate_series(0,524) i;`);
    const migration = fs
      .readFileSync(
        path.resolve(
          __dirname,
          "../../../cipherscan-rust/schema/migrations/023_mining_software.sql",
        ),
        "utf8",
      )
      .replaceAll("public.", `${schema}.`)
      .replaceAll("CONCURRENTLY ", "");
    await db.query(migration);
    // An empty optional tag was incorrectly classified as missing by 023.
    await db.query("UPDATE blocks SET coinbase_hex='' WHERE height=523");
    assert.equal((await db.query('SELECT software FROM block_software WHERE height=523')).rows[0].software,'missing');
    await backfill(db,50);
    const correction = fs.readFileSync(path.resolve(__dirname,'../deploy/migrations/025_empty_coinbase_tags_are_unmarked.sql'),'utf8').replaceAll('public.', `${schema}.`);
    const beforeCorrection = await db.query('SELECT sum(blocks)::int AS n FROM block_software_daily');
    await db.query(correction);
    await db.query(correction);
    assert.equal((await db.query('SELECT software FROM block_software WHERE height=523')).rows[0].software,'unknown');
    assert.equal((await db.query('SELECT sum(blocks)::int AS n FROM block_software_daily')).rows[0].n,beforeCorrection.rows[0].n);
    // Restore readiness for the existing incomplete-read regression below.
    await db.query('UPDATE block_software_state SET ready=false');
    for (const [value, expected] of fixtures) {
      const result = await db.query(
        "SELECT classify_mining_software_v1($1) AS software",
        [value],
      );
      assert.equal(result.rows[0].software, expected, String(value));
    }
    await assert.rejects(
      () => softwareHistory(db, {}),
      (error) => error.status === 503,
    );
    await backfill(db, 50);
    await backfill(db, 50); // restart/idempotence: counts must not double
    const total = await db.query(
      "SELECT sum(blocks)::int AS total FROM block_software_daily",
    );
    assert.equal(total.rows[0].total, 525);
    const snapshot = await softwareHistory(db, {
      period: "custom",
      from: "2026-09-01",
      to: "2026-09-01",
    });
    assert.equal(snapshot.totalBlocks, 525);
    assert.equal(
      snapshot.categories.find((c) => c.software === "zebra").blocks,
      105,
    );
    assert.equal(
      snapshot.categories.find((c) => c.software === "missing").share,
      0.2,
    );
    assert.equal(snapshot.history[0].total, 525);
    await db.query(
      "INSERT INTO blocks(height,hash,timestamp,coinbase_hex) VALUES(525,'new',1788307200,'f09fa693')",
    );
    const weighted = await softwareHistory(db, {
      period: "custom",
      from: "2026-09-01",
      to: "2026-09-02",
    });
    assert.equal(
      weighted.categories.find((c) => c.software === "zebra").share,
      106 / 526,
      "weighted counts, not daily average",
    );
    const weekly = await softwareHistory(db, {period:'custom',from:'2026-09-01',to:'2026-09-02',bucket:'week'});
    assert.equal(weekly.totalBlocks, weighted.totalBlocks);
    assert.equal(weekly.history[0].date, '2026-08-31');
    assert.equal(weekly.history[0].total, 526, 'partial week excludes unselected days');
    const since = await softwareHistory(db, {period:'since-zebra'}, Date.UTC(2026,8,2));
    assert.equal(since.from,'2026-09-01');
    await db.query(
      "UPDATE blocks SET hash='replacement',coinbase_hex='f09f8cb8' WHERE height=525",
    );
    assert.equal(
      (
        await softwareHistory(db, {
          period: "custom",
          from: "2026-09-02",
          to: "2026-09-02",
        })
      ).categories.find((c) => c.software === "zakura").blocks,
      1,
    );
    await db.query("DELETE FROM blocks WHERE height=525");
    assert.equal(
      (
        await softwareHistory(db, {
          period: "custom",
          from: "2026-09-02",
          to: "2026-09-02",
        })
      ).totalBlocks,
      0,
    );
    const source = express();
    source.locals.pool = db;
    source.locals.chainTip = { height: 524 };
    source.locals.callZebraRPC = async () => ({});
    source.use(blocks, mining);
    const upstream = source.listen(0, "127.0.0.1");
    await once(upstream, "listening");
    const router = createV1Router({
      API_V1_ENABLED: "true",
      API_V1_LAUNCHED: "true",
      NEXT_PUBLIC_NETWORK: "mainnet",
      V1_INTERNAL_API_BASE_URL: `http://127.0.0.1:${upstream.address().port}`,
    });
    const app = express();
    app.locals.chainTip = { height: 524 };
    app.use("/v1", router);
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(() => {
      router.__stopRateLimiters();
      server.closeAllConnections();
      upstream.closeAllConnections();
      server.close();
      upstream.close();
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const order of ["newest", "oldest"])
      for (const limit of [1, 25, 100])
        await t.test(`${order}, limit ${limit}`, async () => {
          const pages = [];
          const seen = [];
          let cursor = null;
          const get = async (cursor) => {
            const params = new URLSearchParams({
              software: "zebra",
              order,
              limit: String(limit),
              ...(cursor ? { cursor } : {}),
            });
            const response = await fetch(`${origin}/v1/blocks?${params}`);
            const body = await response.json();
            assert.equal(response.status, 200, JSON.stringify(body));
            return body;
          };
          do {
            const body = await get(cursor);
            pages.push(body);
            seen.push(...body.data.map((b) => b.height));
            for (const block of body.data)
              assert.equal(block.intervalSeconds, 75, "actual parent interval");
            assert.equal(body.meta.page.total, 105);
            cursor = body.meta.page.nextCursor;
            assert(pages.length < 110);
          } while (cursor);
          assert.equal(seen.length, 105);
          assert.equal(new Set(seen).size, 105);
          const expected = Array.from({ length: 105 }, (_, i) => i * 5 + 1);
          if (order === "newest") expected.reverse();
          assert.deepEqual(seen, expected);
          for (let i = pages.length - 1; i > 0; i--)
            assert.deepEqual(
              (await get(pages[i].meta.page.prevCursor)).data.map(
                (b) => b.height,
              ),
              pages[i - 1].data.map((b) => b.height),
            );
          const mismatch = await fetch(
            `${origin}/v1/blocks?software=zakura&order=${order}&limit=${limit}&cursor=${pages[0].meta.page.nextCursor}`,
          );
          assert.equal(mismatch.status, 400);
        });
    const response = await fetch(
      `${origin}/v1/blocks?software=zebra&pool=ViaBTC&min_height=100&max_height=200&order=oldest`,
    );
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.meta.page.total, 10);
    assert(
      body.data.every(
        (b) => b.height >= 100 && b.height <= 200 && b.height % 2 === 0,
      ),
    );
    for (const query of [
      "from=2026-02-30",
      "min_height=3&max_height=1",
      "order=fees",
      "software=invalid",
    ])
      assert.equal((await fetch(`${origin}/v1/blocks?${query}`)).status, 400);
    const history = await fetch(
      `${origin}/v1/mining/software?period=custom&from=2026-09-01&to=2026-09-01`,
    );
    assert.equal(history.status, 200);
    assert.equal((await history.json()).data.totalBlocks, 525);
    const sluiceyTag = Buffer.from('Get Sluicey Yall sluicey.xyz').toString('hex');
    await db.query('UPDATE blocks SET coinbase_hex=$1 WHERE height IN (522,523)',[sluiceyTag]);
    const tagged = await fetch(`${origin}/v1/blocks?pool=Sluicey%20Pool&min_height=520&max_height=524`);
    const taggedBody = await tagged.json();
    assert.equal(tagged.status,200,JSON.stringify(taggedBody));
    assert.deepEqual(taggedBody.data.map(b=>b.height),[523]);
    assert.equal(taggedBody.data[0].miner_pool,'Sluicey Pool');
    const untagged = await fetch(`${origin}/v1/blocks?pool=unattributed&min_height=523&max_height=523`);
    assert.equal((await untagged.json()).data.length,0);
    await t.test('metric bounds filter the dataset and bind pagination', async () => {
      await db.query("UPDATE blocks SET size=25000,total_fees=123456789,transaction_count=7 WHERE height IN (501,511,521)");
      const query = 'software=zebra&min_interval=75&max_interval=75&min_size=25000&max_size=25000&min_fees=1.23456789&max_fees=1.23456789&min_txs=7&max_txs=7&limit=1';
      const first = await fetch(`${origin}/v1/blocks?${query}`);
      const result = await first.json();
      assert.equal(first.status,200,JSON.stringify(result));
      assert.equal(result.meta.page.total,3);
      assert.deepEqual(result.data.map(b=>b.height),[521]);
      assert.equal(result.data[0].intervalSeconds,75);
      const next = await fetch(`${origin}/v1/blocks?${query}&cursor=${encodeURIComponent(result.meta.page.nextCursor)}`);
      assert.deepEqual((await next.json()).data.map(b=>b.height),[511]);
      assert.equal((await fetch(`${origin}/v1/blocks?${query.replace('min_size=25000','min_size=24000')}&cursor=${encodeURIComponent(result.meta.page.nextCursor)}`)).status,400);
      const outside = await fetch(`${origin}/v1/blocks?min_fees=1.23456790`);
      assert.equal((await outside.json()).meta.page.total,0);
      for (const invalid of ['min_size=2&max_size=1','min_fees=0.000000001','min_txs=-1','min_interval=1.5'])
        assert.equal((await fetch(`${origin}/v1/blocks?${invalid}`)).status,400,invalid);
    });
    await t.test('metric sorting traverses ties and missing values in both directions', async () => {
      await db.query('UPDATE blocks SET size=CASE WHEN height=4 THEN NULL ELSE (height%3)*100 END,total_fees=CASE WHEN height=4 THEN NULL ELSE (height%3)*100000000 END,transaction_count=CASE WHEN height=4 THEN NULL ELSE height%3+1 END WHERE height<=12');
      const expressions = {size:'b.size',fees:'b.total_fees',txs:'b.transaction_count',interval:'b.timestamp-parent.timestamp'};
      for (const [metric,expression] of Object.entries(expressions)) for (const direction of ['asc','desc']) {
        const query = `min_height=0&max_height=12&order=${metric}_${direction}&limit=4`;
        const expected = (await db.query(`SELECT b.height FROM blocks b LEFT JOIN blocks parent ON parent.height=b.height-1 WHERE b.height<=12 ORDER BY ${expression} ${direction} NULLS LAST,b.height ${direction}`)).rows.map(b=>b.height);
        const pages=[];let cursor=null;
        do {
          const response=await fetch(`${origin}/v1/blocks?${query}${cursor ? '&cursor='+encodeURIComponent(cursor) : ''}`);
          const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));
          assert.equal(body.meta.page.total,13);assert(body.data.every(b=>!('_sort' in b)));
          pages.push(body);cursor=body.meta.page.nextCursor;assert(pages.length<6);
        } while(cursor);
        assert.deepEqual(pages.flatMap(p=>p.data.map(b=>b.height)),expected,`${metric}_${direction}`);
        for(let i=pages.length-1;i>0;i--){
          const response=await fetch(`${origin}/v1/blocks?${query}&cursor=${encodeURIComponent(pages[i].meta.page.prevCursor)}`);
          const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));
          assert.deepEqual(body.data.map(b=>b.height),pages[i-1].data.map(b=>b.height));
        }
      }
    });
    // Larger synthetic range for query-plan and bounded-aggregate smoke checks.
    await db.query(
      `INSERT INTO blocks(height,hash,timestamp,coinbase_hex) SELECT i,'synthetic-'||i,1788220800+i*75,CASE WHEN i%100=0 THEN 'f09fa693' ELSE '00' END FROM generate_series(526,100525) i`,
    );
    await db.query(
      "ANALYZE blocks; ANALYZE block_software; ANALYZE block_software_daily",
    );
    const plan = await db.query(
      "EXPLAIN (ANALYZE,FORMAT JSON) SELECT height FROM block_software WHERE software='zebra' ORDER BY height DESC LIMIT 25",
    );
    assert(
      JSON.stringify(plan.rows).includes("block_software_category_height_idx"),
    );
    const began = performance.now();
    await softwareHistory(db, { period: "all" });
    t.diagnostic(
      `100,525-block synthetic history read: ${(performance.now() - began).toFixed(1)} ms; marker index plan verified.`,
    );
  },
);
