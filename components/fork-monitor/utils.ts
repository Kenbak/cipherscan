import type { ForkMonitorData } from './types';

export function truncHash(hash: string | null, len = 12): string {
  if (!hash) return '—';
  if (hash.length <= len + 3) return hash;
  return `${hash.slice(0, len)}…`;
}

export function fmtAgo(ms: number): string {
  const secs = Math.floor((Date.now() - ms) / 1000);
  if (secs < 0) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export function parseHeightHashLines(input: string): { height: number; hash: string }[] {
  const pairs: { height: number; hash: string }[] = [];
  const seen = new Set<string>();
  for (const match of input.matchAll(/(\d+)\s+([0-9a-fA-F]{64})/g)) {
    const height = parseInt(match[1], 10);
    const hash = match[2].toLowerCase();
    const key = `${height}:${hash}`;
    if (!seen.has(key)) {
      pairs.push({ height, hash });
      seen.add(key);
    }
  }
  return pairs.slice(0, 12);
}

export function branchLabel(branch: string): string {
  const labels: Record<string, string> = {
    reference: 'Reference',
    cipherscan: 'CipherScan',
    ctaz: 'cTAZ',
    other: 'Other',
    unknown: 'Unknown',
  };
  return labels[branch] ?? branch;
}

export function makeCommunityReport(data: ForkMonitorData): string {
  const cs = data.cipherscan;
  const ct = data.ctaz;
  const lines = [
    `CipherScan fork monitor: ${data.status}`,
    `CipherScan: h${cs.tip} ${cs.tip_hash || 'no-tip-hash'} peers=${cs.peers} finalized=${cs.finalized}`,
  ];
  if (ct) {
    lines.push(`cTAZ: h${ct.tip} ${ct.tip_hash || 'no-tip-hash'} peers=${ct.peers} finalized=${ct.finalized}`);
  }
  const matched = data.anchors.filter((a) => a.match === true).map((a) => `h${a.height}`).join(', ');
  const mismatched = data.anchors.filter((a) => a.match === false).map((a) => `h${a.height}`).join(', ');
  lines.push(`Anchors matched: ${matched || 'none'}`);
  if (mismatched) lines.push(`Anchors mismatched: ${mismatched}`);
  lines.push('Reminder: peer count shows connectivity, not fork correctness.');
  return lines.join('\n');
}

export function statusMeta(data: ForkMonitorData) {
  if (data.status === 'aligned') {
    return {
      label: 'Chains aligned',
      detail: 'Known anchor hashes match between CipherScan and cTAZ.',
      badge: 'green' as const,
      accent: 'border-l-cipher-cyan',
    };
  }
  if (data.status === 'diverged') {
    return {
      label: 'Chains diverged',
      detail: data.first_divergence
        ? `First mismatch at height ${data.first_divergence.toLocaleString()}.`
        : 'Anchor hashes disagree between reference nodes.',
      badge: 'orange' as const,
      accent: 'border-l-cipher-orange',
    };
  }
  return {
    label: 'cTAZ unavailable',
    detail: 'CipherScan anchors are live; cTAZ comparison is temporarily offline.',
    badge: 'muted' as const,
    accent: 'border-l-cipher-border',
  };
}
