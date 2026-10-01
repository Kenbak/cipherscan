'use strict';

// ZecBlock social cards: one headline number, one plain sentence, one visual.
// The tweet carries the wording; the card should read at a glance in a feed.
const { createCanvas, registerFont, loadImage } = require('canvas');
const path = require('path');
const fs = require('fs');
const os = require('os');

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
  const file = path.join(os.tmpdir(), `zecblock-card-${name}-${Date.now()}.png`);
  fs.writeFileSync(file, canvas.toBuffer('image/png'));
  return file;
}

// y always starts at zero so small moves are not exaggerated.
function lineChart(ctx, values, { x, y, w, h, color, reference, referenceLabel }) {
  const floor = 0;
  const max = Math.max(...values, reference ?? 0) * 1.08;
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

module.exports = { renderFlow, renderHashrate, renderWeekly, renderSwap, renderMilestone, W, H };
