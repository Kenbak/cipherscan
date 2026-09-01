'use client';

import { useEffect, useMemo, useState } from 'react';
import { getApiUrl } from '@/lib/api-config';
import {
  MAP_WIDTH,
  MAP_HEIGHT,
  DOT_RADIUS,
  project,
  useWorldLandDots,
} from '@/lib/world-dot-map';
import { clientColor, clientLabel, buildIspColorMap, ISP_UNRESOLVED_COLOR, ISP_OTHER_COLOR, CLIENT_COLORS } from '@/lib/network-colors';

interface RawLocation {
  country: string;
  countryCode: string;
  lat: number;
  lon: number;
  nodeCount: number;
  avgPingMs: number | null;
  topClient: string | null;
  topIsp: string | null;
}

interface CellPoint extends RawLocation {
  x: number;
  y: number;
  radius: number;
  color: string;
  /** Unknown/unresolved/catch-all "Other" cell — carries no real signal, so
   * it should always render behind identified cells, never obscure them. */
  muted: boolean;
}

const MUTED_COLORS = new Set<string>([
  CLIENT_COLORS.Unknown,
  CLIENT_COLORS.Other,
  ISP_UNRESOLVED_COLOR,
  ISP_OTHER_COLOR,
]);

function getFlagEmoji(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return '';
  return String.fromCodePoint(
    ...countryCode.toUpperCase().split('').map((char) => 127397 + char.charCodeAt(0))
  );
}

export type GeoLayerMode = 'client' | 'infra';

export function NodeGeoLayerMap({ mode }: { mode: GeoLayerMode }) {
  const [locations, setLocations] = useState<RawLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<CellPoint | null>(null);

  const worldDots = useWorldLandDots();

  useEffect(() => {
    const apiUrl = getApiUrl();
    fetch(`${apiUrl}/api/network/nodes`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch node locations');
        return res.json();
      })
      .then((data) => {
        setLocations(data.locations || []);
        setError(null);
      })
      .catch((err) => setError(err.message || 'Failed to load node map'))
      .finally(() => setLoading(false));
  }, []);

  // ISPs ranked by how many active cells they dominate, for a stable-ish legend.
  const ispColorMap = useMemo(() => {
    const counts = new Map<string, number>();
    locations.forEach((loc) => {
      const isp = loc.topIsp || 'Unresolved';
      counts.set(isp, (counts.get(isp) || 0) + loc.nodeCount);
    });
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([isp]) => isp);
    return buildIspColorMap(ranked);
  }, [locations]);

  const points: CellPoint[] = useMemo(() => {
    return locations.map((loc) => {
      const pos = project(loc.lat, loc.lon);
      const radius = Math.max(9, Math.min(20, 7 + Math.sqrt(loc.nodeCount) * 3));
      const color = mode === 'client'
        ? clientColor(loc.topClient)
        : (ispColorMap[loc.topIsp || 'Unresolved'] || ISP_UNRESOLVED_COLOR);
      return { ...loc, x: pos.x, y: pos.y, radius, color, muted: MUTED_COLORS.has(color) };
    });
  }, [locations, mode, ispColorMap]);

  const legendEntries = useMemo(() => {
    if (mode === 'client') {
      const clients = new Set(locations.map((l) => l.topClient || 'Unknown'));
      return [...clients].map((c) => ({ label: clientLabel(c), color: clientColor(c) }));
    }
    const topIsps = [...new Set(locations.map((l) => l.topIsp || 'Unresolved'))]
      .sort((a, b) => (ispColorMap[a] === ISP_UNRESOLVED_COLOR ? 1 : 0) - (ispColorMap[b] === ISP_UNRESOLVED_COLOR ? 1 : 0))
      .slice(0, 8);
    return topIsps.map((isp) => ({ label: isp, color: ispColorMap[isp] || ISP_UNRESOLVED_COLOR }));
  }, [locations, mode, ispColorMap]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-cipher-cyan border-t-transparent" />
      </div>
    );
  }

  if (error || locations.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-secondary text-sm">{error || 'No node location data available'}</p>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden bg-cipher-bg rounded-lg">
      <svg
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        className="relative z-[1] w-full h-auto"
        style={{ maxHeight: '460px' }}
        onMouseLeave={() => setHovered(null)}
      >
        {worldDots.map((dot, i) => (
          <circle key={`wd-${i}`} cx={dot.x} cy={dot.y} r={DOT_RADIUS} fill="var(--color-map-dot)" />
        ))}

        {/* Paint order: muted (unknown/other) cells always go in the back, then
            identified cells layered by size — so overlapping identified data
            never gets hidden under a same-size-or-larger "Unresolved" blob. */}
        {[...points]
          .sort((a, b) => {
            if (a.muted !== b.muted) return a.muted ? -1 : 1;
            return b.nodeCount - a.nodeCount;
          })
          .map((p, i) => {
          const isHovered = hovered === p;
          return (
            <g
              key={`gl-${i}`}
              className="cursor-pointer"
              onMouseEnter={() => setHovered(p)}
              onMouseLeave={() => setHovered(null)}
            >
              <circle
                cx={p.x}
                cy={p.y}
                r={isHovered ? p.radius + 2 : p.radius}
                fill={p.color}
                opacity={isHovered ? 1 : (p.muted ? 0.55 : 0.9)}
                stroke={isHovered ? '#ffffff' : 'rgba(255,255,255,0.15)'}
                strokeWidth={isHovered ? 2 : 0.5}
                style={{ transition: 'all 150ms cubic-bezier(0.16, 1, 0.3, 1)' }}
              />
              <text
                x={p.x}
                y={p.y + 0.5}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#08090F"
                fontSize={p.radius > 16 ? 11 : 9}
                fontWeight="700"
                fontFamily="ui-monospace, 'JetBrains Mono', monospace"
                className="pointer-events-none select-none"
              >
                {p.nodeCount}
              </text>
            </g>
          );
        })}
      </svg>

      {hovered && (
        <div className="absolute top-3 left-3 backdrop-blur-sm border border-cipher-cyan/20 rounded-lg px-4 py-3 shadow-2xl z-10 pointer-events-none bg-cipher-surface-solid">
          <div className="flex items-center gap-2">
            <span className="text-lg">{getFlagEmoji(hovered.countryCode)}</span>
            <span className="font-semibold text-primary text-sm">{hovered.country}</span>
          </div>
          <div className="flex items-center gap-3 text-xs mt-1.5">
            <span className="font-mono font-bold" style={{ color: hovered.color }}>
              {hovered.nodeCount} node{hovered.nodeCount > 1 ? 's' : ''}
            </span>
          </div>
          <div className="text-[11px] font-mono text-muted mt-1">
            {mode === 'client' ? clientLabel(hovered.topClient) : (hovered.topIsp || 'Unresolved')}
          </div>
        </div>
      )}

      <div className="absolute bottom-3 left-3 flex flex-wrap gap-2 max-w-[calc(100%-24px)] backdrop-blur-sm border border-cipher-border rounded-lg px-3 py-2 text-[10px] pointer-events-none bg-cipher-surface-solid">
        {legendEntries.map((entry) => (
          <span key={entry.label} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: entry.color }} />
            <span className="text-muted truncate max-w-[110px]">{entry.label}</span>
          </span>
        ))}
      </div>

      <p className="absolute top-3 right-3 text-[10px] font-mono text-muted/70 bg-cipher-surface-solid/80 backdrop-blur-sm px-2 py-1 rounded">
        Dominant {mode === 'client' ? 'client' : 'host'} per ~110km cell
      </p>
    </div>
  );
}
