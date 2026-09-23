#!/usr/bin/env node
'use strict';

// Preview by default. Count-only historical repair; never rewrite pool balances,
// supply, scores, timestamps or published posts. No fabricated missing snapshots.
const { loadEnv } = require('../lib/job-utils');
const { day, readActivity, repairTrendCounts } = require('../lib/transaction-activity');
loadEnv(__dirname);
const { getPool, getReadPool } = require('../lib/db-pool');
const pool = getPool(); const reader = getReadPool();

async function main() {
  const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1];
  const start = day(arg('start'));
  const end = day(arg('end')); // exclusive; completed days only
  if (end > new Date().toISOString().slice(0, 10)) throw new Error('Repair requires completed UTC days');
  const activity = await readActivity(reader, start, end);
  const { rows } = await pool.query('SELECT date::text, shielded_count, transparent_count FROM privacy_trends_daily WHERE date >= $1 AND date < $2 ORDER BY date', [start, end]);
  const existing = new Map(rows.map(r => [r.date, r]));
  const changes = activity.days.filter(d => {
    const old = existing.get(d.date);
    return !old || Number(old.shielded_count) !== d.shielded || Number(old.transparent_count) !== d.transparent;
  });
  const missing = activity.days.filter(d => !existing.has(d.date)).map(d => d.date);
  console.log(JSON.stringify({ start, endExclusive: end, sourceTip: activity.tip, changedDays: changes.length, missingSnapshotDates: missing, changes }, null, 2));
  if (process.argv.includes('--apply')) {
    console.log(`Repaired counts for ${await repairTrendCounts(pool, activity.days)} existing dates. Missing snapshots remain unavailable.`);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(async () => { await pool.end(); if (reader !== pool) await reader.end(); });
