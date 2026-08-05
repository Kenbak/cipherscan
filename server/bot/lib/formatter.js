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
  shielded,
  flows,
  ironwood,
  compliance,
}) {
  const lines = [
    `📊 Zcash Daily — Block ${fmtHeight(chainTip.height)}`,
    ``,
    `🛡 Shielded: ${fmtZec(shielded.totalZat)}`,
    `24h: +${fmtZec(flows.netShielded)} in / -${fmtZec(flows.netDeshielded)} out`,
    ``,
    `🌲 Ironwood: ${fmtZec(ironwood.poolSizeZat)}`,
    `Orchard → Ironwood: ${fmtPct(ironwood.orchardToIronwoodPct)}`,
    `ZIP-318 compliance: ${fmtPct(compliance.pct)}`,
    ``,
    `${BASE_URL}/ironwood`,
  ];

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

// ─── Cross-chain Whale Alert ──────────────────────────────────────────────

function formatCrossChainAlert({ direction, amountUsd, sourceChain, destChain, zecTxid }) {
  const arrow = direction === 'inflow' ? '🟢' : '🔴';
  const verb = direction === 'inflow' ? 'in' : 'out';
  const chain = direction === 'inflow' ? sourceChain : destChain;
  const lines = [
    `${arrow} Cross-chain ${verb}: $${Math.round(amountUsd).toLocaleString()}`,
    `${chain.toUpperCase()} ${direction === 'inflow' ? '→' : '←'} ZEC`,
  ];
  if (zecTxid) lines.push(`${BASE_URL}/tx/${zecTxid}`);
  return lines.join('\n');
}

// ─── Privacy Risk Alert ───────────────────────────────────────────────────

function formatPrivacyRiskAlert({ highLinkages, batchClusters }) {
  const lines = [
    `🔍 24h Privacy Risk Summary`,
  ];

  if (highLinkages.highCount > 0) {
    lines.push(`${highLinkages.highCount} high-confidence linkage patterns (${fmtZec(highLinkages.totalAmountZat)})`);
  }

  if (batchClusters.clusterCount > 0) {
    lines.push(`${batchClusters.clusterCount} batch deshielding clusters (${batchClusters.totalMembers} txs, ${fmtZec(batchClusters.totalAmountZat)})`);
  }

  lines.push(``, `Use standard denominations. Avoid timing correlations.`);
  lines.push(`${BASE_URL}/privacy`);
  return lines.join('\n');
}

module.exports = {
  formatDailyDigest,
  formatLargeFlowAlert,
  formatIronwoodMilestone,
  formatReorgAlert,
  formatChainStall,
  formatChainRecovery,
  formatCrossChainAlert,
  formatPrivacyRiskAlert,
  fmtZec,
  fmtPct,
  fmtHeight,
};
