'use strict';

const { addDays, HISTORY_START } = require('./transaction-activity');
const METRICS = { shielded: 'Transactions involving shielded pools', fully_shielded: 'Fully shielded transactions' };
const METHODOLOGY = 'Mainnet canonical indexed transactions, counted once across Sprout, Sapling, Orchard and Ironwood; coinbase excluded. Monday–Sunday UTC, end exclusive. Fully shielded means zero transparent inputs and outputs; includes pool migrations. Counts do not identify users, payments, private value transferred or causes.';

function completedWeekEnd(now) {
  // Two hours for week-end indexing/reorg settling. This is not finality.
  const settled = new Date(now.getTime() - 2 * 3600000);
  return addDays(settled.toISOString().slice(0, 10), -((settled.getUTCDay() + 6) % 7));
}

function weeklySeries(days, end) {
  if (days[0]?.date !== HISTORY_START || days.at(-1)?.date !== addDays(end, -1)) throw new Error('Historical coverage is incomplete');
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) {
    const slice = days.slice(i, i + 7);
    if (slice.length !== 7 || slice.some((d, j) => d.date !== addDays(HISTORY_START, i + j))) throw new Error('Missing day in historical coverage');
    const row = { week: slice[0].date, shielded: 0, fully_shielded: 0 };
    for (const d of slice) for (const metric of Object.keys(METRICS)) {
      if (!Number.isSafeInteger(d[metric]) || d[metric] < 0) throw new Error('Invalid historical count');
      row[metric] += d[metric];
    }
    weeks.push(row);
  }
  return weeks;
}

function summarize(weeks, metric) {
  const current = weeks.at(-1);
  const prior = weeks.slice(0, -1);
  const value = current[metric];
  const previous = prior.at(-1)[metric];
  const lastAtLeast = prior.findLast(row => row[metric] >= value)?.week ?? null;
  const rank = 1 + prior.filter(row => row[metric] > value).length;
  const tied = prior.some(row => row[metric] === value);
  const changePct = previous > 0 ? (value / previous - 1) * 100 : null;
  const weeksSince = lastAtLeast ? (Date.parse(current.week) - Date.parse(lastAtLeast)) / 604800000 : null;
  return { metric, label: METRICS[metric], value, previous, rank, tied, lastAtLeast, weeksSince, changePct,
    noteworthy: value >= 1000 && (rank <= 10 || weeksSince === null || weeksSince >= 52 || changePct >= 100) };
}

function ordinal(n) {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
  return `${n}${suffix}`;
}

function makeDraft(activity, end) {
  const weeks = weeklySeries(activity.days, end);
  if (weeks.length < 53) throw new Error('At least one year of complete weeks is required');
  const metrics = Object.keys(METRICS).map(metric => summarize(weeks, metric));
  if (!metrics.some(m => m.noteworthy)) return null;
  const current = weeks.at(-1);
  const lead = metrics.find(m => m.noteworthy);
  const fmt = n => n.toLocaleString('en-US');
  const rankText = `${lead.tied ? 'joint ' : ''}${ordinal(lead.rank)}-highest complete week`;
  const historical = lead.weeksSince >= 52 ? ` Highest since the week of ${lead.lastAtLeast}.` : '';
  const content = `${lead.label}: ${fmt(lead.value)} — ${rankText}.${historical}\n\n${current.week} to ${addDays(end, -1)} UTC. Coinbase excluded.\n\nSource: CipherScan`;
  const full = metrics[1];
  const alternative = full.changePct === null ? null : `Fully shielded transactions ${full.changePct >= 0 ? 'rose' : 'fell'} from ${fmt(full.previous)} to ${fmt(full.value)} week over week (${Math.abs(full.changePct).toFixed(1)}%).\n\nNo transparent inputs or outputs. Includes pool migrations.\n\n${current.week} to ${addDays(end, -1)} UTC. Source: CipherScan.`;
  return {
    week: current.week, content,
    metadata: { version: 1, network: 'mainnet', status: 'needs_review', period: { start: current.week, endExclusive: end },
      methodology: METHODOLOGY, source: 'transactions + blocks (repeatable-read snapshot)',
      sourceUrl: 'https://cipherscan.app/privacy', historyStart: HISTORY_START,
      capturedAt: activity.capturedAt, tip: activity.tip, metrics, chart: weeks, alternativeDraft: alternative,
      caveats: ['Review before posting. Rankings can change after reorgs or indexing corrections.',
        'First partial launch week omitted. Current incomplete week omitted.',
        'A record does not establish organic adoption or explain the cause.'],
    },
  };
}

function renderChart(metadata) {
  const rows = metadata.chart;
  const max = Math.max(1, ...rows.map(r => r.shielded), ...rows.map(r => r.fully_shielded));
  const x = i => 80 + i / Math.max(1, rows.length - 1) * 1040;
  const y = value => 430 - value / max * 300;
  const lines = Object.keys(METRICS).map((key, i) => `<polyline fill="none" stroke="${i ? '#22d3ee' : '#a78bfa'}" stroke-width="2" points="${rows.map((r, j) => `${x(j).toFixed(1)},${y(r[key]).toFixed(1)}`).join(' ')}"/>`).join('');
  const label = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
  const latest = rows.at(-1);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 620" role="img" aria-labelledby="title desc">
<title id="title">Zcash weekly shielded transaction activity</title><desc id="desc">${label(METHODOLOGY)}</desc>
<rect width="1200" height="620" fill="#101219"/><g fill="#eee" font-family="sans-serif">
<text x="80" y="48" font-size="28">Zcash weekly transaction activity · CipherScan</text>
<text x="80" y="86" fill="#a78bfa">Any shielded component: ${latest.shielded.toLocaleString('en-US')}</text>
<text x="620" y="86" fill="#22d3ee">Fully shielded: ${latest.fully_shielded.toLocaleString('en-US')}</text>
<text x="16" y="138">${max.toLocaleString('en-US')}</text><text x="52" y="435">0</text>
<path d="M80 130 V430 H1120" fill="none" stroke="#555"/>${lines}
<text x="80" y="465">${label(rows[0].week)}</text><text x="1010" y="465">${label(latest.week)}</text>
<text x="80" y="505">Completed Monday–Sunday UTC weeks · Coinbase excluded · Transactions, not actions</text>
<text x="80" y="535">Fully shielded = no transparent inputs or outputs; includes pool migrations</text>
<text x="80" y="565">Source: CipherScan canonical indexed chain · Captured ${label(metadata.capturedAt)}</text>
<text x="80" y="595">DRAFT — review definitions, ranking and freshness before publication</text></g></svg>`;
}

module.exports = { completedWeekEnd, weeklySeries, summarize, makeDraft, renderChart };
