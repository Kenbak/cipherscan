'use strict';

const { createCanvas, registerFont, loadImage } = require('canvas');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ASSETS = path.join(__dirname, '..', 'assets');
const FONTS_DIR = path.join(ASSETS, 'fonts');
const LOGO_PATH = path.join(ASSETS, 'logo-icon.png');

const W = 1200;
const H = 628;

const C = {
  bg: '#08090F',
  elevated: '#0E1018',
  surface: '#14161F',
  hover: '#1A1D28',
  border: 'rgba(30, 41, 59, 0.35)',
  textPrimary: '#E5E7EB',
  textSecondary: '#9CA3AF',
  textMuted: '#6B7280',
  cyan: '#00D4FF',
  cyanGlow: '#00E5FF',
  green: '#34D399',
  red: '#F87171',
  yellow: '#F4B728',
  purple: '#A78BFA',
  orange: '#FF6B35',
};

const CHAIN_FILE_MAP = {
  tron: 'tron', trx: 'trx', ethereum: 'eth', bitcoin: 'btc',
  solana: 'sol', avalanche: 'avax', polygon: 'pol', matic: 'pol',
  bnb: 'bsc', optimism: 'op', arbitrum: 'arb', zcash: 'zec',
};

function resolveChainFile(chain) {
  const key = chain.toLowerCase();
  const mapped = CHAIN_FILE_MAP[key] || key;
  return path.join(ASSETS, 'chains', `${mapped}.png`);
}

let fontsRegistered = false;

function ensureFonts() {
  if (fontsRegistered) return;
  registerFont(path.join(FONTS_DIR, 'Geist-Bold.ttf'), { family: 'Geist', weight: 'bold' });
  registerFont(path.join(FONTS_DIR, 'Geist-Medium.ttf'), { family: 'Geist', weight: '500' });
  registerFont(path.join(FONTS_DIR, 'Geist-Regular.ttf'), { family: 'Geist', weight: 'normal' });
  registerFont(path.join(FONTS_DIR, 'GeistMono-Bold.ttf'), { family: 'GeistMono', weight: 'bold' });
  registerFont(path.join(FONTS_DIR, 'GeistMono-Regular.ttf'), { family: 'GeistMono', weight: 'normal' });
  fontsRegistered = true;
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function drawBase(ctx, glowColor) {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  // Single subtle radial from top center
  const gc = glowColor || C.cyan;
  const grad = ctx.createRadialGradient(W * 0.5, -100, 0, W * 0.5, -100, W * 0.7);
  grad.addColorStop(0, `${gc}11`);
  grad.addColorStop(0.5, `${gc}08`);
  grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawGlassCard(ctx, x, y, w, h) {
  roundedRect(ctx, x, y, w, h, 16);
  ctx.fillStyle = 'rgba(20, 22, 31, 0.6)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(30, 41, 59, 0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawBar(ctx, x, y, w, h, pct, color) {
  roundedRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = 'rgba(30, 41, 59, 0.35)';
  ctx.fill();
  const fillW = Math.max(h, w * Math.min(pct / 100, 1));
  roundedRect(ctx, x, y, fillW, h, h / 2);
  // Subtle horizontal gradient on the fill
  const grad = ctx.createLinearGradient(x, 0, x + fillW, 0);
  grad.addColorStop(0, `${color}CC`);
  grad.addColorStop(1, color);
  ctx.fillStyle = grad;
  ctx.fill();
}

async function drawFooter(ctx, url) {
  ctx.font = 'normal 12px GeistMono';
  ctx.fillStyle = C.textMuted;
  ctx.fillText(url || 'cipherscan.app', 72, H - 36);
  // Logo icon + brand text right
  try {
    const logo = await loadImage(LOGO_PATH);
    const logoH = 28;
    const logoW = (logo.width / logo.height) * logoH;
    ctx.font = 'bold 12px GeistMono';
    const textW = ctx.measureText('CIPHERSCAN').width;
    const totalW = logoW + 10 + textW;
    const startX = W - 72 - totalW;
    ctx.drawImage(logo, startX, H - 50, logoW, logoH);
    ctx.fillStyle = C.cyan;
    ctx.fillText('CIPHERSCAN', startX + logoW + 10, H - 32);
  } catch {
    ctx.font = 'bold 12px GeistMono';
    ctx.fillStyle = C.cyan;
    ctx.fillText('CIPHERSCAN', W - 72 - ctx.measureText('CIPHERSCAN').width, H - 36);
  }
}

function fmtZec(zat) {
  const zec = zat / 1e8;
  if (zec >= 1_000_000) return `${(zec / 1_000_000).toFixed(2)}M`;
  if (zec >= 1_000) return `${(zec / 1_000).toFixed(1)}K`;
  return zec.toFixed(2);
}

function fmtUsd(usd) {
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(0)}K`;
  return `$${Math.round(usd)}`;
}

function saveTempPng(canvas) {
  const tmpPath = path.join(os.tmpdir(), `cipherscan-card-${Date.now()}.png`);
  fs.writeFileSync(tmpPath, canvas.toBuffer('image/png'));
  return tmpPath;
}

// Consistent card padding
const PAD = 72;

// ─── Shared layout helpers ────────────────────────────────────────────────────
// Every card uses the same skeleton:
//   y=60   header label (accent) + context pill (right)
//   y=112  context line (accent, medium)
//   y=240  hero value baseline (104px) with correctly measured unit
//   y=286  secondary muted line
//   mid    optional progress / route section
//   y=428  stat row (3 glass boxes, 72 high)
//   footer url + brand

function drawHeaderRow(ctx, label, accent, pillText, pillDotColor) {
  ctx.font = 'bold 12px GeistMono';
  ctx.fillStyle = accent;
  ctx.fillText(label, PAD, 60);

  if (pillText) {
    ctx.font = 'normal 10px GeistMono';
    const tw = ctx.measureText(pillText).width;
    const hasDot = Boolean(pillDotColor);
    const pw = tw + (hasDot ? 36 : 22);
    const px = W - PAD - pw;
    roundedRect(ctx, px, 43, pw, 24, 12);
    ctx.fillStyle = 'rgba(20, 22, 31, 0.7)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();
    let textX = px + 11;
    if (hasDot) {
      ctx.fillStyle = pillDotColor;
      ctx.beginPath();
      ctx.arc(px + 14, 55, 3.5, 0, Math.PI * 2);
      ctx.fill();
      textX = px + 25;
    }
    ctx.fillStyle = C.textSecondary;
    ctx.fillText(pillText, textX, 59);
  }
}

// Hero value with unit — measures the hero width with the CORRECT font before
// placing the unit, so the unit never overlaps the number.
function drawHero(ctx, x, baselineY, value, unit, opts = {}) {
  const size = opts.size || 104;
  ctx.font = `bold ${size}px Geist`;
  ctx.fillStyle = opts.color || C.textPrimary;
  ctx.fillText(value, x, baselineY);
  const heroW = ctx.measureText(value).width;
  if (unit) {
    ctx.font = `bold ${Math.round(size * 0.36)}px Geist`;
    ctx.fillStyle = opts.unitColor || C.textMuted;
    ctx.fillText(unit, x + heroW + 14, baselineY);
  }
  return heroW;
}

// Row of glass stat boxes spanning the full width.
function drawStatRow(ctx, y, stats, { boxH = 72, accentBorder } = {}) {
  const gap = 14;
  const boxW = Math.floor((W - PAD * 2 - gap * (stats.length - 1)) / stats.length);
  stats.forEach((s, i) => {
    const x = PAD + i * (boxW + gap);
    roundedRect(ctx, x, y, boxW, boxH, 12);
    ctx.fillStyle = 'rgba(14, 16, 24, 0.75)';
    ctx.fill();
    ctx.strokeStyle = accentBorder || 'rgba(30, 41, 59, 0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = 'normal 10px GeistMono';
    ctx.fillStyle = C.textMuted;
    ctx.fillText(s.label, x + 20, y + 29);

    ctx.font = 'bold 18px GeistMono';
    ctx.fillStyle = s.color || C.textPrimary;
    ctx.fillText(s.value, x + 20, y + 55);
  });
}

function shortTxid(txid) {
  return txid.slice(0, 20) + '…' + txid.slice(-8);
}

// ─── 1. Daily Digest ──────────────────────────────────────────────────────────

async function renderDailyDigest({ chainTip, shielded, flows, ironwood, compliance, crossChain }) {
  ensureFonts();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  drawBase(ctx);

  drawHeaderRow(ctx, 'DAILY DIGEST', C.cyan, `BLOCK ${Number(chainTip.height).toLocaleString()}`);

  // ─── Equal 2x2 grid ─────────────────────────────────────────────────────
  const gridTop = 92;
  const gridBottom = 552;
  const gap = 18;
  const rowH = (gridBottom - gridTop - gap) / 2;   // ~221
  const colW = (W - PAD * 2 - gap) / 2;            // ~519
  const inset = 30;

  const cells = [
    { x: PAD, y: gridTop },
    { x: PAD + colW + gap, y: gridTop },
    { x: PAD, y: gridTop + rowH + gap },
    { x: PAD + colW + gap, y: gridTop + rowH + gap },
  ];

  cells.forEach(c => drawGlassCard(ctx, c.x, c.y, colW, rowH));

  // Shared in-cell baselines
  const labelY = 40;
  const heroY = 108;
  const subY = 152;
  const barY = rowH - 40;
  const innerW = colW - inset * 2;

  // Cell 1 — Shielded Supply
  {
    const { x, y } = cells[0];
    ctx.font = 'normal 10px GeistMono';
    ctx.fillStyle = C.textMuted;
    ctx.fillText('SHIELDED SUPPLY', x + inset, y + labelY);

    ctx.font = 'bold 52px Geist';
    ctx.fillStyle = C.textPrimary;
    const v = fmtZec(shielded.totalZat);
    ctx.fillText(v, x + inset, y + heroY);
    const vw = ctx.measureText(v).width;
    ctx.font = 'bold 20px Geist';
    ctx.fillStyle = C.textMuted;
    ctx.fillText('ZEC', x + inset + vw + 10, y + heroY);

    ctx.font = 'bold 16px Geist';
    ctx.fillStyle = C.green;
    const inStr = `+${fmtZec(flows.netShielded)}`;
    ctx.fillText(inStr, x + inset, y + subY);
    const inW = ctx.measureText(inStr).width;
    ctx.fillStyle = C.red;
    ctx.fillText(`−${fmtZec(flows.netDeshielded)}`, x + inset + inW + 18, y + subY);

    ctx.font = 'normal 10px GeistMono';
    ctx.fillStyle = C.textMuted;
    ctx.fillText('24H SHIELD / DESHIELD', x + inset, y + barY + 8);
  }

  // Cell 2 — Ironwood Pool
  {
    const { x, y } = cells[1];
    ctx.font = 'normal 10px GeistMono';
    ctx.fillStyle = C.textMuted;
    ctx.fillText('IRONWOOD POOL', x + inset, y + labelY);

    ctx.font = 'bold 52px Geist';
    ctx.fillStyle = C.textPrimary;
    const v = fmtZec(ironwood.poolSizeZat);
    ctx.fillText(v, x + inset, y + heroY);
    const vw = ctx.measureText(v).width;
    ctx.font = 'bold 20px Geist';
    ctx.fillStyle = C.textMuted;
    ctx.fillText('ZEC', x + inset + vw + 10, y + heroY);

    ctx.font = 'bold 15px Geist';
    ctx.fillStyle = C.yellow;
    const pctStr = `${ironwood.orchardToIronwoodPct.toFixed(1)}%`;
    ctx.fillText(pctStr, x + inset, y + subY);
    ctx.font = '500 15px Geist';
    ctx.fillStyle = C.textSecondary;
    ctx.fillText(' from Orchard', x + inset + ctx.measureText(pctStr).width + 2, y + subY);

    drawBar(ctx, x + inset, y + barY, innerW, 8, ironwood.orchardToIronwoodPct, C.yellow);
  }

  // Cell 3 — ZIP-318 Compliance
  {
    const { x, y } = cells[2];
    ctx.font = 'normal 10px GeistMono';
    ctx.fillStyle = C.textMuted;
    ctx.fillText('ZIP-318 COMPLIANCE', x + inset, y + labelY);

    ctx.font = 'bold 52px Geist';
    ctx.fillStyle = C.textPrimary;
    ctx.fillText(`${compliance.pct.toFixed(1)}%`, x + inset, y + heroY);

    ctx.font = '500 15px Geist';
    ctx.fillStyle = C.textSecondary;
    ctx.fillText('of Ironwood migrations compliant', x + inset, y + subY);

    drawBar(ctx, x + inset, y + barY, innerW, 8, compliance.pct, C.cyan);
  }

  // Cell 4 — Cross-chain
  {
    const { x, y } = cells[3];
    ctx.font = 'normal 10px GeistMono';
    ctx.fillStyle = C.textMuted;
    ctx.fillText('CROSS-CHAIN 24H', x + inset, y + labelY);

    const hasData = crossChain && (crossChain.inflowUsd > 0 || crossChain.outflowUsd > 0);
    if (hasData) {
      ctx.font = 'bold 52px Geist';
      ctx.fillStyle = C.textPrimary;
      ctx.fillText(fmtUsd(crossChain.inflowUsd + crossChain.outflowUsd), x + inset, y + heroY);

      ctx.font = 'bold 16px Geist';
      ctx.fillStyle = C.green;
      const inStr = `+${fmtUsd(crossChain.inflowUsd)}`;
      ctx.fillText(inStr, x + inset, y + subY);
      const inW = ctx.measureText(inStr).width;
      ctx.fillStyle = C.red;
      ctx.fillText(`−${fmtUsd(crossChain.outflowUsd)}`, x + inset + inW + 18, y + subY);

      ctx.font = 'normal 10px GeistMono';
      ctx.fillStyle = C.textMuted;
      const swaps = crossChain.swapCount ? `${crossChain.swapCount} SWAPS — ` : '';
      ctx.fillText(`${swaps}INFLOW / OUTFLOW`, x + inset, y + barY + 8);
    } else {
      ctx.font = 'bold 52px Geist';
      ctx.fillStyle = C.textMuted;
      ctx.fillText('—', x + inset, y + heroY);
      ctx.font = 'normal 10px GeistMono';
      ctx.fillText('NO ACTIVITY', x + inset, y + subY);
    }
  }

  await drawFooter(ctx, 'cipherscan.app');
  return saveTempPng(canvas);
}

// ─── 2. Large Flow ────────────────────────────────────────────────────────────

async function renderLargeFlow({ direction, amountZat, pool, blockHeight, txid, percentileRank, priceUsd }) {
  ensureFonts();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const isShield = direction === 'shield';
  const accent = isShield ? C.green : C.red;
  drawBase(ctx, accent);

  drawHeaderRow(ctx, isShield ? 'SHIELD ALERT' : 'DESHIELD ALERT', accent, 'MAINNET', C.green);

  // Context line
  const poolName = pool.charAt(0).toUpperCase() + pool.slice(1);
  ctx.font = '500 15px Geist';
  ctx.fillStyle = accent;
  ctx.fillText(isShield ? `Transparent → ${poolName}` : `${poolName} → Transparent`, PAD, 112);

  // Hero
  const zec = amountZat / 1e8;
  const heroStr = zec >= 1000
    ? `${(zec / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}K`
    : zec.toLocaleString(undefined, { maximumFractionDigits: 0 });
  drawHero(ctx, PAD - 4, 240, heroStr, 'ZEC');

  // USD — muted secondary
  if (priceUsd) {
    ctx.font = '500 26px Geist';
    ctx.fillStyle = C.textMuted;
    ctx.fillText(fmtUsd(zec * priceUsd), PAD, 286);
  }

  // Direction glyph — subtle decorative accent, right side
  const iconX = W - PAD - 76;
  const iconY = 205;
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.beginPath();
  ctx.arc(iconX, iconY, 64, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(iconX, iconY);
  const dir = isShield ? -1 : 1;
  ctx.beginPath();
  ctx.moveTo(0, dir * 22);
  ctx.lineTo(0, -dir * 22);
  ctx.moveTo(-11, -dir * 11);
  ctx.lineTo(0, -dir * 22);
  ctx.lineTo(11, -dir * 11);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();

  // Stat row
  drawStatRow(ctx, 428, [
    { label: 'PERCENTILE', value: `Top ${(100 - percentileRank).toFixed(1)}% · 90D`, color: accent },
    { label: 'POOL', value: poolName },
    { label: 'BLOCK', value: Number(blockHeight).toLocaleString() },
  ], { accentBorder: `${accent}26` });

  // Txid
  if (txid) {
    ctx.font = 'normal 10px GeistMono';
    ctx.fillStyle = C.textMuted;
    ctx.fillText(shortTxid(txid), PAD, 396);
  }

  await drawFooter(ctx, 'cipherscan.app');
  return saveTempPng(canvas);
}

// ─── 3. Cross-Chain ───────────────────────────────────────────────────────────

async function renderCrossChain({ direction, amountUsd, sourceChain, destChain, zecTxid, amountZec }) {
  ensureFonts();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const isInflow = direction === 'inflow';
  const accent = isInflow ? C.green : C.red;
  drawBase(ctx, accent);

  drawHeaderRow(ctx, isInflow ? 'WHALE INFLOW' : 'WHALE OUTFLOW', accent, 'CROSS-CHAIN');

  // Context line
  const fromLabel = isInflow ? sourceChain.toUpperCase() : 'ZEC';
  const toLabel = isInflow ? 'ZEC' : destChain.toUpperCase();
  ctx.font = '500 15px Geist';
  ctx.fillStyle = accent;
  ctx.fillText(`${fromLabel} → ${toLabel}`, PAD, 112);

  // Hero — USD amount
  drawHero(ctx, PAD - 4, 240, `$${Math.round(amountUsd).toLocaleString()}`, null);

  // ZEC equivalent — muted
  if (amountZec) {
    ctx.font = '500 26px Geist';
    ctx.fillStyle = C.textMuted;
    ctx.fillText(`≈ ${amountZec.toLocaleString(undefined, { maximumFractionDigits: 1 })} ZEC`, PAD, 286);
  }

  // Route strip — full-width glass card with chain logos
  const routeY = 330;
  const routeH = 72;
  drawGlassCard(ctx, PAD, routeY, W - PAD * 2, routeH);

  const logoSize = 36;
  const logoY = routeY + (routeH - logoSize) / 2;
  let cursor = PAD + 28;

  // From
  try {
    const fromLogo = await loadImage(resolveChainFile(isInflow ? sourceChain : 'zec'));
    ctx.drawImage(fromLogo, cursor, logoY, logoSize, logoSize);
  } catch {
    ctx.beginPath();
    ctx.arc(cursor + logoSize / 2, logoY + logoSize / 2, logoSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(30, 41, 59, 0.6)';
    ctx.fill();
  }
  cursor += logoSize + 14;
  ctx.font = 'bold 15px GeistMono';
  ctx.fillStyle = C.textSecondary;
  ctx.fillText(fromLabel, cursor, routeY + routeH / 2 + 5);
  cursor += ctx.measureText(fromLabel).width + 36;

  // Arrow
  ctx.font = '500 22px Geist';
  ctx.fillStyle = accent;
  ctx.fillText('→', cursor, routeY + routeH / 2 + 7);
  cursor += 46;

  // To
  try {
    const toLogo = await loadImage(resolveChainFile(isInflow ? 'zec' : destChain));
    ctx.drawImage(toLogo, cursor, logoY, logoSize, logoSize);
  } catch {
    ctx.beginPath();
    ctx.arc(cursor + logoSize / 2, logoY + logoSize / 2, logoSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(30, 41, 59, 0.6)';
    ctx.fill();
  }
  cursor += logoSize + 14;
  ctx.font = 'bold 15px GeistMono';
  ctx.fillStyle = C.textPrimary;
  ctx.fillText(toLabel, cursor, routeY + routeH / 2 + 5);

  // Bridge label on the right of the strip
  ctx.font = 'normal 10px GeistMono';
  ctx.fillStyle = C.textMuted;
  const bridgeLabel = 'BRIDGE SWAP';
  ctx.fillText(bridgeLabel, W - PAD - 28 - ctx.measureText(bridgeLabel).width, routeY + routeH / 2 + 4);

  // Stat row
  drawStatRow(ctx, 428, [
    { label: 'DIRECTION', value: isInflow ? 'Into Zcash' : 'Out of Zcash', color: accent },
    { label: 'USD VALUE', value: `$${Math.round(amountUsd).toLocaleString()}` },
    { label: 'ZEC AMOUNT', value: amountZec ? `${amountZec.toLocaleString(undefined, { maximumFractionDigits: 1 })} ZEC` : '—' },
  ], { accentBorder: `${accent}26` });

  // Txid
  if (zecTxid) {
    ctx.font = 'normal 10px GeistMono';
    ctx.fillStyle = C.textMuted;
    ctx.fillText(shortTxid(zecTxid), PAD, 540);
  }

  await drawFooter(ctx, 'cipherscan.app');
  return saveTempPng(canvas);
}

// ─── 4. Milestone ─────────────────────────────────────────────────────────────

async function renderMilestone({ type, value, poolSizeZat, orchardPct, orchardToIronwoodPct }) {
  const pct = orchardPct ?? orchardToIronwoodPct;
  ensureFonts();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  drawBase(ctx, C.yellow);

  drawHeaderRow(ctx, 'MILESTONE', C.yellow, 'IRONWOOD');

  // Hero + subtitle
  let mainText = '';
  let unit = null;
  let subtitle = '';
  if (type === 'volume' || type === 'pool_size') {
    const zecVal = type === 'volume' ? value : (poolSizeZat ? poolSizeZat / 1e8 : value / 1e8);
    mainText = fmtZec(zecVal * 1e8);
    unit = 'ZEC';
    subtitle = 'Ironwood pool size just crossed';
  } else if (type === 'supply_pct') {
    mainText = `${value}%`;
    subtitle = 'of Orchard migrated to Ironwood';
  } else {
    mainText = String(value);
  }

  ctx.font = '500 15px Geist';
  ctx.fillStyle = C.yellow;
  ctx.fillText(subtitle, PAD, 112);

  drawHero(ctx, PAD - 4, 240, mainText, unit);

  // Progress bar
  if (pct != null) {
    const barY = 330;
    const barW = W - PAD * 2;

    ctx.font = 'bold 11px GeistMono';
    ctx.fillStyle = C.textMuted;
    ctx.fillText('ORCHARD → IRONWOOD MIGRATION', PAD, barY - 14);
    ctx.fillStyle = C.yellow;
    const pctStr = `${pct.toFixed(1)}%`;
    ctx.fillText(pctStr, W - PAD - ctx.measureText(pctStr).width, barY - 14);

    drawBar(ctx, PAD, barY, barW, 12, pct, C.yellow);
  }

  // Stat row
  const stats = [];
  if (poolSizeZat) stats.push({ label: 'POOL SIZE', value: `${fmtZec(poolSizeZat)} ZEC`, color: C.yellow });
  if (pct != null) stats.push({ label: 'MIGRATION PROGRESS', value: `${pct.toFixed(1)}%`, color: C.yellow });
  stats.push({ label: 'NETWORK', value: 'Mainnet' });
  drawStatRow(ctx, 428, stats, { accentBorder: 'rgba(244, 183, 40, 0.18)' });

  await drawFooter(ctx, 'cipherscan.app/ironwood');
  return saveTempPng(canvas);
}

// ─── 4b. Pool Migration ──────────────────────────────────────────────────────

async function renderMigration({ amountZat, fromPool, toPool, txid, orchardLeftZat, ironwoodBalZat, migrated24hZat, orchardToIronwoodPct, priceUsd }) {
  ensureFonts();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  drawBase(ctx, C.yellow);

  const zec = amountZat / 1e8;
  const pct = orchardToIronwoodPct || 0;

  drawHeaderRow(ctx, 'POOL MIGRATION', C.yellow, 'MAINNET', C.green);

  // Context line
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  ctx.font = '500 15px Geist';
  ctx.fillStyle = C.yellow;
  ctx.fillText(`${cap(fromPool)} → ${cap(toPool)}`, PAD, 112);

  // Hero
  const heroStr = zec >= 1000
    ? `${(zec / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}K`
    : zec.toLocaleString(undefined, { maximumFractionDigits: 0 });
  drawHero(ctx, PAD - 4, 240, heroStr, 'ZEC');

  // USD — muted
  if (priceUsd && priceUsd > 0) {
    const usdStr = fmtUsd(zec * priceUsd);
    ctx.font = '500 28px Geist';
    ctx.fillStyle = '#8a8f98';
    ctx.fillText(usdStr, PAD, 290);
  }

  // Progress bar
  const barY = 330;
  const barW = W - PAD * 2;
  ctx.font = 'bold 11px GeistMono';
  ctx.fillStyle = C.textMuted;
  ctx.fillText('ORCHARD → IRONWOOD MIGRATION', PAD, barY - 14);
  ctx.fillStyle = C.yellow;
  const pctStr = `${pct.toFixed(1)}%`;
  ctx.fillText(pctStr, W - PAD - ctx.measureText(pctStr).width, barY - 14);
  drawBar(ctx, PAD, barY, barW, 12, pct, C.yellow);

  // Stat row
  drawStatRow(ctx, 428, [
    { label: 'ORCHARD LEFT', value: `${fmtZec(orchardLeftZat || 0)} ZEC`, color: C.yellow },
    { label: 'IRONWOOD BALANCE', value: `${fmtZec(ironwoodBalZat || 0)} ZEC`, color: C.yellow },
    { label: 'MIGRATED TODAY', value: `${fmtZec(migrated24hZat || amountZat)} ZEC`, color: C.yellow },
  ], { accentBorder: 'rgba(244, 183, 40, 0.18)' });

  // Txid
  if (txid) {
    ctx.font = 'normal 10px GeistMono';
    ctx.fillStyle = C.textMuted;
    ctx.fillText(shortTxid(txid), PAD, 396);
  }

  await drawFooter(ctx, 'cipherscan.app/ironwood');
  return saveTempPng(canvas);
}

// ─── 5. Privacy Risk ──────────────────────────────────────────────────────────

async function renderPrivacyRisk({ highLinkages, batchClusters }) {
  ensureFonts();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  drawBase(ctx, C.orange);

  drawHeaderRow(ctx, 'PRIVACY ALERT', C.orange, '24H SUMMARY');

  const hasLinkages = highLinkages.highCount > 0;
  const hasClusters = batchClusters.clusterCount > 0;

  // Context line
  ctx.font = '500 15px Geist';
  ctx.fillStyle = C.orange;
  ctx.fillText('Linkage patterns detected on Zcash', PAD, 112);

  // Hero — the dominant number
  if (hasLinkages) {
    drawHero(ctx, PAD - 4, 240, String(highLinkages.highCount), 'high-confidence linkages');
  } else if (hasClusters) {
    drawHero(ctx, PAD - 4, 240, String(batchClusters.clusterCount), 'batch deshielding clusters');
  }

  // Secondary muted line
  if (hasLinkages) {
    ctx.font = '500 26px Geist';
    ctx.fillStyle = C.textMuted;
    ctx.fillText(`${fmtZec(highLinkages.totalAmountZat)} ZEC potentially linked`, PAD, 286);
  }

  // Advisory strip
  const advY = 330;
  drawGlassCard(ctx, PAD, advY, W - PAD * 2, 72);
  ctx.font = 'normal 10px GeistMono';
  ctx.fillStyle = C.textMuted;
  ctx.fillText('RECOMMENDATION', PAD + 28, advY + 29);
  ctx.font = '500 15px Geist';
  ctx.fillStyle = C.textSecondary;
  ctx.fillText('Use standard denominations. Avoid timing correlations.', PAD + 28, advY + 53);

  // Stat row
  drawStatRow(ctx, 428, [
    { label: 'HIGH-CONF LINKAGES', value: String(highLinkages.highCount || 0), color: C.orange },
    { label: 'ZEC LINKED', value: `${fmtZec(highLinkages.totalAmountZat || 0)} ZEC` },
    { label: 'BATCH CLUSTERS', value: hasClusters ? `${batchClusters.clusterCount} (${batchClusters.totalMembers} txs)` : '0' },
  ], { accentBorder: 'rgba(255, 107, 53, 0.18)' });

  await drawFooter(ctx, 'cipherscan.app/privacy-risks');
  return saveTempPng(canvas);
}

// ─── 6. Network Pulse Anomaly ─────────────────────────────────────────────────

const { PULSE_METRIC_UNITS, fmtMetricValue } = require('./formatter');

async function renderPulse({ metric, description, value, zscore, mean, std, direction }) {
  ensureFonts();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const absZ = Math.abs(zscore);
  const isCritical = absZ >= 4.0;
  const accent = isCritical ? C.red : C.cyan;
  drawBase(ctx, accent);

  drawHeaderRow(ctx, 'NETWORK PULSE', accent, isCritical ? 'CRITICAL ANOMALY' : 'ANOMALY DETECTED', accent);

  // Context line — what happened
  ctx.font = '500 15px Geist';
  ctx.fillStyle = accent;
  ctx.fillText(description, PAD, 112);

  // Hero — the metric value, unit split per type
  const unit = PULSE_METRIC_UNITS[metric];
  let heroStr;
  let heroUnit = null;
  if (unit === 'ZEC') {
    heroStr = fmtZec(value);
    heroUnit = 'ZEC';
  } else if (unit === 'txs') {
    heroStr = Math.round(value).toLocaleString();
    heroUnit = 'TXS';
  } else if (unit === '%') {
    heroStr = `${value.toFixed(1)}%`;
  } else if (unit === 'USD') {
    heroStr = fmtUsd(value);
  } else {
    heroStr = value.toFixed(2);
  }
  drawHero(ctx, PAD - 4, 240, heroStr, heroUnit);

  // Secondary muted line — deviation summary
  const rel = direction === 'up' ? 'above' : 'below';
  ctx.font = '500 28px Geist';
  ctx.fillStyle = '#8a8f98';
  ctx.fillText(`${absZ.toFixed(1)}σ ${rel} the 90-day average`, PAD, 290);

  // Deviation bar — |z| against a 5σ scale
  const barY = 330;
  const barW = W - PAD * 2;
  ctx.font = 'bold 11px GeistMono';
  ctx.fillStyle = C.textMuted;
  ctx.fillText('DEVIATION FROM 90-DAY MEAN', PAD, barY - 14);
  ctx.fillStyle = accent;
  const zStr = `z = ${zscore >= 0 ? '+' : ''}${zscore.toFixed(2)}`;
  ctx.fillText(zStr, W - PAD - ctx.measureText(zStr).width, barY - 14);
  drawBar(ctx, PAD, barY, barW, 12, Math.min(absZ / 5, 1) * 100, accent);

  // Stat row
  drawStatRow(ctx, 428, [
    { label: '90-DAY MEAN', value: fmtMetricValue(metric, mean) },
    { label: 'STD DEVIATION', value: fmtMetricValue(metric, std) },
    { label: 'Z-SCORE', value: zStr, color: accent },
  ], { accentBorder: `${accent}26` });

  await drawFooter(ctx, 'cipherscan.app/pulse');
  return saveTempPng(canvas);
}

module.exports = {
  renderDailyDigest,
  renderLargeFlow,
  renderCrossChain,
  renderMilestone,
  renderMigration,
  renderPrivacyRisk,
  renderPulse,
};
