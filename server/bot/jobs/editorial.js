'use strict';

const fs = require('fs');
const { addDays } = require('../../lib/transaction-activity');
const { completedWeekEnd } = require('../../lib/activity-milestones');
const data = require('../lib/editorial-data');
const { select, isNew } = require('../lib/editorial-policy');

// One sender across overlapping service instances. Per-story atomic claims
// protect deduplication even after a crash or lost advisory-lock connection.
const LOCK = 839307;
const ACTIVATION_KEY = 'analysis:activation:v1';

async function activationTime(pool, dryRun, now) {
  if (!dryRun) await pool.query(`INSERT INTO social_post_outbox(post_type,dedup_key,content,metadata,status)
    VALUES ('editorial_activation',$1,'Future events only',$2::jsonb,'active')
    ON CONFLICT(dedup_key) DO NOTHING`, [ACTIVATION_KEY,JSON.stringify({activatedAt:now.toISOString()})]);
  const { rows: [row] } = await pool.query('SELECT metadata FROM social_post_outbox WHERE dedup_key=$1',[ACTIVATION_KEY]);
  const value = row?.metadata?.activatedAt;
  if (value && Number.isFinite(Date.parse(value))) return value;
  if (dryRun && !row) return now.toISOString();
  throw new Error('Activation watermark unavailable; refusing historical publication');
}

async function publish(db, xClient, story, { logger = console, render } = {}) {
  if (!story.content || story.content.length > 280) throw new Error('Refusing invalid editorial copy');
  if (xClient.dryRun) {
    logger.info(`[Editorial preview] ${story.key}\n${story.content}`);
    return { key: story.key, status: 'preview' };
  }
  const { rows: [claim] } = await db.query(`INSERT INTO social_post_outbox
    (post_type,dedup_key,content,metadata,status) VALUES ($1,$2,$3,$4::jsonb,'posting')
    ON CONFLICT(dedup_key) DO NOTHING RETURNING id`, [story.type,story.key,story.content,JSON.stringify(story.evidence)]);
  if (!claim) return { key: story.key, status: 'duplicate' };
  let imagePath;
  try {
    try { if (render) imagePath = await render(story); }
    catch (error) { logger.warn(`[Editorial] Card unavailable: ${error.message}`); }
    const result = imagePath ? await xClient.postWithMedia(story.content,imagePath) : await xClient.post(story.content);
    if (!result?.id || String(result.id).startsWith('dry_run')) throw new Error('Missing real X post ID');
    // Record the ID in logs too, so a DB failure after acceptance is reconcilable.
    logger.info(`[Editorial] X accepted ${story.key}: ${result.id}`);
    await db.query(`UPDATE social_post_outbox SET status='posted',x_post_id=$2,
      posted_at=NOW(),attempts=attempts+1,updated_at=NOW() WHERE id=$1`, [claim.id,result.id]);
    return { key: story.key, status: 'posted', id: result.id };
  } catch (error) {
    // A timeout can occur after X accepts a post. Blind retries create duplicates.
    // Keep the claim for operator reconciliation; never reset it automatically.
    await db.query(`UPDATE social_post_outbox SET status='uncertain',error_message=$2,
      attempts=attempts+1,updated_at=NOW() WHERE id=$1`, [claim.id,String(error.message).slice(0,500)]);
    logger.error(`[Editorial] Delivery needs reconciliation: ${story.key}: ${error.message}`);
    return { key: story.key, status: 'uncertain' };
  } finally { if (imagePath) try { fs.unlinkSync(imagePath); } catch { /* temporary artifact */ } }
}

async function run(pool, xClient, { now = new Date(), logger = console, render, reader = pool, collectors = data } = {}) {
  const lock = await pool.connect();
  let locked = false;
  const leaseLost = () => { locked = false; };
  lock.on?.('error', leaseLost);
  try {
    const { rows: [row] } = await lock.query('SELECT pg_try_advisory_lock($1) AS acquired',[LOCK]);
    locked = row.acquired;
    if (!locked) return { skipped: 'another-run-active' };
    await collectors.assertMainnetFresh(pool,now);
    const activatedAt = await activationTime(pool,xClient.dryRun,now);
    const { rows: history } = await pool.query(`SELECT post_type,dedup_key,status,created_at,metadata
      FROM social_post_outbox WHERE created_at >= $1::timestamptz-interval '90 days'`, [now.toISOString()]);
    const pacing = history.some(p => p.metadata?.editorialVersion === 1 &&
      ['posted','posting','uncertain'].includes(p.status) && now-new Date(p.created_at)<20*60000);
    const candidates = [], decisions = [], scans = [];
    const collect = async (name, fn, scanKey) => {
      try {
        const result = await fn();
        if (Array.isArray(result)) candidates.push(...result);
        else if (result?.candidates) { candidates.push(...result.candidates); decisions.push(...result.decisions); }
        else if (result) candidates.push(result);
        if (scanKey) scans.push({key:scanKey,stories:Array.isArray(result)?result.map(c=>c.key):result?[result.key]:[]});
      } catch (error) {
        logger.error(`[Editorial] ${name} skipped: ${error.message}`);
        decisions.push({ key: name, reason: 'source-check-failed', detail: error.message });
      }
    };
    if (pacing) await collect('reorg', () => collectors.reorgCandidates(reader,now));
    else await collect('live', () => collectors.liveCandidates(reader,now));
    if (!pacing && now.getUTCHours() >= 6 && Date.parse(`${now.toISOString().slice(0,10)}T06:00:00Z`) >= Date.parse(activatedAt)) {
      const target = addDays(now.toISOString().slice(0,10), -1);
      const week = addDays(completedWeekEnd(now), -7);
      const includeWeekly = Date.parse(`${completedWeekEnd(now)}T06:00:00Z`) >= Date.parse(activatedAt) && !history.some(p => p.dedup_key === `analysis:week:${week}` ||
        (p.dedup_key === `activity_week:v1:${week}` && !['draft','withdrawn'].includes(p.status)));
      for (const [name, fn] of [
        ['activity', () => collectors.activityCandidates(reader,now,includeWeekly)],
        ['hashrate', () => collectors.hashrateCandidate(reader,now)],
        ['signals', () => collectors.signalCandidates(reader,now)],
        ['crosschain', () => collectors.crosschainDaily(reader,now)],
        ['milestones', () => collectors.milestoneCandidates?.(reader,now) ?? []],
      ]) {
        const key = `analysis:scan:${name}:${target}`;
        if (!history.some(p => p.dedup_key === key)) await collect(name,fn,key);
      }
    }
    const fresh = candidates.filter(c=>isNew(c,activatedAt));
    decisions.push(...candidates.filter(c=>!isNew(c,activatedAt)).map(c=>({key:c.key,reason:'before-activation'})));
    const selection = select(fresh,history,now);
    decisions.push(...selection.skipped);
    const toPublish = selection.selected.slice(0,1);
    decisions.push(...selection.selected.slice(1).map(c=>({key:c.key,reason:'paced-for-next-run'})));
    for (const decision of decisions) logger.info(`[Editorial decision] ${JSON.stringify(decision)}`);
    const results = [];
    for (const story of toPublish) {
      if (!locked) throw new Error('Sender lock connection lost');
      // Long historical reads must not permit posting against a stale tip.
      await collectors.assertMainnetFresh(pool,new Date(Math.max(now.getTime(), Date.now())));
      results.push(await publish(pool,xClient,story,{logger,render}));
    }
    if (!xClient.dryRun) for (const scan of scans) {
      // Recompute deferred analysis when its turn arrives. Do not mark it done
      // just because a higher-priority story used this run's posting slot.
      if (scan.stories.some(key=>selection.selected.slice(1).some(c=>c.key===key))) continue;
      await pool.query(`INSERT INTO social_post_outbox(post_type,dedup_key,content,metadata,status)
        VALUES ('editorial_scan',$1,'',$2::jsonb,'evaluated') ON CONFLICT(dedup_key) DO NOTHING`,
      [scan.key,JSON.stringify({ capturedAt:now.toISOString(),decisions,selected:toPublish.map(c => c.key) })]);
    }
    return { activatedAt, candidates, selected:selection.selected, decisions, results };
  } finally {
    if (locked) await lock.query('SELECT pg_advisory_unlock($1)',[LOCK]);
    lock.removeListener?.('error',leaseLost);
    lock.release();
  }
}

module.exports = { run, publish, activationTime };
