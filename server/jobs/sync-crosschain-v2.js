#!/usr/bin/env node
"use strict";
// Explicit opt-in writer. Never imported by the API, never edits legacy swap data.
const { loadEnv } = require("../lib/job-utils");
const { logSafeError } = require("../api/lib/safe-log");
const { getPool } = require("../lib/db-pool");
const {
  loadTokens,
  explorerClient,
  traverse,
  refreshUnsettled,
} = require("../lib/crosschain/ingest");

async function main() {
  loadEnv(__dirname);
  const args = process.argv.slice(2);
  const mode = args.includes("--backfill")
    ? "backfill"
    : args.includes("--reconcile")
      ? "reconcile"
      : "sync";
  const maxPages = Number(
    args.find((a) => a.startsWith("--max-pages="))?.split("=")[1] || 5,
  );
  if (
    args.some(
      (a) =>
        !["--apply", "--backfill", "--reconcile"].includes(a) &&
        !/^--max-pages=\d+$/.test(a),
    ) ||
    (args.includes("--backfill") && args.includes("--reconcile")) ||
    !Number.isInteger(maxPages) ||
    maxPages < 1 ||
    maxPages > 100
  )
    throw new Error(
      "Usage: --apply [--backfill|--reconcile] [--max-pages=1..100]",
    );
  if (!args.includes("--apply")) {
    console.log(
      JSON.stringify({
        mode,
        maxPagesPerDirection: maxPages,
        writes: false,
        action:
          "Apply create-crosschain-v2.sql in the intended database, then use --apply. Coordinate the partner API rate limit with the legacy job.",
      }),
    );
    return;
  }
  if (
    process.env.CROSSCHAIN_V2_WRITER_ENABLED !== "1" ||
    process.env.NETWORK !== "mainnet"
  )
    throw new Error(
      "Requires CROSSCHAIN_V2_WRITER_ENABLED=1 and NETWORK=mainnet",
    );
  const pool = getPool({
    max: 1,
    statement_timeout: 15000,
    application_name: "crosschain-v2",
  });
  const db = await pool.connect();
  try {
    const identity = (await db.query("SELECT current_database() AS name"))
      .rows[0].name;
    if (identity !== "zcash_explorer_mainnet")
      throw new Error(
        "Writer requires zcash_explorer_mainnet; refusing a different database",
      );
    const lock = await db.query(
      "SELECT pg_try_advisory_lock(724092801) AS acquired",
    );
    if (!lock.rows[0].acquired) {
      console.log("Cross-chain v2 writer already active");
      return;
    }
    const tokens = await loadTokens();
    const request = explorerClient({ key: process.env.NEAR_INTENTS_API_KEY });
    for (const direction of ["inflow", "outflow"])
      console.log(
        JSON.stringify({
          mode,
          direction,
          ...(await traverse(db, request, tokens, {
            mode,
            direction,
            maxPages,
          })),
        }),
      );
    if (mode === "sync") await refreshUnsettled(db, request, tokens);
  } finally {
    await db.query("SELECT pg_advisory_unlock(724092801)").catch(() => {});
    db.release();
    await pool.end();
  }
}
if (require.main === module)
  main().catch((err) => {
    logSafeError("Cross-chain writer failed; checkpoint retained", err);
    process.exitCode = 1;
  });
module.exports = { main };
