'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { usePostgresApiClient, getApiUrl } from '@/lib/api-config';

const ZCASH_BLOCK_INTERVAL = 75; // seconds

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  }
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  return `${d}d ${h}h`;
}

function formatEstimatedDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

export function FutureBlockView({
  targetHeight,
  currentHeight: initialCurrentHeight,
}: {
  targetHeight: number;
  currentHeight: number;
}) {
  const [currentHeight, setCurrentHeight] = useState(initialCurrentHeight);
  const [now, setNow] = useState(() => Date.now());

  // Poll for updated tip height every 30s
  useEffect(() => {
    const poll = async () => {
      try {
        const apiUrl = usePostgresApiClient() ? `${getApiUrl()}/api/info` : '/api/info';
        const res = await fetch(apiUrl);
        if (res.ok) {
          const data = await res.json();
          const h = data.height ?? data.blocks;
          if (typeof h === 'number' && h > currentHeight) {
            setCurrentHeight(h);
          }
        }
      } catch {}
    };
    const interval = setInterval(poll, 30_000);
    return () => clearInterval(interval);
  }, [currentHeight]);

  // Update countdown every second
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const blocksRemaining = targetHeight - currentHeight;
  const secondsRemaining = blocksRemaining * ZCASH_BLOCK_INTERVAL;
  const estimatedDate = new Date(now + secondsRemaining * 1000);
  const progress = currentHeight / targetHeight;

  // If the block has been mined while we're on this page, link to it
  if (blocksRemaining <= 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
        <Card>
          <CardBody className="text-center py-16">
            <div className="text-5xl mb-6">⛏️</div>
            <h1 className="text-2xl font-bold font-mono text-primary mb-3">
              Block #{targetHeight.toLocaleString()} Has Been Mined!
            </h1>
            <p className="text-secondary mb-6">
              This block is now part of the Zcash blockchain.
            </p>
            <Link
              href={`/block/${targetHeight}`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cipher-cyan/10 border border-cipher-cyan/30 text-cipher-cyan font-mono text-sm hover:bg-cipher-cyan/20 transition-colors"
            >
              View Block →
            </Link>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <span className="text-[10px] font-mono text-muted tracking-wider">&gt; FUTURE_BLOCK</span>
        <div className="flex flex-wrap items-center gap-3 mt-1">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold font-mono text-primary">
            Zcash Block #{targetHeight.toLocaleString()}
          </h1>
          <Badge color="muted">UPCOMING</Badge>
        </div>
        <p className="mt-3 text-xs sm:text-sm text-secondary">
          This block has not been mined yet. Below is an estimate based on Zcash&apos;s
          75-second target block interval.
        </p>
      </div>

      {/* Countdown Card */}
      <Card className="mb-6">
        <CardBody>
          <div className="text-center py-6">
            {/* Big countdown */}
            <div className="font-mono text-4xl sm:text-5xl font-bold text-primary mb-2 tabular-nums">
              {formatDuration(secondsRemaining)}
            </div>
            <div className="text-sm text-muted font-mono">estimated time remaining</div>

            {/* Estimated date */}
            <div className="mt-6 pt-6 border-t border-cipher-border">
              <div className="text-xs text-muted uppercase tracking-wider mb-1">Estimated arrival</div>
              <div className="font-mono text-sm text-secondary">
                {formatEstimatedDate(estimatedDate)}
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Details Card */}
      <Card className="mb-6">
        <CardBody className="space-y-0">
          <div className="flex flex-col sm:flex-row sm:items-center py-3 border-b border-cipher-border gap-2 sm:gap-0">
            <div className="flex items-center min-w-[180px] text-secondary text-xs sm:text-sm">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              Current Height
            </div>
            <div className="flex-1 font-mono text-xs sm:text-sm text-primary">
              <Link href={`/block/${currentHeight}`} className="text-cipher-cyan hover:underline">
                #{currentHeight.toLocaleString()}
              </Link>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center py-3 border-b border-cipher-border gap-2 sm:gap-0">
            <div className="flex items-center min-w-[180px] text-secondary text-xs sm:text-sm">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              Target Height
            </div>
            <div className="flex-1 font-mono text-xs sm:text-sm text-primary font-semibold">
              #{targetHeight.toLocaleString()}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center py-3 border-b border-cipher-border gap-2 sm:gap-0">
            <div className="flex items-center min-w-[180px] text-secondary text-xs sm:text-sm">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Blocks Remaining
            </div>
            <div className="flex-1 font-mono text-xs sm:text-sm text-primary">
              {blocksRemaining.toLocaleString()}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center py-3 gap-2 sm:gap-0">
            <div className="flex items-center min-w-[180px] text-secondary text-xs sm:text-sm">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Block Interval
            </div>
            <div className="flex-1 font-mono text-xs sm:text-sm text-muted">
              ~75 seconds (target)
            </div>
          </div>

          {/* Progress bar */}
          <div className="pt-4 mt-4 border-t border-cipher-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono text-muted uppercase tracking-wider">Chain progress</span>
              <span className="text-[10px] font-mono text-secondary">{(progress * 100).toFixed(4)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-cipher-border overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cipher-cyan to-cipher-purple transition-all duration-1000"
                style={{ width: `${Math.min(progress * 100, 100)}%` }}
              />
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Disclaimer */}
      <div className="text-center text-xs text-muted font-mono space-y-1">
        <p>Estimates assume a constant 75-second block interval.</p>
        <p>Actual times vary due to mining difficulty adjustments and hash rate fluctuations.</p>
      </div>
    </div>
  );
}
