"use strict";

const STATUSES = [
  "SUCCESS",
  "FAILED",
  "REFUNDED",
  "PROCESSING",
  "PENDING_DEPOSIT",
  "INCOMPLETE_DEPOSIT",
];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const normalizeChain = (chain) =>
  ({ trx: "tron", bnb: "bsc", apt: "aptos" })[chain] || chain;
const decimal = (value) =>
  typeof value === "string" &&
  /^\d+(\.\d+)?$/.test(value) &&
  value.length <= 160
    ? value
    : null;

function transform(tx, tokens) {
  if (
    !tx ||
    typeof tx.depositAddress !== "string" ||
    !tx.depositAddress ||
    !STATUSES.includes(tx.status) ||
    !Number.isFinite(Date.parse(tx.createdAt)) ||
    !tx.originAsset ||
    !tx.destinationAsset ||
    (tx.depositMemo != null && typeof tx.depositMemo !== "string")
  )
    throw new Error("Invalid Explorer transaction; checkpoint not advanced");
  const asset = (id) =>
    tokens.get(id) ||
    (id === "nep141:zec.omft.near"
      ? { blockchain: "zec", symbol: "ZEC" }
      : { blockchain: "unknown", symbol: "UNKNOWN" });
  const src = asset(tx.originAsset),
    dst = asset(tx.destinationAsset);
  if (src.blockchain !== "zec" && dst.blockchain !== "zec")
    throw new Error("Cannot identify native ZEC leg from token catalog");
  // In-flight amounts are deliberately hidden by upstream. Zero is not volume.
  const settled = ["SUCCESS", "REFUNDED"].includes(tx.status);
  return [
    tx.depositAddress,
    tx.depositMemo || "",
    tx.status,
    tx.createdAt,
    normalizeChain(src.blockchain),
    src.symbol,
    normalizeChain(dst.blockchain),
    dst.symbol,
    settled ? decimal(tx.amountInFormatted) : null,
    settled ? decimal(tx.amountOutFormatted) : null,
    settled ? decimal(tx.amountInUsd) : null,
    settled ? decimal(tx.amountOutUsd) : null,
    JSON.stringify(tx),
  ];
}

async function upsert(db, tx, tokens) {
  const row = transform(tx, tokens);
  await db.query(
    `INSERT INTO crosschain_swaps_v2
    (deposit_address,deposit_memo,status,swap_created_at,source_chain,source_token,dest_chain,dest_token,
     source_amount,dest_amount,source_amount_usd,dest_amount_usd,payload)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    ON CONFLICT (deposit_address,deposit_memo) DO UPDATE SET
      status_observed_at=CASE WHEN crosschain_swaps_v2.status<>EXCLUDED.status THEN now() ELSE crosschain_swaps_v2.status_observed_at END,
      status=EXCLUDED.status,swap_created_at=EXCLUDED.swap_created_at,
      source_chain=EXCLUDED.source_chain,source_token=EXCLUDED.source_token,dest_chain=EXCLUDED.dest_chain,dest_token=EXCLUDED.dest_token,
      source_amount=EXCLUDED.source_amount,dest_amount=EXCLUDED.dest_amount,
      source_amount_usd=EXCLUDED.source_amount_usd,dest_amount_usd=EXCLUDED.dest_amount_usd,payload=EXCLUDED.payload,last_seen_at=now(),last_checked_at=now()`,
    row,
  );
}

function explorerClient({
  key,
  fetchImpl = fetch,
  wait = sleep,
  now = Date.now,
} = {}) {
  let lastRequest = -Infinity;
  return async (params) => {
    if (!key) throw new Error("NEAR_INTENTS_API_KEY required");
    const url = new URL(
      "https://explorer.near-intents.org/api/v0/transactions",
    );
    for (const [k, v] of Object.entries(params))
      if (v != null) url.searchParams.set(k, String(v));
    for (let attempt = 0; attempt < 5; attempt++) {
      await wait(Math.max(0, 5500 - (now() - lastRequest)));
      lastRequest = now();
      let res;
      try {
        res = await fetchImpl(url, {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(30000),
        });
      } catch (err) {
        if (err.code === "NEAR_COOLDOWN" || attempt === 4) throw err;
        await wait(1000 * 2 ** attempt);
        continue;
      }
      if (res.status === 429 || res.status >= 500) {
        if (attempt === 4)
          throw new Error(
            `Explorer unavailable (${res.status}); checkpoint preserved`,
          );
        const retry = res.headers.get("retry-after");
        const retryMs = /^\d+$/.test(retry || "")
          ? Number(retry) * 1000
          : Date.parse(retry) - now();
        // Never retry before a provider-requested long cooldown. The next
        // scheduled invocation resumes the durable checkpoint instead.
        if (retryMs > 60000)
          throw new Error(
            "Explorer requested a long cooldown; checkpoint preserved",
          );
        await wait(
          Math.max(5500 * 2 ** attempt, Number.isFinite(retryMs) ? retryMs : 0),
        );
        continue;
      }
      if (!res.ok)
        throw new Error(`Explorer HTTP ${res.status}; checkpoint preserved`);
      const rows = await res.json();
      if (!Array.isArray(rows)) throw new Error("Invalid Explorer response");
      return rows;
    }
  };
}

async function loadTokens(fetchImpl = fetch) {
  const res = await fetchImpl("https://1click.chaindefuser.com/v0/tokens", {
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Token catalog HTTP ${res.status}`);
  const tokens = await res.json();
  if (!Array.isArray(tokens) || !tokens.some((t) => t.blockchain === "zec"))
    throw new Error("Incomplete token catalog");
  return new Map(
    tokens
      .filter((t) => t.assetId && t.blockchain && t.symbol)
      .map((t) => [t.assetId, t]),
  );
}

// Caller holds a session advisory lock. Every page and its cursor commit together.
// Stop only on an exhausted cursor, never on an empty calendar week or a short page.
async function traverse(
  db,
  request,
  tokens,
  { mode, direction, maxPages = 5, now = new Date() },
) {
  await db.query(
    "INSERT INTO crosschain_sync_v2 (mode,direction) VALUES ($1,$2) ON CONFLICT DO NOTHING",
    [mode, direction],
  );
  let state = (
    await db.query(
      "SELECT * FROM crosschain_sync_v2 WHERE mode=$1 AND direction=$2",
      [mode, direction],
    )
  ).rows[0];
  if (mode === "backfill" && state.completed_at)
    return { complete: true, pages: 0 };
  if (!state.window_end) {
    const start =
      mode === "sync"
        ? new Date(
            (state.completed_through
              ? new Date(state.completed_through)
              : now
            ).getTime() -
              7 * 86400000,
          )
        : null;
    state = (
      await db.query(
        `UPDATE crosschain_sync_v2 SET window_start=$3,window_end=$4,cursor_address=NULL,cursor_memo=NULL
      WHERE mode=$1 AND direction=$2 RETURNING *`,
        [mode, direction, start, now],
      )
    ).rows[0];
  }
  const seen = new Set();
  for (let page = 0; page < maxPages; page++) {
    const rows = await request({
      statuses: STATUSES.join(","),
      numberOfTransactions: 1000,
      direction: "next",
      showTestTxs: "false",
      [direction === "inflow" ? "toChainId" : "fromChainId"]: "zec",
      startTimestamp: state.window_start
        ? new Date(state.window_start.getTime() - 1).toISOString()
        : undefined,
      endTimestamp: state.window_end.toISOString(),
      lastDepositAddress: state.cursor_address,
      // Empty memo is not equivalent to an omitted memo for the provider cursor.
      lastDepositMemo: state.cursor_address
        ? state.cursor_memo || undefined
        : undefined,
    });
    const last = rows.at(-1);
    const cursor = last
      ? JSON.stringify([last.depositAddress, last.depositMemo || ""])
      : null;
    if (
      cursor &&
      (cursor ===
        JSON.stringify([state.cursor_address, state.cursor_memo || ""]) ||
        seen.has(cursor))
    ) {
      throw new Error(
        "Explorer cursor did not advance; traversal remains incomplete",
      );
    }
    if (cursor) seen.add(cursor);
    await db.query("BEGIN");
    try {
      for (const row of rows) await upsert(db, row, tokens);
      if (!rows.length) {
        await db.query(
          `INSERT INTO crosschain_coverage_v2(direction,window_start,window_end)
          VALUES ($1,$2,$3) ON CONFLICT (direction,window_end) DO UPDATE SET
          window_start=CASE WHEN crosschain_coverage_v2.window_start IS NULL OR EXCLUDED.window_start IS NULL THEN NULL ELSE LEAST(crosschain_coverage_v2.window_start,EXCLUDED.window_start) END,
          completed_at=now()`,
          [direction, state.window_start, state.window_end],
        );
        await db.query(
          `UPDATE crosschain_sync_v2 SET completed_at=now(),completed_through=window_end,
          window_start=NULL,window_end=NULL,cursor_address=NULL,cursor_memo=NULL,updated_at=now()
          WHERE mode=$1 AND direction=$2`,
          [mode, direction],
        );
      } else {
        await db.query(
          `UPDATE crosschain_sync_v2 SET cursor_address=$3,cursor_memo=$4,pages=pages+1,
          records=records+$5,updated_at=now() WHERE mode=$1 AND direction=$2`,
          [
            mode,
            direction,
            last.depositAddress,
            last.depositMemo || "",
            rows.length,
          ],
        );
      }
      await db.query("COMMIT");
    } catch (err) {
      await db.query("ROLLBACK");
      throw err;
    }
    if (!rows.length) return { complete: true, pages: page + 1 };
    state.cursor_address = last.depositAddress;
    state.cursor_memo = last.depositMemo || "";
  }
  return { complete: false, pages: maxPages };
}

async function refreshUnsettled(db, request, tokens, limit = 10) {
  const { rows } = await db.query(
    `SELECT deposit_address,deposit_memo FROM crosschain_swaps_v2
    WHERE status IN ('PROCESSING','INCOMPLETE_DEPOSIT')
      OR (status='PENDING_DEPOSIT' AND swap_created_at>=now()-interval '7 days')
      ORDER BY CASE WHEN status='PENDING_DEPOSIT' THEN 1 ELSE 0 END,last_checked_at LIMIT $1`,
    [limit],
  );
  for (const row of rows) {
    const found = await request({
      search: row.deposit_address,
      depositMemo: row.deposit_memo,
      statuses: STATUSES.join(","),
      numberOfTransactions: 1000,
    });
    // Search is broad; accept only exact identity. Absence is not failure/deletion.
    const exact = found.find(
      (tx) =>
        tx.depositAddress === row.deposit_address &&
        (tx.depositMemo || "") === row.deposit_memo,
    );
    if (exact) await upsert(db, exact, tokens);
    else
      await db.query(
        "UPDATE crosschain_swaps_v2 SET last_checked_at=now() WHERE deposit_address=$1 AND deposit_memo=$2",
        [row.deposit_address, row.deposit_memo],
      );
  }
}
module.exports = {
  STATUSES,
  transform,
  upsert,
  explorerClient,
  loadTokens,
  traverse,
  refreshUnsettled,
};
