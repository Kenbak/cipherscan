'use strict';
// CSV must be the worldwide/all-categories/Web Search/Zcash-only export.
// captured-at describes the export, not the day an old file is re-imported.
const { readFileSync } = require('node:fs');
const { parseZcashTrends, importSnapshot } = require('../lib/google-trends');
async function main() {
  const [file, capturedAt, ...flags] = process.argv.slice(2);
  if (!file || !capturedAt || flags.some(f=>f!=='--dry-run')) throw new Error('Usage: node server/jobs/import-google-trends.js <csv> <captured-at-ISO> [--dry-run]');
  if (!/^\d{4}-\d{2}-\d{2}T.*Z$/.test(capturedAt) || Date.parse(capturedAt)>Date.now()) throw new Error('Use a valid UTC export timestamp in the past');
  const csv = readFileSync(file, 'utf8');
  const snapshot = parseZcashTrends(csv, capturedAt);
  if (flags.includes('--dry-run')) { console.log(JSON.stringify({points:snapshot.points.length,partial:snapshot.points.filter(p=>p.partial).length,capturedAt})); return; }
  require('../lib/job-utils').loadEnv(__dirname);
  const pool = require('../lib/db-pool').getPool({max:1});
  try { console.log(JSON.stringify(await importSnapshot(pool, csv, capturedAt))); }
  finally { await pool.end(); }
}
if (require.main === module) main().catch(error=>{ console.error('Google Trends import failed:', error.code || 'invalid export or unavailable database'); process.exitCode=1; });
