"use strict";
const INTERVAL_MS = 6000;
const LOCK_ID = 724092802;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function cooldownError() {
  return Object.assign(
    new Error("NEAR Explorer cooldown active; checkpoint preserved"),
    { code: "NEAR_COOLDOWN" },
  );
}
/** Shared by all opted-in Explorer callers. The session lock covers the HTTP response,
 * and the durable deadline survives process exits. Never stores tokens or payloads. */
function limitedExplorerFetch({
  pool,
  fetchImpl = fetch,
  wait = sleep,
  now = Date.now,
}) {
  return async (input, init) => {
    const url = new URL(
      typeof input === "string" || input instanceof URL ? input : input.url,
    );
    if (url.hostname !== "explorer.near-intents.org")
      return fetchImpl(input, init);
    const db = await pool.connect();
    let locked = false;
    try {
      await db.query("SELECT pg_advisory_lock($1)", [LOCK_ID]);
      locked = true;
      const {
        rows: [state],
      } = await db.query(
        "SELECT GREATEST(0,extract(epoch FROM (not_before-clock_timestamp()))*1000)::float8 AS wait_ms FROM crosschain_provider_budget WHERE id=1",
      );
      if (!state)
        throw new Error(
          "NEAR shared budget is not initialized; refusing unpaced request",
        );
      // Long server cooldowns must not occupy the live-sync execution window.
      if (state.wait_ms > 10000) throw cooldownError();
      if (state.wait_ms > 0) await wait(Math.ceil(state.wait_ms));
      await db.query(
        "UPDATE crosschain_provider_budget SET not_before=clock_timestamp()+interval '6 seconds',requests=requests+1,updated_at=clock_timestamp() WHERE id=1",
      );
      const res = await fetchImpl(input, init);
      if (res.status === 429) {
        const retry = res.headers.get("retry-after");
        const delay = /^\d+(?:\.\d+)?$/.test(retry || "")
          ? Number(retry) * 1000
          : Date.parse(retry) - now();
        const cooldown =
          Number.isFinite(delay) && delay > 0
            ? Math.max(INTERVAL_MS, delay)
            : 60000;
        await db.query(
          "UPDATE crosschain_provider_budget SET not_before=GREATEST(not_before,clock_timestamp()+($1::double precision * interval '1 millisecond')),throttled=throttled+1,last_status=429,updated_at=clock_timestamp() WHERE id=1",
          [cooldown],
        );
        throw cooldownError();
      }
      await db.query(
        "UPDATE crosschain_provider_budget SET last_status=$1 WHERE id=1",
        [res.status],
      );
      return res;
    } finally {
      let releaseError;
      if (locked) {
        try {
          await db.query("SELECT pg_advisory_unlock($1)", [LOCK_ID]);
        } catch (err) {
          releaseError = err;
        }
      }
      db.release(releaseError);
    }
  };
}
module.exports = { limitedExplorerFetch, INTERVAL_MS };
