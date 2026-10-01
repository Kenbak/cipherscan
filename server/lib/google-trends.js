'use strict';
const { createHash } = require('node:crypto');
function parseZcashTrends(csv, importedAt) {
  const lines = csv.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const header = lines.findIndex(line => line === 'Week,zcash: (Worldwide)');
  if (header < 0) throw new Error('Expected a weekly, worldwide, Zcash-only export. Comparison exports use a different scale.');
  const cutoff = Date.parse(importedAt);
  if (csv.length > 250000) throw new Error('Export too large');
  if (lines[0] !== 'Category: All categories') throw new Error('Expected all categories');
  if (!Number.isFinite(cutoff)) throw new Error('Invalid import date');
  const points = lines.slice(header + 1).map((line, i) => {
    const [date, raw, extra] = line.split(',');
    const day = Date.parse(`${date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(day) || new Date(day).toISOString().slice(0,10) !== date || day > cutoff || extra !== undefined || !/^(?:<1|\d+)$/.test(raw)) throw new Error(`Invalid observation on row ${i + header + 2}`);
    const value = raw === '<1' ? null : Number(raw);
    if (value !== null && value > 100) throw new Error('Index must be between 0 and 100');
    return { date, value, belowOne: raw === '<1', partial: day + 7 * 86400000 > cutoff };
  });
  if (points.length > 800 || points.length < 2 || points.some((p, i) => i > 0 && Date.parse(p.date) - Date.parse(points[i-1].date) !== 7 * 86400000)) throw new Error('Expected consecutive weekly observations');
  return { source: 'Google Trends', query: 'zcash', geography: 'Worldwide', category: 'All categories', resolution: 'week', importedAt, acquisition: 'manual CSV export', points };
}
async function importSnapshot(pool, csv, capturedAt) {
  const snapshot = parseZcashTrends(csv, capturedAt);
  const id = createHash('sha256').update('google_trends|zcash|worldwide|all|web|week|' + JSON.stringify(snapshot.points.map(({date,value,belowOne})=>({date,value,belowOne})))).digest('hex');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(`INSERT INTO search_interest_snapshots
      (id,provider,query,geography,resolution,category,search_property,acquisition,captured_at,window_start,window_end)
      VALUES ($1,'google_trends','zcash','worldwide','week','all','web','csv_import',$2,$3,$4)
      ON CONFLICT (id) DO NOTHING RETURNING id`, [id,capturedAt,snapshot.points[0].date,snapshot.points.at(-1).date]);
    if (inserted.rowCount) {
      await client.query(`INSERT INTO search_interest_points (snapshot_id,date,value,below_one,partial)
        SELECT $1, p.date::date, p.value, p."belowOne", p.partial
        FROM jsonb_to_recordset($2::jsonb) AS p(date text,value smallint,"belowOne" boolean,partial boolean)`, [id,JSON.stringify(snapshot.points)]);
    }
    await client.query('COMMIT');
    return { id, imported: !!inserted.rowCount, count: snapshot.points.length };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
module.exports = { parseZcashTrends, importSnapshot };
