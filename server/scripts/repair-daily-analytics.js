#!/usr/bin/env node
'use strict';

// Bounded, missing-only repair. Dry run writes a reviewable plan; --apply-plan
// rechecks canonical anchors and atomically inserts only still-missing rows.
// No current-day data, fallback pool balances, interpolation, or existing-row updates.
const fs = require('node:fs');
const path = require('node:path');
const { calculatePrivacyScore, computeScoreInputsFromCounts } = require('../lib/privacy-score');
const { CURRENT_UNSPENT_SQL, RECENT_SPENDS_SQL } = require('../lib/utxo-age');
const DAY = 86400000;
const dateKey = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const addDays = (date, days) => new Date(Date.parse(date) + days * DAY).toISOString().slice(0, 10);
const epoch = date => Date.parse(date) / 1000;
const TABLES = {
  privacy_trends_daily: ['date', 'shielded_count', 'transparent_count', 'shielded_percentage', 'pool_size', 'privacy_score', 'sprout_pool_size', 'sapling_pool_size', 'orchard_pool_size', 'ironwood_pool_size', 'transparent_pool_size', 'chain_supply'],
  mvrv_daily: ['date', 'market_cap_usd', 'realized_cap_usd', 'transparent_realized_cap_usd', 'shielded_realized_cap_usd', 'mvrv', 'realized_price', 'sopr', 'shielded_sopr', 'nupl'],
  swap_amount_stats_daily: ['date', 'source_chain', 'source_token', 'amount_bucket', 'swap_count', 'total_volume_usd'],
};
function validateRange(from, to) {
  if (!dateKey(from) || !dateKey(to) || from > to || Date.parse(to) - Date.parse(from) >= 366 * DAY || to >= new Date().toISOString().slice(0, 10)) throw new Error('Provide at most 366 complete UTC days');
}
function parsePools(block) {
  const result = {};
  for (const item of block.valuePools || []) {
    if (!['sprout', 'sapling', 'orchard', 'ironwood', 'transparent', 'lockbox'].includes(item.id)) throw new Error('Unknown value pool');
    if (!Number.isSafeInteger(item.chainValueZat) || item.chainValueZat < 0) throw new Error('Invalid pool amount');
    result[item.id] = item.chainValueZat;
  }
  for (const key of ['sprout', 'sapling', 'orchard', 'ironwood', 'transparent']) if (!(key in result)) throw new Error(`Missing ${key} pool`);
  if (!Number.isSafeInteger(block.chainSupply?.chainValueZat) || block.chainSupply.chainValueZat <= 0) throw new Error('Invalid chain supply');
  result.shielded = result.sprout + result.sapling + result.orchard + result.ironwood;
  result.supply = block.chainSupply.chainValueZat;
  return result;
}
// Same 5%-adjacent / >=3-swap clustering and value-dependent rounding as sync job.
function clusterAmounts(input) {
  const amounts = input.filter(a => a.amount > 0).sort((a, b) => a.amount - b.amount);
  const groups = [];
  for (const amount of amounts) {
    const current = groups.at(-1);
    if (current && Math.abs(amount.amount - current.at(-1).amount) / current.at(-1).amount <= 0.05) current.push(amount);
    else groups.push([amount]);
  }
  const result = new Map();
  for (const group of groups.filter(g => g.length >= 3)) {
    const usd = group.reduce((sum, a) => sum + a.usd, 0);
    const mean = group.reduce((sum, a) => sum + a.amount, 0) / group.length;
    const price = usd / group.length / mean;
    const decimals = price >= 10000 ? 5 : price >= 1000 ? 4 : price >= 100 ? 3 : price >= 10 ? 2 : price >= 1 ? 1 : 0;
    const bucket = Number(mean.toFixed(decimals));
    if (bucket <= 0) continue;
    const previous = result.get(bucket) || { bucket, count: 0, usd: 0 };
    previous.count += group.length; previous.usd += Number(usd.toFixed(2));
    result.set(bucket, previous);
  }
  return [...result.values()].map(row => ({ ...row, usd: Number(row.usd.toFixed(2)) }));
}
function historicalCostBasis(date, unspent, spent, prices) {
  const target = Math.floor(Date.parse(date) / DAY);
  let value = 0n; let cap = 0;
  function include(row) {
    const created = Number(row.created_day);
    if (created > target) return;
    const key = new Date(created * DAY).toISOString().slice(0, 10);
    const price = prices.get(key);
    if (!(price > 0)) throw new Error(`Missing acquisition price: ${key}`);
    const amount = BigInt(row.value_zat);
    if (amount < 0n) throw new Error('Negative cohort');
    value += amount;
    cap += Number(amount) / 1e8 * price;
  }
  unspent.forEach(include);
  for (const row of spent) if (Number(row.spent_day) > target) include(row);
  if (!(cap > 0) || !Number.isFinite(cap)) throw new Error('Invalid historical cost basis');
  return { valueZat: value.toString(), capUsd: cap };
}
async function missingDates(db, table, from, to) {
  if (!Object.hasOwn(TABLES, table)) throw new Error('Unsupported table');
  return (await db.query(`SELECT d::date::text AS date FROM generate_series($1::date,$2::date,'1 day') d WHERE NOT EXISTS(SELECT 1 FROM ${table} t WHERE t.date=d::date) ORDER BY d`, [from, to])).rows.map(r => r.date);
}
async function buildPlan(db, from, to, rpc) {
  validateRange(from, to);
  const plan = { version: 1, from, to, generatedAt: new Date().toISOString(), anchors: [], rows: {}, notes: ['MVRV transparent cost basis reconstructs the end-of-day UTXO set from canonical creation/spend cohorts and UTC creation-day USD prices; USD valuations are an economic approximation, not individual purchase prices.', 'Swap amount snapshots reconstruct the trailing seven days at the end of the missing UTC day.'] };
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    await db.query("SET LOCAL statement_timeout='120s'");
    await db.query("SET LOCAL TIME ZONE 'UTC'");
    const tip = (await db.query('SELECT height,hash,timestamp FROM blocks ORDER BY height DESC LIMIT 1')).rows[0];
    if (Number(tip.timestamp) < epoch(addDays(to, 1))) throw new Error('Indexer has not reached the requested boundary');
    plan.anchors.push({ height: Number(tip.height), hash: tip.hash });
    const gaps = {};
    for (const table of Object.keys(TABLES)) gaps[table] = await missingDates(db, table, from, to);
    console.log(JSON.stringify({ missingDates: gaps }));
    const newPrivacy = new Map();
    for (const date of gaps.privacy_trends_daily) {
      const end = epoch(addDays(date, 1));
      const block = (await db.query('SELECT height,hash FROM blocks WHERE timestamp >= $1 - 86400 AND timestamp < $1 ORDER BY height DESC LIMIT 1', [end])).rows[0];
      if (!block) throw new Error(`No end-of-day block: ${date}`);
      const source = await rpc('getblock', [String(block.height), 1]);
      if (source.hash !== block.hash || Number(source.height) !== Number(block.height)) throw new Error('RPC/database chain mismatch');
      plan.anchors.push({ height: Number(block.height), hash: block.hash });
      const pools = parsePools(source);
      const count = (await db.query(`SELECT
        COUNT(*) FILTER(WHERE block_time >= $2 AND (has_sapling OR has_orchard OR has_ironwood)) AS shielded_day,
        COUNT(*) FILTER(WHERE block_time >= $2 AND NOT is_coinbase AND NOT has_sapling AND NOT has_orchard AND NOT has_ironwood) AS transparent_day,
        COUNT(*) FILTER(WHERE has_sapling OR has_orchard OR has_ironwood) AS shielded,
        COUNT(*) FILTER(WHERE NOT is_coinbase AND NOT has_sapling AND NOT has_orchard AND NOT has_ironwood) AS transparent,
        COUNT(*) FILTER(WHERE (has_sapling OR has_orchard OR has_ironwood) AND vin_count=0 AND vout_count=0 AND NOT is_coinbase) AS fully_shielded
        FROM transactions WHERE block_time >= $1 AND block_time < $3 AND block_height > 0`, [epoch(addDays(date, -29)), epoch(date), end])).rows[0];
      const turnstile = (await db.query('SELECT SUM(deshielded_zat) AS deshielded,SUM(reshielded_zat) AS reshielded FROM turnstile_daily WHERE date >= $1 AND date <= $2', [addDays(date, -89), date])).rows[0];
      const score = calculatePrivacyScore(computeScoreInputsFromCounts({ shielded30d: Number(count.shielded), transparent30d: Number(count.transparent), fullyShielded30d: Number(count.fully_shielded), deshielded90dZat: Number(turnstile.deshielded), reshielded90dZat: Number(turnstile.reshielded), supplyShieldedPercent: pools.shielded / pools.supply * 100 })).total;
      const shielded = Number(count.shielded_day); const transparent = Number(count.transparent_day);
      if (shielded + transparent === 0) throw new Error(`No indexed transaction activity: ${date}`);
      newPrivacy.set(date, { date, shielded_count: shielded, transparent_count: transparent, shielded_percentage: shielded / (shielded + transparent) * 100, pool_size: pools.shielded, privacy_score: score, sprout_pool_size: pools.sprout, sapling_pool_size: pools.sapling, orchard_pool_size: pools.orchard, ironwood_pool_size: pools.ironwood, transparent_pool_size: pools.transparent, chain_supply: pools.supply });
    }
    plan.rows.privacy_trends_daily = [...newPrivacy.values()];
    plan.rows.mvrv_daily = [];
    if (gaps.mvrv_daily.length) {
      console.log('Reconstructing historical UTXO acquisition basis');
      await db.query("SET LOCAL statement_timeout='180s'");
      await db.query("SET LOCAL work_mem='64MB'");
      await db.query('SET LOCAL max_parallel_workers_per_gather=2');
      const unspent = (await db.query(CURRENT_UNSPENT_SQL)).rows;
      const spent = (await db.query(RECENT_SPENDS_SQL, [epoch(gaps.mvrv_daily[0])])).rows;
      const prices = new Map((await db.query('SELECT date::text AS date,price_usd FROM zec_price_daily')).rows.map(row => [row.date, Number(row.price_usd)]));
      plan.transparentBasis = { method: 'historical-utxo-cohorts', anchorHeight: Number(tip.height), currentCohorts: unspent.length, spentCohorts: spent.length, days: [] };
      for (const date of gaps.mvrv_daily) {
        const price = Number((await db.query('SELECT price_usd FROM zec_price_daily WHERE date=$1', [date])).rows[0]?.price_usd);
        const supply = newPrivacy.get(date) || (await db.query('SELECT chain_supply,transparent_pool_size FROM privacy_trends_daily WHERE date=$1', [date])).rows[0];
        const caps = (await db.query('SELECT SUM(realized_cap_usd) AS cap,SUM(balance_zat) AS balance FROM pool_realized_cap_daily WHERE date=$1', [date])).rows[0];
        if (!(price > 0) || !(Number(supply?.chain_supply) > 0) || !(Number(caps.cap) > 0)) throw new Error(`Missing MVRV inputs: ${date}`);
        const supplyZec = Number(supply.chain_supply) / 1e8;
        const basis = historicalCostBasis(date, unspent, spent, prices);
        plan.transparentBasis.days.push({ date, ...basis });
        const transparentCap = basis.capUsd;
        const shieldedCap = Number(caps.cap); const realizedCap = transparentCap + shieldedCap;
        const marketCap = price * supplyZec;
        plan.rows.mvrv_daily.push({ date, market_cap_usd: marketCap, realized_cap_usd: realizedCap, transparent_realized_cap_usd: transparentCap, shielded_realized_cap_usd: shieldedCap, mvrv: marketCap / realizedCap, realized_price: realizedCap / supplyZec, sopr: null, shielded_sopr: price / (shieldedCap / (Number(caps.balance) / 1e8)), nupl: (marketCap - realizedCap) / marketCap });
      }
    }
    plan.rows.swap_amount_stats_daily = [];
    for (const date of gaps.swap_amount_stats_daily) {
      const rows = (await db.query(`SELECT source_chain,source_token,source_amount,source_amount_usd FROM cross_chain_swaps
        WHERE status='SUCCESS' AND direction='inflow' AND swap_created_at >= $1::timestamptz AND swap_created_at < $2::timestamptz`, [addDays(date, -6), addDays(date, 1)])).rows;
      const groups = new Map();
      for (const row of rows) {
        if (!row.source_chain || !row.source_token) throw new Error('Missing swap identity');
        const key = JSON.stringify([row.source_chain, row.source_token]);
        if (!groups.has(key)) groups.set(key, []);
        const amount = Number(row.source_amount); const usd = Number(row.source_amount_usd || 0);
        if (!Number.isFinite(amount) || !Number.isFinite(usd) || usd < 0) throw new Error('Invalid swap amount');
        groups.get(key).push({ amount, usd });
      }
      for (const [key, amounts] of groups) {
        const [chain, token] = JSON.parse(key);
        for (const cluster of clusterAmounts(amounts)) plan.rows.swap_amount_stats_daily.push({ date, source_chain: chain, source_token: token, amount_bucket: cluster.bucket, swap_count: cluster.count, total_volume_usd: cluster.usd });
      }
    }
    await db.query('COMMIT');
    return plan;
  } catch (error) { await db.query('ROLLBACK'); throw error; }
}
async function applyPlan(db, plan) {
  validateRange(plan.from, plan.to);
  if (plan.version !== 1 || !Array.isArray(plan.anchors) || !plan.anchors.length || Object.keys(plan.rows).some(table => !Object.hasOwn(TABLES, table))) throw new Error('Invalid repair plan');
  await db.query('BEGIN');
  try {
    await db.query("SET LOCAL statement_timeout='30s'");
    await db.query("SET LOCAL lock_timeout='2s'");
    if (!(await db.query('SELECT pg_try_advisory_xact_lock(20260910, 1) AS acquired')).rows[0].acquired) throw new Error('Another repair is active');
    for (const anchor of plan.anchors) {
      if (!Number.isSafeInteger(anchor.height) || !/^[a-f0-9]{64}$/.test(anchor.hash)) throw new Error('Invalid chain anchor');
      const found = (await db.query('SELECT hash FROM blocks WHERE height=$1 FOR SHARE', [anchor.height])).rows[0];
      if (found?.hash !== anchor.hash) throw new Error('Chain changed since plan creation');
    }
    const inserted = {};
    for (const [table, columns] of Object.entries(TABLES)) {
      const rows = plan.rows[table];
      if (!Array.isArray(rows) || rows.length > 100000) throw new Error('Invalid row batch');
      const dates = [...new Set(rows.map(row => row.date))];
      for (const date of dates) {
        if (!dateKey(date) || date < plan.from || date > plan.to) throw new Error('Row outside repair range');
        if ((await db.query(`SELECT 1 FROM ${table} WHERE date=$1 LIMIT 1`, [date])).rowCount) throw new Error(`Date already exists: ${table} ${date}`);
      }
      inserted[table] = 0;
      for (const row of rows) {
        if (Object.keys(row).length !== columns.length || columns.some(col => !Object.hasOwn(row, col)) || Object.values(row).some(v => typeof v === 'number' && !Number.isFinite(v))) throw new Error('Invalid repair row');
        await db.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(',')})`, columns.map(col => row[col]));
        inserted[table]++;
      }
    }
    await db.query('COMMIT');
    return inserted;
  } catch (error) { await db.query('ROLLBACK'); throw error; }
}
async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map(arg => arg.replace(/^--/, '').split('=')));
  if (!args.env || (!args['apply-plan'] && (!args.from || !args.to || !args.plan))) throw new Error('Usage: --env=/server/api/.env --from=YYYY-MM-DD --to=YYYY-MM-DD --plan=/private/plan.json OR --env=... --apply-plan=/private/plan.json');
  require('dotenv').config({ path: path.resolve(args.env), quiet: true });
  const { Client } = require('pg');
  const db = new Client({ host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 5432), database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD, application_name: 'daily-analytics-gap-repair', connectionTimeoutMillis: 5000, statement_timeout: 120000 });
  await db.connect();
  try {
    if (args['apply-plan']) { console.log(JSON.stringify({ inserted: await applyPlan(db, JSON.parse(fs.readFileSync(args['apply-plan'], 'utf8'))) })); return; }
    const rpc = async (method, params) => {
      const cookie = fs.readFileSync(process.env.ZEBRA_RPC_COOKIE_FILE || '/root/.cache/zakura/.cookie', 'utf8').trim();
      const response = await fetch(process.env.ZEBRA_RPC_URL || 'http://127.0.0.1:8232', { method: 'POST', signal: AbortSignal.timeout(20000), headers: { 'Content-Type': 'application/json', Authorization: `Basic ${Buffer.from(cookie).toString('base64')}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 'daily-gap-repair', method, params }) });
      if (!response.ok) throw new Error('Node request failed');
      const result = await response.json();
      if (result.error || !result.result) throw new Error('Historical node data unavailable');
      return result.result;
    };
    const plan = await buildPlan(db, args.from, args.to, rpc);
    fs.writeFileSync(args.plan, JSON.stringify(plan, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ plan: args.plan, rows: Object.fromEntries(Object.entries(plan.rows).map(([table, rows]) => [table, rows.length])) }));
  } finally { await db.end(); }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { validateRange, parsePools, clusterAmounts, historicalCostBasis, buildPlan, applyPlan };
