'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ParentSize } from '@visx/responsive';
import { ShareableCard } from '@/components/ShareableCard';
import { zatToZec } from '@/lib/format-numbers';
import { PrivacyScatterChart, type ScatterPoint } from '../PrivacyScatterChart';
import { VolumeAreaChart } from '../VolumeAreaChart';
import type { ChartColors, PrivacyRange, PrivacyView, ScatterData } from './types';
import {
  ComplianceLegend,
  ComplianceSummary,
  DENOM_BUCKETS,
  DenomMixChart,
  FamiliesTab,
  REFERENCE_DENOMS,
} from './ComplianceSection';
import { EmptyPanel, SegmentedControl } from './ui';

const PRIVACY_RANGES: { id: PrivacyRange; label: string }[] = [
  { id: '24h', label: '24h' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: 'all', label: 'All' },
];

const PRIVACY_VIEWS: { id: PrivacyView; label: string }[] = [
  { id: 'volume', label: 'Volume' },
  { id: 'scatter', label: 'Transactions' },
  { id: 'denoms', label: 'Denomination mix' },
  { id: 'families', label: 'Families' },
];

export function PrivacyScore({
  scatter,
  scatterLoading,
  scatterUnavailable,
  activated,
  colors,
  tipHeight,
}: {
  scatter: ScatterData | null;
  scatterLoading: boolean;
  scatterUnavailable: boolean;
  activated: boolean;
  colors: ChartColors;
  tipHeight: number;
}) {
  const router = useRouter();
  const [range, setRange] = useState<PrivacyRange>('7d');
  const [view, setView] = useState<PrivacyView>('scatter');

  const filteredTxs = useMemo(() => {
    const txs = scatter?.txs ?? [];
    if (range === 'all') return txs;
    const secs = range === '24h' ? 86400 : range === '7d' ? 7 * 86400 : 30 * 86400;
    const cutoff = Math.floor(Date.now() / 1000) - secs;
    return txs.filter((tx) => tx.timestamp != null && tx.timestamp >= cutoff);
  }, [scatter?.txs, range]);

  const headlineStats = useMemo(() => {
    if (!scatter) {
      return { denomCount: 0, total: 0, txPct: 0, volPct: 0 };
    }
    const denomVol = zatToZec(scatter.denominatedVolumeZat ?? 0);
    const distVol = zatToZec(scatter.distinctiveVolumeZat ?? 0);
    const totalVol = denomVol + distVol;
    return {
      denomCount: scatter.denominatedCount,
      total: scatter.total,
      txPct: scatter.total > 0 ? (scatter.denominatedCount / scatter.total) * 100 : 0,
      volPct: totalVol > 0 ? (denomVol / totalVol) * 100 : 0,
    };
  }, [scatter]);

  const PRIVACY_COLORS = {
    best: '#4ade80',
    denomPadded: '#fbbf24',
    distinctUnpadded: '#f97316',
    worst: '#dc2626',
  };

  type GradeKey = 'green' | 'partial2' | 'partial1' | 'weak';
  const [visibleGrades, setVisibleGrades] = useState<Set<GradeKey>>(
    new Set(['green', 'partial2', 'partial1', 'weak']),
  );
  const toggleGrade = useCallback((key: string) => {
    setVisibleGrades((prev) => {
      const next = new Set(prev);
      const k = key as GradeKey;
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }, []);

  const allPoints: ScatterPoint[] = useMemo(
    () =>
      filteredTxs.map((tx) => ({
        x: tx.height,
        y: tx.amountZec,
        txid: tx.txid,
        privacy: tx.privacy,
        matched: tx.matchedDenomination,
        iwActions: tx.ironwoodActions,
        orchardActions: tx.orchardActions,
        anchorCompliant: tx.anchorCompliant,
        family: tx.family,
        familyConfidence: tx.familyConfidence,
        familyShortLabel: tx.familyShortLabel,
        fee: tx.fee,
        expiryDelta: tx.expiryDelta,
      })),
    [filteredTxs],
  );

  const visiblePoints: ScatterPoint[] = useMemo(() => {
    if (visibleGrades.size === 4) return allPoints;
    return allPoints.filter((p) => {
      let checks = 0;
      if (p.privacy === 'denominated') checks++;
      if ((p.orchardActions ?? 0) === 2 && (p.iwActions ?? 0) === 1) checks++;
      if (p.anchorCompliant) checks++;
      const grade: GradeKey = checks === 3 ? 'green' : checks === 2 ? 'partial2' : checks === 1 ? 'partial1' : 'weak';
      return visibleGrades.has(grade);
    });
  }, [allPoints, visibleGrades]);

  const volumeAreaData = useMemo(
    () =>
      filteredTxs.map((tx) => {
        let checks = 0;
        if (tx.privacy === 'denominated') checks++;
        if ((tx.orchardActions ?? 0) === 2 && (tx.ironwoodActions ?? 0) === 1) checks++;
        if (tx.anchorCompliant) checks++;
        const grade = checks === 3 ? 'green' as const
          : checks === 2 ? 'partial2' as const
          : checks === 1 ? 'partial1' as const
          : 'weak' as const;
        return { height: tx.height, amountZec: tx.amountZec, grade };
      }),
    [filteredTxs],
  );

  const denomBuckets = useMemo(() => {
    const counts = new Map<number, { count: number; volume: number }>();
    for (const tx of filteredTxs) {
      if (tx.privacy === 'denominated' && tx.matchedDenomination != null) {
        const d = tx.matchedDenomination;
        const existing = counts.get(d) ?? { count: 0, volume: 0 };
        existing.count++;
        existing.volume += tx.amountZec;
        counts.set(d, existing);
      }
    }
    return DENOM_BUCKETS.map((denom) => {
      const data = counts.get(denom) ?? { count: 0, volume: 0 };
      return { denom, count: data.count, volume: data.volume };
    }).filter((b) => b.count > 0);
  }, [filteredTxs]);

  const maxBucketCount = denomBuckets.reduce((m, b) => Math.max(m, b.count), 0);
  const maxBucketVolume = denomBuckets.reduce((m, b) => Math.max(m, b.volume), 0);
  const totalDenomVolume = denomBuckets.reduce((s, b) => s + b.volume, 0);

  const complianceStats = useMemo(() => {
    const t = filteredTxs.length;
    if (t === 0) return null;
    let g = 0, p2 = 0, p1 = 0, w = 0;
    let gVol = 0, p2Vol = 0, p1Vol = 0, wVol = 0;
    for (const tx of filteredTxs) {
      let checks = 0;
      if (tx.privacy === 'denominated') checks++;
      if ((tx.orchardActions ?? 0) === 2 && (tx.ironwoodActions ?? 0) === 1) checks++;
      if (tx.anchorCompliant) checks++;
      if (checks === 3) { g++; gVol += tx.amountZec; }
      else if (checks === 2) { p2++; p2Vol += tx.amountZec; }
      else if (checks === 1) { p1++; p1Vol += tx.amountZec; }
      else { w++; wVol += tx.amountZec; }
    }
    const totalVol = gVol + p2Vol + p1Vol + wVol;
    return {
      total: t, green: g, partial2: p2, partial1: p1, weak: w,
      greenVol: totalVol > 0 ? (gVol / totalVol) * 100 : 0,
      partial2Vol: totalVol > 0 ? (p2Vol / totalVol) * 100 : 0,
      partial1Vol: totalVol > 0 ? (p1Vol / totalVol) * 100 : 0,
      weakVol: totalVol > 0 ? (wVol / totalVol) * 100 : 0,
    };
  }, [filteredTxs]);

  const filteredFamilyCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const compliance: Record<string, Record<string, number>> = {};
    for (const tx of filteredTxs) {
      if (tx.family) {
        counts[tx.family] = (counts[tx.family] || 0) + 1;
        if (!compliance[tx.family]) compliance[tx.family] = { green: 0, partial2: 0, partial1: 0, weak: 0 };
        let checks = 0;
        if (tx.privacy === 'denominated') checks++;
        if ((tx.orchardActions ?? 0) === 2 && (tx.ironwoodActions ?? 0) === 1) checks++;
        if (tx.anchorCompliant) checks++;
        const grade = checks === 3 ? 'green' : checks === 2 ? 'partial2' : checks === 1 ? 'partial1' : 'weak';
        compliance[tx.family][grade]++;
      }
    }
    return { counts, compliance };
  }, [filteredTxs]);

  const hasData = (scatter?.total ?? 0) > 0;
  const hasFilteredData = filteredTxs.length > 0;
  const shareText =
    hasFilteredData && complianceStats
      ? `ZIP-318 compliance: ${(complianceStats.green / complianceStats.total * 100).toFixed(1)}% fully compliant (${complianceStats.green}/${complianceStats.total} txs). ${headlineStats.txPct.toFixed(0)}% use standard denominations.\n\nhttps://cipherscan.app/ironwood`
      : `Zcash migration privacy on CipherScan.\n\nhttps://cipherscan.app/ironwood`;

  return (
    <div id="privacy-score" className="scroll-mt-20">
      <ShareableCard
        title="Amount privacy"
        sourceHeight={tipHeight}
        isLive={activated}
        shareText={shareText}
        fileName="cipherscan-privacy.png"
      >
        <div className="mb-4">
          <p className="max-w-2xl text-xs leading-relaxed text-muted">
            Each dot is one Orchard → Ironwood migration. Click a dot to open the transaction.
          </p>
        </div>

        {scatter && hasData && complianceStats ? (
          <ComplianceSummary
            stats={complianceStats}
            privacyColors={PRIVACY_COLORS}
            mode={view === 'scatter' ? 'txs' : 'volume'}
          />
        ) : null}

        {hasData && hasFilteredData ? (
          <>
            <div className="mb-4 flex flex-col gap-2 sm:mb-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3" data-html2canvas-ignore="true">
              <SegmentedControl options={PRIVACY_VIEWS} value={view} onChange={setView} />
              <SegmentedControl options={PRIVACY_RANGES} value={range} onChange={setRange} className="sm:shrink-0" />
            </div>

            {view === 'families' ? (
              Object.keys(filteredFamilyCounts.counts).length > 0 ? (
                <FamiliesTab
                  counts={filteredFamilyCounts.counts}
                  compliance={filteredFamilyCounts.compliance}
                  total={filteredTxs.length}
                  privacyColors={PRIVACY_COLORS}
                />
              ) : (
                <p className="py-16 text-center text-xs font-mono text-muted">No family data available.</p>
              )
            ) : view === 'denoms' ? (
              denomBuckets.length > 0 ? (
                <DenomMixChart
                  denomBuckets={denomBuckets}
                  maxBucketCount={maxBucketCount}
                  maxBucketVolume={maxBucketVolume}
                  totalDenomVolume={totalDenomVolume}
                  totalTxs={filteredTxs.length}
                  barColor={colors.denominated}
                  mode="txs"
                />
              ) : (
                <p className="py-16 text-center text-xs font-mono text-muted">No standard denominations in this range.</p>
              )
            ) : view === 'volume' ? (
            <>
            <div style={{ width: '100%', height: 280 }}>
              <ParentSize debounceTime={100}>
                {({ width: parentWidth }) =>
                  parentWidth > 0 ? (
                    <VolumeAreaChart
                      data={volumeAreaData}
                      width={parentWidth}
                      height={280}
                      colors={colors}
                      privacyColors={PRIVACY_COLORS}
                    />
                  ) : null
                }
              </ParentSize>
            </div>
            <div className="mt-3 flex flex-col gap-2 border-t border-cipher-border/30 pt-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <ComplianceLegend
                privacyColors={PRIVACY_COLORS}
                denomLineColor={colors.denominated}
              />
              <div className="shrink-0 text-[10px] font-mono text-muted">
                {filteredTxs.length} txs in range · stacked volume
              </div>
            </div>
            </>
            ) : (
            <>
            <div style={{ width: '100%', height: 280 }}>
              <ParentSize debounceTime={100}>
                {({ width: parentWidth }) =>
                  parentWidth > 0 ? (
                    <PrivacyScatterChart
                      data={visiblePoints}
                      width={parentWidth}
                      height={280}
                      colors={colors}
                      privacyColors={PRIVACY_COLORS}
                      referenceLines={REFERENCE_DENOMS}
                      onDotClick={(txid) => router.push(`/tx/${txid}`)}
                    />
                  ) : null
                }
              </ParentSize>
            </div>
            <div className="mt-3 flex flex-col gap-2 border-t border-cipher-border/30 pt-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <ComplianceLegend
                privacyColors={PRIVACY_COLORS}
                denomLineColor={colors.denominated}
                activeGrades={visibleGrades}
                onToggle={toggleGrade}
              />
              <div className="shrink-0 text-[10px] font-mono text-muted">
                {visiblePoints.length} txs in range · log scale
              </div>
            </div>
            </>
            )}
          </>
        ) : hasData ? (
          <p className="py-8 text-center text-xs font-mono text-muted">No migrations in this range.</p>
        ) : (
          <EmptyPanel
            activated={activated}
            message={
              scatterLoading
                ? 'Loading transaction-level privacy data…'
                : scatterUnavailable
                  ? 'Transaction-level privacy data temporarily unavailable'
                  : undefined
            }
          />
        )}
      </ShareableCard>
    </div>
  );
}
