'use strict';

// ZecBlock social cards: one headline number, one plain sentence, a short
// qualifier and one visual. Content comes from the story's `evidence.card`,
// built alongside the tweet copy, so the two cannot disagree.
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
  gold: '#F8BC21', ironwood: '#E8CF78', orchard: '#B6A0E0', sapling: '#91AC90',
  in: '#65C79A', out: '#E8776A',
};
const TONES = { in: C.in, out: C.out, gold: C.gold, ironwood: C.ironwood, text: C.text };
const NODE_FILL = { ironwood: C.ironwood, orchard: C.orchard, sapling: C.sapling, gold: C.gold };
const CHAIN_ICONS = { trx: 'tron', bnb: 'bsc', matic: 'pol' };

let fontsReady = false;
function ensureFonts() {
  if (fontsReady) return;
  const font = name => path.join(ASSETS, 'fonts', name);
  registerFont(font('Geist-Medium.ttf'), { family: 'Geist', weight: '500' });
  registerFont(font('Geist-Regular.ttf'), { family: 'Geist', weight: 'normal' });
  registerFont(font('GeistMono-Regular.ttf'), { family: 'GeistMono', weight: 'normal' });
  fontsReady = true;
}

const fmt = (n, d = 0) => n.toLocaleString('en-US', { maximumFractionDigits: d });

// Shrinks a line to fit, down to a floor; past that the card is refused and
// the post falls back to text rather than clipping wording.
function fit(ctx, text, weight, size, min, width, family = 'Geist') {
  for (let s = size; s >= min; s -= 2) {
    ctx.font = `${weight} ${s}px ${family}`;
    if (ctx.measureText(text).width <= width) return s;
  }
  throw new Error('Card text exceeds safe bounds');
}

async function drawFrame(ctx, kicker, accent) {
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
}

function drawText(ctx, card, accent, width) {
  // Hero shares one line with its unit; both shrink together if needed.
  const unitGap = card.unit ? 18 : 0;
  let size = 150;
  for (; size >= 72; size -= 4) {
    ctx.font = `500 ${size}px Geist`;
    const heroW = ctx.measureText(card.hero).width;
    ctx.font = `500 ${Math.round(size * 0.34)}px Geist`;
    if (heroW + (card.unit ? unitGap + ctx.measureText(card.unit).width : 0) <= width) break;
  }
  if (size < 72) throw new Error('Card headline exceeds safe bounds');
  const y = 290;
  ctx.font = `500 ${size}px Geist`;
  ctx.fillStyle = accent;
  ctx.fillText(card.hero, PAD - 6, y);
  if (card.unit) {
    const x = PAD - 6 + ctx.measureText(card.hero).width + unitGap;
    ctx.font = `500 ${Math.round(size * 0.34)}px Geist`;
    ctx.fillStyle = C.muted;
    ctx.fillText(card.unit, x, y);
  }
  ctx.fillStyle = C.text;
  fit(ctx, card.line, 500, 36, 26, width);
  ctx.fillText(card.line, PAD, 368);
  if (card.qualifier) {
    ctx.fillStyle = C.muted;
    fit(ctx, card.qualifier, 500, 36, 26, width);
    ctx.fillText(card.qualifier, PAD, 416);
  }
}

function drawFooter(ctx, source, date) {
  ctx.fillStyle = C.border;
  ctx.fillRect(PAD, H - 108, W - 2 * PAD, 1);
  ctx.font = 'normal 19px GeistMono';
  ctx.fillStyle = C.muted;
  ctx.fillText(source, PAD, H - 62);
  if (date) ctx.fillText(date, W - PAD - ctx.measureText(date).width, H - 62);
}

// y always starts at zero so small moves are not exaggerated.
function drawSeries(ctx, v, accent) {
  const x = 700, y = 170, w = W - PAD - x, h = 290;
  const values = v.values;
  if (values.length < 2 || values.some(n => !Number.isFinite(n) || n < 0)) throw new Error('Missing editorial value');
  const max = Math.max(...values, v.reference ?? 0) * 1.08 || 1;
  const px = i => x + (i / (values.length - 1)) * w;
  const py = n => y + h - (n / max) * h;
  ctx.fillStyle = C.border;
  ctx.fillRect(x, y + h, w, 1);
  if (v.reference != null) {
    ctx.strokeStyle = C.faint; ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.moveTo(x, py(v.reference)); ctx.lineTo(x + w, py(v.reference)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = 'normal 15px GeistMono'; ctx.fillStyle = C.muted;
    ctx.fillText(v.referenceLabel, x, py(v.reference) - 10);
  }
  const grad = ctx.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, `${accent}38`);
  grad.addColorStop(1, `${accent}00`);
  const trace = () => values.forEach((n, i) => (i ? ctx.lineTo(px(i), py(n)) : ctx.moveTo(px(i), py(n))));
  ctx.beginPath(); trace(); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();
  ctx.beginPath(); trace();
  ctx.strokeStyle = accent; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.stroke();
  // The brand block marks the latest observation.
  ctx.fillStyle = accent;
  ctx.fillRect(px(values.length - 1) - 8, py(values.at(-1)) - 8, 16, 16);
}

// Public side on top, shielded pool below. The arrow stays neutral; colour
// lives on the headline amount, which already states the size.
function drawTransfer(ctx, v) {
  const x = 800, box = 44, topY = 160, bottomY = 400;
  const node = (n, y) => {
    if (n.style === 'outline') { ctx.strokeStyle = C.muted; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, box - 2, box - 2); }
    else { ctx.fillStyle = NODE_FILL[n.style] || C.gold; ctx.fillRect(x, y, box, box); }
    ctx.font = '500 26px Geist'; ctx.fillStyle = C.text; ctx.fillText(n.name, x + box + 20, y + 22);
    ctx.font = 'normal 16px GeistMono'; ctx.fillStyle = C.muted; ctx.fillText(n.detail, x + box + 20, y + 46);
  };
  node(v.top, topY);
  node(v.bottom, bottomY);
  const cx = x + box / 2, from = topY + box + 18, to = bottomY - 18;
  ctx.fillStyle = C.text;
  for (let y = from + 26; y < to - 22; y += 18) ctx.fillRect(cx - 4, y, 8, 8);
  ctx.beginPath();
  if (v.direction === 'down') { ctx.moveTo(cx - 12, to - 16); ctx.lineTo(cx + 12, to - 16); ctx.lineTo(cx, to); }
  else { ctx.moveTo(cx - 12, from + 16); ctx.lineTo(cx + 12, from + 16); ctx.lineTo(cx, from); }
  ctx.fill();
}

async function chainNode(ctx, code, cx, cy, ring) {
  const r = 34;
  ctx.beginPath(); ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
  ctx.fillStyle = C.surface; ctx.fill();
  ctx.strokeStyle = ring; ctx.lineWidth = 1.5; ctx.stroke();
  const file = path.join(ASSETS, 'chains', `${CHAIN_ICONS[code] || code}.png`);
  if (fs.existsSync(file)) {
    const img = await loadImage(file);
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(img, cx - r, cy - r, 2 * r, 2 * r); ctx.restore();
  }
  const label = code.toUpperCase();
  ctx.font = 'normal 16px GeistMono'; ctx.fillStyle = C.muted;
  ctx.fillText(label, cx - ctx.measureText(label).width / 2, cy + 74);
}

async function drawSwap(ctx, v) {
  const y = 250, x1 = 820, x2 = W - PAD - 40;
  ctx.fillStyle = C.text;
  for (let x = x1 + 58; x < x2 - 70; x += 22) ctx.fillRect(x, y - 4, 8, 8);
  ctx.beginPath(); ctx.moveTo(x2 - 62, y - 12); ctx.lineTo(x2 - 62, y + 12); ctx.lineTo(x2 - 46, y); ctx.fill();
  await chainNode(ctx, v.from, x1, y, v.from === 'zec' ? C.gold : C.border);
  await chainNode(ctx, v.to, x2, y, v.to === 'zec' ? C.gold : C.border);
}

// Ten blocks; the ranked week is gold and the busier weeks are outlined.
function drawRank(ctx, v) {
  const size = 34, gap = 10, x0 = W - PAD - 10 * (size + gap) + gap, y0 = 250;
  ctx.font = 'normal 16px GeistMono'; ctx.fillStyle = C.muted;
  ctx.fillText(v.tied ? 'Joint rank among complete weeks' : 'Rank among complete weeks', x0, y0 - 22);
  for (let i = 1; i <= 10; i++) {
    const x = x0 + (i - 1) * (size + gap);
    if (i === v.rank) { ctx.fillStyle = C.gold; ctx.fillRect(x, y0, size, size); }
    else { ctx.strokeStyle = i < v.rank ? C.muted : C.grid; ctx.lineWidth = 1.5; ctx.strokeRect(x + 0.75, y0 + 0.75, size - 1.5, size - 1.5); }
    ctx.font = 'normal 15px GeistMono'; ctx.fillStyle = i === v.rank ? C.gold : C.faint;
    const label = `#${i}`;
    ctx.fillText(label, x + (size - ctx.measureText(label).width) / 2, y0 + size + 28);
  }
}

function drawBars(ctx, v) {
  const x = 760, w = W - PAD - x;
  if (v.items.some(i => !Number.isFinite(i.value) || i.value < 0)) throw new Error('Invalid comparison');
  const max = Math.max(...v.items.map(i => i.value), 1);
  v.items.forEach((item, i) => {
    const y = 230 + i * 120;
    ctx.font = 'normal 22px Geist'; ctx.fillStyle = C.secondary;
    ctx.fillText(item.label, x, y - 18);
    ctx.font = 'normal 18px GeistMono'; ctx.fillStyle = C.text;
    ctx.fillText(item.display, x + w - ctx.measureText(item.display).width, y - 18);
    ctx.fillStyle = C.border; ctx.fillRect(x, y, w, 14);
    ctx.fillStyle = TONES[item.tone] || C.gold; ctx.fillRect(x, y, w * item.value / max, 14);
  });
}

// A short chain with `depth` replaced blocks forking off it.
function drawReorg(ctx, v) {
  const size = 30, gap = 14, step = size + gap, mid = 285, x0 = 740;
  const fork = x0 + 2 * step + size, fx = x0 + 3 * step + 20;
  ctx.fillStyle = C.muted;
  for (let i = 0; i < 3; i++) ctx.fillRect(x0 + i * step, mid - size / 2, size, size);
  ctx.strokeStyle = C.faint; ctx.lineWidth = 1.5;
  for (const dy of [-70, 70]) {
    ctx.beginPath(); ctx.moveTo(fork, mid); ctx.lineTo(fx, mid + dy); ctx.stroke();
  }
  for (let i = 0; i < v.depth; i++) {
    const x = fx + i * step;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(x + 0.75, mid - 70 - size / 2 + 0.75, size - 1.5, size - 1.5);
    ctx.setLineDash([]);
    ctx.fillStyle = C.gold; ctx.fillRect(x, mid + 70 - size / 2, size, size);
  }
  ctx.font = 'normal 15px GeistMono'; ctx.fillStyle = C.muted;
  ctx.fillText('replaced', fx, mid - 70 - size / 2 - 14);
  ctx.fillText('canonical', fx, mid + 70 + size / 2 + 26);
}

async function renderEditorial(story) {
  const card = story.evidence?.card;
  if (!card?.hero || !card.line || !card.kicker) throw new Error('Story has no card');
  const link = String(story.content || '').split('\n').at(-1);
  if (!link.startsWith('https://zecblock.com/') || !/^zecblock\.com\//.test(card.source || '')) {
    throw new Error('Unexpected editorial link');
  }
  ensureFonts();
  const canvas = createCanvas(W, H), ctx = canvas.getContext('2d');
  const accent = TONES[card.tone] || C.gold;
  await drawFrame(ctx, card.kicker, accent);
  const v = card.visual;
  drawText(ctx, card, accent, v ? 590 : W - 2 * PAD);
  if (v?.kind === 'series') drawSeries(ctx, v, accent);
  else if (v?.kind === 'transfer') drawTransfer(ctx, v);
  else if (v?.kind === 'swap') await drawSwap(ctx, v);
  else if (v?.kind === 'rank') drawRank(ctx, v);
  else if (v?.kind === 'bars') drawBars(ctx, v);
  else if (v?.kind === 'reorg') drawReorg(ctx, v);
  else if (v) throw new Error(`Unknown card visual: ${v.kind}`);
  drawFooter(ctx, card.source, card.date);
  const file = path.join(os.tmpdir(), `zecblock-card-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`);
  fs.writeFileSync(file, canvas.toBuffer('image/png'));
  return file;
}

module.exports = { renderEditorial, W, H, C, fmt };
