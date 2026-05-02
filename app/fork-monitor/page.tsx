'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { getApiUrl } from '@/lib/api-config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Anchor {
  height: number;
  label: string;
  cipherscan_hash: string | null;
  ctaz_hash: string | null;
  match: boolean | null;
}

interface NodeRef {
  tip: number;
  tip_hash: string | null;
  peers: number;
  finalized: number;
  finality_gap: number;
}

interface RegisteredNode {
  name: string;
  tip: number;
  tip_hash: string | null;
  sample_hashes?: { height: number; hash: string }[];
  peers: number | null;
  mining: boolean | null;
  branch: string;
  reported_at: number;
}

interface ForkMonitorData {
  generated_at: string;
  cipherscan: NodeRef;
  ctaz: NodeRef | null;
  status: 'aligned' | 'diverged' | 'ctaz_unavailable';
  first_divergence: number | null;
  anchors: Anchor[];
  nodes: RegisteredNode[];
  split_hints: string[];
}

interface CheckResult {
  height: number;
  cipherscan_hash: string | null;
  ctaz_hash: string | null;
  match: boolean | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncHash(hash: string | null, len = 12): string {
  if (!hash) return '-';
  return hash.slice(0, len) + '...';
}

function fmtAgo(ms: number): string {
  const secs = Math.floor((Date.now() - ms) / 1000);
  if (secs < 0) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function parseHeightHashLines(input: string): { height: number; hash: string }[] {
  const pairs: { height: number; hash: string }[] = [];
  const seen = new Set<string>();
  for (const match of input.matchAll(/(\d+)\s+([0-9a-fA-F]{64})/g)) {
    const height = parseInt(match[1]);
    const hash = match[2].toLowerCase();
    const key = `${height}:${hash}`;
    if (!seen.has(key)) {
      pairs.push({ height, hash });
      seen.add(key);
    }
  }
  return pairs.slice(0, 12);
}

function branchLabel(branch: string): string {
  if (branch === 'reference') return 'Reference branch';
  if (branch === 'cipherscan') return 'CipherScan branch';
  if (branch === 'ctaz') return 'cTAZ branch';
  if (branch === 'other') return 'Other branch';
  return 'Unknown branch';
}

function branchBadgeColor(branch: string): 'green' | 'orange' | 'muted' {
  if (branch === 'reference') return 'green';
  if (branch === 'other') return 'orange';
  return 'muted';
}

function makeCommunityReport(data: ForkMonitorData): string {
  const cs = data.cipherscan;
  const ct = data.ctaz;
  const lines = [
    `CipherScan fork monitor: ${data.status}`,
    `CipherScan: h${cs.tip} ${cs.tip_hash || 'no-tip-hash'} peers=${cs.peers} finalized=${cs.finalized}`,
  ];
  if (ct) {
    lines.push(`cTAZ: h${ct.tip} ${ct.tip_hash || 'no-tip-hash'} peers=${ct.peers} finalized=${ct.finalized}`);
  }
  const matched = data.anchors
    .filter((a) => a.match === true)
    .map((a) => `h${a.height}`)
    .join(', ');
  const mismatched = data.anchors
    .filter((a) => a.match === false)
    .map((a) => `h${a.height}`)
    .join(', ');
  lines.push(`Anchors matched: ${matched || 'none'}`);
  if (mismatched) lines.push(`Anchors mismatched: ${mismatched}`);
  lines.push('Reminder: peer count shows connectivity, not fork correctness.');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="text-[10px] font-mono text-muted hover:text-cipher-cyan transition-colors"
      title="Copy full hash"
    >
      {copied ? 'copied' : 'copy'}
    </button>
  );
}

function StatusDot({ color }: { color: 'green' | 'orange' | 'red' }) {
  const bg = { green: 'bg-cipher-green', orange: 'bg-cipher-orange', red: 'bg-red-500' }[color];
  const ping = { green: 'bg-cipher-green', orange: 'bg-cipher-orange', red: 'bg-red-500' }[color];
  return (
    <span className="relative flex h-2 w-2">
      <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${ping} opacity-60`} />
      <span className={`relative inline-flex h-2 w-2 rounded-full ${bg}`} />
    </span>
  );
}

function MatchIcon({ match }: { match: boolean | null }) {
  if (match === null) return <span className="text-muted text-xs">-</span>;
  if (match) return <span className="text-cipher-green font-mono text-xs" title="Match">&#10003;</span>;
  return <span className="text-red-500 font-mono text-xs" title="Mismatch">&#10007;</span>;
}

function NodeCard({ label, node, color }: { label: string; node: NodeRef | null; color: 'green' | 'orange' | 'red' }) {
  if (!node) {
    return (
      <div className="card p-4 flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-3">
          <StatusDot color="red" />
          <span className="text-xs font-mono text-muted uppercase tracking-wider">{label}</span>
        </div>
        <div className="text-sm text-muted">Unavailable</div>
      </div>
    );
  }
  return (
    <div className="card p-4 flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-3">
        <StatusDot color={color} />
        <span className="text-xs font-mono text-muted uppercase tracking-wider">{label}</span>
      </div>
      <div className="space-y-2">
        <div className="flex justify-between items-baseline">
          <span className="text-[10px] font-mono text-muted">Tip</span>
          <span className="text-sm font-mono font-bold text-primary">h{node.tip.toLocaleString()}</span>
        </div>
        <div className="flex justify-between items-baseline gap-2">
          <span className="text-[10px] font-mono text-muted">Hash</span>
          <div className="flex items-center gap-1.5">
            <code className="text-xs font-mono text-secondary">{truncHash(node.tip_hash)}</code>
            {node.tip_hash && <CopyButton text={node.tip_hash} />}
          </div>
        </div>
        <div className="flex justify-between items-baseline">
          <span className="text-[10px] font-mono text-muted">Peers</span>
          <span className={`text-xs font-mono ${node.peers < 5 ? 'text-red-500' : 'text-secondary'}`}>
            {node.peers}
          </span>
        </div>
        <div className="flex justify-between items-baseline">
          <span className="text-[10px] font-mono text-muted">Finalized</span>
          <span className="text-xs font-mono text-secondary">h{node.finalized.toLocaleString()}</span>
        </div>
        <div className="flex justify-between items-baseline">
          <span className="text-[10px] font-mono text-muted">Gap</span>
          <span className={`text-xs font-mono ${node.finality_gap > 1000 ? 'text-cipher-orange' : 'text-secondary'}`}>
            {node.finality_gap.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}

function ForkTimeline({ data }: { data: ForkMonitorData }) {
  const anchors = data.anchors;
  const first = anchors[0]?.height ?? data.cipherscan.finalized;
  const last = Math.max(data.cipherscan.tip, data.ctaz?.tip ?? 0, anchors[anchors.length - 1]?.height ?? 0);
  const span = Math.max(last - first, 1);
  const branchCounts = data.nodes.reduce<Record<string, number>>((acc, node) => {
    acc[node.branch] = (acc[node.branch] || 0) + 1;
    return acc;
  }, {});

  return (
    <Card className="mb-6">
      <CardBody className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div>
            <h2 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider">
              Fork Timeline
            </h2>
            <p className="text-xs text-muted mt-1">
              Anchors are fixed-height observations. Node reports are self-reported and expire after 1 hour.
            </p>
          </div>
          <Badge color={data.status === 'aligned' ? 'green' : 'orange'}>
            {data.status === 'aligned' ? 'NO KNOWN SPLIT' : 'SPLIT VISIBLE'}
          </Badge>
        </div>

        <div className="relative h-24 mt-5 mb-4">
          <div className="absolute left-0 right-0 top-11 h-px bg-cipher-border" />
          {anchors.map((anchor) => {
            const left = `${Math.max(0, Math.min(100, ((anchor.height - first) / span) * 100))}%`;
            const color = anchor.match === false ? 'bg-red-500' : anchor.match === true ? 'bg-cipher-green' : 'bg-muted';
            return (
              <div key={anchor.height} className="absolute top-7 -translate-x-1/2" style={{ left }}>
                <div className={`w-2.5 h-2.5 rounded-full ${color} mx-auto mb-2`} />
                <div className="text-[10px] font-mono text-primary whitespace-nowrap">h{anchor.height.toLocaleString()}</div>
                <div className="text-[9px] text-muted whitespace-nowrap max-w-[90px] truncate">{anchor.label}</div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {['reference', 'cipherscan', 'ctaz', 'other'].map((branch) => (
            <div key={branch} className="block-hash-bg border border-cipher-border rounded p-2">
              <div className="text-[10px] font-mono text-muted uppercase tracking-wider">
                {branchLabel(branch)}
              </div>
              <div className="text-sm font-mono text-primary mt-1">{branchCounts[branch] || 0} nodes</div>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

function RecommendedActions({ data }: { data: ForkMonitorData }) {
  const actions: string[] = [];
  if (data.cipherscan.finalized === 0) {
    actions.push('PoS finality RPC is unavailable. Treat fork status as degraded until finalized height returns.');
  } else if (data.cipherscan.finality_gap > 1000) {
    actions.push(`PoS finality is stale at h${data.cipherscan.finalized.toLocaleString()}. Compare PoW anchors, not just tip height.`);
  }
  if (data.status === 'diverged') {
    actions.push(`First visible mismatch is h${data.first_divergence?.toLocaleString()}. Nodes should check that height before resyncing.`);
  } else {
    actions.push('Known anchors match between CipherScan and cTAZ. Nodes that differ should restart/reconnect before wiping cache.');
  }
  if (data.cipherscan.peers < 5) {
    actions.push('CipherScan peer count is low. Peer count is connectivity only, but low peers increase partition risk.');
  }
  actions.push('If your node is mining every block, turn mining off until peers and fixed-height hashes line up.');

  return (
    <Card className="mb-6">
      <CardBody className="p-4 sm:p-5">
        <h2 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider mb-3">
          Recommended Actions
        </h2>
        <ul className="space-y-2">
          {actions.map((action) => (
            <li key={action} className="text-xs text-secondary leading-relaxed flex gap-2">
              <span className="text-cipher-cyan shrink-0">&gt;</span>
              <span>{action}</span>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ForkMonitorPage() {
  const [data, setData] = useState<ForkMonitorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Hash checker state
  const [checkHeight, setCheckHeight] = useState('');
  const [checkResults, setCheckResults] = useState<CheckResult[]>([]);
  const [checking, setChecking] = useState(false);

  // Bulk compare state
  const [bulkInput, setBulkInput] = useState('');
  const [bulkResults, setBulkResults] = useState<{ matches: number[]; mismatches: { height: number; ref: string; got: string }[]; unknown: number[] } | null>(null);

  // Node report state
  const [reportName, setReportName] = useState('');
  const [reportTip, setReportTip] = useState('');
  const [reportHash, setReportHash] = useState('');
  const [reportPeers, setReportPeers] = useState('');
  const [reportMining, setReportMining] = useState(false);
  const [reportSamples, setReportSamples] = useState('');
  const [reportStatus, setReportStatus] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const resp = await fetch(`${getApiUrl()}/api/crosslink/fork-monitor`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      setData(json);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Live hash lookup
  const handleCheck = async () => {
    const heights = checkHeight
      .split(/[,\s]+/)
      .map((s) => parseInt(s.trim()))
      .filter((n) => !isNaN(n) && n >= 0);
    if (heights.length === 0) return;
    setChecking(true);
    try {
      const resp = await fetch(`${getApiUrl()}/api/crosslink/fork-monitor/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ heights }),
      });
      const json = await resp.json();
      if (json.success) setCheckResults(json.results);
    } catch {} finally {
      setChecking(false);
    }
  };

  // Bulk compare (client-side against loaded anchors + tips)
  const handleBulkCompare = () => {
    if (!data) return;
    const refMap = new Map<string, string>();
    for (const a of data.anchors) {
      if (a.cipherscan_hash) refMap.set(String(a.height), a.cipherscan_hash.toLowerCase());
    }
    if (data.cipherscan.tip_hash) {
      refMap.set(String(data.cipherscan.tip), data.cipherscan.tip_hash.toLowerCase());
    }
    if (data.ctaz?.tip_hash) {
      refMap.set(String(data.ctaz.tip), data.ctaz.tip_hash.toLowerCase());
    }

    const matches: number[] = [];
    const mismatches: { height: number; ref: string; got: string }[] = [];
    const unknown: number[] = [];

    const lines = bulkInput.matchAll(/(\d+)\s+([0-9a-fA-F]{64})/g);
    for (const m of lines) {
      const h = m[1];
      const hash = m[2].toLowerCase();
      const ref = refMap.get(h);
      if (!ref) {
        unknown.push(parseInt(h));
      } else if (ref === hash) {
        matches.push(parseInt(h));
      } else {
        mismatches.push({ height: parseInt(h), ref, got: hash });
      }
    }
    setBulkResults({ matches, mismatches, unknown });
  };

  // Node report
  const handleReport = async () => {
    setReportStatus(null);
    try {
      const sample_hashes = parseHeightHashLines(reportSamples);
      const body: Record<string, unknown> = {
        name: reportName,
        tip: parseInt(reportTip),
        mining: reportMining,
      };
      if (reportHash) body.tip_hash = reportHash;
      if (reportPeers) body.peers = parseInt(reportPeers);
      if (sample_hashes.length > 0) body.sample_hashes = sample_hashes;
      const resp = await fetch(`${getApiUrl()}/api/crosslink/fork-monitor/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await resp.json();
      if (json.success) {
        setReportStatus('Registered. Your node will appear in the table below.');
        setReportName('');
        setReportTip('');
        setReportHash('');
        setReportPeers('');
        setReportMining(false);
        setReportSamples('');
        fetchData();
      } else {
        setReportStatus(json.error || 'Failed');
      }
    } catch {
      setReportStatus('Network error');
    }
  };

  const csColor = data ? (data.status === 'aligned' ? 'green' as const : data.status === 'diverged' ? 'red' as const : 'orange' as const) : 'orange' as const;
  const ctazColor = data?.ctaz ? csColor : 'red' as const;
  const groupedNodes = useMemo(() => {
    const groups: Record<string, RegisteredNode[]> = {
      reference: [],
      cipherscan: [],
      ctaz: [],
      other: [],
      unknown: [],
    };
    for (const node of data?.nodes || []) {
      (groups[node.branch] || groups.unknown).push(node);
    }
    return groups;
  }, [data?.nodes]);
  const communityReport = useMemo(() => (data ? makeCommunityReport(data) : ''), [data]);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12 animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <p className="text-xs text-muted font-mono uppercase tracking-widest mb-3">
          <span className="opacity-50">{'>'}</span> FORK MONITOR
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold text-primary mb-2">
          Crosslink Fork Monitor
        </h1>
        <p className="text-sm text-secondary leading-relaxed">
          Live chain comparison between CipherScan and cTAZ reference nodes. Check your own
          node&apos;s hashes, report your chain state, and see which branch other operators are on.
        </p>
      </div>

      {loading ? (
        <Card>
          <CardBody className="py-10 text-center text-muted text-sm">Loading fork monitor...</CardBody>
        </Card>
      ) : error ? (
        <Card>
          <CardBody className="py-10 text-center text-muted text-sm">Error: {error}</CardBody>
        </Card>
      ) : data ? (
        <>
          {/* ---------------------------------------------------------------- */}
          {/* Section 1: Chain Status */}
          {/* ---------------------------------------------------------------- */}
          <Card className="mb-6">
            <CardBody className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h2 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider">
                  Chain Status
                </h2>
                <Badge color={data.status === 'aligned' ? 'green' : data.status === 'diverged' ? 'orange' : 'muted'}>
                  {data.status === 'aligned'
                    ? 'ALIGNED'
                    : data.status === 'diverged'
                      ? `DIVERGED at h${data.first_divergence?.toLocaleString()}`
                      : 'cTAZ UNAVAILABLE'}
                </Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <NodeCard label="CipherScan" node={data.cipherscan} color={csColor} />
                <NodeCard label="cTAZ" node={data.ctaz} color={ctazColor} />
              </div>
              <p className="text-[10px] text-muted font-mono mt-3">
                Updated {new Date(data.generated_at).toLocaleTimeString()} -- auto-refreshes every 15s
              </p>
            </CardBody>
          </Card>

          <RecommendedActions data={data} />
          <ForkTimeline data={data} />

          {/* ---------------------------------------------------------------- */}
          {/* Section 2: Reference Anchors */}
          {/* ---------------------------------------------------------------- */}
          <Card className="mb-6">
            <CardBody className="p-4 sm:p-5">
              <h2 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider mb-1">
                Reference Anchors
              </h2>
              <p className="text-xs text-muted mb-4">
                Block hashes at known fork points, compared between both explorers.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-cipher-border">
                      <th className="text-left py-2 px-2 font-mono text-muted uppercase tracking-wider text-[10px]">Height</th>
                      <th className="text-left py-2 px-2 font-mono text-muted uppercase tracking-wider text-[10px]">Label</th>
                      <th className="text-left py-2 px-2 font-mono text-muted uppercase tracking-wider text-[10px]">CipherScan</th>
                      <th className="text-left py-2 px-2 font-mono text-muted uppercase tracking-wider text-[10px]">cTAZ</th>
                      <th className="text-center py-2 px-2 font-mono text-muted uppercase tracking-wider text-[10px]">Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.anchors.map((a) => (
                      <tr key={a.height} className="border-b border-cipher-border/50 hover:bg-[var(--color-hover)] transition-colors">
                        <td className="py-2 px-2 font-mono text-primary">h{a.height.toLocaleString()}</td>
                        <td className="py-2 px-2 text-muted">{a.label}</td>
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-1">
                            <code className="font-mono text-secondary">{truncHash(a.cipherscan_hash, 10)}</code>
                            {a.cipherscan_hash && <CopyButton text={a.cipherscan_hash} />}
                          </div>
                        </td>
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-1">
                            <code className="font-mono text-secondary">{truncHash(a.ctaz_hash, 10)}</code>
                            {a.ctaz_hash && <CopyButton text={a.ctaz_hash} />}
                          </div>
                        </td>
                        <td className="py-2 px-2 text-center"><MatchIcon match={a.match} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>

          {/* ---------------------------------------------------------------- */}
          {/* Section 3: Hash Checker */}
          {/* ---------------------------------------------------------------- */}
          <Card className="mb-6">
            <CardBody className="p-4 sm:p-5">
              <h2 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider mb-1">
                Check Your Chain
              </h2>
              <p className="text-xs text-muted mb-4">
                Verify your node is on the same branch. Enter any block height to see both reference hashes,
                or paste multiple <code className="text-cipher-cyan">height hash</code> lines for bulk comparison.
              </p>

              {/* Live lookup */}
              <div className="mb-5">
                <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-2">Live Lookup</div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={checkHeight}
                    onChange={(e) => setCheckHeight(e.target.value)}
                    placeholder="e.g. 40762"
                    className="flex-1 px-3 py-2 text-xs font-mono bg-[var(--color-bg)] border border-cipher-border rounded text-primary placeholder:text-muted/50 focus:outline-none focus:border-cipher-cyan/50"
                    onKeyDown={(e) => e.key === 'Enter' && handleCheck()}
                  />
                  <button
                    onClick={handleCheck}
                    disabled={checking}
                    className="px-4 py-2 text-xs font-mono bg-cipher-cyan/10 text-cipher-cyan border border-cipher-cyan/30 rounded hover:bg-cipher-cyan/20 transition-colors disabled:opacity-50"
                  >
                    {checking ? 'Checking...' : 'Check'}
                  </button>
                </div>
                {checkResults.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {checkResults.map((r) => (
                      <div key={r.height} className="block-hash-bg border border-cipher-border rounded p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-xs text-primary font-bold">h{r.height.toLocaleString()}</span>
                          <MatchIcon match={r.match} />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px]">
                          <div>
                            <span className="text-muted font-mono">CS: </span>
                            <code className="text-secondary">{r.cipherscan_hash || 'not yet synced'}</code>
                          </div>
                          <div>
                            <span className="text-muted font-mono">cTAZ: </span>
                            <code className="text-secondary">{r.ctaz_hash || 'not available'}</code>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Bulk compare */}
              <div>
                <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-2">Bulk Compare</div>
                <p className="text-[11px] text-muted mb-2">
                  Paste lines like <code className="text-cipher-cyan">39574 006e0a84682c...</code> -- compared client-side against loaded anchors.
                </p>
                <textarea
                  value={bulkInput}
                  onChange={(e) => setBulkInput(e.target.value)}
                  placeholder={"39573 00228574fad9f6b8d88e8ad1edcee00565eb86cffa0439d5e7ca57b974f3f14c\n39574 006e0a84682c81d539965fd0f3698e0d61bbd3bfc98dea74638029edd3ec2555"}
                  className="w-full px-3 py-2 text-xs font-mono bg-[var(--color-bg)] border border-cipher-border rounded text-primary placeholder:text-muted/30 focus:outline-none focus:border-cipher-cyan/50 resize-y"
                  rows={4}
                  spellCheck={false}
                />
                <button
                  onClick={handleBulkCompare}
                  className="mt-2 px-4 py-2 text-xs font-mono bg-cipher-cyan/10 text-cipher-cyan border border-cipher-cyan/30 rounded hover:bg-cipher-cyan/20 transition-colors"
                >
                  Compare
                </button>
                {bulkResults && (
                  <div className="mt-3 block-hash-bg border border-cipher-border rounded p-3 text-xs">
                    {bulkResults.mismatches.length > 0 ? (
                      <div>
                        <div className="text-red-500 font-bold mb-1">
                          First mismatch: h{bulkResults.mismatches[0].height.toLocaleString()}
                        </div>
                        <div className="text-muted font-mono text-[11px]">
                          <div>reference: <code className="text-secondary">{bulkResults.mismatches[0].ref}</code></div>
                          <div>your node: <code className="text-secondary">{bulkResults.mismatches[0].got}</code></div>
                        </div>
                        {bulkResults.matches.length > 0 && (
                          <div className="text-cipher-green mt-1">Matched: {bulkResults.matches.join(', ')}</div>
                        )}
                      </div>
                    ) : bulkResults.matches.length > 0 ? (
                      <div className="text-cipher-green">
                        All known anchors match. Matched heights: {bulkResults.matches.join(', ')}
                        {bulkResults.unknown.length > 0 && (
                          <span className="text-muted"> (unknown: {bulkResults.unknown.join(', ')})</span>
                        )}
                      </div>
                    ) : (
                      <div className="text-muted">No height/hash pairs found in input.</div>
                    )}
                  </div>
                )}
              </div>
            </CardBody>
          </Card>

          {/* ---------------------------------------------------------------- */}
          {/* Section 4: Node Registry */}
          {/* ---------------------------------------------------------------- */}
          <Card className="mb-6">
            <CardBody className="p-4 sm:p-5">
              <h2 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider mb-1">
                Node Registry
              </h2>
              <p className="text-xs text-muted mb-4">
                Voluntarily report your node&apos;s chain state so other operators can see which branch you&apos;re on.
                Nothing is uploaded automatically. Reports expire after 1 hour.
              </p>

              {/* Report form */}
              <div className="block-hash-bg border border-cipher-border rounded p-4 mb-4">
                <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-3">Report Your Node</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-mono text-muted block mb-1">Node Name *</label>
                    <input
                      type="text"
                      value={reportName}
                      onChange={(e) => setReportName(e.target.value)}
                      placeholder="e.g. My Mac Mini"
                      maxLength={32}
                      className="w-full px-3 py-2 text-xs font-mono bg-[var(--color-bg)] border border-cipher-border rounded text-primary placeholder:text-muted/50 focus:outline-none focus:border-cipher-cyan/50"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-mono text-muted block mb-1">Tip Height *</label>
                    <input
                      type="number"
                      value={reportTip}
                      onChange={(e) => setReportTip(e.target.value)}
                      placeholder="e.g. 41898"
                      className="w-full px-3 py-2 text-xs font-mono bg-[var(--color-bg)] border border-cipher-border rounded text-primary placeholder:text-muted/50 focus:outline-none focus:border-cipher-cyan/50"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-mono text-muted block mb-1">Tip Hash</label>
                    <input
                      type="text"
                      value={reportHash}
                      onChange={(e) => setReportHash(e.target.value)}
                      placeholder="64-char hex"
                      maxLength={64}
                      className="w-full px-3 py-2 text-xs font-mono bg-[var(--color-bg)] border border-cipher-border rounded text-primary placeholder:text-muted/50 focus:outline-none focus:border-cipher-cyan/50"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-mono text-muted block mb-1">Peer Count</label>
                    <input
                      type="number"
                      value={reportPeers}
                      onChange={(e) => setReportPeers(e.target.value)}
                      placeholder="e.g. 12"
                      className="w-full px-3 py-2 text-xs font-mono bg-[var(--color-bg)] border border-cipher-border rounded text-primary placeholder:text-muted/50 focus:outline-none focus:border-cipher-cyan/50"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-3">
                  <label className="flex items-center gap-2 text-xs font-mono text-muted cursor-pointer">
                    <input
                      type="checkbox"
                      checked={reportMining}
                      onChange={(e) => setReportMining(e.target.checked)}
                      className="rounded border-cipher-border"
                    />
                    Mining on
                  </label>
                  <button
                    onClick={handleReport}
                    disabled={!reportName || !reportTip}
                    className="px-4 py-2 text-xs font-mono bg-cipher-cyan/10 text-cipher-cyan border border-cipher-cyan/30 rounded hover:bg-cipher-cyan/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Report
                  </button>
                  {reportStatus && (
                    <span className="text-[11px] font-mono text-muted">{reportStatus}</span>
                  )}
                </div>
                <div className="mt-3">
                  <label className="text-[10px] font-mono text-muted block mb-1">
                    Anchor Hashes (recommended)
                  </label>
                  <p className="text-[11px] text-muted mb-2">
                    Paste fixed-height checks like <code className="text-cipher-cyan">39574 006e0a...</code>.
                    This lets CipherScan classify your branch instead of showing unknown.
                  </p>
                  <textarea
                    value={reportSamples}
                    onChange={(e) => setReportSamples(e.target.value)}
                    placeholder={"39573 00228574fad9f6b8d88e8ad1edcee00565eb86cffa0439d5e7ca57b974f3f14c\n39574 006e0a84682c81d539965fd0f3698e0d61bbd3bfc98dea74638029edd3ec2555"}
                    className="w-full px-3 py-2 text-xs font-mono bg-[var(--color-bg)] border border-cipher-border rounded text-primary placeholder:text-muted/30 focus:outline-none focus:border-cipher-cyan/50 resize-y"
                    rows={3}
                    spellCheck={false}
                  />
                  <div className="text-[10px] text-muted mt-1 font-mono">
                    Parsed {parseHeightHashLines(reportSamples).length}/12 anchor hashes.
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 mb-4">
                {Object.entries(groupedNodes).map(([branch, nodes]) => (
                  <div key={branch} className="block-hash-bg border border-cipher-border rounded p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono text-muted uppercase tracking-wider">
                        {branchLabel(branch)}
                      </span>
                      <Badge color={branchBadgeColor(branch)}>{nodes.length}</Badge>
                    </div>
                  </div>
                ))}
              </div>

              {/* Node table */}
              {data.nodes.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-cipher-border">
                        <th className="text-left py-2 px-2 font-mono text-muted uppercase tracking-wider text-[10px]">Node</th>
                        <th className="text-left py-2 px-2 font-mono text-muted uppercase tracking-wider text-[10px]">Tip</th>
                        <th className="text-left py-2 px-2 font-mono text-muted uppercase tracking-wider text-[10px]">Hash</th>
                        <th className="text-center py-2 px-2 font-mono text-muted uppercase tracking-wider text-[10px]">Peers</th>
                        <th className="text-center py-2 px-2 font-mono text-muted uppercase tracking-wider text-[10px]">Mining</th>
                        <th className="text-left py-2 px-2 font-mono text-muted uppercase tracking-wider text-[10px]">Branch</th>
                        <th className="text-right py-2 px-2 font-mono text-muted uppercase tracking-wider text-[10px]">Seen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.nodes.map((n) => {
                        const stale = Date.now() - n.reported_at > 15 * 60 * 1000;
                        return (
                          <tr key={n.name} className={`border-b border-cipher-border/50 ${stale ? 'opacity-50' : ''}`}>
                            <td className="py-2 px-2 font-mono text-primary">{n.name}</td>
                            <td className="py-2 px-2 font-mono text-secondary">h{n.tip.toLocaleString()}</td>
                            <td className="py-2 px-2 font-mono text-secondary">{truncHash(n.tip_hash, 8)}</td>
                            <td className="py-2 px-2 text-center font-mono text-secondary">{n.peers ?? '-'}</td>
                            <td className="py-2 px-2 text-center font-mono">
                              {n.mining === true ? <span className="text-cipher-orange">on</span> : n.mining === false ? <span className="text-muted">off</span> : '-'}
                            </td>
                            <td className="py-2 px-2">
                              <Badge color={branchBadgeColor(n.branch)}>
                                {branchLabel(n.branch)}
                              </Badge>
                            </td>
                            <td className="py-2 px-2 text-right font-mono text-muted">{fmtAgo(n.reported_at)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-xs text-muted text-center py-4">
                  No nodes reported yet. Be the first to report your chain state.
                </div>
              )}
            </CardBody>
          </Card>

          <Card className="mb-6">
            <CardBody className="p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                <div>
                  <h2 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider">
                    Community Report
                  </h2>
                  <p className="text-xs text-muted mt-1">
                    Copy this into chat when coordinating forks. It separates PoW branch checks from PoS finality.
                  </p>
                </div>
                <button
                  onClick={() => navigator.clipboard.writeText(communityReport).catch(() => {})}
                  className="px-3 py-1.5 text-xs font-mono bg-cipher-cyan/10 text-cipher-cyan border border-cipher-cyan/30 rounded hover:bg-cipher-cyan/20 transition-colors"
                >
                  Copy report
                </button>
              </div>
              <pre className="block-hash-bg border border-cipher-border rounded p-3 text-xs font-mono text-secondary overflow-x-auto whitespace-pre-wrap">
                {communityReport}
              </pre>
            </CardBody>
          </Card>

          {/* ---------------------------------------------------------------- */}
          {/* Section 5: Split Hints */}
          {/* ---------------------------------------------------------------- */}
          <Card>
            <CardBody className="p-4 sm:p-5">
              <h2 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider mb-3">
                Diagnostic Hints
              </h2>
              <ul className="space-y-2">
                {data.split_hints.map((hint, i) => (
                  <li key={i} className="text-xs text-secondary leading-relaxed flex gap-2">
                    <span className="text-muted shrink-0">&#8227;</span>
                    {hint}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </>
      ) : null}
    </div>
  );
}
