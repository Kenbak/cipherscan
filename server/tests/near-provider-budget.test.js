"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { Pool } = require("pg");
const { limitedExplorerFetch } = require("../lib/crosschain/provider-budget");
const { explorerClient } = require("../lib/crosschain/ingest");

test("shared cooldown is not retried by the ingestion client", async () => {
  let calls = 0;
  const request = explorerClient({
    key: "test",
    wait: async () => {},
    fetchImpl: async () => {
      calls++;
      throw Object.assign(new Error("cooldown"), { code: "NEAR_COOLDOWN" });
    },
  });
  await assert.rejects(request({}), { code: "NEAR_COOLDOWN" });
  assert.equal(calls, 1);
});

test(
  "real PostgreSQL budget serializes callers and persists Retry-After across new clients",
  { skip: process.env.CROSSCHAIN_TEST_POSTGRES !== "1" },
  async () => {
    const admin = new Pool({ host: "/tmp", database: "postgres", max: 1 });
    const name = `near_budget_test_${process.pid}`;
    let pool;
    try {
      await admin.query(`CREATE DATABASE ${name}`);
      pool = new Pool({ host: "/tmp", database: name, max: 3 });
      await pool.query(
        fs.readFileSync(
          require.resolve("../scripts/create-near-provider-budget.sql"),
          "utf8",
        ),
      );
      const starts = [];
      const make = () =>
        limitedExplorerFetch({
          pool,
          fetchImpl: async () => {
            starts.push(Date.now());
            return new Response("[]");
          },
        });
      await Promise.all([
        make()("https://explorer.near-intents.org/api/v0/transactions"),
        make()("https://explorer.near-intents.org/api/v0/transactions"),
      ]);
      assert.equal(starts.length, 2);
      assert.ok(starts[1] - starts[0] >= 5900);
      let calls = 0;
      const throttled = limitedExplorerFetch({
        pool,
        fetchImpl: async () => {
          calls++;
          return new Response("", {
            status: 429,
            headers: { "retry-after": "120" },
          });
        },
      });
      await assert.rejects(
        throttled("https://explorer.near-intents.org/api/v0/transactions"),
        { code: "NEAR_COOLDOWN" },
      );
      // Another process/client cannot bypass the persisted cooldown.
      await assert.rejects(
        make()("https://explorer.near-intents.org/api/v0/transactions"),
        { code: "NEAR_COOLDOWN" },
      );
      assert.equal(starts.length, 2);
      assert.equal(calls, 1);
      const state = (
        await pool.query(
          "SELECT requests,throttled,not_before>now()+interval '110 seconds' AS cooling FROM crosschain_provider_budget",
        )
      ).rows[0];
      assert.deepEqual(state, { requests: "3", throttled: "1", cooling: true });
      // Token catalog is outside this partner endpoint's quota.
      await make()("https://1click.chaindefuser.com/v0/tokens");
      assert.equal(starts.length, 3);
      await pool.query("DELETE FROM crosschain_provider_budget");
      await assert.rejects(
        make()("https://explorer.near-intents.org/api/v0/transactions"),
        /not initialized/,
      );
      assert.equal(starts.length, 3);
    } finally {
      if (pool) await pool.end();
      await admin.query(`DROP DATABASE IF EXISTS ${name}`);
      await admin.end();
    }
  },
);
