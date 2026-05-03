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
  ttl?: '1h' | '24h';
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
      <div className="block-hash-bg border border-cipher-border-alpha/40 rounded-lg p-4 flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-3">
          <StatusDot color="red" />
          <span className="text-xs font-mono text-muted uppercase tracking-wider">{label}</span>
        </div>
        <div className="text-sm text-muted">Unavailable</div>
      </div>
    );
  }
  return (
    <div className="block-hash-bg border border-cipher-border-alpha/40 rounded-lg p-4 flex-1 min-w-0">
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
  const [hoveredAnchor, setHoveredAnchor] = useState<number | null>(null);
  const [copiedAnchor, setCopiedAnchor] = useState<number | null>(null);
  const [scale, setScale] = useState<'even' | 'linear'>('even');

  const anchors = data.anchors;

  const positions = useMemo(() => {
    if (anchors.length === 0) return [];
    if (anchors.length === 1) return [50];
    if (scale === 'even') {
      return anchors.map((_, i) => 5 + (i / (anchors.length - 1)) * 90);
    }
    const first = anchors[0].height;
    const last = anchors[anchors.length - 1].height;
    const span = Math.max(last - first, 1);
    return anchors.map((a) => 5 + ((a.height - first) / span) * 90);
  }, [anchors, scale]);

  const copyAnchor = (height: number, hash: string | null) => {
    if (!hash) return;
    navigator.clipboard.writeText(`${height} ${hash}`).catch(() => {});
    setCopiedAnchor(height);
    setTimeout(() => setCopiedAnchor((current) => (current === height ? null : current)), 1200);
  };

  return (
    <Card className="mb-4 p-0 card-static">
      <CardBody className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div>
            <h2 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider">
              Fork Timeline
            </h2>
            <p className="text-xs text-muted mt-1">
              Fixed-height hash comparisons between CipherScan and cTAZ. Hover for details, click to copy.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center text-[10px] font-mono uppercase tracking-wider rounded border border-cipher-border-alpha/40 overflow-hidden">
              <button
                type="button"
                onClick={() => setScale('even')}
                className={`px-2 py-1 transition-colors ${scale === 'even' ? 'bg-cipher-cyan/10 text-cipher-cyan' : 'text-muted hover:text-primary'}`}
              >
                Even
              </button>
              <button
                type="button"
                onClick={() => setScale('linear')}
                className={`px-2 py-1 transition-colors ${scale === 'linear' ? 'bg-cipher-cyan/10 text-cipher-cyan' : 'text-muted hover:text-primary'}`}
              >
                Linear
              </button>
            </div>
            <Badge color={data.status === 'aligned' ? 'green' : 'orange'}>
              {data.status === 'aligned' ? 'NO KNOWN SPLIT' : 'SPLIT VISIBLE'}
            </Badge>
          </div>
        </div>

        <div className="relative h-44 sm:h-40 mt-2 mb-4 select-none">
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-cipher-border" />

          {anchors.map((anchor, i) => {
            const left = `${positions[i]}%`;
            const above = i % 2 === 0;
            const color =
              anchor.match === false
                ? 'bg-red-500'
                : anchor.match === true
                  ? 'bg-cipher-green'
                  : 'bg-muted';
            const ringColor =
              anchor.match === false
                ? 'ring-red-500/40'
                : anchor.match === true
                  ? 'ring-cipher-green/40'
                  : 'ring-cipher-border';
            const isHovered = hoveredAnchor === anchor.height;
            const isDivergence = data.first_divergence === anchor.height;

            return (
              <div
                key={anchor.height}
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                style={{ left }}
              >
                {isDivergence && (
                  <div className="absolute left-1/2 -translate-x-1/2 -top-12 text-[9px] font-mono uppercase tracking-wider text-red-500 whitespace-nowrap">
                    First split
                  </div>
                )}
                <button
                  type="button"
                  onMouseEnter={() => setHoveredAnchor(anchor.height)}
                  onMouseLeave={() => setHoveredAnchor((h) => (h === anchor.height ? null : h))}
                  onFocus={() => setHoveredAnchor(anchor.height)}
                  onBlur={() => setHoveredAnchor((h) => (h === anchor.height ? null : h))}
                  onClick={() => copyAnchor(anchor.height, anchor.cipherscan_hash || anchor.ctaz_hash)}
                  className={`block w-3 h-3 rounded-full ${color} ring-2 ${ringColor} transition-transform hover:scale-150 focus:outline-none`}
                  aria-label={`Anchor h${anchor.height}, ${anchor.label}`}
                />

                <div
                  className={`absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-center pointer-events-none ${
                    above ? 'bottom-4 mb-1' : 'top-4 mt-1'
                  }`}
                >
                  <div className="text-[10px] font-mono text-primary">h{anchor.height.toLocaleString()}</div>
                  <div className="text-[9px] text-muted truncate max-w-[110px]">{anchor.label}</div>
                </div>

                {isHovered && (
                  <div
                    className={`absolute left-1/2 -translate-x-1/2 z-20 bg-cipher-bg border border-cipher-border rounded p-2 shadow-xl min-w-[260px] ${
                      above ? 'bottom-12' : 'top-12'
                    }`}
                  >
                    <div className="text-[11px] font-mono text-primary font-bold mb-1.5">
                      h{anchor.height.toLocaleString()} <span className="text-muted font-normal">— {anchor.label}</span>
                    </div>
                    <div className="space-y-1 text-[10px] font-mono">
                      <div className="flex gap-2">
                        <span className="text-muted shrink-0 w-12">CS</span>
                        <code className="text-secondary break-all">{anchor.cipherscan_hash || '—'}</code>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-muted shrink-0 w-12">cTAZ</span>
                        <code className="text-secondary break-all">{anchor.ctaz_hash || '—'}</code>
                      </div>
                    </div>
                    <div className="text-[10px] mt-1.5 flex items-center justify-between gap-2">
                      {anchor.match === true ? (
                        <span className="text-cipher-green font-mono">MATCH</span>
                      ) : anchor.match === false ? (
                        <span className="text-red-500 font-mono">MISMATCH</span>
                      ) : (
                        <span className="text-muted font-mono">UNKNOWN</span>
                      )}
                      <span className="text-muted font-mono">
                        {copiedAnchor === anchor.height ? 'copied' : 'click dot to copy'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3 text-xs">
          <div className="block-hash-bg border border-cipher-border rounded p-2 flex items-center justify-between gap-2">
            <div>
              <div className="text-[10px] font-mono text-muted uppercase tracking-wider">CipherScan tip</div>
              <div className="font-mono text-primary mt-0.5">h{data.cipherscan.tip.toLocaleString()}</div>
            </div>
            <code className="text-[10px] font-mono text-secondary truncate max-w-[140px]">
              {truncHash(data.cipherscan.tip_hash, 12)}
            </code>
          </div>
          {data.ctaz ? (
            <div className="block-hash-bg border border-cipher-border rounded p-2 flex items-center justify-between gap-2">
              <div>
                <div className="text-[10px] font-mono text-muted uppercase tracking-wider">cTAZ tip</div>
                <div className="font-mono text-primary mt-0.5">h{data.ctaz.tip.toLocaleString()}</div>
              </div>
              <code className="text-[10px] font-mono text-secondary truncate max-w-[140px]">
                {truncHash(data.ctaz.tip_hash, 12)}
              </code>
            </div>
          ) : (
            <div className="block-hash-bg border border-cipher-border rounded p-2 text-[10px] font-mono text-muted">
              cTAZ tip unavailable
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 text-[10px] font-mono text-muted">
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-cipher-green" /> Match</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-red-500" /> Mismatch</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-muted" /> Unknown</span>
        </div>
      </CardBody>
    </Card>
  );
}

function RecommendedActions({ data, inline }: { data: ForkMonitorData; inline?: boolean }) {
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

  const content = (
    <>
      {!inline && (
        <h2 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider mb-3">
          Recommended Actions
        </h2>
      )}
      <ul className={inline ? 'flex flex-wrap gap-x-4 gap-y-1' : 'space-y-2'}>
        {actions.map((action) => (
          <li key={action} className="text-xs text-secondary leading-relaxed flex gap-1.5">
            <span className="text-cipher-cyan shrink-0">&gt;</span>
            <span>{action}</span>
          </li>
        ))}
      </ul>
    </>
  );

  if (inline) {
    return <div className="mt-3 pt-3 border-t border-cipher-border-alpha/40">{content}</div>;
  }

  return (
    <Card className="mb-6">
      <CardBody className="p-4 sm:p-5">{content}</CardBody>
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
  const [reportTtl, setReportTtl] = useState<'1h' | '24h'>('24h');
  const [reportStatus, setReportStatus] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'anchors' | 'checker'>('anchors');

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
        ttl: reportTtl,
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
        setReportTtl('24h');
        fetchData();
      } else {
        setReportStatus(json.error || 'Failed');
      }
    } catch {
      setReportStatus('Network error');
    }
  };

  const handleDeleteNode = async (name: string) => {
    if (!confirm(`Remove "${name}" from the registry?`)) return;
    try {
      const resp = await fetch(`${getApiUrl()}/api/crosslink/fork-monitor/report/${encodeURIComponent(name)}`, { method: 'DELETE' });
      if (resp.ok) {
        setData((prev) => prev ? { ...prev, nodes: prev.nodes.filter((n) => n.name !== name) } : prev);
      }
    } catch {}
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
        <Card className="p-0">
          <CardBody className="py-10 text-center text-muted text-sm">Loading fork monitor...</CardBody>
        </Card>
      ) : error ? (
        <Card className="p-0">
          <CardBody className="py-10 text-center text-muted text-sm">Error: {error}</CardBody>
        </Card>
      ) : data ? (
        <>
          {/* ============================================================== */}
          {/* Tier 1: At-a-glance dashboard                                 */}
          {/* ============================================================== */}
          <Card className="mb-4 p-0 card-static">
            <CardBody className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h2 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider">
                  Chain Status
                </h2>
                <div className="flex items-center gap-2">
                  <Badge color={data.status === 'aligned' ? 'green' : data.status === 'diverged' ? 'orange' : 'muted'}>
                    {data.status === 'aligned'
                      ? 'ALIGNED'
                      : data.status === 'diverged'
                        ? `DIVERGED at h${data.first_divergence?.toLocaleString()}`
                        : 'cTAZ UNAVAILABLE'}
                  </Badge>
                  <span className="text-[10px] text-muted font-mono hidden sm:inline">
                    {new Date(data.generated_at).toLocaleTimeString()}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <NodeCard label="CipherScan" node={data.cipherscan} color={csColor} />
                <NodeCard label="cTAZ" node={data.ctaz} color={ctazColor} />
              </div>
              <RecommendedActions data={data} inline />
            </CardBody>
          </Card>

          <ForkTimeline data={data} />

          {/* ============================================================== */}
          {/* Tier 2: Tabbed tools                                          */}
          {/* ============================================================== */}
          <Card className="mb-4 p-0 card-static">
            <div className="border-b border-cipher-border-alpha/40 flex">
              {(['anchors', 'checker'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setActiveTab(t)}
                  className={`flex-1 py-2.5 text-[11px] font-mono uppercase tracking-wider text-center transition-colors ${
                    activeTab === t
                      ? 'text-cipher-cyan border-b-2 border-cipher-cyan bg-cipher-cyan/5'
                      : 'text-muted hover:text-primary'
                  }`}
                >
                  {t === 'anchors' ? `Anchors (${data.anchors.length})` : 'Check Your Chain'}
                </button>
              ))}
            </div>
            <CardBody className="p-4 sm:p-5">

              {/* --- Tab: Anchors --- */}
              {activeTab === 'anchors' && (
                <div>
                  <p className="text-xs text-muted mb-3">
                    Block hashes at known fork points, compared between CipherScan and cTAZ.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-cipher-border-alpha/40">
                          <th className="text-left py-2 px-2 font-mono text-muted uppercase tracking-wider text-[10px]">Height</th>
                          <th className="text-left py-2 px-2 font-mono text-muted uppercase tracking-wider text-[10px]">Label</th>
                          <th className="text-left py-2 px-2 font-mono text-muted uppercase tracking-wider text-[10px]">CipherScan</th>
                          <th className="text-left py-2 px-2 font-mono text-muted uppercase tracking-wider text-[10px]">cTAZ</th>
                          <th className="text-center py-2 px-2 font-mono text-muted uppercase tracking-wider text-[10px]">Match</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.anchors.map((a) => (
                          <tr key={a.height} className="border-b border-cipher-border-alpha/30 hover:bg-[var(--color-hover)] transition-colors">
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
                </div>
              )}

              {/* --- Tab: Checker --- */}
              {activeTab === 'checker' && (
                <div>
                  <div className="mb-5">
                    <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-2">Live Lookup</div>
                    <p className="text-xs text-muted mb-2">
                      Enter any block height to compare hashes from both explorers.
                    </p>
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
                        {checking ? '...' : 'Check'}
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

                  <div className="border-t border-cipher-border-alpha/40 pt-4">
                    <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-2">Bulk Compare</div>
                    <p className="text-[11px] text-muted mb-2">
                      Paste <code className="text-cipher-cyan">height hash</code> lines -- compared client-side against loaded anchors.
                    </p>
                    <textarea
                      value={bulkInput}
                      onChange={(e) => setBulkInput(e.target.value)}
                      placeholder={"39573 00228574fad9f6b8d88e8ad1edcee00565eb86cffa...\n39574 006e0a84682c81d539965fd0f3698e0d61bbd3bfc9..."}
                      className="w-full px-3 py-2 text-xs font-mono bg-[var(--color-bg)] border border-cipher-border rounded text-primary placeholder:text-muted/30 focus:outline-none focus:border-cipher-cyan/50 resize-y"
                      rows={3}
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
                            All known anchors match ({bulkResults.matches.join(', ')})
                            {bulkResults.unknown.length > 0 && (
                              <span className="text-muted"> unknown: {bulkResults.unknown.join(', ')}</span>
                            )}
                          </div>
                        ) : (
                          <div className="text-muted">No height/hash pairs found in input.</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

            </CardBody>
          </Card>

          {/* ============================================================== */}
          {/* Node Registry — always visible                                 */}
          {/* ============================================================== */}
          <Card className="mb-4 p-0 card-static">
            <CardBody className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div>
                  <h2 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider">
                    Node Registry
                  </h2>
                  <p className="text-xs text-muted mt-1">
                    Report your node so operators can see which branch you&apos;re on. Choose 1h for quick tests or 24h for debugging.
                  </p>
                </div>
                {data.nodes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(groupedNodes).map(([branch, nodes]) =>
                      nodes.length > 0 ? (
                        <Badge key={branch} color={branchBadgeColor(branch)}>
                          {branchLabel(branch)}: {nodes.length}
                        </Badge>
                      ) : null
                    )}
                  </div>
                )}
              </div>

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
                  <div className="flex items-center rounded border border-cipher-border-alpha/40 overflow-hidden text-[10px] font-mono">
                    <button
                      type="button"
                      onClick={() => setReportTtl('1h')}
                      className={`px-2 py-1 transition-colors ${reportTtl === '1h' ? 'bg-cipher-cyan/10 text-cipher-cyan' : 'text-muted hover:text-primary'}`}
                    >
                      1h
                    </button>
                    <button
                      type="button"
                      onClick={() => setReportTtl('24h')}
                      className={`px-2 py-1 transition-colors ${reportTtl === '24h' ? 'bg-cipher-cyan/10 text-cipher-cyan' : 'text-muted hover:text-primary'}`}
                    >
                      24h
                    </button>
                  </div>
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
                <details className="mt-3">
                  <summary className="text-[10px] font-mono text-cipher-cyan cursor-pointer hover:underline">
                    Advanced: paste anchor hashes for branch classification
                  </summary>
                  <div className="mt-2">
                    <textarea
                      value={reportSamples}
                      onChange={(e) => setReportSamples(e.target.value)}
                      placeholder={"39573 00228574fad9f6b8d88e8ad...\n39574 006e0a84682c81d539965fd..."}
                      className="w-full px-3 py-2 text-xs font-mono bg-[var(--color-bg)] border border-cipher-border rounded text-primary placeholder:text-muted/30 focus:outline-none focus:border-cipher-cyan/50 resize-y"
                      rows={2}
                      spellCheck={false}
                    />
                    <div className="text-[10px] text-muted mt-1 font-mono">
                      Parsed {parseHeightHashLines(reportSamples).length}/12 anchor hashes.
                    </div>
                  </div>
                </details>
              </div>

              {data.nodes.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-cipher-border-alpha/40">
                        <th className="text-left py-2 px-2 font-mono text-muted uppercase tracking-wider text-[10px]">Node</th>
                        <th className="text-left py-2 px-2 font-mono text-muted uppercase tracking-wider text-[10px]">Tip</th>
                        <th className="text-left py-2 px-2 font-mono text-muted uppercase tracking-wider text-[10px]">Hash</th>
                        <th className="text-center py-2 px-2 font-mono text-muted uppercase tracking-wider text-[10px]">Peers</th>
                        <th className="text-center py-2 px-2 font-mono text-muted uppercase tracking-wider text-[10px]">Mining</th>
                        <th className="text-left py-2 px-2 font-mono text-muted uppercase tracking-wider text-[10px]">Branch</th>
                        <th className="text-right py-2 px-2 font-mono text-muted uppercase tracking-wider text-[10px]">Seen</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.nodes.map((n) => {
                        const nodeTtlMs = n.ttl === '1h' ? 3_600_000 : 86_400_000;
                        const stale = Date.now() - n.reported_at > nodeTtlMs * 0.75;
                        return (
                          <tr key={n.name} className={`border-b border-cipher-border-alpha/30 ${stale ? 'opacity-50' : ''}`}>
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
                            <td className="py-2 px-2 text-right font-mono text-muted">
                              {fmtAgo(n.reported_at)}
                              <span className="text-[9px] ml-1 opacity-60">{n.ttl || '1h'}</span>
                            </td>
                            <td className="py-1 px-1 text-center">
                              <button
                                onClick={() => handleDeleteNode(n.name)}
                                className="text-muted hover:text-red-400 transition-colors text-xs opacity-40 hover:opacity-100"
                                title={`Remove ${n.name}`}
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-xs text-muted text-center py-4">
                  No nodes reported yet. Be the first to report your chain state above.
                </div>
              )}
            </CardBody>
          </Card>

          {/* ============================================================== */}
          {/* Tier 3: Reference material (side-by-side on desktop)          */}
          {/* ============================================================== */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-0 card-static">
              <CardBody className="p-4 sm:p-5">
                <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                  <h2 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider">
                    Community Report
                  </h2>
                  <button
                    onClick={() => navigator.clipboard.writeText(communityReport).catch(() => {})}
                    className="px-2.5 py-1 text-[10px] font-mono bg-cipher-cyan/10 text-cipher-cyan border border-cipher-cyan/30 rounded hover:bg-cipher-cyan/20 transition-colors"
                  >
                    Copy
                  </button>
                </div>
                <pre className="block-hash-bg border border-cipher-border rounded p-3 text-[11px] font-mono text-secondary overflow-x-auto whitespace-pre-wrap max-h-60 overflow-y-auto">
                  {communityReport}
                </pre>
              </CardBody>
            </Card>
            <Card className="p-0 card-static">
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
          </div>
        </>
      ) : null}
    </div>
  );
}
