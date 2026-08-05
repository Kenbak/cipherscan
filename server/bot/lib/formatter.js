'use strict';

/**
 * CipherScan Data Bot — Post Formatter
 *
 * Composes post text for each content type.
 * All posts are self-contained (no "click to see more" dependency on links).
 * Links provide provenance only.
 */

const BASE_URL = 'https://cipherscan.app';

function fmtZec(zat) {
  const zec = zat / 1e8;
  if (zec >= 1_000_000) return `${(zec / 1_000_000).toFixed(2)}M ZEC`;
  if (zec >= 1_000) return `${(zec / 1_000).toFixed(1)}K ZEC`;
  return `${zec.toFixed(2)} ZEC`;
}

function fmtPct(pct) {
  return `${pct.toFixed(1)}%`;
}

function fmtBlockTime(seconds) {
  return `${seconds.toFixed(1)}s`;
}

function fmtHeight(h) {
  return h.toLocaleString();
}

// ─── Daily Digest ────────────────────────────────────────────────────────────

function formatDailyDigest({
  chainTip,
  avgBlockTime,
  shieldedPct,
  flows,
  ironwood,
  compliance,
  signalOfDay,
}) {
  const lines = [
    `📊 Zcash Daily — Block ${fmtHeight(chainTip.height)}`,
    `⏱ ${fmtBlockTime(avgBlockTime)} avg | 🛡 ${fmtPct(shieldedPct)} shielded`,
    `🌲 Ironwood: ${fmtZec(ironwood.totalVolumeZat)} total`,
    `  24h: ${fmtZec(ironwood.volume24hZat)} (${ironwood.migrations24h} txs) | ZIP-318: ${fmtPct(compliance.pct)}`,
    `Shield: ${fmtZec(flows.netShielded)} | Deshield: ${fmtZec(flows.netDeshielded)}`,
  ];

  if (signalOfDay) {
    lines.push(signalOfDay);
  }

  lines.push(`${BASE_URL}/ironwood`);

  return lines.join('\n');
}

// ─── Large Flow Alert ────────────────────────────────────────────────────────

function formatLargeFlowAlert({ direction, amountZat, pool, blockHeight, txid, percentileRank }) {
  const arrow = direction === 'shield' ? '🟢 Large Shield' : '🔴 Large Deshield';
  const lines = [
    `${arrow}: ${fmtZec(amountZat)}`,
    ``,
    `Pool: ${pool}`,
    `Block: ${fmtHeight(blockHeight)}`,
    `Top ${(100 - percentileRank).toFixed(2)}% of 90-day flows`,
    ``,
    `${BASE_URL}/tx/${txid}`,
  ];
  return lines.join('\n');
}

// ─── Ironwood Milestone ──────────────────────────────────────────────────────

function formatIronwoodMilestone({ type, value, context }) {
  let headline;
  switch (type) {
    case 'volume':
      headline = `🌲 Ironwood milestone: ${fmtZec(value * 1e8)} migrated`;
      break;
    case 'count':
      headline = `🌲 Ironwood milestone: ${value.toLocaleString()} migration transactions`;
      break;
    case 'supply_pct':
      headline = `🌲 Ironwood milestone: ${value}% of shielded supply migrated`;
      break;
    case 'compliance':
      headline = `🌲 ZIP-318 compliance sustained above ${value}%`;
      break;
    default:
      headline = `🌲 Ironwood milestone reached`;
  }

  const lines = [headline];
  if (context) lines.push(``, context);
  lines.push(``, `${BASE_URL}/ironwood`);
  return lines.join('\n');
}

// ─── Reorg Alert ─────────────────────────────────────────────────────────────

function formatReorgAlert({ depth, forkHeight, canonicalTip }) {
  const lines = [
    `⚠️ Chain reorganization detected`,
    ``,
    `Depth: ${depth} blocks`,
    `Fork height: ${fmtHeight(forkHeight)}`,
    `Canonical tip: ${fmtHeight(canonicalTip)}`,
    ``,
    `Monitoring for stability.`,
  ];
  return lines.join('\n');
}

// ─── Chain Stall ─────────────────────────────────────────────────────────────

function formatChainStall({ lastBlockTime, gapSeconds }) {
  const minutes = Math.floor(gapSeconds / 60);
  const lines = [
    `⚠️ Block production gap: ${minutes} minutes`,
    ``,
    `Last block: ${new Date(lastBlockTime * 1000).toISOString()}`,
    `Expected: ~75 seconds between blocks`,
    ``,
    `Monitoring. Will update on recovery.`,
  ];
  return lines.join('\n');
}

function formatChainRecovery({ blockHeight, gapMinutes }) {
  return [
    `✅ Block production resumed at height ${fmtHeight(blockHeight)}`,
    ``,
    `Gap was ~${gapMinutes} minutes. Chain is healthy.`,
  ].join('\n');
}

module.exports = {
  formatDailyDigest,
  formatLargeFlowAlert,
  formatIronwoodMilestone,
  formatReorgAlert,
  formatChainStall,
  formatChainRecovery,
  fmtZec,
  fmtPct,
  fmtHeight,
};
