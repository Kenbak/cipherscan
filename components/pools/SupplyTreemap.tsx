'use client';

import { useMemo, useRef } from 'react';
import { formatZecCompact } from '@/lib/format-numbers';
import {
  MAX_SUPPLY_ZAT,
  isShieldedPoolKey,
  type ShieldedPoolKey,
  type SupplyPoolKey,
  type SupplySegmentInput,
  type TopLevelKey,
} from './supply-treemap-layout';
import { useSegmentLabelMode, type SegmentLabelMode } from './useSegmentLabelMode';

export interface SupplyTreemapProps {
  topLevel: SupplySegmentInput[];
  shieldedChildren: SupplySegmentInput[];
  hoveredKey: SupplyPoolKey | null;
  pinnedShielded: boolean;
  onHover: (key: SupplyPoolKey | null) => void;
  onTogglePinShielded: () => void;
}

function flexWeight(zat: number, key: SupplyPoolKey): number {
  if (zat > 0) return zat;
  if (key === 'ironwood') return 1;
  return 0;
}

function BandLabel({
  label,
  zat,
  capPct,
  mode,
}: {
  label: string;
  zat: number;
  capPct: number;
  mode: SegmentLabelMode;
}) {
  if (mode === 'none') return null;

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-1 text-center">
      <span className="truncate text-[11px] font-sans font-semibold text-white/90 sm:text-xs">{label}</span>
      {mode === 'full' ? (
        <>
          <span className="mt-0.5 text-[10px] font-mono tabular-nums text-white/75 sm:text-[11px]">
            {zat === 0 ? '0 ZEC' : `${formatZecCompact(zat / 1e8)} ZEC`}
          </span>
          <span className="mt-0.5 text-[10px] font-mono tabular-nums text-white/50">{capPct.toFixed(1)}%</span>
        </>
      ) : null}
    </div>
  );
}

function TopSegment({
  segment,
  active,
  dimmed,
  onHover,
  onClick,
  className,
  style,
}: {
  segment: SupplySegmentInput;
  active: boolean;
  dimmed: boolean;
  onHover: (key: SupplyPoolKey | null) => void;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const capPct = (segment.zat / MAX_SUPPLY_ZAT) * 100;
  const labelMode = useSegmentLabelMode(ref, capPct);

  return (
    <button
      ref={ref}
      type="button"
      className={`relative min-w-0 overflow-hidden rounded-md transition-opacity duration-150 ${dimmed ? 'opacity-30' : 'opacity-100'} ${className ?? ''}`}
      style={style}
      onMouseEnter={() => onHover(segment.key)}
      onMouseLeave={() => onHover(null)}
      onClick={onClick}
      aria-label={`${segment.label}, ${formatZecCompact(segment.zat / 1e8)} ZEC, ${capPct.toFixed(1)} percent of cap`}
    >
      {segment.hatch ? (
        <div
          className="absolute inset-0 rounded-[5px]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(135deg, rgba(148,163,184,0.14) 0 2px, transparent 2px 7px)',
            backgroundColor: 'rgba(148,163,184,0.06)',
          }}
        />
      ) : (
        <div
          className={`absolute inset-0 rounded-[5px] ${active ? 'ring-1 ring-inset ring-white/40' : 'ring-1 ring-inset ring-white/10'}`}
          style={{
            backgroundColor: segment.color,
            opacity: segment.key === 'transparent' ? 0.32 : 0.9,
          }}
        />
      )}
      <BandLabel label={segment.label} zat={segment.zat} capPct={capPct} mode={labelMode} />
    </button>
  );
}

function ShieldedPoolStack({
  segments,
  hoveredKey,
  pinnedShielded,
  onHover,
  onTogglePinShielded,
  className,
  style,
}: {
  segments: SupplySegmentInput[];
  hoveredKey: SupplyPoolKey | null;
  pinnedShielded: boolean;
  onHover: (key: SupplyPoolKey | null) => void;
  onTogglePinShielded: () => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const focusedPool = pinnedShielded && isShieldedPoolKey(hoveredKey) ? hoveredKey : null;

  return (
    <div
      className={`relative flex h-full min-w-0 flex-col overflow-hidden rounded-md ring-1 ring-inset transition-opacity duration-150 ${
        pinnedShielded ? 'ring-cipher-yellow/45' : 'ring-cipher-yellow/30'
      } ${className ?? ''}`}
      style={style}
      onMouseEnter={() => onHover('shielded')}
      onMouseLeave={() => onHover(null)}
      onClick={() => {
        if (!pinnedShielded) onTogglePinShielded();
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onTogglePinShielded();
        }
      }}
      aria-pressed={pinnedShielded}
      aria-label="Shielded pool composition. Click to pin open."
    >
      {segments.map((child, index) => {
        const weight = flexWeight(child.zat, child.key);
        const isFocused = focusedPool === child.key;
        const isDimmed = focusedPool != null && !isFocused;

        return (
          <div
            key={child.key}
            className={`relative min-h-0 w-full transition-opacity duration-150 ${index > 0 ? 'border-t border-white/12' : ''} ${isDimmed ? 'opacity-25' : 'opacity-100'} ${isFocused ? 'ring-1 ring-inset ring-white/50 z-[1]' : ''}`}
            style={{ flex: `${weight} 1 0` }}
            onMouseEnter={() => {
              if (pinnedShielded) onHover(child.key);
            }}
            onMouseLeave={() => {
              if (pinnedShielded) onHover('shielded');
            }}
            onClick={(e) => {
              if (pinnedShielded) e.stopPropagation();
            }}
          >
            <div
              className="absolute inset-0"
              style={{ backgroundColor: child.color, opacity: 0.9 }}
            />
          </div>
        );
      })}
    </div>
  );
}

export function SupplyTreemap({
  topLevel,
  shieldedChildren,
  hoveredKey,
  pinnedShielded,
  onHover,
  onTogglePinShielded,
}: SupplyTreemapProps) {
  const shieldedExpanded = pinnedShielded || hoveredKey === 'shielded';

  const handleMapLeave = () => {
    onHover(null);
  };

  return (
    <div
      className="flex h-[220px] w-full gap-0.5 p-0.5 sm:h-[280px]"
      role="img"
      aria-label="Zcash supply map: transparent, shielded, and unmined portions of the 21 million cap"
      onMouseLeave={handleMapLeave}
    >
      {topLevel.map((segment) => {
        const weight = flexWeight(segment.zat, segment.key);
        const flexStyle = { flex: `${weight} 1 0` };
        const active = hoveredKey === segment.key;
        const dimmed =
          hoveredKey != null &&
          !active &&
          !(shieldedExpanded && segment.key === 'shielded') &&
          !(pinnedShielded && segment.key === 'shielded') &&
          !(pinnedShielded && isShieldedPoolKey(hoveredKey) && segment.key !== 'shielded');

        if (segment.key === 'shielded' && shieldedExpanded) {
          return (
            <ShieldedPoolStack
              key="shielded"
              segments={shieldedChildren}
              hoveredKey={hoveredKey}
              pinnedShielded={pinnedShielded}
              onHover={onHover}
              onTogglePinShielded={onTogglePinShielded}
              className={dimmed ? 'opacity-30' : 'opacity-100'}
              style={flexStyle}
            />
          );
        }

        if (segment.key === 'shielded') {
          return (
            <TopSegment
              key={segment.key}
              segment={segment}
              active={active || pinnedShielded}
              dimmed={dimmed}
              onHover={onHover}
              className="h-full min-w-0 cursor-pointer"
              style={flexStyle}
              onClick={onTogglePinShielded}
            />
          );
        }

        return (
          <TopSegment
            key={segment.key}
            segment={segment}
            active={active}
            dimmed={dimmed}
            onHover={onHover}
            className="h-full min-w-0"
            style={flexStyle}
          />
        );
      })}
    </div>
  );
}

export type { TopLevelKey, ShieldedPoolKey };
