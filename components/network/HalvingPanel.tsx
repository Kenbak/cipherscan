'use client';

import { useMemo } from 'react';
import { Card, CardBody } from '@/components/ui/Card';
import { formatDuration } from '@/lib/format-numbers';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot } from 'recharts';
import { useTheme } from '@/contexts/ThemeContext';
import { getChartColors } from '@/lib/chart-theme';

export interface HalvingInfo {
  halvingBlock: number | null;
  blocksRemaining: number | null;
  eraProgress?: number;
  currentSubsidy: number;
  nextSubsidy: number | null;
  minerReward: number;
  nextMinerReward: number | null;
  estimatedDate: string | null;
  estimatedSeconds: number | null;
  currentHeight?: number;
}

export function HalvingPanel({ halving }: { halving: HalvingInfo | null }) {
  if (!halving) return null;

  const progress = halving.eraProgress ?? (
    halving.blocksRemaining != null && halving.halvingBlock
      ? Math.max(0, Math.min(100, ((halving.halvingBlock - (halving.blocksRemaining ?? 0)) / halving.halvingBlock) * 100))
      : 0
  );

  const estDate = halving.estimatedDate
    ? new Date(halving.estimatedDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <Card>
      <CardBody>
        <div className="flex items-center gap-2 mb-5">
          <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
          <h2 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider">NEXT_HALVING</h2>
        </div>

        <div className="text-center mb-5">
          <p className="text-3xl sm:text-4xl font-bold font-mono text-primary tabular-nums">
            {halving.blocksRemaining?.toLocaleString() ?? '—'}
          </p>
          <p className="text-[10px] text-muted font-mono mt-1">blocks remaining</p>
        </div>

        <div className="mb-5">
          <div className="flex justify-between text-[10px] text-muted font-mono mb-1.5">
            <span>Current era progress</span>
            <span>{progress.toFixed(1)}%</span>
          </div>
          <div className="h-2.5 bg-cipher-bg rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cipher-cyan to-cipher-yellow transition-all duration-700 rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="space-y-2.5">
          <div className="flex justify-between items-center">
            <span className="text-[11px] text-muted font-mono">Estimated time</span>
            <span className="text-[11px] font-mono text-primary font-medium">
              ~{halving.estimatedSeconds ? formatDuration(halving.estimatedSeconds) : '—'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[11px] text-muted font-mono">Estimated date</span>
            <span className="text-[11px] font-mono text-primary font-medium">{estDate ?? '—'}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[11px] text-muted font-mono">Halving block</span>
            <span className="text-[11px] font-mono text-primary font-medium">
              {halving.halvingBlock?.toLocaleString() ?? '—'}
            </span>
          </div>
          <div className="border-t border-cipher-border my-2" />
          <div className="flex justify-between items-center">
            <span className="text-[11px] text-muted font-mono">Current block subsidy</span>
            <span className="text-[11px] font-mono text-cipher-yellow font-bold">
              {halving.currentSubsidy} ZEC
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[11px] text-muted font-mono">Next block subsidy</span>
            <span className="text-[11px] font-mono text-cipher-yellow font-bold">
              {halving.nextSubsidy != null ? `${halving.nextSubsidy} ZEC` : '—'}
            </span>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function generateEmissionCurve(currentCirculating: number) {
  const points: { date: string; supply: number; ts: number }[] = [];
  const genesisDate = new Date('2016-10-28');
  const maxSupply = 21_000_000;

  // Zcash actual emission schedule (accounting for Blossom halving per-block reward):
  // Era 1: blocks 0–1,046,399 (Oct 2016 – Nov 2020) — effectively 10 ZEC/block avg (slow start + pre-Blossom)
  // Era 2: blocks 1,046,400–2,726,399 (Nov 2020 – ~Dec 2024) — 3.125 ZEC/block
  // Era 3: blocks 2,726,400–4,406,399 (Dec 2024 – ~Nov 2028) — 1.5625 ZEC/block
  // Era 4: blocks 4,406,400+ (~Nov 2028+) — 0.78125 ZEC/block
  const eras = [
    { endBlock: 1_046_400, avgSubsidy: 10.0 },
    { endBlock: 2_726_400, avgSubsidy: 3.125 },
    { endBlock: 4_406_400, avgSubsidy: 1.5625 },
    { endBlock: 6_086_400, avgSubsidy: 0.78125 },
    { endBlock: 7_766_400, avgSubsidy: 0.390625 },
  ];
  const blockTime = 75;

  for (let year = 2016; year <= 2036; year += 1) {
    for (let month = 0; month < 12; month += 3) {
      const date = new Date(year, month, 1);
      if (date < genesisDate) continue;
      if (date > new Date(2036, 0, 1)) break;

      const secondsSinceGenesis = (date.getTime() - genesisDate.getTime()) / 1000;
      const blockAtDate = Math.floor(secondsSinceGenesis / blockTime);

      let s = 0;
      let prevEnd = 0;
      for (const era of eras) {
        if (blockAtDate <= era.endBlock) {
          s += (blockAtDate - prevEnd) * era.avgSubsidy;
          break;
        }
        s += (era.endBlock - prevEnd) * era.avgSubsidy;
        prevEnd = era.endBlock;
      }

      const cappedSupply = Math.min(s, maxSupply);
      const label = `${date.toLocaleString(undefined, { month: 'short' })} '${String(year).slice(2)}`;
      points.push({ date: label, supply: cappedSupply, ts: date.getTime() });
    }
  }

  return points;
}

export function SupplyEmissionPanel({
  circulating,
  remaining,
  circulatingPct,
  dailyEmission,
  maxSupply = 21_000_000,
}: {
  circulating: number;
  remaining: number;
  circulatingPct: number;
  dailyEmission: number | null;
  maxSupply?: number;
}) {
  const { theme } = useTheme();
  const colors = getChartColors(theme);
  const emissionData = useMemo(() => generateEmissionCurve(circulating), [circulating]);

  const nowTs = Date.now();
  const nowIndex = emissionData.reduce((closest, p, i) =>
    Math.abs(p.ts - nowTs) < Math.abs(emissionData[closest].ts - nowTs) ? i : closest, 0);
  const nowPoint = emissionData[nowIndex];

  return (
    <Card>
      <CardBody>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
          <h2 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider">SUPPLY_&amp;_EMISSION</h2>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div>
            <p className="text-[9px] text-muted font-mono uppercase mb-0.5">Circulating</p>
            <p className="text-sm font-bold font-mono text-cipher-yellow tabular-nums">
              {(circulating / 1_000_000).toFixed(2)}M ZEC
            </p>
            <p className="text-[9px] text-muted font-mono">{circulatingPct.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-[9px] text-muted font-mono uppercase mb-0.5">Remaining</p>
            <p className="text-sm font-bold font-mono text-secondary tabular-nums">
              {(remaining / 1_000_000).toFixed(2)}M ZEC
            </p>
          </div>
          <div>
            <p className="text-[9px] text-muted font-mono uppercase mb-0.5">Daily Emission</p>
            <p className="text-sm font-bold font-mono text-primary tabular-nums">
              ~{dailyEmission != null ? `${Math.round(dailyEmission).toLocaleString()}` : '—'} ZEC
            </p>
          </div>
        </div>

        <div className="h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={emissionData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="emissionGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#5B9CF6" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#5B9CF6" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                stroke={colors.axis}
                tick={{ fill: colors.axis, fontSize: 9 }}
                interval={7}
                tickLine={false}
              />
              <YAxis
                stroke={colors.axis}
                tick={{ fill: colors.axis, fontSize: 9 }}
                tickFormatter={(v: number) => `${(v / 1_000_000).toFixed(0)}M`}
                domain={[0, 21_000_000]}
                tickLine={false}
                width={32}
              />
              <Tooltip
                cursor={{ stroke: 'rgba(255,255,255,0.1)' }}
                contentStyle={{
                  backgroundColor: colors.tooltipBg,
                  border: `1px solid ${colors.tooltipBorder}`,
                  borderRadius: 8,
                  fontSize: 11,
                  fontFamily: 'monospace',
                }}
                itemStyle={{ color: colors.tooltipText }}
                labelStyle={{ color: colors.tooltipText }}
                formatter={(value) => [`${(Number(value) / 1_000_000).toFixed(2)}M ZEC`, 'Supply']}
              />
              <ReferenceLine y={maxSupply} stroke={colors.axis} strokeDasharray="3 3" strokeOpacity={0.5} />
              {nowPoint && (
                <ReferenceDot
                  x={nowPoint.date}
                  y={nowPoint.supply}
                  r={4}
                  fill="#5B9CF6"
                  stroke="#fff"
                  strokeWidth={1.5}
                />
              )}
              <Area
                type="monotone"
                dataKey="supply"
                stroke="#5B9CF6"
                strokeWidth={2}
                fill="url(#emissionGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <p className="text-[9px] text-muted font-mono text-center mt-2">
          21M cap · Halving every 840,000 blocks
        </p>
      </CardBody>
    </Card>
  );
}
