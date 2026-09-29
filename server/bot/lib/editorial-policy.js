'use strict';

const { addDays } = require('../../lib/transaction-activity');
const { formatHashrate } = require('../../api/lib/hashrate');
const BASE = 'https://cipherscan.app';
const number = (n, digits = 0) => n.toLocaleString('en-US', { maximumFractionDigits: digits });

// Templates use ASCII plus ordinary punctuation and deliberately fit without
// truncation. Keep the full URL/identifier and the methodological qualification.
function candidate(type, key, content, evidence, score = 0) {
  if (content.length > 280) throw new Error(`Editorial copy exceeds 280 characters: ${key}`);
  return { type, key, content, evidence: { ...evidence, editorialVersion: 1 }, score };
}

function eventTime(story) {
  if (story.type.startsWith('flow_') || story.type === 'migration') return Number(story.evidence.block_time) * 1000;
  if (story.type === 'swap') return Date.parse(story.evidence.swap_created_at);
  if (story.type === 'reorg') return Date.parse(story.evidence.detected_at);
  if (story.type === 'activity_weekly') return Date.parse(`${story.evidence.period.endExclusive}T06:00:00Z`);
  // Daily stories become eligible only as a newly completed reporting period,
  // after the six-hour data settling window. Their observations remain dated.
  const target = story.evidence.target || story.key.split(':').at(-1);
  return Date.parse(`${addDays(target, 1)}T06:00:00Z`);
}

function isNew(story, activatedAt) {
  const time = eventTime(story);
  return Number.isFinite(time) && time >= Date.parse(activatedAt);
}

function comparison(values) {
  if (!values.length || values.some(v => !Number.isFinite(v) || v < 0)) return null;
  const value = values.at(-1), prior = values.slice(0, -1);
  if (!prior.length) return null;
  const mean = prior.reduce((a, b) => a + b, 0) / prior.length;
  const std = Math.sqrt(prior.reduce((s, v) => s + (v - mean) ** 2, 0) / prior.length);
  return { value, mean, previous: prior.at(-1), samples: prior.length,
    changePct: mean > 0 ? 100 * (value / mean - 1) : null,
    z: std > 0 ? (value - mean) / std : null,
    greater: prior.filter(v => v > value).length, equal: prior.filter(v => v === value).length,
    high: value > Math.max(...prior), low: value < Math.min(...prior) };
}

function completeSeries(rows, target, length) {
  return rows.length === length && rows.every((r, i) => r.date === addDays(target, i - length + 1));
}

function dailyActivity(activity, target) {
  if (!completeSeries(activity.days, target, 31)) return null;
  const definitions = [
    ['share', 'Shielded transaction share', d => d.shielded + d.transparent > 0 ? 100 * d.shielded / (d.shielded + d.transparent) : NaN],
    ['shielded', 'Transactions involving shielded pools', d => d.shielded],
    ['fully', 'Fully shielded transactions', d => d.fully_shielded],
    ['total', 'Zcash transactions', d => d.shielded + d.transparent],
  ];
  const choices = definitions.map(([metric, label, get]) => {
    const stats = comparison(activity.days.map(get));
    if (!stats) return null;
    const noteworthy = stats.high || stats.low || (stats.z !== null && Math.abs(stats.z) >= 3);
    const value = metric === 'share' ? `${stats.value.toFixed(1)}%` : number(stats.value);
    const mean = metric === 'share' ? `${stats.mean.toFixed(1)}%` : number(stats.mean);
    const difference = metric === 'share'
      ? `${Math.abs(stats.value - stats.mean).toFixed(1)} percentage points`
      : stats.changePct === null ? null : `${Math.abs(stats.changePct).toFixed(1)}%`;
    const context = stats.high ? 'Highest in 31 completed days.' : stats.low ? 'Lowest in 31 completed days.' : '';
    const delta = difference === null ? `Prior 30-day mean: ${mean}.` : `${difference} ${stats.value >= stats.mean ? 'above' : 'below'} prior 30-day mean (${mean}).`;
    const caveat = metric === 'fully' ? 'No transparent I/O; migrations included.' : 'Coinbase excluded; counts do not measure users.';
    return candidate('activity_daily', `analysis:activity:${target}`, `${label}: ${value}. ${context}\n${target} UTC. ${delta}\n${caveat}\n${BASE}/privacy`,
      { ...activity, metric, stats }, (noteworthy ? 20 : 0) + (metric === 'share' ? 2 : 0) + Math.min(Math.abs(stats.z || 0), 10));
  }).filter(Boolean);
  return choices.sort((a, b) => b.score - a.score)[0] || null;
}

function weeklyActivity(draft) {
  if (!draft) return null;
  const m = draft.metadata.metrics.find(m => m.noteworthy);
  if (!m || !Number.isFinite(m.value) || !Number.isInteger(m.rank)) return null;
  const rank = `${m.tied ? 'Joint r' : 'R'}ank #${m.rank} among complete weeks since 2016-10-31.`;
  const title = m.metric === 'fully_shielded' ? 'Fully shielded transactions' : 'Transactions involving shielded pools';
  const change = m.changePct === null ? '' : ` ${m.changePct >= 0 ? '+' : ''}${m.changePct.toFixed(1)}% vs previous week.`;
  const note = m.metric === 'fully_shielded' ? 'Coinbase excluded; no transparent I/O; migrations included.' : 'Coinbase excluded; includes migrations.';
  return candidate('activity_weekly', `analysis:week:${draft.week}`, `${title}: ${number(m.value)}.${change}\n${draft.week} to ${addDays(draft.metadata.period.endExclusive, -1)} UTC. ${rank}\n${note}\n${BASE}/privacy`, draft.metadata, 80);
}

function flowStory(flow) {
  const amount = Number(flow.amount_zat), n = Number(flow.sample_count);
  const greater = Number(flow.greater_count), equal = Number(flow.equal_count);
  if (!['shield', 'deshield'].includes(flow.flow_type) || !Number.isSafeInteger(amount) || amount < 500e8 || n < 100) return null;
  // Inclusive upper tail handles ties honestly. No extrapolated percentile.
  const tailPct = 100 * (greater + equal + 1) / (n + 1);
  if (tailPct > 0.5) return null;
  if (!/^[a-f0-9]{64}$/.test(flow.txid) || !['sapling','orchard','ironwood','mixed'].includes(flow.pool)) return null;
  const verb = flow.flow_type === 'shield' ? 'shielded' : 'deshielded';
  const pool = flow.pool === 'mixed' ? 'across pools' : `${flow.flow_type === 'shield' ? 'into' : 'from'} ${flow.pool}`;
  const roundedTail = Math.max(0.01, Math.ceil(tailPct * 100) / 100).toFixed(2);
  return candidate(`flow_${flow.flow_type}`, `large_flow:${flow.txid}`, `${number(amount / 1e8, 2)} ZEC ${verb} ${pool}.\nTop ${roundedTail}% by size vs ${number(n)} prior ${verb} flows over 90 days (ties included).\nPublic net pool flow, not private transfer volume.\n${BASE}/tx/${flow.txid}`, { ...flow, tailPct }, amount / 1e8);
}

function swapStory(swap) {
  const usd = Number(swap.source_amount_usd), n = Number(swap.sample_count);
  const larger = Number(swap.greater_count), equal = Number(swap.equal_count);
  if (!Number.isFinite(usd) || usd < 50000 || n < 100 || !swap.source_chain || !swap.dest_chain) return null;
  const tailPct = 100 * (larger + equal + 1) / (n + 1);
  if (tailPct > 1) return null;
  const route = `${swap.source_chain.toUpperCase()} -> ${swap.dest_chain.toUpperCase()}`;
  if (!/^[A-Z0-9 _>-]{1,35}$/.test(route)) return null;
  const rank = larger + 1;
  const url = /^[a-f0-9]{64}$/.test(swap.zec_txid || '') ? `${BASE}/tx/${swap.zec_txid}` : `${BASE}/crosschain`;
  return candidate('swap', `cross_chain:${swap.id}`, `$${number(usd)} ${route} swap completed.\n${equal ? 'Joint r' : 'R'}ank #${rank} by reported source USD vs ${number(n)} prior completed external ZEC swaps in our 30-day NEAR 1Click sample.\n${url}`, { ...swap, tailPct, exceptional: usd >= 1000000 && tailPct <= 0.1 }, usd);
}

function hashStory(history, { target, genesisComplete }) {
  if (history.method !== 'target-work-v1' || history.window !== '7d') return null;
  const rows = history.points;
  const last = rows.at(-1);
  const end = `${addDays(target, 1)}T00:00:00.000Z`;
  if (!last || last.date !== end) return null;
  const valid = p => p.method === 'target-work-v1' && p.windowSeconds === 604800 && p.unavailableReason === null && Number.isFinite(p.hashrate) && p.hashrate > 0;
  if (!valid(last)) return null;
  let label, stats, samples;
  const contiguous = points => points.every((p, i) => valid(p) && p.date === new Date(Date.parse(end) - (points.length - 1 - i) * 86400000).toISOString());
  if (rows.length >= 366 && genesisComplete && contiguous(rows) && comparison(rows.map(p => p.hashrate)).high) {
    label = 'New all-time high in daily samples'; samples = rows;
  } else {
    for (const days of [90, 30]) {
      const window = rows.slice(-(days + 1));
      if (window.length !== days + 1 || !contiguous(window)) continue;
      const s = comparison(window.map(p => p.hashrate));
      if (s.high) { label = `Highest daily sample in ${days + 1} days`; samples = window; break; }
    }
  }
  if (!samples) return null;
  stats = comparison(samples.map(p => p.hashrate));
  // Avoid posting every tiny new record. Delivery also enforces a 7-day cooldown.
  const previousPeak = Math.max(...samples.slice(0, -1).map(p => p.hashrate));
  if (last.hashrate < previousPeak * 1.01) return null;
  const change = 100 * (last.hashrate / previousPeak - 1);
  return candidate('hashrate', `analysis:hashrate:${target}`, `Zcash estimated hashrate: ${formatHashrate(last.hashrate)}.\n${label}; ${change.toFixed(1)}% above previous peak.\n7-day target-work estimate ending ${addDays(target, 1)} 00:00 UTC; daily samples, not instantaneous hashrate.\n${BASE}/network`,
    { target, method: history.method, window: history.window, point: last, previousPeak, stats, historyStart: samples[0].date, genesisComplete, allTime: label.startsWith('New all-time') }, 60);
}

const SIGNALS = {
  mvrv: { title: 'Zcash estimated MVRV', format: n => n.toFixed(2), note: 'Market cap / modeled realized cap; shielded cost basis is estimated. Not a price forecast.', url: 'valuation' },
  exchange_deposit_zat: { title: 'Transfers to labeled exchanges', format: n => `${number(n / 1e8, 1)} ZEC`, note: 'Tracked transparent destinations; deposits do not establish sales.', url: 'turnstile' },
  daily_fees_zat: { title: 'Zcash transaction fees', format: n => `${number(n / 1e8, 2)} ZEC`, note: 'Total fees on the indexed canonical chain; not fees per transaction.', url: 'network' },
  shield_volume_zat: { title: 'Zcash shielding', format: n => `${number(n / 1e8, 1)} ZEC`, note: 'Public net flows into pools; excludes internal pool migrations.', url: 'privacy' },
  deshield_volume_zat: { title: 'Zcash deshielding', format: n => `${number(n / 1e8, 1)} ZEC`, note: 'Public net flows out of pools; excludes internal pool migrations.', url: 'privacy' },
};

function signalStory(metric, rows, target) {
  const definition = SIGNALS[metric];
  if (!definition || !completeSeries(rows, target, 31)) return null;
  const stats = comparison(rows.map(r => r.value == null ? NaN : Number(r.value)));
  if (!stats || stats.changePct === null || Math.abs(stats.changePct) < 20 || (!stats.high && !stats.low && Math.abs(stats.z || 0) < 3)) return null;
  const context = `${Math.abs(stats.changePct).toFixed(1)}% ${stats.changePct >= 0 ? 'above' : 'below'} prior 30-day mean (${definition.format(stats.mean)}).`;
  return candidate('network_signal', `analysis:signal:${metric}:${target}`, `${definition.title}: ${definition.format(stats.value)}.\n${target} UTC: ${context}\n${definition.note}\n${BASE}/${definition.url}`, { metric, rows, stats }, Math.abs(stats.z || 0));
}

// Two ordinary swaps spread across UTC half-days; a separate exceptional slot
// stays available all day. Each flow direction gets its own two-post allowance.
function select(candidates, history, now) {
  const today = now.toISOString().slice(0, 10);
  const recent = history.filter(p => ['posted','posting','uncertain'].includes(p.status));
  const used = new Set(history.map(p => p.dedup_key));
  const selected = [], skipped = [];
  const priority = c => ({ reorg:100, flow_shield:90, flow_deshield:90, activity_weekly:80,
    hashrate:75, activity_daily:70, network_signal:60, swap:c.evidence.exceptional?95:40,
    crosschain_daily:30, migration:20 }[c.type] || 0);
  for (const c of [...candidates].sort((a, b) => priority(b)-priority(a) || b.score-a.score)) {
    let reason = used.has(c.key) ? 'duplicate-or-held' : null;
    const same = recent.filter(p => p.post_type === c.type);
    const dayPosts = same.filter(p => new Date(p.created_at).toISOString().slice(0, 10) === today);
    if (!reason && c.type.startsWith('flow_') && dayPosts.length >= 2) reason = 'direction-daily-cap';
    if (!reason && c.type === 'swap') {
      const exceptional = c.evidence.exceptional;
      const slot = exceptional ? 'exceptional' : now.getUTCHours() < 12 ? 'am' : 'pm';
      if (dayPosts.some(p => p.metadata?.slot === slot)) reason = `swap-${slot}-slot-used`;
      c.evidence.slot = slot;
    }
    if (!reason && ['hashrate','network_signal'].includes(c.type)) {
      const comparable = same.filter(p => c.type !== 'network_signal' || p.metadata?.metric === c.evidence.metric);
      const latest = comparable.filter(p => now-new Date(p.created_at)<7*86400000)
        .sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))[0];
      if (latest) {
        const previous = c.type === 'hashrate' ? latest.metadata?.point?.hashrate : latest.metadata?.stats?.value;
        const value = c.type === 'hashrate' ? c.evidence.point?.hashrate : c.evidence.stats?.value;
        const materialChange = Number.isFinite(previous) && previous>0 && Number.isFinite(value) &&
          (c.type === 'hashrate' ? value>=previous*1.05 : Math.abs(value/previous-1)>=0.25);
        if (!materialChange) reason = 'seven-day-topic-cooldown';
      }
    }
    if (!reason && ['migration','crosschain_daily'].includes(c.type) && dayPosts.length) reason = 'daily-cap';
    if (!reason && c.type === 'network_signal' && dayPosts.length >= 1) reason = 'signal-daily-cap';
    if (reason) { skipped.push({ key: c.key, reason }); continue; }
    selected.push(c); used.add(c.key);
    recent.push({ post_type: c.type, status: 'posting', created_at: now.toISOString(), metadata: c.evidence });
  }
  return { selected, skipped };
}

module.exports = { candidate, comparison, completeSeries, dailyActivity, weeklyActivity, flowStory, swapStory, hashStory, signalStory, select, eventTime, isNew };
