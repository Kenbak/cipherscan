#!/usr/bin/env node
// Explicit operator job after migration 023. Restartable; no external requests.
const { Pool } = require("../api/node_modules/pg");
async function backfill(pool, batch = 5000) {
  const client = await pool.connect();
  try {
    const lock = await client.query(
      "SELECT pg_try_advisory_lock(230023) AS locked",
    );
    if (!lock.rows[0].locked)
      throw new Error("A software backfill is already running");
    let height = -1;
    while (true) {
      // Lock source rows until their observations are inserted, so an overlapping
      // reorg cannot replace a new observation with an obsolete backfill snapshot.
      const { rows } = await client.query(
        `WITH batch AS MATERIALIZED (
        SELECT height,hash,timestamp,coinbase_hex FROM blocks WHERE height > $1 ORDER BY height LIMIT $2 FOR SHARE
      ), written AS (
        INSERT INTO block_software(height,hash,timestamp,day,software)
        SELECT height,hash,timestamp,floor(timestamp/86400.0)::int,classify_mining_software_v1(coinbase_hex) FROM batch
        ON CONFLICT(height) DO NOTHING RETURNING height
      ) SELECT MAX(height) AS height FROM batch`,
        [height, batch],
      );
      if (rows[0].height == null) break;
      height = Number(rows[0].height);
    }
    // One MVCC snapshot verifies canonical coverage before enabling the feature.
    const result =
      await client.query(`UPDATE block_software_state SET ready=true,completed_at=now()
      WHERE version=1 AND NOT EXISTS (
        SELECT 1 FROM blocks b LEFT JOIN block_software s ON s.height=b.height
        WHERE s.height IS NULL OR s.hash IS DISTINCT FROM b.hash OR s.timestamp IS DISTINCT FROM b.timestamp
      ) RETURNING version`);
    if (!result.rowCount)
      throw new Error("Coverage verification failed; rerun backfill");
  } finally {
    await client.query("SELECT pg_advisory_unlock(230023)");
    client.release();
  }
}
if (require.main === module) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    statement_timeout: 120000,
    lock_timeout: 2000,
  });
  backfill(pool)
    .then(() => console.log("Mining software v1 backfill complete"))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
module.exports = { backfill };
