'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Tooltip } from '@/components/Tooltip';
import { getApiUrl } from '@/lib/api-config';

interface BlockRow {
  height: number;
  hash: string;
  timestamp: number;
  transaction_count: number;
  size: number;
  finality_status?: string | null;
}

interface CrosslinkStats {
  tipHeight: number;
  finalizedHeight: number;
  finalityGap: number;
  finalizerCount: number;
  totalStakeZec: number;
}

interface BftTip {
  votedBlockHash: string | null;
  signatureCount: number;
}

interface DivergenceEvent {
  id: number;
  start_time: number;
  end_time: number | null;
  duration_seconds: number | null;
  is_open: boolean;
  severity: string;
  start_tip_height: number;
  start_finalized_height: number;
  peak_gap: number;
  peak_tip_height: number;
  end_tip_height: number | null;
  end_finalized_height: number | null;
}

/**
 * Pretty-print bytes with a compact unit.
 */
function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function fmtAge(epoch: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000 - epoch));
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

/**
 * Size-to-visual-scale: log scale so coinbase-only blocks (1-2 KB) are still
 * visible next to full blocks (>60 KB). Returns a value in [0.2, 1].
 */
function sizeToScale(size: number, maxSize: number): number {
  if (maxSize <= 0) return 0.4;
  const normalizedMax = Math.log10(Math.max(maxSize, 2048));
  const normalizedSize = Math.log10(Math.max(size, 1024));
  const pct = normalizedSize / normalizedMax;
  return Math.max(0.2, Math.min(1, pct));
}

/**
 * Shared Crosslink chain visualizer.
 *
 * Two layouts:
 *  - variant="full": standalone page with header + all stats
 *  - variant="compact": embeddable on the homepage (fewer blocks, no header)
 */
export function CrosslinkChainView({
  variant = 'full',
  blocksToShow = 20,
}: {
  variant?: 'full' | 'compact';
  blocksToShow?: number;
}) {
  const [blocks, setBlocks] = useState<BlockRow[]>([]);
  const [stats, setStats] = useState<CrosslinkStats | null>(null);
  const [bftTip, setBftTip] = useState<BftTip | null>(null);
  const [divergenceEvents, setDivergenceEvents] = useState<DivergenceEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const api = getApiUrl();
      const [blocksRes, crosslinkRes, bftRes, divRes] = await Promise.all([
        fetch(`${api}/api/blocks?limit=${blocksToShow}`),
        fetch(`${api}/api/crosslink`),
        fetch(`${api}/api/crosslink/bft-tip`),
        variant === 'full'
          ? fetch(`${api}/api/crosslink/divergence-history?limit=10`)
          : Promise.resolve(null),
      ]);

      if (blocksRes.ok) {
        const data = await blocksRes.json();
        setBlocks(data.blocks || []);
      }
      if (crosslinkRes.ok) {
        const data = await crosslinkRes.json();
        if (data.success) {
          setStats({
            tipHeight: data.tipHeight,
            finalizedHeight: data.finalizedHeight,
            finalityGap: data.finalityGap,
            finalizerCount: data.finalizerCount,
            totalStakeZec: data.totalStakeZec,
          });
        }
      }
      if (bftRes.ok) {
        const data = await bftRes.json();
        if (data.success) {
          setBftTip({
            votedBlockHash: data.votedBlockHash,
            signatureCount: data.signatureCount,
          });
        }
      }
      if (divRes && divRes.ok) {
        const data = await divRes.json();
        if (data.success) setDivergenceEvents(data.events || []);
      }
    } catch (err) {
      console.error('Chain view fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [blocksToShow, variant]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, variant === 'compact' ? 15_000 : 10_000);
    return () => clearInterval(interval);
  }, [fetchData, variant]);

  // Index into blocks[] of the first finalized block from the top (= finality frontier)
  const finalizedFrontierIndex = stats
    ? blocks.findIndex((b) => b.height <= stats.finalizedHeight)
    : -1;

  // Index of the block BFT is currently voting on (if visible)
  const votedIndex = bftTip?.votedBlockHash
    ? blocks.findIndex((b) => b.hash === bftTip.votedBlockHash)
    : -1;

  const maxSize = blocks.reduce((m, b) => Math.max(m, b.size || 0), 0);
  const openDivergence = divergenceEvents.find((e) => e.is_open);

  if (loading && blocks.length === 0) {
    return (
      <div className="card p-8 flex items-center justify-center min-h-[240px]">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-cipher-cyan border-t-transparent" />
      </div>
    );
  }

  return (
    <div className={variant === 'compact' ? '' : 'space-y-6'}>
      {variant === 'full' && stats && (
        <StatsGrid stats={stats} openDivergence={!!openDivergence} />
      )}

      {variant === 'full' && (openDivergence || divergenceEvents.length > 0) && (
        <DivergencePanel openEvent={openDivergence} recentEvents={divergenceEvents} />
      )}

      <div className="card overflow-hidden">
        {/* Column headers */}
        <div className="grid grid-cols-[1fr_auto_minmax(7rem,1fr)] gap-3 sm:gap-4 px-4 sm:px-6 py-3 border-b border-cipher-border/60 text-[10px] font-mono uppercase tracking-wider text-muted">
          <div>PoW Chain</div>
          <div className="w-4 sm:w-8" />
          <div className="text-right">PoS / BFT</div>
        </div>

        <div className="py-4 px-3 sm:px-6">
          {blocks.map((b, i) => {
            const isFinalized = stats ? b.height <= stats.finalizedHeight : false;
            const isFrontier = i === finalizedFrontierIndex && stats;
            const isVotingOn = i === votedIndex;
            const scale = sizeToScale(b.size || 0, maxSize);

            return (
              <ChainRow
                key={b.hash}
                block={b}
                scale={scale}
                isFinalized={isFinalized}
                isFrontier={isFrontier}
                isVotingOn={isVotingOn}
                stats={stats}
                bftTip={bftTip}
                isFirst={i === 0}
                isLast={i === blocks.length - 1}
                variant={variant}
              />
            );
          })}
        </div>

        {variant === 'compact' && (
          <div className="px-4 sm:px-6 py-3 border-t border-cipher-border/60 flex items-center justify-between text-[11px] font-mono">
            <span className="text-muted">
              {stats && `Finalized through #${stats.finalizedHeight.toLocaleString()} · gap ${stats.finalityGap}`}
            </span>
            <Link href="/chain" className="text-cipher-cyan hover:underline">
              Open Chain View →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function ChainRow({
  block,
  scale,
  isFinalized,
  isFrontier,
  isVotingOn,
  stats,
  bftTip,
  isFirst,
  isLast,
  variant,
}: {
  block: BlockRow;
  scale: number;
  isFinalized: boolean;
  isFrontier: boolean;
  isVotingOn: boolean;
  stats: CrosslinkStats | null;
  bftTip: BftTip | null;
  isFirst: boolean;
  isLast: boolean;
  variant: 'full' | 'compact';
}) {
  // Card width scales with block size (min 55%, max 100%).
  // A bigger block literally takes more visual space on the row.
  const widthPct = 55 + scale * 45;

  const borderColor = isVotingOn
    ? 'border-cipher-orange/50'
    : isFinalized
    ? 'border-cipher-green/40'
    : 'border-cipher-border';

  const dotClasses = isFrontier
    ? 'w-3.5 h-3.5 bg-cipher-green border-cipher-green ring-2 ring-cipher-green/30'
    : isVotingOn
    ? 'w-3 h-3 bg-cipher-orange border-cipher-orange ring-2 ring-cipher-orange/30 animate-pulse'
    : isFinalized
    ? 'w-2.5 h-2.5 bg-cipher-green/80 border-cipher-green'
    : 'w-2.5 h-2.5 bg-cipher-cyan/70 border-cipher-cyan';

  return (
    <div className="grid grid-cols-[1fr_auto_minmax(7rem,1fr)] gap-3 sm:gap-4 items-center py-2 group">
      {/* PoW block card — width proportional to size */}
      <div className="flex justify-end min-w-0">
        <Link
          href={`/block/${block.height}`}
          className={`block rounded-md border ${borderColor} bg-cipher-bg/40 hover:bg-cipher-hover/60 transition-all px-3 py-2 min-w-0`}
          style={{ width: `${widthPct}%` }}
        >
          <div className="flex items-center justify-between gap-3 min-w-0">
            <span className="font-mono text-sm text-primary group-hover:text-cipher-cyan transition-colors truncate">
              #{block.height.toLocaleString()}
            </span>
            <code className="hidden sm:inline text-[10px] font-mono text-muted truncate">
              {block.hash.slice(0, 8)}…{block.hash.slice(-6)}
            </code>
          </div>
          {/* Size bar */}
          <div className="mt-1.5 flex items-center gap-2">
            <div className="flex-1 h-1 rounded-full bg-cipher-border/40 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  isVotingOn
                    ? 'bg-cipher-orange/70'
                    : isFinalized
                    ? 'bg-cipher-green/60'
                    : 'bg-cipher-cyan/70'
                }`}
                style={{ width: `${scale * 100}%` }}
              />
            </div>
            <div className="shrink-0 text-[10px] font-mono text-muted whitespace-nowrap">
              {block.transaction_count} tx · {fmtBytes(block.size || 0)} · {fmtAge(block.timestamp)}
            </div>
          </div>
        </Link>
      </div>

      {/* Center timeline */}
      <div className="relative flex items-center justify-center w-4 sm:w-8 self-stretch shrink-0">
        <span
          className={`absolute left-1/2 -translate-x-1/2 w-px ${
            isFinalized ? 'bg-cipher-green/40' : 'bg-cipher-cyan/30'
          }`}
          style={{
            top: isFirst ? '50%' : '0',
            bottom: isLast ? '50%' : '0',
          }}
        />
        <span className={`relative z-10 block rounded-full border transition-all ${dotClasses}`} />
      </div>

      {/* Right column: BFT status */}
      <div className="flex items-center min-w-0">
        {isVotingOn && bftTip && stats ? (
          <BftVoteMarker
            signatureCount={bftTip.signatureCount}
            finalizerCount={stats.finalizerCount}
            compact={variant === 'compact'}
          />
        ) : isFrontier && stats ? (
          <FrontierMarker
            finalizerCount={stats.finalizerCount}
            totalStakeZec={stats.totalStakeZec}
            compact={variant === 'compact'}
          />
        ) : isFinalized ? (
          <div className="flex items-center gap-2 text-[10px] font-mono">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-cipher-green/70" />
            <span className="text-cipher-green/80 uppercase tracking-wider">bft ✓</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-[10px] font-mono">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-cipher-orange/60 animate-pulse" />
            <span className="text-muted uppercase tracking-wider">pending</span>
          </div>
        )}
      </div>
    </div>
  );
}

function StatsGrid({
  stats,
  openDivergence,
}: {
  stats: CrosslinkStats;
  openDivergence: boolean;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <TipStat
        label="PoW Tip"
        value={`#${stats.tipHeight.toLocaleString()}`}
        tooltip="Highest block mined by miners."
      />
      <TipStat
        label="Finalized"
        value={`#${stats.finalizedHeight.toLocaleString()}`}
        tooltip="Highest block irreversibly confirmed by PoS BFT consensus."
      />
      <TipStat
        label="Finality Gap"
        value={`${stats.finalityGap}`}
        sub="blocks"
        accent={openDivergence ? 'orange' : stats.finalityGap > 20 ? 'orange' : undefined}
        tooltip="Blocks between the PoW tip and the last finalized block. Healthy: 0–10."
      />
      <TipStat
        label="Finalizers"
        value={`${stats.finalizerCount}`}
        tooltip="Active validators participating in BFT voting."
      />
    </div>
  );
}

function TipStat({
  label,
  value,
  sub,
  tooltip,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  tooltip?: string;
  accent?: 'orange';
}) {
  return (
    <div className="card p-4">
      <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1 flex items-center gap-1">
        <span>{label}</span>
        {tooltip && <Tooltip content={tooltip} />}
      </div>
      <div
        className={`text-lg sm:text-xl font-mono font-bold ${
          accent === 'orange' ? 'text-cipher-orange' : 'text-primary'
        }`}
      >
        {value}
        {sub && <span className="text-xs text-muted ml-1">{sub}</span>}
      </div>
    </div>
  );
}

function FrontierMarker({
  finalizerCount,
  totalStakeZec,
  compact,
}: {
  finalizerCount: number;
  totalStakeZec: number;
  compact?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 py-1.5 px-2.5 rounded border border-cipher-green/40 bg-cipher-green/5">
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cipher-green opacity-70" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-cipher-green" />
      </span>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold text-cipher-green whitespace-nowrap">
          Finality Frontier
        </div>
        {!compact && (
          <div className="text-[9px] text-muted font-mono whitespace-nowrap">
            {finalizerCount} finalizers · {totalStakeZec.toFixed(1)} cTAZ
          </div>
        )}
      </div>
    </div>
  );
}

function BftVoteMarker({
  signatureCount,
  finalizerCount,
  compact,
}: {
  signatureCount: number;
  finalizerCount: number;
  compact?: boolean;
}) {
  const pct = finalizerCount > 0 ? Math.round((signatureCount / finalizerCount) * 100) : 0;
  return (
    <div className="flex items-center gap-2 py-1.5 px-2.5 rounded border border-cipher-orange/40 bg-cipher-orange/5">
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cipher-orange opacity-70" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-cipher-orange" />
      </span>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold text-cipher-orange whitespace-nowrap">Voting now</div>
        {!compact && (
          <div className="text-[9px] text-muted font-mono whitespace-nowrap">
            {signatureCount}/{finalizerCount} sigs · {pct}%
          </div>
        )}
      </div>
    </div>
  );
}

function fmtAgo(epoch: number | null): string {
  if (!epoch) return '—';
  const diff = Math.floor(Date.now() / 1000 - epoch);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function fmtDuration(secs: number | null): string {
  if (!secs) return '—';
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

function DivergencePanel({
  openEvent,
  recentEvents,
}: {
  openEvent?: DivergenceEvent;
  recentEvents: DivergenceEvent[];
}) {
  const [expanded, setExpanded] = useState(false);
  const closed = recentEvents.filter((e) => !e.is_open);
  if (!openEvent && closed.length === 0) return null;

  const repeatedHeights = new Map<number, number>();
  for (const e of closed) {
    const h = e.start_finalized_height;
    repeatedHeights.set(h, (repeatedHeights.get(h) || 0) + 1);
  }
  const recurringHeight = [...repeatedHeights.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])[0];

  return (
    <div className={`card p-4 sm:p-5 ${openEvent ? 'border-cipher-orange/40' : ''}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <span className="relative flex h-2.5 w-2.5 mt-1.5 shrink-0">
            <span
              className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${
                openEvent ? 'bg-cipher-orange' : 'bg-cipher-cyan'
              }`}
            />
            <span
              className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                openEvent ? 'bg-cipher-orange' : 'bg-cipher-cyan'
              }`}
            />
          </span>
          <div>
            <div className="text-sm font-semibold text-primary">
              {openEvent ? 'Chain divergence in progress' : 'Chain divergence history'}
            </div>
            <div className="text-xs text-secondary mt-1 leading-relaxed max-w-2xl">
              {openEvent ? (
                <>
                  Our node&apos;s finality gap is{' '}
                  <span className="text-cipher-orange font-semibold">
                    {openEvent.peak_gap} blocks
                  </span>
                  . Started {fmtAgo(openEvent.start_time)} at finalized block{' '}
                  <Link
                    href={`/block/${openEvent.start_finalized_height}`}
                    className="text-cipher-cyan hover:underline"
                  >
                    #{openEvent.start_finalized_height.toLocaleString()}
                  </Link>
                  .
                </>
              ) : recurringHeight ? (
                <>
                  We&apos;ve diverged at finalized block{' '}
                  <Link
                    href={`/block/${recurringHeight[0]}`}
                    className="text-cipher-cyan hover:underline"
                  >
                    #{recurringHeight[0].toLocaleString()}
                  </Link>{' '}
                  <span className="text-primary">{recurringHeight[1]} times</span> — looks like a
                  reproducible protocol bug at that height.
                </>
              ) : (
                <>Last divergence resolved {fmtAgo(closed[0]?.end_time ?? null)}.</>
              )}
            </div>
          </div>
        </div>

        {recentEvents.length > 0 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs font-mono text-muted hover:text-cipher-cyan"
          >
            {expanded ? 'hide history' : `history (${recentEvents.length})`}
          </button>
        )}
      </div>

      {expanded && recentEvents.length > 0 && (
        <div className="mt-4 pt-4 border-t border-cipher-border overflow-x-auto">
          <table className="w-full text-xs font-mono min-w-[560px]">
            <thead>
              <tr className="text-left text-muted text-[10px] uppercase tracking-wider">
                <th className="py-2 pr-4">Started</th>
                <th className="py-2 pr-4">Diverged at</th>
                <th className="py-2 pr-4 text-right">Peak gap</th>
                <th className="py-2 pr-4 text-right">Duration</th>
                <th className="py-2 pr-4">Severity</th>
              </tr>
            </thead>
            <tbody>
              {recentEvents.map((e) => (
                <tr key={e.id} className="border-t border-cipher-border/40">
                  <td className="py-2 pr-4 text-secondary">{fmtAgo(e.start_time)}</td>
                  <td className="py-2 pr-4">
                    <Link
                      href={`/block/${e.start_finalized_height}`}
                      className="text-cipher-cyan hover:underline"
                    >
                      #{e.start_finalized_height.toLocaleString()}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-right text-primary">{e.peak_gap}</td>
                  <td className="py-2 pr-4 text-right text-secondary">
                    {e.is_open ? 'open' : fmtDuration(e.duration_seconds)}
                  </td>
                  <td className="py-2 pr-4">
                    <span
                      className={
                        e.severity === 'critical' ? 'text-cipher-orange' : 'text-muted'
                      }
                    >
                      {e.severity}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
