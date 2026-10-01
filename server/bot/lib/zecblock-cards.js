'use strict';

// ZecBlock social cards: one headline number, one plain sentence, one visual.
// The tweet carries the wording; the card should read at a glance in a feed.
const { createCanvas, registerFont, loadImage } = require('canvas');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { randomUUID } = require('crypto');

const ASSETS = path.join(__dirname, '..', 'assets');
const LOGO = path.join(__dirname, '..', '..', '..', 'public', 'brand', 'zecblock-logotype.png');
const W = 1200, H = 675, PAD = 80;

// Dark tokens from app/globals.css and lib/chart-theme.ts.
const C = {
  bg: '#0B0C0E', surface: '#111316', border: '#24272D', grid: '#2C3037',
  text: '#F1F3F5', secondary: '#C2C7CF', muted: '#9CA4B0', faint: '#565D68',
  gold: '#F8BC21', ironwood: '#E8CF78', shielding: '#65C79A', deshielding: '#E8776A',
};

let fontsReady = false;
function ensureFonts() {
  if (fontsReady) return;
  const f = name => path.join(ASSETS, 'fonts', name);
  registerFont(f('Geist-Medium.ttf'), { family: 'Geist', weight: '500' });
  registerFont(f('Geist-Regular.ttf'), { family: 'Geist', weight: 'normal' });
  registerFont(f('GeistMono-Regular.ttf'), { family: 'GeistMono', weight: 'normal' });
  fontsReady = true;
}

async function base({ kicker, accent = C.gold }) {
  ensureFonts();
  const canvas = createCanvas(W, H), ctx = canvas.getContext('2d');
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.font = 'normal 20px GeistMono';
  ctx.fillStyle = accent;
  ctx.fillText('>', PAD, 96);
  ctx.fillStyle = C.muted;
  ctx.fillText(kicker.toUpperCase(), PAD + 26, 96);
  const logo = await loadImage(LOGO);
  const lh = 30, lw = logo.width * lh / logo.height;
  ctx.drawImage(logo, W - PAD - lw, 73, lw, lh);
  return { canvas, ctx };
}

function hero(ctx, value, unit, { y = 290, size = 150, color = C.text } = {}) {
  ctx.font = `500 ${size}px Geist`;
  ctx.fillStyle = color;
  ctx.fillText(value, PAD - 6, y);
  if (!unit) return;
  const x = PAD - 6 + ctx.measureText(value).width + 18;
  ctx.font = `500 ${Math.round(size * 0.34)}px Geist`;
  ctx.fillStyle = C.muted;
  ctx.fillText(unit, x, y);
}

// Headline sentence in ink, qualifier underneath in muted.
function caption(ctx, line, qualifier, { y = 368, maxWidth = W - 2 * PAD } = {}) {
  ctx.font = '500 36px Geist';
  ctx.fillStyle = C.text;
  ctx.fillText(line, PAD, y, maxWidth);
  if (!qualifier) return;
  ctx.fillStyle = C.muted;
  ctx.fillText(qualifier, PAD, y + 48, maxWidth);
}

function footer(ctx, left, right) {
  ctx.fillStyle = C.border;
  ctx.fillRect(PAD, H - 108, W - 2 * PAD, 1);
  ctx.font = 'normal 19px GeistMono';
  ctx.fillStyle = C.muted;
  ctx.fillText(left, PAD, H - 62);
  if (right) ctx.fillText(right, W - PAD - ctx.measureText(right).width, H - 62);
}

function save(canvas, name) {
  const file = path.join(os.tmpdir(), `zecblock-card-${name}-${randomUUID()}.png`);
  fs.writeFileSync(file, canvas.toBuffer('image/png'));
  return file;
}

// y always starts at zero so small moves are not exaggerated.
function lineChart(ctx, values, { x, y, w, h, color, reference, referenceLabel }) {
  const floor = 0;
  if (values.length < 2 || values.some(v => !Number.isFinite(v) || v < 0)) throw new Error('Invalid chart observations');
  const max = Math.max(...values, reference ?? 0, 1) * 1.08;
  const px = i => x + (i / (values.length - 1)) * w;
  const py = v => y + h - ((v - floor) / (max - floor)) * h;
  ctx.fillStyle = C.border;
  ctx.fillRect(x, y + h, w, 1);
  if (reference != null) {
    ctx.strokeStyle = C.faint;
    ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.moveTo(x, py(reference)); ctx.lineTo(x + w, py(reference)); ctx.stroke();
    ctx.setLineDash([]);
    if (referenceLabel) {
      ctx.font = 'normal 15px GeistMono';
      ctx.fillStyle = C.muted;
      ctx.fillText(referenceLabel, x, py(reference) - 10);
    }
  }
  const grad = ctx.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, `${color}38`);
  grad.addColorStop(1, `${color}00`);
  ctx.beginPath();
  values.forEach((v, i) => (i ? ctx.lineTo(px(i), py(v)) : ctx.moveTo(px(i), py(v))));
  ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();
  ctx.beginPath();
  values.forEach((v, i) => (i ? ctx.lineTo(px(i), py(v)) : ctx.moveTo(px(i), py(v))));
  ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.stroke();
  const lx = px(values.length - 1), ly = py(values.at(-1));
  // The brand block marks "now" instead of a dot.
  ctx.fillStyle = color;
  ctx.fillRect(lx - 8, ly - 8, 16, 16);
}

const fmt = (n, d = 0) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

// Truncate: rounding 899.99975 up to 900.00 would overstate the amount.
const zecAmount = zec => (zec >= 100 && Number.isInteger(Math.floor(zec * 100) / 100) ? fmt(Math.floor(zec)) : fmt(Math.floor(zec * 100) / 100, 2));
const usdShort = usd => (usd >= 1e9 ? `$${(usd / 1e9).toFixed(2)}B` : usd >= 1e6 ? `$${(usd / 1e6).toFixed(2)}M` : `$${fmt(Math.round(usd / 1e3))}K`);

const zecShort = zec => (zec >= 1e6 ? `${(zec / 1e6).toFixed(2)}M` : zec >= 1e3 ? `${(zec / 1e3).toFixed(1)}K` : fmt(zec));

// Signed and coloured by direction: + green into a pool, − red out of it.
// The diagram shows what happened: public (transparent) side on top, the
// shielded pool below; deshielding surfaces value, shielding sinks it.
async function renderFlow({ direction, amountZec, usd, pool, qualifier, poolZec, transparentZec, url, date }) {
  const shielding = direction === 'shield';
  const accent = shielding ? C.shielding : C.deshielding;
  const { canvas, ctx } = await base({ kicker: `${shielding ? 'Shielding' : 'Deshielding'} · ${pool}`, accent });
  const value = `${shielding ? '+' : '−'}${zecAmount(amountZec)}`;
  ctx.font = '500 132px Geist';
  const size = Math.min(132, Math.floor(132 * 520 / ctx.measureText(value).width));
  hero(ctx, value, 'ZEC', { size, color: accent });
  const line = `${shielding ? 'entered' : 'left'} ${pool}${usd ? ` (≈ ${usdShort(usd)})` : '.'}`;
  caption(ctx, line, qualifier, { maxWidth: 600 });

  const x = 800, box = 44, topY = 160, bottomY = 400;
  const node = (y, filled, colour, name, detail) => {
    if (filled) { ctx.fillStyle = colour; ctx.fillRect(x, y, box, box); }
    else { ctx.strokeStyle = colour; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, box - 2, box - 2); }
    ctx.font = '500 26px Geist'; ctx.fillStyle = C.text; ctx.fillText(name, x + box + 20, y + 22);
    ctx.font = 'normal 16px GeistMono'; ctx.fillStyle = C.muted; ctx.fillText(detail, x + box + 20, y + 46);
  };
  node(topY, false, C.muted, 'Transparent', transparentZec ? `${zecShort(transparentZec)} ZEC · public` : 'public');
  node(bottomY, true, C.ironwood, pool, poolZec ? `${zecShort(poolZec)} ZEC · shielded` : 'shielded');

  // Dotted block trail between the nodes, arrowhead pointing the way value moved.
  const cx = x + box / 2, from = topY + box + 18, to = bottomY - 18;
  ctx.fillStyle = accent;
  for (let y = from + 14; y < to - 22; y += 18) ctx.fillRect(cx - 4, y, 8, 8);
  ctx.beginPath();
  if (shielding) { ctx.moveTo(cx - 12, to - 16); ctx.lineTo(cx + 12, to - 16); ctx.lineTo(cx, to); }
  else { ctx.moveTo(cx - 12, from + 16); ctx.lineTo(cx + 12, from + 16); ctx.lineTo(cx, from); }
  ctx.fill();
  ctx.font = 'normal 18px GeistMono'; ctx.fillStyle = accent;
  ctx.fillText(`${zecAmount(amountZec)} ZEC`, cx + 28, (from + to) / 2 + 6);

  footer(ctx, url, date);
  return save(canvas, 'flow');
}

async function renderHashrate({ values, value, unit, headline, qualifier, previousPeak, url, date }) {
  const { canvas, ctx } = await base({ kicker: 'Network · Hashrate' });
  hero(ctx, value, unit);
  caption(ctx, headline, qualifier, { maxWidth: 560 });
  lineChart(ctx, values, { x: 700, y: 170, w: W - PAD - 700, h: 290, color: C.gold, reference: previousPeak, referenceLabel: 'previous peak' });
  footer(ctx, url, date);
  return save(canvas, 'hashrate');
}

// Rank ladder: ten blocks, the ranked week in gold, higher ranks outlined.
async function renderWeekly({ value, rank, weeks, headline, qualifier, url, date }) {
  const { canvas, ctx } = await base({ kicker: 'Activity · Weekly' });
  hero(ctx, fmt(value));
  caption(ctx, headline, qualifier, { maxWidth: 640 });
  const size = 34, gap = 10, x0 = W - PAD - 10 * (size + gap) + gap, y0 = 250;
  for (let i = 1; i <= 10; i++) {
    const x = x0 + (i - 1) * (size + gap);
    if (i === rank) { ctx.fillStyle = C.gold; ctx.fillRect(x, y0, size, size); }
    else { ctx.strokeStyle = i < rank ? C.muted : C.grid; ctx.lineWidth = 1.5; ctx.strokeRect(x + 0.75, y0 + 0.75, size - 1.5, size - 1.5); }
    ctx.font = 'normal 15px GeistMono';
    ctx.fillStyle = i === rank ? C.gold : C.faint;
    const label = `#${i}`;
    ctx.fillText(label, x + (size - ctx.measureText(label).width) / 2, y0 + size + 28);
  }
  ctx.font = 'normal 16px GeistMono';
  ctx.fillStyle = C.muted;
  ctx.fillText(`of ${fmt(weeks)} complete weeks`, x0, y0 - 22);
  footer(ctx, url, date);
  return save(canvas, 'weekly');
}

async function chainIcon(ctx, file, cx, cy, r, ring) {
  ctx.beginPath(); ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
  ctx.fillStyle = C.surface; ctx.fill();
  ctx.strokeStyle = ring; ctx.lineWidth = 1.5; ctx.stroke();
  const img = await loadImage(path.join(ASSETS, 'chains', file));
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  ctx.drawImage(img, cx - r, cy - r, 2 * r, 2 * r); ctx.restore();
}

async function renderSwap({ usd, fromLabel, fromIcon, headline, qualifier, url, date }) {
  const { canvas, ctx } = await base({ kicker: 'Cross-chain · Swap' });
  hero(ctx, `$${fmt(usd)}`);
  caption(ctx, headline, qualifier, { maxWidth: 640 });
  const y = 230, x1 = 800, x2 = W - PAD - 40;
  for (let x = x1 + 58; x < x2 - 52; x += 22) { ctx.fillStyle = C.grid; ctx.fillRect(x, y - 4, 8, 8); }
  ctx.fillStyle = C.gold; ctx.fillRect(x2 - 72, y - 5, 10, 10);
  await chainIcon(ctx, fromIcon, x1, y, 34, C.border);
  await chainIcon(ctx, 'zec.png', x2, y, 34, C.gold);
  ctx.font = 'normal 16px GeistMono'; ctx.fillStyle = C.muted;
  ctx.fillText(fromLabel, x1 - ctx.measureText(fromLabel).width / 2, y + 74);
  ctx.fillText('ZEC', x2 - ctx.measureText('ZEC').width / 2, y + 74);
  footer(ctx, url, date);
  return save(canvas, 'swap');
}

async function renderMilestone({ values, value, unit, headline, qualifier, reference, referenceLabel, url, date, kicker }) {
  const { canvas, ctx } = await base({ kicker, accent: C.ironwood });
  hero(ctx, value, unit, { color: C.ironwood, size: 168 });
  caption(ctx, headline, qualifier, { maxWidth: 520 });
  lineChart(ctx, values, { x: 680, y: 170, w: W - PAD - 680, h: 290, color: C.ironwood, reference, referenceLabel });
  footer(ctx, url, date);
  return save(canvas, 'milestone');
}


// The live editorial adapter preserves every qualification in the selected
// story. Figures come from its evidence; never synthesize a historical series.
function editorialModel(story) {
  const e = story.evidence || {};
  const lines = story.content.split('\n').filter(Boolean);
  const link = new URL(lines.at(-1));
  if (link.origin !== 'https://zecblock.com') throw new Error('Unexpected editorial link');
  const paragraphs = lines.slice(0, -1);
  let value, label, visual;
  let accent = C.gold;
  let date = e.target || e.days?.at(-1)?.date || story.key.split(':').at(-1);
  if (e.block_time != null) date = new Date(Number(e.block_time) * 1000).toISOString();
  if (e.swap_created_at) date = new Date(e.swap_created_at).toISOString();
  if (e.detected_at) date = new Date(e.detected_at).toISOString();
  if (e.period) date = `${e.period.start || story.key.split(':').at(-1)} – ${new Date(Date.parse(e.period.endExclusive) - 86400000).toISOString().slice(0, 10)}`;
  const numeric = n => {
    if (n == null || !Number.isFinite(Number(n))) throw new Error('Missing editorial value');
    return Number(n);
  };
  switch (story.type) {
    case 'flow_shield':
    case 'flow_deshield': {
      const into = story.type === 'flow_shield';
      const pool = e.pool === 'mixed' ? 'Shielded pools' : e.pool[0].toUpperCase() + e.pool.slice(1);
      value = `${into ? '+' : '−'}${fmt(Math.floor(numeric(e.amount_zat) / 1e6) / 100, 2).replace(/\.00$/, '')} ZEC`;
      label = `${into ? 'Shielding' : 'Deshielding'} · ${pool}`;
      accent = into ? C.shielding : C.deshielding;
      paragraphs.shift();
      visual = { kind: 'flow', from: into ? 'Transparent' : pool, to: into ? pool : 'Transparent' };
      break;
    }
    case 'swap':
      value = `$${fmt(numeric(e.source_amount_usd))}`;
      label = 'Completed cross-chain swap';
      paragraphs.shift();
      visual = { kind: 'flow', from: e.source_chain.toUpperCase(), to: e.dest_chain.toUpperCase() };
      break;
    case 'activity_daily': {
      value = e.metric === 'share' ? `${numeric(e.stats.value).toFixed(1)}%` : fmt(numeric(e.stats.value));
      label = paragraphs[0].split(':')[0];
      paragraphs[0] = paragraphs[0].replace(/^.*?:\s*[\d,.]+%?\.\s*/, '');
      const get = d => e.metric === 'share' ? 100 * d.shielded / (d.shielded + d.transparent)
        : e.metric === 'shielded' ? d.shielded : e.metric === 'fully' ? d.fully_shielded : d.shielded + d.transparent;
      visual = { kind: 'series', values: e.days.map(get), start: e.days[0].date, end: e.days.at(-1).date, unit: e.metric === 'share' ? '%' : 'transactions' };
      break;
    }
    case 'activity_weekly': {
      const metric = e.metrics.find(m => m.noteworthy);
      value = fmt(numeric(metric.value));
      label = paragraphs[0].split(':')[0];
      paragraphs[0] = paragraphs[0].replace(/^.*?:\s*[\d,.]+\.\s*/, '');
      visual = { kind: 'rank', rank: numeric(metric.rank), tied: metric.tied };
      break;
    }
    case 'hashrate':
      value = paragraphs.shift().replace(/^Zcash estimated hashrate: /, '').replace(/\.$/, '');
      label = 'Estimated network hashrate';
      visual = { kind: 'comparison', values: [numeric(e.previousPeak), numeric(e.point.hashrate)], labels: ['Previous peak', 'Latest sample'] };
      break;
    case 'network_signal':
      label = paragraphs[0].split(':')[0];
      value = paragraphs.shift().slice(label.length + 2).replace(/\.$/, '');
      visual = { kind: 'series', values: e.rows.map(r => numeric(r.value) / (e.metric.endsWith('_zat') ? 1e8 : 1)), start: e.rows[0].date, end: e.rows.at(-1).date, unit: e.metric.endsWith('_zat') ? 'ZEC' : 'ratio' };
      date = e.rows.at(-1).date;
      break;
    case 'migration':
      value = `${fmt(Math.floor(numeric(e.amount_zat) / 1e6) / 100, 2).replace(/\.00$/, '')} ZEC`;
      label = 'Pool migration into Ironwood';
      paragraphs[0] = 'Ironwood deposit with an Orchard withdrawal.';
      visual = { kind: 'flow', from: 'Orchard withdrawal', to: 'Ironwood deposit' };
      break;
    case 'reorg':
      value = `${numeric(e.depth)} blocks`;
      label = 'Chain reorganization';
      paragraphs[0] = `Fork height: ${fmt(numeric(e.fork_height))}.`;
      break;
    case 'crosschain_daily': {
      const net = numeric(e.inflow) - numeric(e.outflow);
      value = `${net < 0 ? '−' : '+'}$${fmt(Math.abs(net))}`;
      label = `Net ${net < 0 ? 'outflow' : 'inflow'} · NEAR 1Click`;
      paragraphs.shift();
      visual = { kind: 'comparison', values: [numeric(e.inflow), numeric(e.outflow)], labels: ['Into ZEC', 'Out of ZEC'] };
      break;
    }
    default: throw new Error(`Unsupported editorial story: ${story.type}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}/.test(date)) throw new Error('Missing editorial date');
  return { value, label, paragraphs: paragraphs.filter(Boolean), visual, accent,
    date: `${date.replace('T', ' ').replace(/\.\d{3}Z$/, '').replace(/Z$/, '')} UTC`,
    // The post retains the full transaction link; the image has a readable source.
    source: `zecblock.com${link.pathname.startsWith('/tx/') ? '/tx/' + link.pathname.slice(4, 12) + '…' : link.pathname}` };
}

function wrap(ctx, text, width) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (ctx.measureText(word).width > width) throw new Error('Editorial word exceeds safe bounds');
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

async function renderEditorial(story) {
  const m = editorialModel(story);
  const { canvas, ctx } = await base({ kicker: 'Zcash · Mainnet', accent: m.accent });
  const width = m.visual ? 625 : W - 2 * PAD;
  let size = 106;
  ctx.font = `500 ${size}px Geist`;
  size = Math.min(size, Math.floor(size * width / ctx.measureText(m.value).width));
  if (size < 42) throw new Error('Editorial headline exceeds safe bounds');
  hero(ctx, m.value, null, { y: 244, size, color: m.accent });
  ctx.font = '500 28px Geist'; ctx.fillStyle = C.text;
  const labels = wrap(ctx, m.label, width);
  if (labels.length > 2) throw new Error('Editorial label exceeds safe bounds');
  labels.forEach((line, i) => ctx.fillText(line, PAD, 292 + i * 34));
  const startY = 345 + (labels.length - 1) * 34;
  let body;
  for (size = 25; size >= 21; size--) {
    ctx.font = `normal ${size}px Geist`;
    body = m.paragraphs.map(p => wrap(ctx, p, width));
    if (startY + body.reduce((n, lines) => n + lines.length * (size + 8) + 12, 0) <= H - 118) break;
  }
  if (size < 21) throw new Error('Editorial qualifications exceed safe bounds');
  ctx.fillStyle = C.secondary;
  let y = startY;
  for (const lines of body) {
    for (const line of lines) { ctx.fillText(line, PAD, y); y += size + 8; }
    y += 12;
  }
  const v = m.visual, x = 790, w = W - PAD - x;
  if (v?.kind === 'series') {
    lineChart(ctx, v.values, { x, y: 230, w, h: 210, color: m.accent });
    ctx.font = 'normal 16px GeistMono'; ctx.fillStyle = C.muted;
    ctx.fillText(`Peak: ${fmt(Math.max(...v.values), 2)} ${v.unit}`, x, 197);
    ctx.fillText('0', x, 465);
    ctx.fillText(v.start, x, 506);
    ctx.fillText(v.end, x + w - ctx.measureText(v.end).width, 506);
  } else if (v?.kind === 'flow') {
    ctx.font = '500 23px Geist'; ctx.fillStyle = C.secondary;
    ctx.fillText(v.from, x + 28, 223);
    ctx.fillStyle = C.faint; ctx.fillRect(x, 205, 14, 14);
    ctx.fillStyle = m.accent;
    for (let yy = 254; yy < 377; yy += 22) ctx.fillRect(x + 4, yy, 6, 6);
    ctx.beginPath(); ctx.moveTo(x - 2, 384); ctx.lineTo(x + 16, 384); ctx.lineTo(x + 7, 398); ctx.fill();
    ctx.fillRect(x, 424, 14, 14);
    ctx.fillStyle = C.text; ctx.fillText(v.to, x + 28, 441);
  } else if (v?.kind === 'rank') {
    ctx.font = '500 75px Geist'; ctx.fillStyle = m.accent;
    ctx.fillText(`#${v.rank}`, x, 301);
    ctx.font = 'normal 22px Geist'; ctx.fillStyle = C.secondary;
    ctx.fillText(v.tied ? 'Joint weekly rank' : 'Weekly rank', x, 350);
    ctx.font = 'normal 18px GeistMono'; ctx.fillStyle = C.muted;
    ctx.fillText('Complete weeks', x, 396);
    ctx.fillText('since 2016-10-31', x, 423);
  } else if (v?.kind === 'comparison') {
    if (v.values.some(n => n < 0)) throw new Error('Invalid comparison');
    const max = Math.max(...v.values, 1);
    v.values.forEach((n, i) => {
      const yy = 270 + i * 110;
      ctx.font = 'normal 22px Geist'; ctx.fillStyle = C.secondary;
      ctx.fillText(v.labels[i], x, yy - 24);
      ctx.fillStyle = C.border; ctx.fillRect(x, yy, w, 18);
      ctx.fillStyle = i ? m.accent : C.muted; ctx.fillRect(x, yy, w * n / max, 18);
    });
    ctx.font = 'normal 16px GeistMono'; ctx.fillStyle = C.muted;
    ctx.fillText('Scale starts at zero', x, 456);
  }
  footer(ctx, m.source, m.date);
  return save(canvas, 'editorial');
}

module.exports = { renderEditorial, editorialModel, renderFlow, renderHashrate, renderWeekly, renderSwap, renderMilestone, W, H };
