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
  ctx.fillStyle = 'rgba(30, 41, 59, 0.25)';
  ctx.fill();
  const fillW = Math.max(h, w * Math.min(pct / 100, 1));
  roundedRect(ctx, x, y, fillW, h, h / 2);
  ctx.fillStyle = color;
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

// ─── 1. Daily Digest ──────────────────────────────────────────────────────────

async function renderDailyDigest({ chainTip, shielded, flows, ironwood, compliance, crossChain }) {
  ensureFonts();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  drawBase(ctx);

  // Header
  ctx.font = 'bold 13px GeistMono';
  ctx.fillStyle = C.cyan;
  ctx.fillText('DAILY UPDATE', PAD, 56);
  ctx.font = 'normal 13px GeistMono';
  ctx.fillStyle = C.textMuted;
  ctx.fillText(`Block ${Number(chainTip.height).toLocaleString()}`, PAD + 140, 56);

  // Three compact cards — vertically centered
  const cardGap = 20;
  const cardW = (W - PAD * 2 - cardGap * 2) / 3;
  const cardH = 220;
  const headerH = 70;
  const footerH = 70;
  const availableH = H - headerH - footerH;
  const cardY = headerH + (availableH - cardH) / 2;

  for (let i = 0; i < 3; i++) {
    const cx = PAD + i * (cardW + cardGap);
    drawGlassCard(ctx, cx, cardY, cardW, cardH);

    const innerX = cx + 24;
    const innerW = cardW - 48;

    if (i === 0) {
      ctx.font = 'normal 10px GeistMono';
      ctx.fillStyle = C.textMuted;
      ctx.fillText('SHIELDED SUPPLY', innerX, cardY + 30);
      ctx.font = 'bold 32px Geist';
      ctx.fillStyle = C.textPrimary;
      ctx.fillText(`${fmtZec(shielded.totalZat)} ZEC`, innerX, cardY + 68);
      ctx.font = '500 14px Geist';
      ctx.fillStyle = C.green;
      ctx.fillText(`+${fmtZec(flows.netShielded)}`, innerX, cardY + 105);
      const gw = ctx.measureText(`+${fmtZec(flows.netShielded)}`).width;
      ctx.fillStyle = C.red;
      ctx.fillText(`-${fmtZec(flows.netDeshielded)}`, innerX + gw + 16, cardY + 105);
      ctx.font = 'normal 10px GeistMono';
      ctx.fillStyle = C.textMuted;
      ctx.fillText('24h shield / deshield', innerX, cardY + 128);
    } else if (i === 1) {
      ctx.font = 'normal 10px GeistMono';
      ctx.fillStyle = C.textMuted;
      ctx.fillText('IRONWOOD POOL', innerX, cardY + 30);
      ctx.font = 'bold 32px Geist';
      ctx.fillStyle = C.textPrimary;
      ctx.fillText(`${fmtZec(ironwood.poolSizeZat)} ZEC`, innerX, cardY + 68);
      ctx.font = '500 13px Geist';
      ctx.fillStyle = C.textSecondary;
      ctx.fillText(`${ironwood.orchardToIronwoodPct.toFixed(1)}% migrated from Orchard`, innerX, cardY + 100);
      drawBar(ctx, innerX, cardY + 116, innerW, 5, ironwood.orchardToIronwoodPct, C.cyan);
    } else {
      ctx.font = 'normal 10px GeistMono';
      ctx.fillStyle = C.textMuted;
      ctx.fillText('ZIP-318 COMPLIANCE', innerX, cardY + 30);
      ctx.font = 'bold 36px Geist';
      ctx.fillStyle = C.textPrimary;
      ctx.fillText(`${compliance.pct.toFixed(1)}%`, innerX, cardY + 70);
      ctx.font = 'normal 11px GeistMono';
      ctx.fillStyle = C.textMuted;
      ctx.fillText('fully compliant migrations', innerX, cardY + 96);
      drawBar(ctx, innerX, cardY + 112, innerW, 5, compliance.pct, C.cyan);
    }
  }

  // Footer line
  ctx.strokeStyle = 'rgba(30, 41, 59, 0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, H - 56);
  ctx.lineTo(W - PAD, H - 56);
  ctx.stroke();

  await drawFooter(ctx, 'cipherscan.app');
  return saveTempPng(canvas);
}

// ─── 2. Large Flow ────────────────────────────────────────────────────────────

async function renderLargeFlow({ direction, amountZat, pool, blockHeight, txid, percentileRank, priceUsd }) {
  ensureFonts();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  drawBase(ctx);

  const isShield = direction === 'shield';
  const accent = isShield ? C.green : C.red;

  // Header
  ctx.font = 'bold 13px GeistMono';
  ctx.fillStyle = accent;
  ctx.fillText(isShield ? 'SHIELDED' : 'DESHIELDED', PAD, 56);
  ctx.font = 'normal 13px GeistMono';
  ctx.fillStyle = C.textMuted;
  ctx.fillText(`${pool}  ·  Block ${Number(blockHeight).toLocaleString()}`, PAD + 120, 56);

  // Hero amount — left side
  const zec = amountZat / 1e8;
  ctx.font = 'bold 80px Geist';
  ctx.fillStyle = C.textPrimary;
  ctx.fillText(`${zec.toLocaleString(undefined, { maximumFractionDigits: 0 })} ZEC`, PAD, 260);

  // USD below
  if (priceUsd) {
    ctx.font = '500 30px Geist';
    ctx.fillStyle = C.textSecondary;
    ctx.fillText(fmtUsd(zec * priceUsd), PAD, 310);
  }

  // Percentile
  ctx.font = '500 16px Geist';
  ctx.fillStyle = C.cyan;
  ctx.fillText(`Top ${(100 - percentileRank).toFixed(1)}% of 90-day flows`, PAD, 370);

  // Shield icon on the right — large decorative element
  const shieldX = W - PAD - 140;
  const shieldY = 200;
  ctx.save();
  ctx.translate(shieldX, shieldY);
  const s = 2.2; // scale
  ctx.scale(s, s);
  // Classic shield path (48x48 viewbox centered at 0,0)
  ctx.beginPath();
  ctx.moveTo(0, -24);
  ctx.lineTo(20, -18);
  ctx.lineTo(20, -2);
  ctx.quadraticCurveTo(20, 14, 0, 24);
  ctx.quadraticCurveTo(-20, 14, -20, -2);
  ctx.lineTo(-20, -18);
  ctx.closePath();
  ctx.fillStyle = `${accent}0C`;
  ctx.fill();
  ctx.strokeStyle = `${accent}50`;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Arrow inside
  ctx.beginPath();
  const arrowDir = isShield ? -1 : 1;
  ctx.moveTo(0, arrowDir * 10);
  ctx.lineTo(0, -arrowDir * 10);
  ctx.moveTo(-6, -arrowDir * 4);
  ctx.lineTo(0, -arrowDir * 10);
  ctx.lineTo(6, -arrowDir * 4);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();

  // Footer
  ctx.strokeStyle = 'rgba(30, 41, 59, 0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, H - 56);
  ctx.lineTo(W - PAD, H - 56);
  ctx.stroke();

  if (txid) {
    ctx.font = 'normal 11px GeistMono';
    ctx.fillStyle = C.textMuted;
    ctx.fillText(txid.slice(0, 16) + '...' + txid.slice(-8), PAD, H - 72);
  }

  await drawFooter(ctx, 'cipherscan.app');
  return saveTempPng(canvas);
}

// ─── 3. Cross-Chain ───────────────────────────────────────────────────────────

async function renderCrossChain({ direction, amountUsd, sourceChain, destChain, zecTxid, amountZec }) {
  ensureFonts();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  drawBase(ctx);

  const isInflow = direction === 'inflow';
  const accent = isInflow ? C.green : C.red;

  // Header
  ctx.font = 'bold 13px GeistMono';
  ctx.fillStyle = accent;
  ctx.fillText(isInflow ? 'INFLOW' : 'OUTFLOW', PAD, 56);
  ctx.font = 'normal 13px GeistMono';
  ctx.fillStyle = C.textMuted;
  ctx.fillText('Cross-chain bridge swap', PAD + 90, 56);

  // Chain flow visualization — centered
  const fromChain = isInflow ? sourceChain.toLowerCase() : 'zec';
  const toChain = isInflow ? 'zec' : destChain.toLowerCase();
  const fromLabel = isInflow ? sourceChain.toUpperCase() : 'ZEC';
  const toLabel = isInflow ? 'ZEC' : destChain.toUpperCase();
  const centerX = W / 2;
  const flowY = 200;

  // Load and draw chain logos
  const chainsDir = path.join(ASSETS, 'chains');
  const logoSize = 56;
  const spacing = 180;

  // From logo
  const fromX = centerX - spacing;
  try {
    const fromLogo = await loadImage(path.join(chainsDir, `${fromChain}.png`));
    ctx.drawImage(fromLogo, fromX - logoSize / 2, flowY - logoSize / 2, logoSize, logoSize);
  } catch {
    ctx.beginPath();
    ctx.arc(fromX, flowY, logoSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20, 22, 31, 0.8)';
    ctx.fill();
    ctx.strokeStyle = C.border;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  // Label below
  ctx.font = 'bold 14px GeistMono';
  ctx.fillStyle = C.textSecondary;
  ctx.textAlign = 'center';
  ctx.fillText(fromLabel, fromX, flowY + logoSize / 2 + 22);

  // Arrow
  ctx.font = '500 32px Geist';
  ctx.fillStyle = C.cyan;
  ctx.fillText('→', centerX, flowY + 8);

  // To logo
  const toX = centerX + spacing;
  try {
    const toLogo = await loadImage(path.join(chainsDir, `${toChain}.png`));
    ctx.drawImage(toLogo, toX - logoSize / 2, flowY - logoSize / 2, logoSize, logoSize);
  } catch {
    ctx.beginPath();
    ctx.arc(toX, flowY, logoSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20, 22, 31, 0.8)';
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.font = 'bold 14px GeistMono';
  ctx.fillStyle = C.textPrimary;
  ctx.fillText(toLabel, toX, flowY + logoSize / 2 + 22);

  ctx.textAlign = 'left';

  // Description line
  ctx.font = '500 18px Geist';
  ctx.fillStyle = C.textSecondary;
  const descText = isInflow
    ? `${amountZec ? amountZec.toFixed(1) + ' ZEC' : fmtUsd(amountUsd)} bridged from ${sourceChain.toUpperCase()} to Zcash`
    : `${amountZec ? amountZec.toFixed(1) + ' ZEC' : fmtUsd(amountUsd)} bridged from Zcash to ${destChain.toUpperCase()}`;
  const descW = ctx.measureText(descText).width;
  ctx.textAlign = 'center';
  ctx.fillText(descText, centerX, flowY + logoSize / 2 + 50);
  ctx.textAlign = 'left';

  // Amounts — centered below
  ctx.font = 'bold 64px Geist';
  ctx.fillStyle = C.textPrimary;
  const usdText = `$${Math.round(amountUsd).toLocaleString()}`;
  const usdW = ctx.measureText(usdText).width;
  ctx.fillText(usdText, centerX - usdW / 2, 380);

  // ZEC amount
  if (amountZec) {
    ctx.font = '500 20px Geist';
    ctx.fillStyle = C.textSecondary;
    const zecText = `≈ ${amountZec.toFixed(1)} ZEC`;
    const zecW = ctx.measureText(zecText).width;
    ctx.fillText(zecText, centerX - zecW / 2, 415);
  }

  // Footer
  ctx.strokeStyle = 'rgba(30, 41, 59, 0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, H - 56);
  ctx.lineTo(W - PAD, H - 56);
  ctx.stroke();

  if (zecTxid) {
    ctx.font = 'normal 11px GeistMono';
    ctx.fillStyle = C.textMuted;
    ctx.fillText(zecTxid.slice(0, 16) + '...' + zecTxid.slice(-8), PAD, H - 72);
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

  // Header
  ctx.font = 'bold 13px GeistMono';
  ctx.fillStyle = C.yellow;
  ctx.fillText('MILESTONE', PAD, 56);

  // Hero stat — vertically centered
  let mainText = '';
  let subtitle = '';
  if (type === 'volume' || type === 'pool_size') {
    const zecVal = type === 'volume' ? value : (poolSizeZat ? poolSizeZat / 1e8 : value / 1e8);
    mainText = `${fmtZec(zecVal * 1e8)} ZEC`;
    subtitle = 'Ironwood pool size';
  } else if (type === 'supply_pct') {
    mainText = `${value}%`;
    subtitle = 'of Orchard migrated to Ironwood';
  } else {
    mainText = String(value);
    subtitle = '';
  }

  ctx.font = 'bold 80px Geist';
  ctx.fillStyle = C.textPrimary;
  ctx.fillText(mainText, PAD, 250);

  ctx.font = '500 20px Geist';
  ctx.fillStyle = C.textSecondary;
  ctx.fillText(subtitle, PAD, 295);

  // Progress bar with labels
  if (pct != null) {
    const barY = 370;
    const barW = W - PAD * 2;
    ctx.font = 'normal 11px GeistMono';
    ctx.fillStyle = C.textMuted;
    ctx.fillText('ORCHARD → IRONWOOD MIGRATION', PAD, barY - 14);
    drawBar(ctx, PAD, barY, barW, 10, pct, C.yellow);
    // Labels at ends
    ctx.font = 'normal 11px GeistMono';
    ctx.fillStyle = C.textMuted;
    ctx.fillText('0%', PAD, barY + 28);
    ctx.fillStyle = C.yellow;
    ctx.fillText(`${pct.toFixed(1)}%`, PAD + barW * (pct / 100) - 15, barY + 28);
    ctx.fillStyle = C.textMuted;
    const hundredW = ctx.measureText('100%').width;
    ctx.fillText('100%', PAD + barW - hundredW, barY + 28);
  }

  // Footer
  ctx.strokeStyle = 'rgba(30, 41, 59, 0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, H - 56);
  ctx.lineTo(W - PAD, H - 56);
  ctx.stroke();

  await drawFooter(ctx, 'cipherscan.app/ironwood');
  return saveTempPng(canvas);
}

// ─── 5. Privacy Risk ──────────────────────────────────────────────────────────

async function renderPrivacyRisk({ highLinkages, batchClusters }) {
  ensureFonts();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  drawBase(ctx, C.orange);

  // Header
  ctx.font = 'bold 13px GeistMono';
  ctx.fillStyle = C.orange;
  ctx.fillText('PRIVACY ALERT', PAD, 56);
  ctx.font = 'normal 13px GeistMono';
  ctx.fillStyle = C.textMuted;
  ctx.fillText('24-hour summary', PAD + 150, 56);

  // Main stat — hero placement
  if (highLinkages.highCount > 0) {
    ctx.font = 'bold 72px Geist';
    ctx.fillStyle = C.textPrimary;
    ctx.fillText(String(highLinkages.highCount), PAD, 220);
    ctx.font = '500 22px Geist';
    ctx.fillStyle = C.textSecondary;
    ctx.fillText('high-confidence linkage patterns', PAD, 260);
    ctx.font = 'normal 13px GeistMono';
    ctx.fillStyle = C.textMuted;
    ctx.fillText(`${fmtZec(highLinkages.totalAmountZat)} ZEC potentially linked`, PAD, 295);
  }

  // Secondary stat
  if (batchClusters.clusterCount > 0) {
    const secY = highLinkages.highCount > 0 ? 365 : 220;
    ctx.font = 'bold 42px Geist';
    ctx.fillStyle = C.textPrimary;
    ctx.fillText(String(batchClusters.clusterCount), PAD, secY);
    ctx.font = '500 18px Geist';
    ctx.fillStyle = C.textSecondary;
    ctx.fillText(`batch deshielding clusters (${batchClusters.totalMembers} txs)`, PAD, secY + 35);
  }

  // Footer
  ctx.strokeStyle = 'rgba(30, 41, 59, 0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, H - 56);
  ctx.lineTo(W - PAD, H - 56);
  ctx.stroke();

  ctx.font = 'normal 12px Geist';
  ctx.fillStyle = C.textMuted;
  ctx.fillText('Use standard denominations. Avoid timing correlations.', PAD, H - 72);

  await drawFooter(ctx, 'cipherscan.app/privacy-risks');
  return saveTempPng(canvas);
}

module.exports = {
  renderDailyDigest,
  renderLargeFlow,
  renderCrossChain,
  renderMilestone,
  renderPrivacyRisk,
};
