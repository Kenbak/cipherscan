'use client';

import { useMemo, useState } from 'react';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import type { Anchor, CheckResult, ForkMonitorData, NodeRef, RegisteredNode } from './types';
import { branchLabel, fmtAgo, statusMeta, truncHash } from './utils';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export function CopyButton({ text, className = '' }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className={`text-[10px] font-mono text-muted hover:text-cipher-cyan transition-colors ${className}`}
      title="Copy"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function MatchState({ match, compact }: { match: boolean | null; compact?: boolean }) {
  if (match === null) {
    return <span className="text-xs font-mono text-muted">—</span>;
  }
  if (match) {
    return (
      <span className={`font-mono text-cipher-cyan ${compact ? 'text-[10px]' : 'text-xs'}`}>
        Match
      </span>
    );
  }
  return (
    <span className={`font-mono text-cipher-orange ${compact ? 'text-[10px]' : 'text-xs'}`}>
      Mismatch
    </span>
  );
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card variant="compact">
      <CardBody className="py-4 px-4">
        <div className="text-xl sm:text-2xl font-bold font-mono text-primary leading-none">{value}</div>
        {sub && <div className="text-[10px] font-mono text-muted mt-1 truncate" title={sub}>{sub}</div>}
        <div className="text-[10px] uppercase tracking-wider text-muted mt-2">{label}</div>
      </CardBody>
    </Card>
  );
}

function MetricRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-cipher-border last:border-0">
      <span className="text-[10px] font-mono uppercase tracking-wider text-muted shrink-0">{label}</span>
      <div className="text-xs font-mono text-secondary text-right min-w-0">{children}</div>
    </div>
  );
}

function ReferenceNodePanel({ title, node }: { title: string; node: NodeRef | null }) {
  if (!node) {
    return (
      <div className="card-dark rounded-lg p-4 min-w-0">
        <div className="text-xs font-mono text-primary mb-2">{title}</div>
        <p className="text-xs text-muted">Unavailable</p>
      </div>
    );
  }
  return (
    <div className="card-dark rounded-lg p-4 min-w-0">
      <div className="text-xs font-mono text-primary mb-3">{title}</div>
      <MetricRow label="Tip">
        <span className="text-primary font-semibold">h{node.tip.toLocaleString()}</span>
      </MetricRow>
      <MetricRow label="Hash">
        <span className="inline-flex items-center gap-1.5 max-w-full">
          <code className="truncate">{truncHash(node.tip_hash, 14)}</code>
          {node.tip_hash && <CopyButton text={node.tip_hash} />}
        </span>
      </MetricRow>
      <MetricRow label="Peers">
        <span className={node.peers < 5 ? 'text-cipher-orange' : ''}>{node.peers}</span>
      </MetricRow>
      <MetricRow label="Finalized">h{node.finalized.toLocaleString()}</MetricRow>
      <MetricRow label="Finality gap">
        <span className={node.finality_gap > 1000 ? 'text-cipher-orange' : ''}>
          {node.finality_gap.toLocaleString()}
        </span>
      </MetricRow>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status hero
// ---------------------------------------------------------------------------

export function StatusHero({ data }: { data: ForkMonitorData }) {
  const meta = statusMeta(data);
  const matched = data.anchors.filter((a) => a.match === true).length;
  const mismatched = data.anchors.filter((a) => a.match === false).length;

  return (
    <>
      <Card className={`border-l-4 ${meta.accent} mb-6`}>
        <CardBody className="p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <h2 className="text-lg font-bold font-mono text-primary">{meta.label}</h2>
                <Badge color={meta.badge}>
                  {data.status === 'aligned'
                    ? 'ALIGNED'
                    : data.status === 'diverged'
                      ? 'DIVERGED'
                      : 'DEGRADED'}
                </Badge>
              </div>
              <p className="text-xs text-secondary max-w-2xl leading-relaxed">{meta.detail}</p>
            </div>
            <div className="text-[10px] font-mono text-muted shrink-0">
              Updated {new Date(data.generated_at).toLocaleTimeString()}
              <span className="hidden sm:inline"> · auto-refresh 15s</span>
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatTile
          label="CipherScan tip"
          value={`h${data.cipherscan.tip.toLocaleString()}`}
          sub={truncHash(data.cipherscan.tip_hash, 10)}
        />
        <StatTile
          label="cTAZ tip"
          value={data.ctaz ? `h${data.ctaz.tip.toLocaleString()}` : '—'}
          sub={data.ctaz ? truncHash(data.ctaz.tip_hash, 10) : 'unavailable'}
        />
        <StatTile
          label="Anchors"
          value={`${matched}/${data.anchors.length}`}
          sub={mismatched > 0 ? `${mismatched} mismatch` : 'all known points checked'}
        />
        <StatTile
          label="Reported nodes"
          value={String(data.nodes.length)}
          sub={data.nodes.length ? 'community registry' : 'none yet'}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        <ReferenceNodePanel title="CipherScan" node={data.cipherscan} />
        <ReferenceNodePanel title="cTAZ reference" node={data.ctaz} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export function ForkTimeline({ data }: { data: ForkMonitorData }) {
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

  const copyAnchor = (anchor: Anchor) => {
    const hash = anchor.cipherscan_hash || anchor.ctaz_hash;
    if (!hash) return;
    navigator.clipboard.writeText(`${anchor.height} ${hash}`).catch(() => {});
    setCopiedAnchor(anchor.height);
    setTimeout(() => setCopiedAnchor((h) => (h === anchor.height ? null : h)), 1200);
  };

  const dotClass = (anchor: Anchor) => {
    if (anchor.match === false) {
      return 'w-3 h-3 rounded-full border-2 border-cipher-orange bg-cipher-orange/20';
    }
    if (anchor.match === true) {
      return 'w-3 h-3 rounded-full bg-cipher-cyan/80 ring-2 ring-cipher-cyan/25';
    }
    return 'w-3 h-3 rounded-full bg-muted/40 ring-2 ring-cipher-border';
  };

  return (
    <Card className="mb-6">
      <CardBody className="p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <div>
            <h2 className="text-sm font-bold font-mono text-primary">Anchor timeline</h2>
            <p className="text-xs text-muted mt-1">
              Fixed-height comparisons. Hover for hashes, click to copy.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-cipher-border overflow-hidden text-[10px] font-mono uppercase tracking-wider">
              {(['even', 'linear'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setScale(mode)}
                  className={`px-3 py-1.5 transition-colors ${
                    scale === mode
                      ? 'bg-[var(--color-hover)] text-primary'
                      : 'text-muted hover:text-secondary'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="relative h-36 sm:h-32 mb-2 select-none">
          <div className="absolute inset-x-0 top-1/2 h-px bg-cipher-border" />
          {anchors.map((anchor, i) => {
            const above = i % 2 === 0;
            const isHovered = hoveredAnchor === anchor.height;
            const isDivergence = data.first_divergence === anchor.height;

            return (
              <div
                key={anchor.height}
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${positions[i]}%` }}
              >
                {isDivergence && (
                  <div className="absolute left-1/2 -translate-x-1/2 -top-10 text-[9px] font-mono uppercase tracking-wider text-cipher-orange whitespace-nowrap">
                    First split
                  </div>
                )}
                <button
                  type="button"
                  onMouseEnter={() => setHoveredAnchor(anchor.height)}
                  onMouseLeave={() => setHoveredAnchor((h) => (h === anchor.height ? null : h))}
                  onFocus={() => setHoveredAnchor(anchor.height)}
                  onBlur={() => setHoveredAnchor((h) => (h === anchor.height ? null : h))}
                  onClick={() => copyAnchor(anchor)}
                  className={`block transition-transform hover:scale-125 focus:outline-none focus-visible:ring-2 focus-visible:ring-cipher-cyan/40 rounded-full ${dotClass(anchor)}`}
                  aria-label={`Anchor height ${anchor.height}, ${anchor.label}`}
                />
                <div
                  className={`absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-center pointer-events-none ${
                    above ? 'bottom-5' : 'top-5'
                  }`}
                >
                  <div className="text-[10px] font-mono text-secondary">h{anchor.height.toLocaleString()}</div>
                </div>
                {isHovered && (
                  <div
                    className={`absolute left-1/2 -translate-x-1/2 z-20 card-glass border border-cipher-border rounded-lg p-3 shadow-xl min-w-[240px] max-w-[320px] ${
                      above ? 'bottom-10' : 'top-10'
                    }`}
                  >
                    <div className="text-[11px] font-mono text-primary font-semibold mb-1">
                      h{anchor.height.toLocaleString()}
                      <span className="text-muted font-normal"> · {anchor.label}</span>
                    </div>
                    <div className="space-y-1 text-[10px] font-mono mb-2">
                      <div className="flex gap-2">
                        <span className="text-muted w-10 shrink-0">CS</span>
                        <code className="text-secondary break-all">{anchor.cipherscan_hash || '—'}</code>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-muted w-10 shrink-0">cTAZ</span>
                        <code className="text-secondary break-all">{anchor.ctaz_hash || '—'}</code>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[10px]">
                      <MatchState match={anchor.match} compact />
                      <span className="text-muted font-mono">
                        {copiedAnchor === anchor.height ? 'Copied' : 'Click to copy'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-[10px] font-mono text-muted">
          <span className="text-cipher-cyan">●</span> match
          <span className="mx-2 text-cipher-border">·</span>
          <span className="text-cipher-orange">○</span> mismatch
          <span className="mx-2 text-cipher-border">·</span>
          <span className="text-muted">●</span> unknown
        </p>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Guidance
// ---------------------------------------------------------------------------

export function GuidancePanel({ data }: { data: ForkMonitorData }) {
  const actions: string[] = [];
  if (data.cipherscan.finalized === 0) {
    actions.push('PoS finality RPC is unavailable. Treat fork status as degraded until finalized height returns.');
  } else if (data.cipherscan.finality_gap > 1000) {
    actions.push(
      `PoS finality is stale at h${data.cipherscan.finalized.toLocaleString()}. Compare PoW anchors, not just tip height.`,
    );
  }
  if (data.status === 'diverged') {
    actions.push(
      `First visible mismatch is h${data.first_divergence?.toLocaleString()}. Nodes should verify that height before resyncing.`,
    );
  } else {
    actions.push('Known anchors match. If your node differs, restart and reconnect before wiping cache.');
  }
  if (data.cipherscan.peers < 5) {
    actions.push('CipherScan peer count is low. Peers measure connectivity, not fork correctness.');
  }
  actions.push('If your node is mining every block, pause mining until peers and anchor hashes align.');

  return (
    <Card className="mb-6">
      <CardBody className="p-4 sm:p-5">
        <h2 className="text-sm font-bold font-mono text-primary mb-3">What to do</h2>
        <ul className="space-y-2">
          {actions.map((action) => (
            <li key={action} className="text-xs text-secondary leading-relaxed pl-3 border-l border-cipher-border">
              {action}
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Anchors table
// ---------------------------------------------------------------------------

export function AnchorsTable({ anchors }: { anchors: Anchor[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-cipher-border">
            <th className="text-left text-[11px] uppercase tracking-wider text-muted px-4 py-3">Height</th>
            <th className="text-left text-[11px] uppercase tracking-wider text-muted px-4 py-3 hidden sm:table-cell">Label</th>
            <th className="text-left text-[11px] uppercase tracking-wider text-muted px-4 py-3">CipherScan</th>
            <th className="text-left text-[11px] uppercase tracking-wider text-muted px-4 py-3">cTAZ</th>
            <th className="text-right text-[11px] uppercase tracking-wider text-muted px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {anchors.map((a) => (
            <tr
              key={a.height}
              className="border-b border-cipher-border hover:bg-[var(--color-hover)] transition-colors"
            >
              <td className="px-4 py-3 font-mono text-xs text-cipher-cyan">h{a.height.toLocaleString()}</td>
              <td className="px-4 py-3 text-xs text-muted hidden sm:table-cell">{a.label}</td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center gap-1.5 font-mono text-xs text-secondary">
                  <code>{truncHash(a.cipherscan_hash, 10)}</code>
                  {a.cipherscan_hash && <CopyButton text={a.cipherscan_hash} />}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center gap-1.5 font-mono text-xs text-secondary">
                  <code>{truncHash(a.ctaz_hash, 10)}</code>
                  {a.ctaz_hash && <CopyButton text={a.ctaz_hash} />}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <MatchState match={a.match} compact />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Checker tools
// ---------------------------------------------------------------------------

interface CheckerPanelProps {
  checkHeight: string;
  setCheckHeight: (v: string) => void;
  checkResults: CheckResult[];
  checking: boolean;
  onCheck: () => void;
  bulkInput: string;
  setBulkInput: (v: string) => void;
  bulkResults: {
    matches: number[];
    mismatches: { height: number; ref: string; got: string }[];
    unknown: number[];
  } | null;
  onBulkCompare: () => void;
}

export function CheckerPanel({
  checkHeight,
  setCheckHeight,
  checkResults,
  checking,
  onCheck,
  bulkInput,
  setBulkInput,
  bulkResults,
  onBulkCompare,
}: CheckerPanelProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-bold font-mono text-primary mb-1">Live lookup</h3>
        <p className="text-xs text-muted mb-3">Enter block heights (comma or space separated).</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={checkHeight}
            onChange={(e) => setCheckHeight(e.target.value)}
            placeholder="e.g. 40762, 41800"
            className="flex-1 px-3 py-2 text-xs font-mono bg-[var(--color-bg)] border border-cipher-border rounded-lg text-primary placeholder:text-muted/50 focus:outline-none focus:border-cipher-cyan/40"
            onKeyDown={(e) => e.key === 'Enter' && onCheck()}
          />
          <button
            type="button"
            onClick={onCheck}
            disabled={checking}
            className="btn-sm btn-primary shrink-0 disabled:opacity-50"
          >
            {checking ? '…' : 'Check'}
          </button>
        </div>
        {checkResults.length > 0 && (
          <div className="mt-4 space-y-2">
            {checkResults.map((r) => (
              <div key={r.height} className="card-dark rounded-lg p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="font-mono text-xs text-primary font-semibold">h{r.height.toLocaleString()}</span>
                  <MatchState match={r.match} compact />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
                  <div>
                    <span className="text-muted">CS </span>
                    <code className="text-secondary break-all">{r.cipherscan_hash || 'not synced'}</code>
                  </div>
                  <div>
                    <span className="text-muted">cTAZ </span>
                    <code className="text-secondary break-all">{r.ctaz_hash || 'unavailable'}</code>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="pt-4 border-t border-cipher-border">
        <h3 className="text-sm font-bold font-mono text-primary mb-1">Bulk compare</h3>
        <p className="text-xs text-muted mb-3">
          Paste <code className="text-secondary">height hash</code> lines — compared against loaded anchors.
        </p>
        <textarea
          value={bulkInput}
          onChange={(e) => setBulkInput(e.target.value)}
          placeholder={'39573 00228574fad9f6b8d88e8ad1edcee00565eb86cffa…\n39574 006e0a84682c81d539965fd0f3698e0d61bbd3bfc9…'}
          className="w-full px-3 py-2 text-xs font-mono bg-[var(--color-bg)] border border-cipher-border rounded-lg text-primary placeholder:text-muted/30 focus:outline-none focus:border-cipher-cyan/40 resize-y"
          rows={3}
          spellCheck={false}
        />
        <button type="button" onClick={onBulkCompare} className="btn-sm btn-secondary mt-2">
          Compare
        </button>
        {bulkResults && (
          <div className="mt-3 card-dark rounded-lg p-3 text-xs font-mono">
            {bulkResults.mismatches.length > 0 ? (
              <>
                <p className="text-cipher-orange font-semibold mb-1">
                  First mismatch: h{bulkResults.mismatches[0].height.toLocaleString()}
                </p>
                <p className="text-muted text-[11px] mb-0.5">reference</p>
                <code className="text-secondary block break-all mb-2">{bulkResults.mismatches[0].ref}</code>
                <p className="text-muted text-[11px] mb-0.5">your node</p>
                <code className="text-secondary block break-all">{bulkResults.mismatches[0].got}</code>
              </>
            ) : bulkResults.matches.length > 0 ? (
              <p className="text-secondary">
                All known anchors match ({bulkResults.matches.join(', ')})
                {bulkResults.unknown.length > 0 && (
                  <span className="text-muted"> · unknown heights: {bulkResults.unknown.join(', ')}</span>
                )}
              </p>
            ) : (
              <p className="text-muted">No height/hash pairs found in input.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Node registry
// ---------------------------------------------------------------------------

function branchBadgeColor(branch: string): 'cyan' | 'green' | 'orange' | 'muted' {
  if (branch === 'reference') return 'cyan';
  if (branch === 'other') return 'orange';
  return 'muted';
}

interface NodeRegistryProps {
  data: ForkMonitorData;
  reportName: string;
  setReportName: (v: string) => void;
  reportTip: string;
  setReportTip: (v: string) => void;
  reportHash: string;
  setReportHash: (v: string) => void;
  reportPeers: string;
  setReportPeers: (v: string) => void;
  reportMining: boolean;
  setReportMining: (v: boolean) => void;
  reportSamples: string;
  setReportSamples: (v: string) => void;
  reportTtl: '1h' | '24h';
  setReportTtl: (v: '1h' | '24h') => void;
  reportStatus: string | null;
  onReport: () => void;
  onDelete: (name: string) => void;
  parseSamples: (input: string) => { height: number; hash: string }[];
}

export function NodeRegistryPanel({
  data,
  reportName,
  setReportName,
  reportTip,
  setReportTip,
  reportHash,
  setReportHash,
  reportPeers,
  setReportPeers,
  reportMining,
  setReportMining,
  reportSamples,
  setReportSamples,
  reportTtl,
  setReportTtl,
  reportStatus,
  onReport,
  onDelete,
  parseSamples,
}: NodeRegistryProps) {
  const inputClass =
    'w-full px-3 py-2 text-xs font-mono bg-[var(--color-bg)] border border-cipher-border rounded-lg text-primary placeholder:text-muted/50 focus:outline-none focus:border-cipher-cyan/40';

  return (
    <div>
      <p className="text-xs text-muted mb-4">
        Operators can report tip height and optional anchor samples. Entries expire after 1h or 24h.
      </p>

      <div className="card-dark rounded-lg p-4 mb-6">
        <h3 className="text-sm font-bold font-mono text-primary mb-3">Report your node</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-mono text-muted uppercase tracking-wider block mb-1">Name *</label>
            <input
              type="text"
              value={reportName}
              onChange={(e) => setReportName(e.target.value)}
              placeholder="e.g. home-zebra"
              maxLength={32}
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-[10px] font-mono text-muted uppercase tracking-wider block mb-1">Tip height *</label>
            <input
              type="number"
              value={reportTip}
              onChange={(e) => setReportTip(e.target.value)}
              placeholder="41898"
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-[10px] font-mono text-muted uppercase tracking-wider block mb-1">Tip hash</label>
            <input
              type="text"
              value={reportHash}
              onChange={(e) => setReportHash(e.target.value)}
              placeholder="64-char hex"
              maxLength={64}
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-[10px] font-mono text-muted uppercase tracking-wider block mb-1">Peers</label>
            <input
              type="number"
              value={reportPeers}
              onChange={(e) => setReportPeers(e.target.value)}
              placeholder="12"
              className={inputClass}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-4">
          <label className="flex items-center gap-2 text-xs font-mono text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={reportMining}
              onChange={(e) => setReportMining(e.target.checked)}
              className="rounded border-cipher-border"
            />
            Mining on
          </label>
          <div className="flex rounded-lg border border-cipher-border overflow-hidden text-[10px] font-mono">
            {(['1h', '24h'] as const).map((ttl) => (
              <button
                key={ttl}
                type="button"
                onClick={() => setReportTtl(ttl)}
                className={`px-3 py-1.5 transition-colors ${
                  reportTtl === ttl ? 'bg-[var(--color-hover)] text-primary' : 'text-muted hover:text-secondary'
                }`}
              >
                {ttl}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onReport}
            disabled={!reportName || !reportTip}
            className="btn-sm btn-primary disabled:opacity-30"
          >
            Report
          </button>
          {reportStatus && <span className="text-[11px] font-mono text-muted">{reportStatus}</span>}
        </div>
        <details className="mt-4 group">
          <summary className="text-[11px] font-mono text-muted cursor-pointer hover:text-secondary list-none flex items-center gap-1">
            <span className="group-open:rotate-90 transition-transform inline-block">›</span>
            Advanced: anchor samples for branch classification
          </summary>
          <div className="mt-2">
            <textarea
              value={reportSamples}
              onChange={(e) => setReportSamples(e.target.value)}
              placeholder={'39573 00228574fad9…\n39574 006e0a84682c…'}
              className={`${inputClass} resize-y`}
              rows={2}
              spellCheck={false}
            />
            <p className="text-[10px] text-muted mt-1 font-mono">
              Parsed {parseSamples(reportSamples).length}/12 samples.
            </p>
          </div>
        </details>
      </div>

      {data.nodes.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-cipher-border">
                <th className="text-left text-[11px] uppercase tracking-wider text-muted px-4 py-3">Node</th>
                <th className="text-center text-[11px] uppercase tracking-wider text-muted px-4 py-3">Tip</th>
                <th className="text-left text-[11px] uppercase tracking-wider text-muted px-4 py-3 hidden md:table-cell">Hash</th>
                <th className="text-center text-[11px] uppercase tracking-wider text-muted px-4 py-3">Peers</th>
                <th className="text-center text-[11px] uppercase tracking-wider text-muted px-4 py-3 hidden sm:table-cell">Mining</th>
                <th className="text-left text-[11px] uppercase tracking-wider text-muted px-4 py-3">Branch</th>
                <th className="text-right text-[11px] uppercase tracking-wider text-muted px-4 py-3">Seen</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {data.nodes.map((n: RegisteredNode) => {
                const nodeTtlMs = n.ttl === '1h' ? 3_600_000 : 86_400_000;
                const stale = Date.now() - n.reported_at > nodeTtlMs * 0.75;
                return (
                  <tr
                    key={n.name}
                    className={`border-b border-cipher-border hover:bg-[var(--color-hover)] transition-colors ${stale ? 'opacity-50' : ''}`}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-primary">{n.name}</td>
                    <td className="px-4 py-3 text-center font-mono text-xs text-secondary">h{n.tip.toLocaleString()}</td>
                    <td className="px-4 py-3 hidden md:table-cell font-mono text-xs text-secondary">
                      {truncHash(n.tip_hash, 8)}
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-xs text-secondary">{n.peers ?? '—'}</td>
                    <td className="px-4 py-3 text-center font-mono text-xs text-muted hidden sm:table-cell">
                      {n.mining === true ? 'on' : n.mining === false ? 'off' : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge color={branchBadgeColor(n.branch)}>{branchLabel(n.branch)}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-muted whitespace-nowrap">
                      {fmtAgo(n.reported_at)}
                      <span className="opacity-60 ml-1">{n.ttl || '1h'}</span>
                    </td>
                    <td className="px-2 py-3">
                      <button
                        type="button"
                        onClick={() => onDelete(n.name)}
                        className="text-muted hover:text-secondary text-xs p-1"
                        title={`Remove ${n.name}`}
                        aria-label={`Remove ${n.name}`}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-muted text-center py-8">No nodes reported yet.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reference footer
// ---------------------------------------------------------------------------

export function ReferenceFooter({
  communityReport,
  hints,
}: {
  communityReport: string;
  hints: string[];
}) {
  return (
    <details className="group">
      <summary className="text-xs font-mono text-muted cursor-pointer hover:text-secondary list-none flex items-center gap-2 mb-4">
        <span className="group-open:rotate-90 transition-transform inline-block">›</span>
        Community report & diagnostic hints
      </summary>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardBody className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="text-sm font-bold font-mono text-primary">Community report</h3>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(communityReport).catch(() => {})}
                className="btn-sm btn-ghost"
              >
                Copy
              </button>
            </div>
            <pre className="card-dark rounded-lg p-3 text-[11px] font-mono text-secondary overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto">
              {communityReport}
            </pre>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="p-4 sm:p-5">
            <h3 className="text-sm font-bold font-mono text-primary mb-3">Diagnostic hints</h3>
            <ul className="space-y-2">
              {hints.map((hint) => (
                <li key={hint} className="text-xs text-secondary leading-relaxed pl-3 border-l border-cipher-border">
                  {hint}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    </details>
  );
}
