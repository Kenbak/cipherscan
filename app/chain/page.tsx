'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Tooltip } from '@/components/Tooltip';
import { getApiUrl } from '@/lib/api-config';
import { formatRelativeTime } from '@/lib/utils';

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

const BLOCKS_TO_SHOW = 20;

export default function ChainViewPage() {
  const [blocks, setBlocks] = useState<BlockRow[]>([]);
  const [stats, setStats] = useState<CrosslinkStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const api = getApiUrl();
      const [blocksRes, crosslinkRes] = await Promise.all([
        fetch(`${api}/api/blocks?limit=${BLOCKS_TO_SHOW}`),
        fetch(`${api}/api/crosslink`),
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
    } catch (err) {
      console.error('Failed to fetch chain view data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Index of the first finalized block (top of the list).
  // This is where we draw the prominent "Finality frontier" marker.
  const finalizedFrontierIndex = stats
    ? blocks.findIndex((b) => b.height <= stats.finalizedHeight)
    : -1;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12 animate-fade-in">
      <div className="mb-6">
        <p className="text-xs text-muted font-mono uppercase tracking-widest mb-3">
          <span className="opacity-50">{'>'}</span> CHAIN_VIEW
        </p>
        <div className="flex items-center gap-3 flex-wrap justify-between">
          <h1 className="text-2xl sm:text-3xl font-bold text-primary">
            PoW &amp; PoS Chain
          </h1>
          {stats && (
            <div className="flex items-center gap-2 text-xs font-mono text-muted">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cipher-green opacity-60"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cipher-green"></span>
              </span>
              <span>live</span>
            </div>
          )}
        </div>
        <p className="text-sm text-secondary mt-2 max-w-xl">
          PoW blocks on the left, PoS finalization markers on the right.
          Lines connect mined blocks to the finalizer vote that confirmed them.
        </p>
      </div>

      {/* Top-of-chain stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <TipStat label="PoW Tip" value={`#${stats.tipHeight.toLocaleString()}`} tooltip="Highest block mined by miners" />
          <TipStat label="Finalized" value={`#${stats.finalizedHeight.toLocaleString()}`} tooltip="Highest block confirmed irreversible by the PoS finality layer" />
          <TipStat label="Finality Gap" value={`${stats.finalityGap}`} sub="blocks" tooltip="Blocks between PoW tip and last finalized block" />
          <TipStat label="Finalizers" value={`${stats.finalizerCount}`} tooltip="Active finalizers participating in BFT consensus" />
        </div>
      )}

      {loading && blocks.length === 0 ? (
        <Card>
          <CardBody className="py-16 text-center text-muted text-sm">
            Loading chain…
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody className="p-0">
            {/* Header row */}
            <div className="grid grid-cols-[1fr_auto_1fr] gap-2 sm:gap-4 px-4 sm:px-6 pt-5 pb-3 border-b border-cipher-border">
              <div className="text-[11px] font-mono uppercase tracking-wider text-cipher-cyan">
                PoW Chain (Best Chain)
              </div>
              <div className="w-6 sm:w-10" />
              <div className="text-[11px] font-mono uppercase tracking-wider text-cipher-cyan text-right">
                PoS / BFT Finalization
              </div>
            </div>

            <div className="relative py-6 px-4 sm:px-6">
              {blocks.map((b, i) => {
                const isFinalized = stats ? b.height <= stats.finalizedHeight : false;
                const isFrontier = i === finalizedFrontierIndex && stats;

                return (
                  <div
                    key={b.hash}
                    className="grid grid-cols-[1fr_auto_1fr] gap-2 sm:gap-4 items-center py-3 group"
                  >
                    {/* PoW block cell */}
                    <Link
                      href={`/block/${b.height}`}
                      className="flex items-center justify-end gap-3 text-right"
                    >
                      <div>
                        <div className="flex items-center justify-end gap-2">
                          <span className="font-mono text-sm text-primary group-hover:text-cipher-cyan transition-colors">
                            #{b.height.toLocaleString()}
                          </span>
                          <code className="hidden sm:inline text-[10px] font-mono text-muted">
                            {b.hash.slice(0, 10)}…{b.hash.slice(-6)}
                          </code>
                        </div>
                        <div className="text-[10px] text-muted font-mono mt-0.5 flex items-center justify-end gap-3">
                          <span>{b.transaction_count} tx</span>
                          <span className="hidden sm:inline">{formatRelativeTime(b.timestamp)}</span>
                        </div>
                      </div>
                    </Link>

                    {/* Center dot + vertical timeline */}
                    <div className="relative flex items-center justify-center w-6 sm:w-10 self-stretch">
                      <span
                        className={`absolute left-1/2 -translate-x-1/2 w-px ${
                          isFinalized ? 'bg-cipher-green/40' : 'bg-cipher-cyan/40'
                        }`}
                        style={{
                          top: i === 0 ? '50%' : '0',
                          bottom: i === blocks.length - 1 ? '50%' : '0',
                        }}
                      />
                      <span
                        className={`relative z-10 block rounded-full border transition-all ${
                          isFrontier
                            ? 'w-3.5 h-3.5 bg-cipher-green border-cipher-green ring-2 ring-cipher-green/30'
                            : isFinalized
                            ? 'w-2.5 h-2.5 bg-cipher-green/80 border-cipher-green'
                            : 'w-2.5 h-2.5 bg-cipher-cyan/70 border-cipher-cyan'
                        }`}
                      />
                    </div>

                    {/* BFT / finalization indicator (right column) */}
                    <div className="flex items-center">
                      {isFrontier && stats ? (
                        // Prominent marker at the finality frontier (top-most finalized block)
                        <FrontierMarker
                          finalizerCount={stats.finalizerCount}
                          totalStakeZec={stats.totalStakeZec}
                        />
                      ) : isFinalized ? (
                        // Compact "BFT confirmed" indicator for blocks below the frontier
                        <div className="flex items-center gap-2 text-[10px] font-mono">
                          <span className="inline-block w-2 h-2 rounded-full bg-cipher-green/70" />
                          <span className="text-cipher-green/80 uppercase tracking-wider">
                            bft ✓
                          </span>
                        </div>
                      ) : (
                        // Not-yet-finalized blocks above the frontier
                        <div className="flex items-center gap-2 text-[10px] font-mono">
                          <span className="inline-block w-2 h-2 rounded-full bg-cipher-orange/60 animate-pulse" />
                          <span className="text-muted uppercase tracking-wider">pending</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      )}

      <p className="text-xs text-muted text-center mt-6">
        Showing the latest {BLOCKS_TO_SHOW} PoW blocks. Updates every 10 seconds.
      </p>
    </div>
  );
}

function FrontierMarker({
  finalizerCount,
  totalStakeZec,
}: {
  finalizerCount: number;
  totalStakeZec: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="block h-px w-4 sm:w-6 bg-cipher-green/50" />
      <div className="flex items-center gap-2 py-1.5 px-2.5 rounded border border-cipher-green/40 bg-cipher-green/5">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cipher-green opacity-70"></span>
          <span className="relative inline-flex h-2 w-2 rounded-full bg-cipher-green"></span>
        </span>
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-cipher-green">Finality Frontier</span>
            <Badge color="green">BFT</Badge>
          </div>
          <div className="text-[9px] text-muted font-mono mt-0.5">
            {finalizerCount} finalizers · {totalStakeZec.toFixed(1)} cTAZ staked
          </div>
        </div>
      </div>
    </div>
  );
}

function TipStat({
  label,
  value,
  sub,
  tooltip,
}: {
  label: string;
  value: string;
  sub?: string;
  tooltip?: string;
}) {
  return (
    <div className="card p-4">
      <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1 flex items-center gap-1">
        <span>{label}</span>
        {tooltip && <Tooltip content={tooltip} />}
      </div>
      <div className="text-lg sm:text-xl font-mono font-bold text-primary">
        {value}
        {sub && <span className="text-xs text-muted ml-1">{sub}</span>}
      </div>
    </div>
  );
}
