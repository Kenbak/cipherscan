'use strict';
// Bounded latest-window read; the snapshot is immutable and imported atomically.
async function latestSearchInterest(pool) {
  const { rows } = await pool.query(`SELECT s.id, s.captured_at, s.imported_at, s.window_start::text, s.window_end::text,
    (SELECT json_agg(json_build_object('date',p.date::text,'value',p.value,'belowOne',p.below_one,'partial',p.partial) ORDER BY p.date)
     FROM search_interest_points p WHERE p.snapshot_id = s.id) AS points
    FROM search_interest_snapshots s ORDER BY s.window_end DESC, s.captured_at DESC LIMIT 1`);
  const row = rows[0];
  if (!row) return null;
  return {id:row.id,source:'Google Trends',query:'zcash',geography:'Worldwide',category:'All categories',searchProperty:'Web Search',resolution:'week',acquisition:'csv_import',capturedAt:row.captured_at,importedAt:row.imported_at,windowStart:row.window_start,windowEnd:row.window_end,points:row.points,automaticRefresh:false,scored:false};
}
module.exports = { latestSearchInterest };
