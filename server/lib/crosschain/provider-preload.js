"use strict";
// Opt-in job-only preload. It never changes the API or readers.
if (process.env.NEAR_EXPLORER_SHARED_LIMIT === "1") {
  const path = require("node:path");
  require("dotenv").config({
    path: path.join(__dirname, "../../api/.env"),
    quiet: true,
  });
  if (process.env.DB_NAME !== "zcash_explorer_mainnet")
    throw new Error("Shared NEAR limiter requires the mainnet database");
  const { Pool } = require("pg");
  const pool = new Pool({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    max: 1,
    statement_timeout: 10000,
    query_timeout: 12000,
    allowExitOnIdle: true,
    application_name: "near-provider-budget",
  });
  const { limitedExplorerFetch } = require("./provider-budget");
  global.fetch = limitedExplorerFetch({ pool, fetchImpl: global.fetch });
}
