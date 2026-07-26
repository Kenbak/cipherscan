'use client';

import { useId, useMemo } from 'react';

export type InflowSourceGroup = 'shielded' | 'transparent' | 'mining';

export interface InflowFlowRow {
  name: string;
  zat: number;
  txs: number;
  color: string;
  group: InflowSourceGroup;
}

export interface InflowFlowProps {
  rows: InflowFlowRow[];
  activeName: string | null;
  onHover: (name: string | null) => void;
  onSelect: (name: string) => void;
  formatValue: (zat: number) => string;
  ironwoodColor: string;
  ironwoodZat: number;
}

type PathKind = 'orchard' | 'sapling' | 'transparent' | 'coinbase';

const STROKE = 1.5;
const GROUP_GAP = 12;

function pathKind(name: string): PathKind {
  if (name.includes('Orchard') || name.includes('ZIP-318')) return 'orchard';
  if (name.includes('Sapling')) return 'sapling';
  if (name.includes('Transparent')) return 'transparent';
  return 'coinbase';
}

function shortName(name: string): string {
  if (name.includes('Orchard')) return 'Orchard';
  return name;
}

function pathNote(kind: PathKind): string {
  switch (kind) {
    case 'orchard':
      return 'ZIP-318 migration';
    case 'sapling':
      return 'Sapling pool cross';
    case 'transparent':
      return 'Transparent shield';
    case 'coinbase':
      return 'Block reward';
  }
}

function sourcePath(sy: number, hubY: number, gateX: number): string {
  return [
    `M 0 ${sy}`,
    `C ${gateX * 0.45} ${sy}, ${gateX - 14} ${hubY}, ${gateX} ${hubY}`,
  ].join(' ');
}

function SourceButton({
  row,
  rowH,
  active,
  formatValue,
  onHover,
  onSelect,
}: {
  row: { name: string; color: string; zat: number };
  rowH: number;
  active: boolean;
  formatValue: (zat: number) => string;
  onHover: (name: string | null) => void;
  onSelect: (name: string) => void;
}) {
  return (
    <button
      type="button"
      className={`flex w-full flex-col justify-center px-1 text-left transition-opacity ${active ? 'opacity-100' : 'opacity-30'}`}
      style={{ height: rowH }}
      onMouseEnter={() => onHover(row.name)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onSelect(row.name)}
    >
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
        <span className="text-xs text-secondary">{shortName(row.name)}</span>
      </div>
      <span className="mt-0.5 pl-3.5 text-[10px] font-mono font-medium tabular-nums text-primary/90">
        {formatValue(row.zat)}
      </span>
    </button>
  );
}

export function InflowFlow({
  rows,
  activeName,
  onHover,
  onSelect,
  formatValue,
  ironwoodColor,
  ironwoodZat,
}: InflowFlowProps) {
  const layout = useMemo(() => {
    const rowH = 44;
    const pad = 16;
    const gateX = 158;
    const hubX = 252;
    const groupOrder: InflowSourceGroup[] = ['shielded', 'transparent', 'mining'];

    const groups = groupOrder
      .map((key) => ({
        key,
        rows: rows.filter((r) => r.group === key),
      }))
      .filter((g) => g.rows.length > 0);

    let y = pad;
    const positioned: Array<InflowFlowRow & { sy: number; kind: PathKind; d: string }> = [];
    const dividerYs: number[] = [];

    groups.forEach((group, groupIndex) => {
      if (groupIndex > 0) {
        y += GROUP_GAP;
        dividerYs.push(y - GROUP_GAP / 2);
      }
      group.rows.forEach((row) => {
        const sy = y + rowH / 2;
        positioned.push({
          ...row,
          kind: pathKind(row.name),
          sy,
          d: sourcePath(sy, 0, gateX),
        });
        y += rowH;
      });
    });

    const height = y + pad;
    const hubY = height / 2;

    positioned.forEach((row) => {
      row.d = sourcePath(row.sy, hubY, gateX);
    });

    return { height, rowH, pad, hubY, hubX, gateX, groups, positioned, dividerYs };
  }, [rows]);

  const vbW = layout.hubX + 6;
  const vbH = layout.height;
  const clipId = useId().replace(/:/g, '');

  return (
    <div
      className="mb-3 overflow-hidden rounded-xl border border-cipher-border/25 bg-glass-3/20"
      role="img"
      aria-label="Sources of Ironwood ZEC inflows converging into the verified Ironwood pool"
    >
      <div className="relative flex min-h-0" style={{ height: vbH }}>
        <div
          className="flex shrink-0 flex-col pl-4 sm:w-36 sm:pl-5"
          style={{ paddingTop: layout.pad, paddingBottom: layout.pad }}
        >
          {layout.groups.map((group, groupIndex) => (
            <div key={group.key}>
              {groupIndex > 0 && (
                <div className="flex items-center px-1" style={{ height: GROUP_GAP }} aria-hidden="true">
                  <div className="w-full border-t border-cipher-border-subtle" />
                </div>
              )}
              {group.rows.map((row) => (
                <SourceButton
                  key={row.name}
                  row={row}
                  rowH={layout.rowH}
                  active={activeName == null || activeName === row.name}
                  formatValue={formatValue}
                  onHover={onHover}
                  onSelect={onSelect}
                />
              ))}
            </div>
          ))}
        </div>

        <div className="relative min-w-0 flex-1 px-1">
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            aria-hidden="true"
          >
            <span className="-rotate-12 select-none text-4xl font-bold font-mono tracking-[0.18em] text-black/[0.04] dark:text-white/[0.045] sm:text-5xl">
              CIPHERSCAN
            </span>
          </div>

          <svg
            viewBox={`0 0 ${vbW} ${vbH}`}
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            <defs>
              <clipPath id={clipId}>
                <rect x={0} y={0} width={layout.gateX} height={vbH} />
              </clipPath>
            </defs>

            {layout.dividerYs.map((dy) => (
              <line
                key={dy}
                x1={0}
                y1={dy}
                x2={layout.gateX}
                y2={dy}
                stroke="var(--color-border-subtle)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}

            <line
              x1={layout.gateX}
              y1={layout.pad}
              x2={layout.gateX}
              y2={vbH - layout.pad}
              stroke={ironwoodColor}
              strokeWidth={1}
              strokeOpacity={0.45}
            />

            <line
              x1={layout.gateX}
              y1={layout.hubY}
              x2={layout.hubX}
              y2={layout.hubY}
              stroke={ironwoodColor}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeOpacity={0.9}
            />

            {layout.positioned.map((row) => {
              const active = activeName == null || activeName === row.name;
              return (
                <g key={row.name}>
                  <path
                    d={row.d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={12}
                    strokeLinecap="round"
                    clipPath={`url(#${clipId})`}
                    className="cursor-pointer"
                    onMouseEnter={() => onHover(row.name)}
                    onMouseLeave={() => onHover(null)}
                    onClick={() => onSelect(row.name)}
                  />
                  <path
                    d={row.d}
                    fill="none"
                    stroke={row.color}
                    strokeWidth={STROKE}
                    strokeLinecap="round"
                    strokeOpacity={active ? 0.8 : 0.15}
                    clipPath={`url(#${clipId})`}
                    style={{ transition: 'stroke-opacity 0.2s ease' }}
                  />
                </g>
              );
            })}

          </svg>

          <span
            className="pointer-events-none absolute text-[8px] font-mono leading-none text-muted/55"
            style={{
              left: `${(layout.gateX / vbW) * 100}%`,
              top: 6,
              transform: 'translate(-50%, -100%)',
              paddingBottom: 8,
            }}
          >
            Turnstile
          </span>
        </div>

        <div className="relative w-[5rem] shrink-0 border-l border-cipher-border/20 pr-4 sm:w-28">
          <div
            className="absolute left-3 sm:left-4"
            style={{ top: `${(layout.hubY / vbH) * 100}%` }}
          >
            <span
              className="block h-3 w-3 -translate-y-1/2 rounded-full"
              style={{
                backgroundColor: ironwoodColor,
                boxShadow: `0 0 14px ${ironwoodColor}66`,
              }}
            />
            <span
              className="mt-2 block text-xs font-mono font-semibold leading-none"
              style={{ color: ironwoodColor }}
            >
              Ironwood
            </span>
            <span className="mt-0.5 block text-[10px] font-mono font-medium tabular-nums text-primary/90">
              {formatValue(ironwoodZat)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function inflowPathDescription(name: string): string {
  const kind = pathKind(name);
  if (kind === 'orchard') return 'ZIP-318 Orchard turnstile migration → Ironwood';
  return `${pathNote(kind)} → Ironwood (pool supply accounted)`;
}
