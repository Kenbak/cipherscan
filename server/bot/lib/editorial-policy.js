'use strict';

const { addDays } = require('../../lib/transaction-activity');
const { formatHashrate } = require('../../api/lib/hashrate');
const f = require('./editorial-format');
const BASE = 'https://zecblock.com';
const number = f.number;
const MARK = '🟨';

// Copy leads with the event in plain words, then one line on why it matters.
// Every claim still comes from the evidence below; the image is described by
// `card` so the tweet and the card can never disagree.
function candidate(type, key, content, evidence, score = 0) {
  if (content.length > 280) throw new Error(`Editorial copy exceeds 280 characters: ${key}`);
  return { type, key, content, evidence: { ...evidence, editorialVersion: 1, copyVersion: 2 }, score };
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

const capital = s => s[0].toUpperCase() + s.slice(1);
const positivePrice = n => (Number.isFinite(Number(n)) && Number(n) > 0 ? Number(n) : null);
const balance = zat => (Number.isFinite(Number(zat)) && Number(zat) > 0 ? Number(zat) / 1e8 : null);

function dailyActivity(activity, target) {
  if (!completeSeries(activity.days, target, 31)) return null;
  const definitions = [
    ['share', d => d.shielded + d.transparent > 0 ? 100 * d.shielded / (d.shielded + d.transparent) : NaN],
    ['shielded', d => d.shielded],
    ['fully', d => d.fully_shielded],
    ['total', d => d.shielded + d.transparent],
  ];
  // Coinbase is excluded from every count; only the total needs saying so.
  const nouns = { shielded: 'Zcash transactions used a shielded pool', fully: 'fully shielded Zcash transactions',
    total: 'Zcash transactions, excluding mining rewards' };
  const cardNouns = { share: 'of transactions used a shielded pool.', shielded: 'transactions used a shielded pool.',
    fully: 'fully shielded transactions.', total: 'transactions, excluding mining rewards.' };
  const day = f.dayText(target);
  const choices = definitions.map(([metric, get]) => {
    const values = activity.days.map(get);
    const stats = comparison(values);
    if (!stats) return null;
    const noteworthy = stats.high || stats.low || (stats.z !== null && Math.abs(stats.z) >= 3);
    const share = metric === 'share';
    const value = share ? `${stats.value.toFixed(1)}%` : number(stats.value);
    const mean = share ? `${stats.mean.toFixed(1)}%` : number(stats.mean);
    const dir = stats.value >= stats.mean ? 'above' : 'below';
    const delta = share ? `${Math.abs(stats.value - stats.mean).toFixed(1)} percentage points ${dir} the 30-day average (${mean})`
      : stats.changePct === null ? `30-day average: ${mean}` : `${Math.abs(stats.changePct).toFixed(1)}% ${dir} the 30-day average (${mean})`;
    const context = stats.high ? 'The highest in 31 days' : stats.low ? 'The lowest in 31 days' : null;
    const lead = share ? `${value} of Zcash transactions used a shielded pool on ${day}.` : `${value} ${nouns[metric]} on ${day}.`;
    const content = `${MARK} ${lead}\n\n${context ? `${context}, ${delta}` : capital(delta)}.\n\n${BASE}/privacy`;
    const shortDelta = share ? `${stats.value >= stats.mean ? '+' : '−'}${Math.abs(stats.value - stats.mean).toFixed(1)} pts vs 30-day average.`
      : stats.changePct === null ? `30-day average: ${mean}.` : `${f.signedPct(stats.changePct)} vs 30-day average.`;
    const card = { kicker: 'Activity · Daily', hero: value, tone: 'gold', line: cardNouns[metric],
      qualifier: context ? `${context}.` : shortDelta, source: 'zecblock.com/privacy', date: f.dayYear(target),
      visual: { kind: 'series', values, reference: stats.mean, referenceLabel: '30-day average' } };
    return candidate('activity_daily', `analysis:activity:${target}`, content, { ...activity, metric, stats, card },
      (noteworthy ? 20 : 0) + (share ? 2 : 0) + Math.min(Math.abs(stats.z || 0), 10));
  }).filter(Boolean);
  return choices.sort((a, b) => b.score - a.score)[0] || null;
}

function weeklyActivity(draft) {
  if (!draft) return null;
  const m = draft.metadata.metrics.find(m => m.noteworthy);
  if (!m || !Number.isFinite(m.value) || !Number.isInteger(m.rank)) return null;
  const fully = m.metric === 'fully_shielded';
  const noun = fully ? 'fully shielded Zcash transactions' : 'Zcash transactions used a shielded pool';
  const end = addDays(draft.metadata.period.endExclusive, -1);
  const doubled = m.changePct !== null && m.changePct >= 100;
  let rankLine, cardRank;
  if (m.rank === 1) {
    rankLine = m.tied ? 'Tied for the busiest week on record.' : 'The busiest week on record.';
    cardRank = m.tied ? 'Joint busiest week on record.' : 'Busiest week on record.';
  } else if (m.rank <= 10) {
    rankLine = m.tied ? `Tied for the ${f.ORDINALS[m.rank]}-busiest week on record.`
      : `Only ${f.WORDS[m.rank - 1]} week${m.rank === 2 ? '' : 's'} in Zcash history ${m.rank === 2 ? 'was' : 'were'} busier.`;
    cardRank = `${m.tied ? 'Joint ' : ''}${f.ORDINALS[m.rank]}-busiest week on record.`;
  } else if (m.weeksSince === null || m.weeksSince >= 52) {
    rankLine = m.lastAtLeast ? `The busiest week since ${f.dayYear(m.lastAtLeast)}.` : 'The busiest week on record.';
    cardRank = m.lastAtLeast ? `Busiest since ${f.dayYear(m.lastAtLeast)}.` : 'Busiest week on record.';
  } else {
    rankLine = 'More than double the week before.';
    cardRank = 'More than double the week before.';
  }
  const change = m.changePct === null || (doubled && m.rank > 10 && m.weeksSince !== null && m.weeksSince < 52) ? ''
    : ` ${m.changePct >= 0 ? 'Up' : 'Down'} ${Math.abs(m.changePct).toFixed(1)}% on the week before.`;
  const card = { kicker: 'Activity · Weekly', hero: number(m.value), tone: 'gold',
    line: fully ? 'fully shielded transactions.' : 'transactions used a shielded pool.', qualifier: cardRank,
    source: 'zecblock.com/privacy', date: f.rangeText(draft.week, end),
    visual: m.rank <= 10 ? { kind: 'rank', rank: m.rank, tied: Boolean(m.tied) } : null };
  return candidate('activity_weekly', `analysis:week:${draft.week}`,
    `${MARK} ${number(m.value)} ${noun} last week.\n\n${rankLine}${change}\n\n${BASE}/privacy`, { ...draft.metadata, card }, 80);
}

// Shared by flows and migrations: public side on top, shielded pools below.
function poolNode(name, zec, detail, style) {
  return { name, detail: zec ? `${f.zecShort(zec)} ZEC · ${detail}` : detail, style };
}

function flowStory(flow) {
  const amount = Number(flow.amount_zat), n = Number(flow.sample_count);
  const greater = Number(flow.greater_count), equal = Number(flow.equal_count);
  if (!['shield', 'deshield'].includes(flow.flow_type) || !Number.isSafeInteger(amount) || amount < 500e8 || n < 100) return null;
  // Inclusive upper tail handles ties honestly. No extrapolated percentile.
  const tailPct = 100 * (greater + equal + 1) / (n + 1);
  if (tailPct > 0.5) return null;
  if (!/^[a-f0-9]{64}$/.test(flow.txid) || !['sapling', 'orchard', 'ironwood', 'mixed'].includes(flow.pool)) return null;
  const into = flow.flow_type === 'shield';
  const pool = f.POOLS[flow.pool];
  const where = pool || 'the shielded pools';
  const price = positivePrice(flow.price_usd);
  const usd = price ? (amount / 1e8) * price : null;
  const held = balance(flow.pool_zat), transparent = balance(flow.transparent_zat);
  const tail = f.tailText(tailPct), amt = f.zecText(amount);
  const holds = held ? ` ${pool || 'Shielded pools'} now ${pool ? 'holds' : 'hold'} ${f.zecShort(held)} ZEC.` : '';
  const content = `${MARK} ${amt} ZEC${usd ? ` (${f.usdShort(usd)})` : ''} just ${into ? 'entered' : 'left'} ${where}.\n\n`
    + `One of the largest ${tail}% of ${into ? 'shielding' : 'deshielding'} transactions in 90 days.${holds}\n\n${BASE}/tx/${flow.txid}`;
  const card = { kicker: `${into ? 'Shielding' : 'Deshielding'} · ${pool || 'Shielded pools'}`, hero: `${into ? '+' : '−'}${amt}`,
    unit: 'ZEC', tone: into ? 'in' : 'out',
    line: `${into ? 'entered' : 'left'} ${where}${usd ? ` (≈ ${f.usdShort(usd)})` : '.'}`,
    qualifier: `Top ${tail}% of ${into ? 'shields' : 'deshields'} in 90 days.`,
    source: `zecblock.com/tx/${f.shortTxid(flow.txid)}`, date: f.timeText(Number(flow.block_time)),
    visual: { kind: 'transfer', direction: into ? 'down' : 'up',
      top: poolNode('Transparent', transparent, 'public', 'outline'),
      bottom: poolNode(pool || 'Shielded pools', held, 'shielded', flow.pool === 'mixed' ? 'gold' : flow.pool) } };
  return candidate(`flow_${flow.flow_type}`, `large_flow:${flow.txid}`, content, { ...flow, tailPct, usd, card }, amount / 1e8);
}

function swapStory(swap) {
  const usd = Number(swap.source_amount_usd), n = Number(swap.sample_count);
  const larger = Number(swap.greater_count), equal = Number(swap.equal_count);
  if (!Number.isFinite(usd) || usd < 50000 || n < 100 || !swap.source_chain || !swap.dest_chain) return null;
  const tailPct = 100 * (larger + equal + 1) / (n + 1);
  if (tailPct > 1) return null;
  if (![swap.source_chain, swap.dest_chain].every(c => /^[a-z0-9_-]{1,16}$/i.test(c))) return null;
  const into = swap.dest_chain.toLowerCase() === 'zec';
  if (!into && swap.source_chain.toLowerCase() !== 'zec') return null;
  const other = into ? swap.source_chain : swap.dest_chain;
  const route = into ? `from ${f.chainName(other)} into ZEC` : `from ZEC to ${f.chainName(other)}`;
  const largest = larger === 0 && equal === 0;
  const tail = f.tailText(tailPct);
  const url = /^[a-f0-9]{64}$/.test(swap.zec_txid || '') ? `${BASE}/tx/${swap.zec_txid}` : `${BASE}/crosschain`;
  const content = `${MARK} $${number(usd)} just crossed ${route}.\n\n`
    + `${largest ? 'The largest ZEC swap' : `One of the largest ${tail}% of ZEC swaps`} we've tracked on NEAR Intents in 30 days.\n\n${url}`;
  const card = { kicker: 'Cross-chain · NEAR Intents', hero: `$${number(usd)}`, tone: into ? 'in' : 'out',
    line: `crossed ${route}.`, qualifier: largest ? 'Largest ZEC swap in 30 days.' : `Top ${tail}% of ZEC swaps in 30 days.`,
    source: url.startsWith(`${BASE}/tx/`) ? `zecblock.com/tx/${f.shortTxid(swap.zec_txid)}` : 'zecblock.com/crosschain',
    date: f.timeText(Date.parse(swap.swap_created_at) / 1000),
    visual: { kind: 'swap', from: swap.source_chain.toLowerCase(), to: swap.dest_chain.toLowerCase() } };
  return candidate('swap', `cross_chain:${swap.id}`, content,
    { ...swap, tailPct, exceptional: usd >= 1000000 && tailPct <= 0.1, card }, usd);
}

function migrationStory(row) {
  const amount = Number(row.amount_zat);
  if (!Number.isSafeInteger(amount) || amount <= 0 || !/^[a-f0-9]{64}$/.test(row.txid)) return null;
  const price = positivePrice(row.price_usd);
  const usd = price ? (amount / 1e8) * price : null;
  const ironwood = balance(row.ironwood_zat), orchard = balance(row.orchard_zat);
  const amt = f.zecText(amount);
  const content = `${MARK} ${amt} ZEC${usd ? ` (${f.usdShort(usd)})` : ''} just moved from Orchard to Ironwood.\n\n`
    + `A pool-to-pool migration, so no new ZEC was shielded.${ironwood ? ` Ironwood now holds ${f.zecShort(ironwood)} ZEC.` : ''}\n\n${BASE}/tx/${row.txid}`;
  const card = { kicker: 'Migration · Orchard → Ironwood', hero: amt, unit: 'ZEC', tone: 'ironwood',
    line: `moved to Ironwood${usd ? ` (≈ ${f.usdShort(usd)})` : '.'}`, qualifier: 'Pool migration, not new shielding.',
    source: `zecblock.com/tx/${f.shortTxid(row.txid)}`, date: f.timeText(Number(row.block_time)),
    visual: { kind: 'transfer', direction: 'down', top: poolNode('Orchard', orchard, 'closed to deposits', 'orchard'),
      bottom: poolNode('Ironwood', ironwood, 'shielded', 'ironwood') } };
  return candidate('migration', `migration:${row.txid}`, content, { ...row, usd, card }, 10);
}

function reorgStory(row) {
  const depth = Number(row.depth), height = Number(row.fork_height);
  if (!Number.isInteger(depth) || depth < 2 || !Number.isInteger(height)) return null;
  const content = `${MARK} Zcash just had a ${depth}-block reorg at height ${number(height)}.\n\n`
    + `Recent transactions may show new confirmation counts while the chain settles.\n\n${BASE}/network`;
  const card = { kicker: 'Network · Reorg', hero: String(depth), unit: depth === 1 ? 'block' : 'blocks', tone: 'gold',
    line: `reorganized at height ${number(height)}.`, qualifier: 'Recent confirmations may change.',
    source: 'zecblock.com/network', date: f.timeText(Date.parse(row.detected_at) / 1000),
    visual: { kind: 'reorg', depth: Math.min(depth, 6) } };
  return candidate('reorg', `reorg:${row.id}`, content, { ...row, card }, 100);
}

function crosschainStory(row, target) {
  const inflow = Number(row.inflow), outflow = Number(row.outflow), net = inflow - outflow;
  const [src, dst] = String(row.top_route).split(' -> ');
  if (![src, dst].every(c => /^[a-z0-9_-]{1,16}$/i.test(c || ''))) return null;
  const usd = n => `$${number(Math.round(n))}`;
  const route = `${f.chainName(src)} → ${f.chainName(dst)}`;
  const content = `${MARK} Net ${usd(Math.abs(net))} flowed ${net >= 0 ? 'into' : 'out of'} ZEC via NEAR Intents on ${f.dayText(target)}.\n\n`
    + `${usd(inflow)} in, ${usd(outflow)} out. Top route: ${route}. Largest swap: ${usd(Number(row.largest))}.\n\n${BASE}/crosschain`;
  const card = { kicker: 'Cross-chain · Daily', hero: `${net >= 0 ? '+' : '−'}${f.usdShort(Math.abs(net))}`, tone: net >= 0 ? 'in' : 'out',
    line: `net ${net >= 0 ? 'into' : 'out of'} ZEC via NEAR Intents.`, qualifier: `Top route: ${route}.`,
    source: 'zecblock.com/crosschain', date: f.dayYear(target),
    visual: { kind: 'bars', items: [{ label: 'Into ZEC', value: inflow, display: f.usdShort(inflow), tone: 'in' },
      { label: 'Out of ZEC', value: outflow, display: f.usdShort(outflow), tone: 'out' }] } };
  return candidate('crosschain_daily', `analysis:crosschain:${target}`, content, { ...row, target, card }, 5);
}

function hashStory(history, { target, genesisComplete }) {
  if (history.method !== 'target-work-v1' || history.window !== '7d') return null;
  const rows = history.points;
  const last = rows.at(-1);
  const end = `${addDays(target, 1)}T00:00:00.000Z`;
  if (!last || last.date !== end) return null;
  const valid = p => p.method === 'target-work-v1' && p.windowSeconds === 604800 && p.unavailableReason === null && Number.isFinite(p.hashrate) && p.hashrate > 0;
  if (!valid(last)) return null;
  let label, samples;
  const contiguous = points => points.every((p, i) => valid(p) && p.date === new Date(Date.parse(end) - (points.length - 1 - i) * 86400000).toISOString());
  if (rows.length >= 366 && genesisComplete && contiguous(rows) && comparison(rows.map(p => p.hashrate)).high) {
    label = 'New all-time high'; samples = rows;
  } else {
    for (const days of [90, 30]) {
      const window = rows.slice(-(days + 1));
      if (window.length !== days + 1 || !contiguous(window)) continue;
      const s = comparison(window.map(p => p.hashrate));
      if (s.high) { label = `Highest in ${days + 1} days`; samples = window; break; }
    }
  }
  if (!samples) return null;
  const stats = comparison(samples.map(p => p.hashrate));
  // Avoid posting every tiny new record. Delivery also enforces a 7-day cooldown.
  const previousPeak = Math.max(...samples.slice(0, -1).map(p => p.hashrate));
  if (last.hashrate < previousPeak * 1.01) return null;
  const change = (100 * (last.hashrate / previousPeak - 1)).toFixed(1);
  const formatted = formatHashrate(last.hashrate);
  const [value, ...unit] = formatted.split(' ');
  // Chart the samples behind the claim only, at most the last 91 days.
  const series = samples.slice(-91).map(p => p.hashrate);
  const card = { kicker: 'Network · Hashrate', hero: value, unit: unit.join(' '), tone: 'gold', line: `${label}.`,
    qualifier: `7-day average, +${change}% on the last peak.`, source: 'zecblock.com/network', date: f.dayYear(target),
    visual: { kind: 'series', values: series, reference: previousPeak, referenceLabel: 'previous peak' } };
  return candidate('hashrate', `analysis:hashrate:${target}`,
    `${MARK} ${label}: Zcash hashrate hit ${formatted}.\n\nThe 7-day average is up ${change}% on the previous peak.\n\n${BASE}/network`,
    { target, method: history.method, window: history.window, point: last, previousPeak, stats, historyStart: samples[0].date, genesisComplete, allTime: label.startsWith('New all-time'), card }, 60);
}

const SIGNALS = {
  mvrv: { kicker: 'MVRV', format: n => n.toFixed(2), unit: null, url: 'valuation', line: 'Zcash MVRV ratio.',
    lead: (v, d, c) => `Zcash MVRV hit ${v} on ${d}, ${c}.`,
    note: 'MVRV compares market cap with an estimated realized cap. It is a valuation gauge, not a forecast.' },
  exchange_deposit_zat: { kicker: 'Exchange deposits', format: n => number(n / 1e8, 1), unit: 'ZEC', url: 'turnstile', line: 'moved to known exchanges.',
    lead: (v, d, c) => `${v} ZEC moved to known exchange addresses on ${d}, ${c}.`,
    note: 'Tracked transparent deposits only. A deposit is not necessarily a sale.' },
  daily_fees_zat: { kicker: 'Fees', format: n => number(n / 1e8, 2), unit: 'ZEC', url: 'network', line: 'paid in transaction fees.',
    lead: (v, d, c) => `Zcash paid ${v} ZEC in transaction fees on ${d}, ${c}.`, note: null },
  shield_volume_zat: { kicker: 'Shielding', format: n => number(n / 1e8, 1), unit: 'ZEC', url: 'privacy', line: 'shielded in one day.',
    lead: (v, d, c) => `${v} ZEC was shielded on ${d}, ${c}.`,
    note: 'Public flows into shielded pools; pool-to-pool migrations are not counted.' },
  deshield_volume_zat: { kicker: 'Deshielding', format: n => number(n / 1e8, 1), unit: 'ZEC', url: 'privacy', line: 'deshielded in one day.',
    lead: (v, d, c) => `${v} ZEC was deshielded on ${d}, ${c}.`,
    note: 'Public flows out of shielded pools; pool-to-pool migrations are not counted.' },
};

function signalStory(metric, rows, target) {
  const d = SIGNALS[metric];
  if (!d || !completeSeries(rows, target, 31)) return null;
  const values = rows.map(r => r.value == null ? NaN : Number(r.value));
  const stats = comparison(values);
  if (!stats || stats.changePct === null || Math.abs(stats.changePct) < 20 || (!stats.high && !stats.low && Math.abs(stats.z || 0) < 3)) return null;
  const extreme = stats.high ? ', the highest in 31 days' : stats.low ? ', the lowest in 31 days' : '';
  const context = `${Math.abs(stats.changePct).toFixed(1)}% ${stats.changePct >= 0 ? 'above' : 'below'} its 30-day average${extreme}`;
  const lead = d.lead(d.format(stats.value), f.dayText(target), context);
  const scale = metric.endsWith('_zat') ? 1e8 : 1;
  const card = { kicker: `Signal · ${d.kicker}`, hero: d.format(stats.value), unit: d.unit, tone: 'gold', line: d.line,
    qualifier: `${f.signedPct(stats.changePct)} vs 30-day average.`, source: `zecblock.com/${d.url}`, date: f.dayYear(target),
    visual: { kind: 'series', values: values.map(v => v / scale), reference: stats.mean / scale, referenceLabel: '30-day average' } };
  return candidate('network_signal', `analysis:signal:${metric}:${target}`,
    `${MARK} ${lead}${d.note ? `\n\n${d.note}` : ''}\n\n${BASE}/${d.url}`, { metric, rows, stats, target, card }, Math.abs(stats.z || 0));
}

// Round-number milestones on completed UTC days. A level posts only when the
// day's close is the first ever at or above it, so a balance hovering around
// a level cannot re-trigger; the outbox key also makes each level one-time.
const MILESTONES = {
  ironwood_zec: { step: 250000, value: r => balance(r.ironwood_pool_size), url: 'pools', kicker: 'Milestone · Ironwood' },
  shielded_zec: { step: 250000, value: r => balance(r.pool_size), url: 'pools', kicker: 'Milestone · Shielded ZEC' },
  shielded_share: { step: 1, value: r => (Number(r.chain_supply) > 0 && Number(r.pool_size) > 0 ? 100 * Number(r.pool_size) / Number(r.chain_supply) : null), url: 'privacy', kicker: 'Milestone · Shielded share' },
  shielded_usd: { step: 1e9, value: r => (balance(r.pool_size) && positivePrice(r.price_usd) ? balance(r.pool_size) * Number(r.price_usd) : null), url: 'pools', kicker: 'Milestone · Shielded value' },
};

function milestoneStories(rows, target) {
  const today = rows.at(-1);
  if (!today || today.date !== target) return [];
  const stories = [];
  for (const [metric, m] of Object.entries(MILESTONES)) {
    const value = m.value(today);
    const prior = rows.slice(0, -1).map(m.value).filter(v => Number.isFinite(v));
    // Thin history could make an old level look new; require a real baseline.
    if (!Number.isFinite(value) || prior.length < 30) continue;
    const level = Math.floor(value / m.step) * m.step;
    if (level <= 0 || Math.max(...prior) >= level) continue;
    const shielded = balance(today.pool_size), supply = balance(today.chain_supply);
    const price = positivePrice(today.price_usd);
    const usd = zec => (price ? ` (${f.usdShort(zec * price)})` : '');
    const day = f.dayText(target);
    let content, hero, unit = 'ZEC', line, qualifier;
    if (metric === 'ironwood_zec') {
      content = `Milestone: Ironwood crossed ${f.levelText(level)} ZEC.\n\nIt held ${f.zecShort(value)} ZEC${usd(value)} at the end of ${day}${shielded ? `, ${Math.floor(100 * value / shielded)}% of all shielded ZEC` : ''}.`;
      hero = f.levelText(level); line = 'now in Ironwood.';
      qualifier = shielded ? `${Math.floor(100 * value / shielded)}% of all shielded ZEC.` : `${f.zecShort(value)} ZEC at close.`;
    } else if (metric === 'shielded_zec') {
      content = `Milestone: shielded ZEC crossed ${f.levelText(level)}.\n\n${f.zecShort(value)} ZEC${usd(value)} sat in shielded pools at the end of ${day}${supply ? `, ${(Math.floor(1000 * value / supply) / 10).toFixed(1)}% of all ZEC` : ''}.`;
      hero = f.levelText(level); line = 'now shielded.';
      qualifier = supply ? `${(Math.floor(1000 * value / supply) / 10).toFixed(1)}% of all ZEC.` : `${f.zecShort(value)} ZEC at close.`;
    } else if (metric === 'shielded_share') {
      content = `Milestone: ${level}% of all ZEC is now shielded.\n\n${f.zecShort(shielded)} of ${f.zecShort(supply)} ZEC sat in shielded pools at the end of ${day}.`;
      hero = `${level}%`; unit = null; line = 'of all ZEC is shielded.'; qualifier = `${f.zecShort(shielded)} of ${f.zecShort(supply)} ZEC.`;
    } else {
      content = `Milestone: shielded ZEC is worth more than $${level / 1e9}B for the first time on record.\n\n${f.zecShort(shielded)} ZEC at $${number(price, 2)} at the end of ${day}.`;
      hero = `$${level / 1e9}B`; unit = null; line = 'in shielded ZEC.'; qualifier = 'First time on record.';
    }
    const series = rows.slice(-90).map(m.value).map(v => (Number.isFinite(v) ? v : 0));
    const card = { kicker: m.kicker, hero, unit, tone: metric === 'ironwood_zec' ? 'ironwood' : 'gold', line, qualifier,
      source: `zecblock.com/${m.url}`, date: f.dayYear(target),
      visual: { kind: 'series', values: series, reference: level, referenceLabel: metric === 'shielded_share' ? `${level}%` : metric === 'shielded_usd' ? `$${level / 1e9}B` : `${f.levelText(level)} ZEC` } };
    stories.push(candidate('milestone', `milestone:${metric}:${level}`, `${MARK} ${content}\n\n${BASE}/${m.url}`,
      { metric, level, value, target, priorMax: Math.max(...prior), card }, { ironwood_zec: 4, shielded_zec: 3, shielded_share: 2, shielded_usd: 1 }[metric]));
  }
  return stories;
}

// Two ordinary swaps spread across UTC half-days; a separate exceptional slot
// stays available all day. Each flow direction gets its own two-post allowance.
function select(candidates, history, now) {
  const today = now.toISOString().slice(0, 10);
  const recent = history.filter(p => ['posted','posting','uncertain'].includes(p.status));
  const used = new Set(history.map(p => p.dedup_key));
  const selected = [], skipped = [];
  const priority = c => ({ reorg:100, flow_shield:90, flow_deshield:90, milestone:85, activity_weekly:80,
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
    if (!reason && ['migration','crosschain_daily','milestone'].includes(c.type) && dayPosts.length) reason = 'daily-cap';
    if (!reason && c.type === 'network_signal' && dayPosts.length >= 1) reason = 'signal-daily-cap';
    if (reason) { skipped.push({ key: c.key, reason }); continue; }
    selected.push(c); used.add(c.key);
    recent.push({ post_type: c.type, status: 'posting', created_at: now.toISOString(), metadata: c.evidence });
  }
  return { selected, skipped };
}

module.exports = { candidate, comparison, completeSeries, dailyActivity, weeklyActivity, flowStory, swapStory,
  migrationStory, reorgStory, crosschainStory, hashStory, signalStory, milestoneStories, select, eventTime, isNew };
