"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { Pool } = require("pg");
const {
  transform,
  upsert,
  traverse,
  explorerClient,
  refreshUnsettled,
} = require("../lib/crosschain/ingest");
const {
  readAnalytics,
  readSwaps,
  parseFilters,
} = require("../lib/crosschain/analytics");
const tokens = new Map([
  ["zec", { blockchain: "zec", symbol: "ZEC" }],
  ["eth", { blockchain: "eth", symbol: "ETH" }],
]);
const tx = (id, extra = {}) => ({
  depositAddress: id,
  depositMemo: null,
  status: "SUCCESS",
  createdAt: "2026-09-20T12:00:00.000Z",
  originAsset: "eth",
  destinationAsset: "zec",
  amountInFormatted: "0.01",
  amountOutFormatted: "1.23456789",
  amountInUsd: "100",
  amountOutUsd: "99",
  amountIn: "10000000000000000",
  amountOut: "123456789",
  originChainTxHashes: ["source-" + id],
  destinationChainTxHashes: ["zec-" + id],
  senders: ["same"],
  nearTxHashes: ["near-" + id],
  ...extra,
});

test("strict statuses, exact amounts and hidden in-flight values", () => {
  assert.equal(transform(tx("a"), tokens)[9], "1.23456789");
  assert.equal(
    transform(
      tx("a", { status: "PROCESSING", amountOutFormatted: "0" }),
      tokens,
    )[9],
    null,
  );
  assert.throws(
    () => transform(tx("a", { status: "NEW_STATUS" }), tokens),
    /Invalid/,
  );
  assert.throws(() => parseFilters({ period: "7d", status: "nope" }));
  assert.throws(() => parseFilters({ period: "all", granularity: "hour" }));
  assert.throws(() => parseFilters({ period: "constructor" }));
  assert.throws(() => parseFilters({ minUsd: "20", maxUsd: "10" }));
  assert.throws(() => parseFilters({ chain: ["eth", "sol"] }));
  assert.throws(() => parseFilters({ from: "2026-02-30T00:00:00Z" }));
  assert.throws(() => parseFilters({ from: "2026-09-01T99:00:00Z" }));
  assert.equal(
    parseFilters({ from: "2026-09-01T00:00:00.123Z" }).from,
    "2026-09-01T00:00:00.123Z",
  );
});
test("rate limiter bounds retries and respects Retry-After without leaking auth", async () => {
  const waits = [];
  let calls = 0;
  let time = 0;
  const request = explorerClient({
    key: "not-logged",
    now: () => time,
    wait: async (ms) => {
      waits.push(ms);
      time += ms;
    },
    fetchImpl: async () => {
      calls++;
      return { status: 429, headers: new Headers({ "retry-after": "12" }) };
    },
  });
  await assert.rejects(request({}), /checkpoint preserved/);
  assert.equal(calls, 5);
  assert.ok(waits.includes(12000));
  let cooldownCalls = 0;
  const cooldown = explorerClient({
    key: "not-logged",
    wait: async () => {},
    fetchImpl: async () => {
      cooldownCalls++;
      return { status: 429, headers: new Headers({ "retry-after": "120" }) };
    },
  });
  await assert.rejects(cooldown({}), /long cooldown/);
  assert.equal(cooldownCalls, 1);
});

test(
  "PostgreSQL: resumable ingestion, identity, status changes, accurate analytics and pagination",
  { skip: process.env.CROSSCHAIN_TEST_POSTGRES !== "1" },
  async () => {
    const name = `crosschain_test_${process.pid}_${Date.now()}`;
    const admin = new Pool({ host: "/tmp", database: "postgres", max: 1 });
    let db;
    try {
      await admin.query(`CREATE DATABASE ${name}`);
      db = new Pool({
        host: "/tmp",
        database: name,
        max: 2,
        options: "-c timezone=Asia/Tokyo",
      });
      await db.query(
        fs.readFileSync(
          require.resolve("../scripts/create-crosschain-v2.sql"),
          "utf8",
        ),
      );
      await db.query(
        "CREATE TABLE transactions(txid text PRIMARY KEY,block_time bigint)",
      );
      const client = await db.connect();
      try {
        await upsert(client, tx("same", { depositMemo: "1" }), tokens);
        await upsert(
          client,
          tx("same", {
            depositMemo: "2",
            status: "PROCESSING",
            amountOutFormatted: "0",
          }),
          tokens,
        );
        assert.equal(
          (await client.query("SELECT count(*) FROM crosschain_swaps_v2"))
            .rows[0].count,
          "2",
        );
        await upsert(
          client,
          tx("same", {
            depositMemo: "2",
            amountOutFormatted: "2",
            amountInUsd: "200",
          }),
          tokens,
        );
        assert.equal(
          (
            await client.query(
              "SELECT dest_amount FROM crosschain_swaps_v2 WHERE deposit_memo='2'",
            )
          ).rows[0].dest_amount,
          "2",
        );
        const page = tx("older", {
          createdAt: "2025-01-01T00:00:00Z",
          amountInUsd: "50",
        });
        let requests = [];
        let result = await traverse(
          client,
          async (p) => {
            requests.push(p);
            return [page];
          },
          tokens,
          {
            mode: "backfill",
            direction: "inflow",
            maxPages: 1,
            now: new Date("2026-09-28"),
          },
        );
        assert.equal(result.complete, false);
        assert.equal(requests[0].startTimestamp, undefined); // no 84-day bound
        result = await traverse(
          client,
          async (p) => {
            assert.equal(p.lastDepositAddress, "older");
            return [];
          },
          tokens,
          { mode: "backfill", direction: "inflow", maxPages: 1 },
        );
        assert.equal(result.complete, true);
        const before = (
          await client.query(
            "SELECT pages FROM crosschain_sync_v2 WHERE mode='backfill'",
          )
        ).rows[0].pages;
        await traverse(
          client,
          async () => {
            throw Error("must not refetch completed backfill");
          },
          tokens,
          { mode: "backfill", direction: "inflow" },
        );
        assert.equal(
          (
            await client.query(
              "SELECT pages FROM crosschain_sync_v2 WHERE mode='backfill'",
            )
          ).rows[0].pages,
          before,
        );
        await assert.rejects(
          traverse(
            client,
            async () => [tx("bad", { status: "NEW_STATUS" })],
            tokens,
            { mode: "backfill", direction: "outflow", maxPages: 1 },
          ),
          /Invalid/,
        );
        assert.equal(
          (
            await client.query(
              "SELECT cursor_address FROM crosschain_sync_v2 WHERE direction='outflow'",
            )
          ).rows[0].cursor_address,
          null,
        );
        await traverse(client, async () => [tx("repeat")], tokens, {
          mode: "backfill",
          direction: "outflow",
          maxPages: 1,
        });
        await assert.rejects(
          traverse(client, async () => [tx("repeat")], tokens, {
            mode: "backfill",
            direction: "outflow",
            maxPages: 1,
          }),
          /did not advance/,
        );
        await client.query(
          "DELETE FROM crosschain_swaps_v2 WHERE deposit_address='repeat'",
        );
        await upsert(
          client,
          tx("out", {
            originAsset: "zec",
            destinationAsset: "eth",
            amountInFormatted: "3",
            amountInUsd: "300",
          }),
          tokens,
        );
        await upsert(
          client,
          tx("self", {
            originAsset: "zec",
            destinationAsset: "zec",
            amountInUsd: "9999",
          }),
          tokens,
        );
        await upsert(client, tx("refund", { status: "REFUNDED" }), tokens);
        await upsert(client, tx("pending", { status: "PROCESSING" }), tokens);
        await refreshUnsettled(
          client,
          async () => [tx("pending", { status: "FAILED" })],
          tokens,
        );
        assert.equal(
          (
            await client.query(
              "SELECT status FROM crosschain_swaps_v2 WHERE deposit_address='pending'",
            )
          ).rows[0].status,
          "FAILED",
        );
        await client.query(
          "INSERT INTO transactions VALUES ('zec-same',179? )".replace(
            "179?",
            "" + Math.floor(new Date("2026-09-20T12:10:00Z").getTime() / 1000),
          ),
        );
      } finally {
        client.release();
      }
      const now = new Date("2026-09-28T00:00:00Z");
      await assert.rejects(
        readSwaps(
          db,
          { cursor: Buffer.from("null").toString("base64url") },
          { v2: true, now },
        ),
        /match filters/,
      );

      const data = await readAnalytics(
        db,
        { period: "30d" },
        { v2: true, now },
      );
      assert.equal(data.summary.swaps, 3);
      assert.equal(data.summary.volume_usd, "600");
      assert.equal(Number(data.summary.average_usd), 200);
      assert.equal(data.flows.length, 1);
      assert.equal(data.flows[0].chain, "eth");
      assert.equal(data.flows[0].swaps, 3);
      assert.equal(data.flows[0].buy_swaps, 2);
      assert.equal(data.flows[0].sell_swaps, 1);
      assert.equal(data.flows[0].inflow_usd, "300");
      assert.equal(data.flows[0].outflow_usd, "300");
      assert.equal(data.flows[0].inflow_zec, "3.23456789");
      assert.equal(data.flows[0].outflow_zec, "3");
      assert.equal(data.summary.volume_zec, "6.23456789");
      assert.equal(data.tokenFlows.length, 1);
      assert.equal(data.tokenFlows[0].chain, "eth");
      assert.equal(data.tokenFlows[0].token, "ETH");
      assert.equal(data.tokenFlows[0].swaps, 3);
      assert.equal(data.tokenFlows[0].inflow_zec, "3.23456789");
      assert.deepEqual(data.chainHistory, [
        {
          bucket: "2026-09-14T00:00:00.000Z",
          chain: "eth",
          swaps: 3,
          missing_zec: 0,
          net_zec: "0.23456789",
        },
      ]);
      assert.equal(
        data.chainOutcomes.reduce((n, r) => n + r.count, 0),
        5,
      );
      assert.equal(
        data.chainOutcomes.find(
          (r) => r.chain === "eth" && r.status === "REFUNDED",
        ).count,
        1,
      );
      assert.equal(
        data.chainOutcomes.find(
          (r) => r.chain === "eth" && r.status === "FAILED",
        ).count,
        1,
      );
      assert.equal(data.summary.sender_addresses, 2); // same address on two chains
      assert.equal(
        data.distribution.reduce((n, b) => n + b.swaps, 0),
        3,
      );
      assert.equal(data.coverage.internalSwaps, 1);
      assert.equal(data.coverage.historyTraversalComplete, false);
      assert.equal(
        data.trends.find((x) => x.bucket === "2026-09-20T00:00:00.000Z").swaps,
        3,
      );
      assert.equal(
        data.trends.find((x) => x.bucket === "2026-09-21T00:00:00.000Z").swaps,
        null,
      );
      assert.equal(data.latency[0].median_minutes, 10);
      assert.equal(data.statuses.find((s) => s.status === "FAILED").count, 1);
      const first = await readSwaps(
        db,
        { period: "all", limit: "2" },
        { v2: true, now },
      );
      const second = await readSwaps(
        db,
        { period: "all", limit: "2", cursor: first.nextCursor },
        { v2: true, now: new Date("2026-09-29") },
      );
      assert.equal(
        new Set([...first.swaps, ...second.swaps].map((s) => s.id)).size,
        4,
      );
      await assert.rejects(
        readSwaps(
          db,
          { period: "7d", cursor: first.nextCursor },
          { v2: true, now },
        ),
        /match filters/,
      );
      const filtered = await readSwaps(
        db,
        { period: "all", status: "SUCCESS", chain: "eth", minUsd: "150" },
        { v2: true, now },
      );
      assert.equal(filtered.swaps.length, 2);
      assert.equal(
        (
          await readSwaps(
            db,
            { period: "all", search: "source-out" },
            { v2: true, now },
          )
        ).swaps.length,
        1,
      );
      const exactRoute = await readSwaps(
        db,
        { period: "all", sourceAsset: "zec", destAsset: "eth" },
        { v2: true, now },
      );
      assert.deepEqual(
        exactRoute.swaps.map((s) => s.depositAddress),
        ["out"],
      );
      const nearHash = await readSwaps(
        db,
        { period: "all", search: "near-out" },
        { v2: true, now },
      );
      assert.equal(nearHash.swaps[0].depositAddress, "out");
      assert.equal(
        (
          await readSwaps(
            db,
            { period: "all", referral: "nonexistent" },
            { v2: true, now },
          )
        ).swaps.length,
        0,
      );
      // A completed historic traversal and a fresh sync must not conceal a gap between their windows.
      await db.query(
        "INSERT INTO crosschain_coverage_v2(direction,window_start,window_end) VALUES ('outflow',NULL,'2026-09-01T00:00:00Z'),('inflow','2026-09-21T00:00:00Z','2026-09-28T00:00:00Z'),('outflow','2026-09-21T00:00:00Z','2026-09-28T00:00:00Z') ON CONFLICT DO NOTHING",
      );
      const gap = await readAnalytics(db, { period: "30d" }, { v2: true, now });
      assert.equal(gap.coverage.continuousThrough, "2026-09-01T00:00:00.000Z");
      await db.query(
        "INSERT INTO crosschain_coverage_v2(direction,window_start,window_end) VALUES ('outflow','2026-09-01T00:00:00Z','2026-09-21T00:00:00Z')",
      );
      const joined = await readAnalytics(
        db,
        { period: "30d" },
        { v2: true, now },
      );
      assert.equal(
        joined.coverage.continuousThrough,
        "2026-09-28T00:00:00.000Z",
      );
      await db.query(
        "UPDATE crosschain_sync_v2 SET completed_at=now() WHERE mode='backfill'",
      );
      await db.query(
        "INSERT INTO crosschain_sync_v2(mode,direction,completed_at,completed_through) VALUES ('sync','inflow',now(),'2026-09-28T00:00:00Z'),('sync','outflow',now(),'2026-09-28T00:00:00Z') ON CONFLICT (mode,direction) DO UPDATE SET completed_through=EXCLUDED.completed_through",
      );
      const complete = await readAnalytics(
        db,
        { period: "30d" },
        { v2: true, now },
      );
      assert.equal(
        complete.trends.find((t) => t.bucket === "2026-09-21T00:00:00.000Z")
          .swaps,
        0,
      );
      assert.equal(complete.trends.at(-1).swaps, null); // current partial bucket
      // Compatibility source has no v2 dependency. Read all six data features from existing columns.
      await db.query(`CREATE TABLE cross_chain_swaps AS SELECT deposit_address,'inflow'::text AS direction,status,swap_created_at,
      source_chain,source_token,dest_chain,dest_token,source_amount,dest_amount,source_amount_usd,dest_amount_usd,
      ARRAY['src']::text[] AS source_tx_hashes,ARRAY['zec-same']::text[] AS dest_tx_hashes,ARRAY['same']::text[] AS senders,
      'eth'::text AS raw_origin_asset,'zec'::text AS raw_dest_asset,ARRAY[]::text[] AS near_tx_hashes,NULL::text AS recipient
      FROM crosschain_swaps_v2 WHERE status='SUCCESS';
      CREATE TABLE sync_state(job_name text,last_sync_timestamp timestamptz);
      INSERT INTO sync_state VALUES ('crosschain_swaps','2026-09-27T23:59:00Z')`);
      const legacy = await readAnalytics(db, { period: "30d" }, { now });
      assert.equal(legacy.summary.volume_zec, "6.23456789");
      assert.equal(legacy.coverage.stale, false);
      assert.deepEqual(legacy.coverage.statusesAvailable, ["SUCCESS"]);
      const express = require("express");
      const app = express();
      app.locals.pool = db;
      app.use(require("../api/routes/crosschain-analytics"));
      const server = await new Promise((resolve) => {
        const s = app.listen(0, "127.0.0.1", () => resolve(s));
      });
      const root = `http://127.0.0.1:${server.address().port}`;
      const v1 = require("../api/v1")({
        API_V1_ENABLED: "true",
        API_V1_LAUNCHED: "true",
        NEXT_PUBLIC_NETWORK: "mainnet",
        V1_INTERNAL_API_BASE_URL: root,
      });
      app.use("/v1", v1);
      try {
        const response = await fetch(
          root + "/v1/crosschain/analytics?period=all",
        );
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.data.summary.swaps, 4);
        assert.equal(body.data.coverage.source, "legacy-success-index");
        const page = await fetch(
          root + "/v1/crosschain/swaps?period=all&limit=1",
        );
        assert.equal(page.status, 200);
        assert.ok((await page.json()).data.nextCursor);
        for (const query of ["period=bad", "period=7d&period=30d", "unknown=1"])
          assert.equal(
            (await fetch(root + "/v1/crosschain/analytics?" + query)).status,
            400,
          );
        assert.equal(
          (await fetch(root + "/v1/crosschain/swaps?minUsd=100&maxUsd=1"))
            .status,
          400,
        );
        app.locals.pool = {
          connect: async () => {
            throw new Error("postgres://secret:password@private-host/db");
          },
        };
        const unavailable = await fetch(root + "/api/crosschain/swaps");
        assert.equal(unavailable.status, 503);
        assert.deepEqual(await unavailable.json(), {
          success: false,
          error: "Cross-chain index temporarily unavailable",
        });
      } finally {
        v1.__stopRateLimiters?.();
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
      }
      await upsert(
        db,
        tx("missing-values", {
          createdAt: "2026-07-01T00:00:00Z",
          amountInUsd: null,
          amountOutFormatted: null,
        }),
        tokens,
      );
      const missing = await readAnalytics(
        db,
        { period: "24h" },
        { v2: true, now: new Date("2026-07-01T12:00:00Z") },
      );
      assert.equal(missing.summary.volume_usd, null);
      assert.equal(missing.summary.average_usd, null);
      assert.equal(missing.flows[0].inflow_usd, null);
      assert.equal(missing.flows[0].outflow_usd, "0");
      assert.equal(missing.summary.volume_zec, null);
      assert.equal(missing.summary.missing_usd, 1);
      assert.equal(missing.tokenFlows[0].inflow_zec, null);
      assert.equal(missing.chainHistory[0].net_zec, null);
      assert.equal(missing.chainHistory[0].missing_zec, 1);
      assert.equal(missing.distribution.length, 0);
      assert.equal(missing.trends.find((t) => t.swaps === 1).inflow_usd, null);
      await db.query(`INSERT INTO crosschain_swaps_v2
        (deposit_address,deposit_memo,status,swap_created_at,source_chain,source_token,dest_chain,dest_token,source_amount,dest_amount,source_amount_usd,payload)
        SELECT 'extra-'||i,'','SUCCESS','2026-09-20T00:00:00Z','zec','ZEC','test'||i,'TOK',1,2,100,
          jsonb_build_object('originAsset','zec','destinationAsset','asset-'||i)
        FROM generate_series(1,105)i`);
      const expanded = await readAnalytics(
        db,
        { period: "30d" },
        { v2: true, now },
      );
      assert.equal(expanded.routes.length, 100);
      assert.equal(expanded.flows.length, 106);
      assert.equal(expanded.tokenFlows.length, 106);
      assert.equal(
        expanded.tokenFlows.reduce((n, r) => n + r.swaps, 0),
        expanded.summary.swaps,
      );
      assert.equal(
        expanded.chainHistory.reduce((n, r) => n + r.swaps, 0),
        expanded.summary.swaps,
      );
      assert.equal(
        expanded.chainOutcomes.reduce((n, r) => n + r.count, 0),
        expanded.statuses.reduce((n, r) => n + r.count, 0),
      );
    } finally {
      if (db) await db.end();
      await admin.query(`DROP DATABASE IF EXISTS ${name}`);
      await admin.end();
    }
  },
);
