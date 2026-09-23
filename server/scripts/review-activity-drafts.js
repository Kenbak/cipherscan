#!/usr/bin/env node
'use strict';

// Read/export only. There is deliberately no approve/post switch or X client.
const fs = require('node:fs/promises');
const path = require('node:path');
const { loadEnv } = require('../lib/job-utils');
const { renderChart } = require('../lib/activity-milestones');
loadEnv(__dirname);
const { getPool } = require('../lib/db-pool');
const pool = getPool();

async function main() {
  const { rows } = await pool.query(`SELECT id,content,metadata,updated_at FROM social_post_outbox
    WHERE post_type='activity_milestone_draft' AND status='draft' ORDER BY created_at DESC LIMIT 12`);
  const output = process.argv.find(a => a.startsWith('--output='))?.slice(9);
  for (const row of rows) {
    const m = row.metadata;
    const stale = Date.now() - Date.parse(m.capturedAt) > 36 * 3600000;
    const text = `# Weekly activity draft ${m.period.start}${stale ? ' — STALE: rerun detector before use' : ''}\n\n${row.content}\n\n${m.alternativeDraft ? `## Alternative angle\n\n${m.alternativeDraft}\n\n` : ''}## Evidence\n\n${m.metrics.map(v =>
      `- ${v.label}: ${v.value}; previous week ${v.previous}; change ${v.changePct === null ? 'unavailable (zero baseline)' : `${v.changePct.toFixed(2)}%`}; ${v.tied ? 'joint ' : ''}rank ${v.rank}; last equal-or-higher week ${v.lastAtLeast ?? 'none in complete-week history'}.`).join('\n')}\n\n${m.methodology}\n\nSource: ${m.source}. Tip ${m.tip.height} (${m.tip.hash}). Captured ${m.capturedAt}.\n\n${m.caveats.join('\n\n')}\n`;
    console.log(text);
    if (output) {
      await fs.mkdir(output, { recursive: true });
      const base = path.join(output, `activity-${m.period.start}`);
      await fs.writeFile(`${base}.md`, text);
      await fs.writeFile(`${base}.json`, JSON.stringify(m, null, 2));
      await fs.writeFile(`${base}.svg`, renderChart(m));
    }
  }
  if (!rows.length) console.log('No activity drafts awaiting review.');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => pool.end());
