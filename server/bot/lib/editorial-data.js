'use strict';

const { addDays, readActivity, HISTORY_START } = require('../../lib/transaction-activity');
const { completedWeekEnd, makeDraft } = require('../../lib/activity-milestones');
const { loadHashrateHistory } = require('../../api/lib/hashrate');
const policy = require('./editorial-policy');

// Flows already represent net movement across pools. Never subtract an
// unrelated Orchard withdrawal from an Ironwood deposit as a "migration".
const VALID_FLOWS = `SELECT sf.* FROM shielded_flows sf
  JOIN transactions t ON t.txid=sf.txid AND t.block_height=sf.block_height
  JOIN blocks b ON b.height=sf.block_height AND b.timestamp=sf.block_time
  WHERE NOT t.is_coinbase AND (t.vin_count>0 OR t.vout_count>0)
    AND COALESCE(t.value_balance_sapling,0)+COALESCE(t.value_balance_orchard,0)+COALESCE(t.value_balance_ironwood,0)
        = CASE WHEN sf.flow_type='shield' THEN -sf.amount_zat ELSE sf.amount_zat END
    AND sf.flow_type IN ('shield','deshield') AND sf.amount_zat>0`;
const VALID_SWAPS = `SELECT * FROM cross_chain_swaps WHERE status='SUCCESS'
  AND source_chain IS NOT NULL AND dest_chain IS NOT NULL AND source_chain<>dest_chain
  AND (source_chain='zec' OR dest_chain='zec') AND source_amount_usd>0`;

async function snapshot(pool, work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

async function assertMainnetFresh(db, now) {
  const { rows: [row] } = await db.query(`SELECT current_database() AS name,
    (SELECT timestamp FROM blocks ORDER BY height DESC LIMIT 1) AS timestamp`);
  if (row?.name !== 'zcash_explorer_mainnet') throw new Error('Editorial bot is mainnet-only');
  const age = now.getTime() / 1000 - Number(row.timestamp);
  if (row.timestamp == null || !Number.isFinite(age) || age > 1800 || age < -7200) throw new Error('Editorial source tip unavailable or stale');
}

async function liveCandidates(pool, now) {
  return snapshot(pool, async db => {
    await assertMainnetFresh(db, now);
    const at = Math.floor(now.getTime() / 1000);
    const { rows: flows } = await db.query(`WITH valid AS MATERIALIZED (
      ${VALID_FLOWS} AND sf.block_time >= $1-90*86400-3600 AND sf.block_time < $1-120
    ), candidates AS (
      SELECT * FROM valid WHERE block_time >= $1-3600 AND amount_zat >= 50000000000
      ORDER BY amount_zat DESC,txid LIMIT 20
    ) SELECT c.*, s.* FROM candidates c CROSS JOIN LATERAL (
      SELECT count(*) AS sample_count,
        count(*) FILTER(WHERE h.amount_zat>c.amount_zat) AS greater_count,
        count(*) FILTER(WHERE h.amount_zat=c.amount_zat) AS equal_count
      FROM valid h WHERE h.flow_type=c.flow_type AND h.block_time<c.block_time
        AND h.block_time>=c.block_time-90*86400
    ) s`, [at]);
    const candidates = flows.map(policy.flowStory).filter(Boolean);
    const decisions = flows.filter(f => !candidates.some(c => c.key === `large_flow:${f.txid}`))
      .map(f => ({ key: `large_flow:${f.txid}`, reason: 'flow-baseline-or-significance' }));

    const { rows: [sync] } = await db.query(`SELECT updated_at FROM sync_state WHERE job_name='crosschain_swaps'`);
    const syncAge = now - new Date(sync?.updated_at || 0);
    if (syncAge >= 0 && syncAge <= 20 * 60000) {
      const { rows: swaps } = await db.query(`WITH valid AS MATERIALIZED (
        ${VALID_SWAPS} AND swap_created_at >= $1::timestamptz-interval '31 days' AND swap_created_at < $1
      ), candidates AS (
        SELECT * FROM valid WHERE swap_created_at >= $1::timestamptz-interval '1 hour'
          AND source_amount_usd>=50000 ORDER BY source_amount_usd DESC,id LIMIT 20
      ) SELECT c.*,s.* FROM candidates c CROSS JOIN LATERAL (
        SELECT count(*) AS sample_count,
          count(*) FILTER(WHERE h.source_amount_usd>c.source_amount_usd) AS greater_count,
          count(*) FILTER(WHERE h.source_amount_usd=c.source_amount_usd) AS equal_count
        FROM valid h WHERE h.swap_created_at<c.swap_created_at
          AND h.swap_created_at>=c.swap_created_at-interval '30 days'
      ) s`, [now.toISOString()]);
      candidates.push(...swaps.map(policy.swapStory).filter(Boolean));
      decisions.push(...swaps.filter(s => !candidates.some(c => c.key === `cross_chain:${s.id}`))
        .map(s => ({ key: `cross_chain:${s.id}`, reason: 'swap-baseline-or-significance' })));
    } else decisions.push({ key: 'crosschain', reason: 'sync-unavailable-or-stale' });

    const { rows: migrations } = await db.query(`SELECT t.txid,t.block_time,abs(t.value_balance_ironwood)::text AS amount_zat
      FROM transactions t JOIN blocks b ON b.height=t.block_height AND b.timestamp=t.block_time
      WHERE t.block_time >= $1-3600 AND t.block_time<$1-120
        AND NOT t.is_coinbase AND t.vin_count=0 AND t.vout_count=0
        AND t.value_balance_orchard>0 AND t.value_balance_ironwood<=-1000000000000
      ORDER BY abs(t.value_balance_ironwood) DESC LIMIT 1`, [at]);
    for (const row of migrations) candidates.push(policy.candidate('migration', `migration:${row.txid}`,
      `${(Number(row.amount_zat)/1e8).toLocaleString('en-US',{maximumFractionDigits:2})} ZEC entered Ironwood in a pool migration with an Orchard withdrawal.\nNo transparent inputs or outputs; this is not new shielding.\nhttps://cipherscan.app/tx/${row.txid}`, row, 10));
    candidates.push(...await reorgCandidates(db,now));
    return { candidates, decisions };
  });
}

async function reorgCandidates(db,now) {
  const { rows } = await db.query(`SELECT id,depth,fork_height,detected_at FROM fork_events
    WHERE detected_at >= $1::timestamptz-interval '1 hour' AND detected_at<=$1 AND depth>=2
    ORDER BY detected_at DESC LIMIT 3`, [now.toISOString()]);
  return rows.map(row => policy.candidate('reorg', `reorg:${row.id}`,
    `Zcash chain reorganization detected: depth ${row.depth}, fork height ${row.fork_height}.\nRecent transaction confirmations can change as the canonical chain changes.\nhttps://cipherscan.app/network`, row, 100));
}

async function activityCandidates(pool, now, includeWeekly) {
  const end = now.toISOString().slice(0, 10), target = addDays(end, -1);
  const activity = await readActivity(pool, addDays(target, -30), end, { now });
  const candidates = [policy.dailyActivity(activity, target)].filter(Boolean);
  if (includeWeekly) {
    const weekEnd = completedWeekEnd(now);
    const all = await readActivity(pool, HISTORY_START, weekEnd, { now, requireGenesis: true });
    const story = policy.weeklyActivity(makeDraft(all, weekEnd));
    if (story) candidates.push(story);
  }
  return candidates;
}

async function hashrateCandidate(pool, now) {
  return snapshot(pool, async db => {
    await assertMainnetFresh(db, now);
    const { rows: [coverage] } = await db.query('SELECT min(height) AS first,max(height) AS last,count(*) AS count FROM blocks');
    const genesisComplete = Number(coverage.first) === 0 && Number(coverage.count) === Number(coverage.last) + 1;
    const history = await loadHashrateHistory(db, 'all', '7d');
    return policy.hashStory(history, { target: addDays(now.toISOString().slice(0,10), -1), genesisComplete });
  });
}

async function signalCandidates(pool, now) {
  return snapshot(pool, async db => {
    await assertMainnetFresh(db, now);
    const end = now.toISOString().slice(0, 10), target = addDays(end, -1), start = addDays(target, -30);
    const candidates = [];
    const queries = {
      mvrv: `SELECT date::text,mvrv AS value FROM mvrv_daily WHERE date >= $1::date AND date < $2::date ORDER BY date`,
      exchange_deposit_zat: `SELECT date::text,sum(exchange_zat)::text AS value FROM turnstile_daily WHERE date >= $1::date AND date < $2::date GROUP BY date ORDER BY date`,
      daily_fees_zat: `SELECT (to_timestamp(timestamp) AT TIME ZONE 'UTC')::date::text AS date,
        CASE WHEN count(total_fees)=count(*) THEN sum(total_fees)::text END AS value FROM blocks
        WHERE timestamp >= extract(epoch FROM $1::date::timestamp AT TIME ZONE 'UTC')
          AND timestamp < extract(epoch FROM $2::date::timestamp AT TIME ZONE 'UTC') GROUP BY 1 ORDER BY 1`,
    };
    for (const [metric, sql] of Object.entries(queries)) {
      const { rows } = await db.query(sql, [start, end]);
      const c = policy.signalStory(metric, rows, target);
      if (c) candidates.push(c);
    }
    const { rows: flows } = await db.query(`WITH valid AS (${VALID_FLOWS}
      AND sf.block_time >= extract(epoch FROM $1::date::timestamp AT TIME ZONE 'UTC')
      AND sf.block_time < extract(epoch FROM $2::date::timestamp AT TIME ZONE 'UTC'))
      SELECT (to_timestamp(block_time) AT TIME ZONE 'UTC')::date::text AS date,
        sum(amount_zat) FILTER(WHERE flow_type='shield')::text AS shield_volume_zat,
        sum(amount_zat) FILTER(WHERE flow_type='deshield')::text AS deshield_volume_zat
      FROM valid GROUP BY 1 ORDER BY 1`, [start, end]);
    for (const metric of ['shield_volume_zat','deshield_volume_zat']) {
      const c = policy.signalStory(metric, flows.map(r => ({ date: r.date, value: r[metric] })), target);
      if (c) candidates.push(c);
    }
    return candidates;
  });
}

async function crosschainDaily(pool, now) {
  return snapshot(pool, async db => {
    const { rows: [sync] } = await db.query(`SELECT updated_at FROM sync_state WHERE job_name='crosschain_swaps'`);
    const age = now - new Date(sync?.updated_at || 0);
    if (age < 0 || age > 20 * 60000) return null;
    const end = now.toISOString().slice(0,10), target = addDays(end,-1);
    const { rows: [row] } = await db.query(`WITH valid AS (${VALID_SWAPS}
      AND swap_created_at >= $1::date::timestamp AT TIME ZONE 'UTC'
      AND swap_created_at < $2::date::timestamp AT TIME ZONE 'UTC')
      SELECT count(*) AS count,
        sum(source_amount_usd) FILTER(WHERE dest_chain='zec')::text AS inflow,
        sum(source_amount_usd) FILTER(WHERE source_chain='zec')::text AS outflow,
        max(source_amount_usd)::text AS largest,
        (SELECT source_chain||' -> '||dest_chain FROM valid GROUP BY source_chain,dest_chain ORDER BY sum(source_amount_usd) DESC,source_chain,dest_chain LIMIT 1) AS top_route
      FROM valid`, [target,end]);
    // Missing direction/value stays unavailable, never converted into a zero.
    if (!row || row.inflow == null || row.outflow == null || Number(row.count) < 10) return null;
    const inflow = Number(row.inflow), outflow = Number(row.outflow), net = inflow-outflow;
    const usd = n => `$${Math.round(n).toLocaleString('en-US')}`;
    return policy.candidate('crosschain_daily', `analysis:crosschain:${target}`,
      `NEAR 1Click ZEC swaps, ${target} UTC:\n${usd(inflow)} in / ${usd(outflow)} out; net ${usd(Math.abs(net))} ${net>=0?'in':'out'}.\nTop route by USD: ${row.top_route.toUpperCase()}. Largest swap: ${usd(Number(row.largest))}.\nObserved completed external routes; reported source USD.\nhttps://cipherscan.app/crosschain`, row, 5);
  });
}

module.exports = { VALID_FLOWS, VALID_SWAPS, snapshot, assertMainnetFresh, liveCandidates, activityCandidates, hashrateCandidate, signalCandidates, crosschainDaily, reorgCandidates };
