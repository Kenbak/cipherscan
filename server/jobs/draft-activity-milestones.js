#!/usr/bin/env node
'use strict';

const { HISTORY_START, addDays, readActivity } = require('../lib/transaction-activity');
const { completedWeekEnd, makeDraft } = require('../lib/activity-milestones');

async function run(writePool, readPool, { now = new Date(), preview = false, logger = console } = {}) {
  const { rows: [db] } = await readPool.query('SELECT current_database() AS name');
  if (db.name !== 'zcash_explorer_mainnet') {
    logger.info('Weekly editorial drafts are mainnet-only; skipped');
    return null;
  }
  const end = completedWeekEnd(now);
  const activity = await readActivity(readPool, HISTORY_START, end, { now, requireGenesis: true });
  const draft = makeDraft(activity, end);
  if (preview) return draft;
  // Dedicated draft type/status. No X client, posting method, or pending status.
  // Recompute on each daily run so unreviewed drafts reflect chain corrections.
  if (draft) {
    await writePool.query(`INSERT INTO social_post_outbox (post_type,dedup_key,content,metadata,status)
      VALUES ('activity_milestone_draft',$1,$2,$3::jsonb,'draft')
      ON CONFLICT (dedup_key) DO UPDATE SET content=EXCLUDED.content,
        metadata=EXCLUDED.metadata, status='draft', updated_at=NOW()
      WHERE social_post_outbox.status IN ('draft','withdrawn')`,
    [`activity_week:v1:${draft.week}`, draft.content, JSON.stringify(draft.metadata)]);
    logger.info(`Editorial draft ready for ${draft.week}; review with review-activity-drafts.js`);
  } else {
    await writePool.query(`UPDATE social_post_outbox SET status='withdrawn', updated_at=NOW()
      WHERE dedup_key=$1 AND status='draft'`, [`activity_week:v1:${addDays(end, -7)}`]);
  }
  return draft;
}

if (require.main === module) {
  const { loadEnv } = require('../lib/job-utils');
  loadEnv(__dirname);
  const { getPool, getReadPool } = require('../lib/db-pool');
  const pool = getPool(); const reader = getReadPool();
  run(pool, reader, { preview: process.argv.includes('--preview') })
    .then(draft => console.log(JSON.stringify(draft, null, 2)))
    .catch(error => { console.error(error); process.exitCode = 1; })
    .finally(async () => { await pool.end(); if (reader !== pool) await reader.end(); });
}
module.exports = { run };
