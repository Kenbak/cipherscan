const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { types } = require("pg");
const statsRouter = require("../api/routes/stats");
const {
  registerNetworkAnalyticsRoutes,
} = require("../api/routes/network-analytics");

// Model the actual pg wire conversion: DATE becomes a local-midnight JS Date;
// a SQL text projection preserves the database calendar key in every timezone.
test("pool and transaction history preserve database dates across server timezones", async () => {
  const oldTimezone = process.env.TZ;
  const app = express();
  app.locals.pool = {
    async query(sql) {
      if (sql.includes("information_schema.columns"))
        return { rows: [{ exists: 1 }] };
      if (sql.includes("FROM privacy_stats"))
        return {
          rows: [
            {
              updated_at: new Date(),
              privacy_score_breakdown: {},
              privacy_score: 30,
            },
          ],
        };
      if (sql.includes("SELECT orchard_pool_size, pool_size"))
        return { rows: [] };
      if (sql.includes("FROM privacy_trends_daily")) {
        const date = /date::text AS date/.test(sql)
          ? "2026-08-24"
          : types.getTypeParser(1082)("2026-08-24");
        return {
          rows: [
            {
              date,
              pool_size: "100",
              orchard_pool_size: "50",
              ironwood_pool_size: "50",
              shielded_count: "3",
              transparent_count: "2",
            },
          ],
        };
      }
      throw new Error("Unexpected query");
    },
  };
  app.use(statsRouter);
  registerNetworkAnalyticsRoutes(app);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  try {
    for (const timezone of [
      "UTC",
      "Europe/Berlin",
      "Australia/Sydney",
      "America/Los_Angeles",
    ]) {
      process.env.TZ = timezone;
      for (const path of [
        "/api/network/pool-history?period=90d&format=zatoshi",
        "/api/privacy-stats?days=30",
      ]) {
        const response = await fetch(
          `http://127.0.0.1:${server.address().port}${path}`,
        );
        assert.equal(response.status, 200);
        const data = await response.json();
        assert.equal(
          (data.points || data.trends.daily)[0].date,
          "2026-08-24",
          `${path} in ${timezone}`,
        );
      }
    }
  } finally {
    if (oldTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = oldTimezone;
    await new Promise((resolve) => server.close(resolve));
  }
});

test("comparison price and public flow dates retain UTC calendar identity, including raw-flow fallback", async () => {
  const oldTimezone = process.env.TZ;
  const app = express();
  let fallback = false;
  app.locals.pool = {
    async query(sql) {
      if (sql.includes("FROM mvrv_daily")) {
        assert.match(sql, /m\.date::text AS date/);
        assert.match(sql, /AT TIME ZONE 'UTC'/);
        return { rows: [{ date: "2026-08-24", price_usd: "100" }] };
      }
      if (sql.includes("FROM flow_daily")) {
        if (fallback) throw Error("view unavailable");
        assert.match(sql, /date::text AS date/);
        assert.match(sql, /AT TIME ZONE 'UTC'/);
        return {
          rows: [
            {
              date: "2026-08-24",
              flow_type: "shield",
              total_zat: "200000000",
              tx_count: 1,
            },
          ],
        };
      }
      if (sql.includes("FROM shielded_flows")) {
        assert.match(sql, /AT TIME ZONE 'UTC'\)::date::text/);
        return {
          rows: [
            {
              date: "2026-08-24",
              flow_type: "deshield",
              total_zat: "100000000",
              tx_count: 1,
            },
          ],
        };
      }
      throw Error("Unexpected query");
    },
  };
  app.use(require("../api/routes/valuation"));
  app.use(require("../api/routes/pools"));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  try {
    for (const timezone of [
      "UTC",
      "Europe/Berlin",
      "Asia/Tokyo",
      "America/Los_Angeles",
    ]) {
      process.env.TZ = timezone;
      for (const raw of [false, true]) {
        fallback = raw;
        for (const path of [
          "/api/valuation/history?period=30d",
          "/api/pools/flows?period=30d",
        ]) {
          const r = await fetch(
            `http://127.0.0.1:${server.address().port}${path}`,
          );
          assert.equal(r.status, 200);
          const data = await r.json();
          assert.equal(data.points[0].date, "2026-08-24");
          if (path.includes("flows"))
            assert.equal(data.points[0].net, raw ? -1 : 2);
        }
      }
    }
  } finally {
    if (oldTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = oldTimezone;
    await new Promise((resolve) => server.close(resolve));
  }
});
