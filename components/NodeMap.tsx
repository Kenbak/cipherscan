'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ChartWatermark } from '@/components/ChartWatermark';
import { clientLabel } from '@/lib/network-colors';
import { useApiQuery } from '@/hooks/useApiQuery';
import {
  MAP_WIDTH,
  MAP_HEIGHT,
  DOT_RADIUS,
  project,
  useWorldLandDots,
} from '@/lib/world-dot-map';

// ==========================================================================
// TYPES
// ==========================================================================

export interface NodeLocation {
  country: string;
  countryCode: string;
  city?: string | null;
  lat: number;
  lon: number;
  nodeCount: number;
  avgPingMs: number | null;
  topClient?: string | null;
  topIsp?: string | null;
}

export interface NodeStats {
  activeNodes: number;
  totalNodes: number;
  countries: number;
  cities: number;
  avgPingMs: number | null;
  torNodes: number;
  lastUpdated: string;
}

interface NodeTrends {
  change24h: number | null;
  change7d: number | null;
  change30d: number | null;
}

interface TopCountry {
  country: string;
  countryCode: string;
  nodeCount: number;
}

export interface NodeLocationsResponse {
  success: boolean;
  locations: NodeLocation[];
  timestamp: number;
}

export interface NodeStatsResponse {
  success: boolean;
  stats: NodeStats;
  trends?: NodeTrends;
  topCountries?: TopCountry[];
  timestamp: number;
}

interface NodeMapProps {
  initialLocations?: NodeLocationsResponse | null;
  initialStats?: NodeStatsResponse | null;
}

// ==========================================================================
// CONSTANTS
// ==========================================================================

// Color tiers based on node count (cipher-yellow intensity scale)
const NODE_TIERS = {
  high: { fill: '#F4B728', glow: '#F4B728', label: '10+' },      // cipher-yellow (full)
  medium: { fill: '#D49A20', glow: '#D49A20', label: '5-9' },    // mid yellow
  low: { fill: '#A07818', glow: '#A07818', label: '2-4' },       // deep yellow
  single: { fill: '#7A6030', glow: '#7A6030', label: '1' },      // muted yellow
};

function getNodeTier(count: number) {
  if (count >= 10) return NODE_TIERS.high;
  if (count >= 5) return NODE_TIERS.medium;
  if (count >= 2) return NODE_TIERS.low;
  return NODE_TIERS.single;
}

// ==========================================================================
// HELPERS
// ==========================================================================

function getFlagEmoji(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return '';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

// ==========================================================================
// COMPONENT
// ==========================================================================

export function NodeMap({ initialLocations, initialStats }: NodeMapProps) {
  const locationsQuery = useApiQuery<NodeLocationsResponse>(
    '/api/network/nodes',
    undefined,
    { refreshInterval: 300_000, initialData: initialLocations ?? undefined },
  );
  const statsQuery = useApiQuery<NodeStatsResponse>(
    '/api/network/nodes/stats',
    undefined,
    { refreshInterval: 300_000, initialData: initialStats ?? undefined },
  );
  const locations = locationsQuery.data?.locations ?? [];
  const stats = statsQuery.data?.stats ?? null;
  const trends = statsQuery.data?.trends ?? null;
  const topCountries = statsQuery.data?.topCountries ?? [];
  const loading = locationsQuery.loading || statsQuery.loading;
  const error = locationsQuery.error || statsQuery.error;
  const [hoveredNode, setHoveredNode] = useState<NodeLocation | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);

  const worldDots = useWorldLandDots();

  // Cluster nearby nodes
  const clusteredNodes = useMemo(() => {
    const clusters: Map<string, NodeLocation> = new Map();

    locations.forEach((loc) => {
      const keyLat = Math.round(loc.lat / 8) * 8;
      const keyLon = Math.round(loc.lon / 8) * 8;
      const key = `${keyLat},${keyLon}`;

      const existing = clusters.get(key);
      if (existing) {
        const total = existing.nodeCount + loc.nodeCount;
        const existingWins = existing.nodeCount >= loc.nodeCount;
        clusters.set(key, {
          lat: (existing.lat * existing.nodeCount + loc.lat * loc.nodeCount) / total,
          lon: (existing.lon * existing.nodeCount + loc.lon * loc.nodeCount) / total,
          nodeCount: total,
          country: existingWins ? existing.country : loc.country,
          countryCode: existingWins ? existing.countryCode : loc.countryCode,
          city: existingWins ? existing.city : loc.city,
          avgPingMs: loc.avgPingMs,
          topClient: existingWins ? existing.topClient : loc.topClient,
          topIsp: existingWins ? existing.topIsp : loc.topIsp,
        });
      } else {
        clusters.set(key, { ...loc });
      }
    });

    return Array.from(clusters.values());
  }, [locations]);

  // Count nodes for selected country (for the header display)
  const selectedCountryData = useMemo(() => {
    if (!selectedCountry) return null;
    const country = topCountries.find(c => c.countryCode === selectedCountry);
    return country || null;
  }, [selectedCountry, topCountries]);

  // ==========================================================================
  // RENDER
  // ==========================================================================

  if (loading && worldDots.length === 0) {
    return (
      <div className="bg-cipher-surface border border-cipher-border rounded-xl p-6">
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-cipher-cyan border-t-transparent" />
          <span className="ml-3 text-secondary font-mono">Loading node map...</span>
        </div>
      </div>
    );
  }

  if (error && locations.length === 0) {
    return (
      <div className="bg-cipher-surface border border-cipher-border rounded-xl p-6">
        <div className="text-center py-12">
          <p className="text-secondary mb-2">Node map unavailable</p>
          <p className="text-xs text-muted font-mono">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="bg-cipher-surface border border-cipher-border rounded-xl overflow-hidden"
      data-node-map-ready={locations.length > 0 ? 'true' : 'false'}
    >
      {/* Header */}
      <div className="px-4 sm:px-6 py-4 border-b border-cipher-border">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-cipher-cyan/10 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 sm:w-5 sm:h-5 text-cipher-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-primary">Network Node Map</h2>
              <p className="text-[10px] sm:text-xs text-muted">Global distribution of Zcash network nodes</p>
            </div>
          </div>

          {stats && (
            <div className="flex items-center gap-5 sm:gap-6">
              <div className="text-center">
                <div className="flex items-baseline justify-center gap-1">
                  <span className="font-bold text-primary font-mono text-lg sm:text-xl">{stats.activeNodes}</span>
                  {trends?.change24h !== null && trends?.change24h !== undefined && (
                    <span className={`text-[10px] font-mono font-semibold ${
                      trends.change24h > 0 ? 'text-cipher-green' : trends.change24h < 0 ? 'text-danger' : 'text-muted'
                    }`}>
                      {trends.change24h > 0 ? '+' : ''}{trends.change24h}%
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-muted uppercase tracking-wider">Nodes</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-primary font-mono text-lg sm:text-xl">{stats.countries}</div>
                <div className="text-[10px] text-muted uppercase tracking-wider">Countries</div>
              </div>
              {stats.torNodes > 0 && (
                <div className="text-center">
                  <div className="font-bold text-cipher-purple font-mono text-lg sm:text-xl">{stats.torNodes}</div>
                  <div className="text-[10px] text-muted uppercase tracking-wider">Tor</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Dot Matrix Map */}
      <div className="relative overflow-hidden bg-cipher-bg">
        <ChartWatermark size="map" />
        {/* Active filter indicator */}
        {selectedCountryData && (
          <button
            onClick={() => setSelectedCountry(null)}
            className="absolute top-3 right-3 z-10 flex items-center gap-2 backdrop-blur-sm border border-cipher-cyan/30 rounded-lg px-3 py-1.5 text-xs font-mono transition-all hover:border-cipher-cyan/60 bg-cipher-surface-solid"
          >
            <span>{getFlagEmoji(selectedCountryData.countryCode)}</span>
            <span className="text-cipher-cyan font-semibold">{selectedCountryData.country}</span>
            <span className="text-muted">({selectedCountryData.nodeCount})</span>
            <span className="text-muted hover:text-primary ml-1">✕</span>
          </button>
        )}

        <svg
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          className="relative z-[1] w-full h-auto"
          style={{ maxHeight: '520px' }}
          onMouseLeave={() => setHoveredNode(null)}
        >
          <defs>
            {/* Glow filters for each tier */}
            <filter id="glow-high" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
              <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0.957  0 0 0 0 0.718  0 0 0 0 0.157  0 0 0 0.6 0" />
              <feMerge>
                <feMergeNode />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="glow-medium" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
              <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0.831  0 0 0 0 0.604  0 0 0 0 0.125  0 0 0 0.5 0" />
              <feMerge>
                <feMergeNode />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="glow-low" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
              <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0.627  0 0 0 0 0.471  0 0 0 0 0.094  0 0 0 0.4 0" />
              <feMerge>
                <feMergeNode />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="glow-single" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
              <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0.478  0 0 0 0 0.376  0 0 0 0 0.188  0 0 0 0.3 0" />
              <feMerge>
                <feMergeNode />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {/* Scan line animation */}
            <linearGradient id="scanGradient" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="transparent" />
              <stop offset="50%" stopColor="#F4B728" stopOpacity="0.08" />
              <stop offset="100%" stopColor="transparent" />
            </linearGradient>
          </defs>

          {/* Land dots (gray dot matrix) */}
          {worldDots.map((dot, i) => (
            <circle
              key={`wd-${i}`}
              cx={dot.x}
              cy={dot.y}
              r={DOT_RADIUS}
              fill="var(--color-map-dot)"
            />
          ))}

          {/* Scan line effect */}
          <rect
            x="0"
            width={MAP_WIDTH}
            height="3"
            fill="url(#scanGradient)"
            opacity="0.6"
          >
            <animate
              attributeName="y"
              from="-3"
              to={MAP_HEIGHT}
              dur="6s"
              repeatCount="indefinite"
            />
          </rect>

          {/* Node clusters - sorted so smaller ones render on top */}
          {[...clusteredNodes]
            .sort((a, b) => b.nodeCount - a.nodeCount)
            .map((node, i) => {
              const pos = project(node.lat, node.lon);
              const isHovered = hoveredNode === node;
              const count = node.nodeCount;
              const tier = getNodeTier(count);

              // Country filter: is this node in the selected country?
              const isFiltered = selectedCountry !== null;
              const isSelected = selectedCountry === node.countryCode;
              const isDimmed = isFiltered && !isSelected;

              const radius = Math.max(10, Math.min(22, 8 + Math.sqrt(count) * 3.5));

              // Pick glow filter
              const filterId = isDimmed ? undefined
                : count >= 10 ? 'glow-high'
                : count >= 5 ? 'glow-medium'
                : count >= 2 ? 'glow-low'
                : 'glow-single';

              return (
                <g
                  key={`nc-${i}`}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredNode(node)}
                  onMouseLeave={() => setHoveredNode(null)}
                  filter={filterId ? `url(#${filterId})` : undefined}
                  style={{
                    transition: 'opacity 300ms ease',
                    opacity: isDimmed ? 0.15 : 1,
                  }}
                >
                  {/* Main circle */}
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={isHovered ? radius + 2 : radius}
                    fill={tier.fill}
                    opacity={isHovered ? 1 : 0.85}
                    stroke={isHovered ? '#ffffff' : 'rgba(255,255,255,0.15)'}
                    strokeWidth={isHovered ? 2 : 0.5}
                    style={{
                      transition: 'all 150ms cubic-bezier(0.16, 1, 0.3, 1)',
                    }}
                  />

                  {/* Count number */}
                  <text
                    x={pos.x}
                    y={pos.y + 0.5}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="#08090F"
                    fontSize={radius > 16 ? 11 : 9}
                    fontWeight="700"
                    fontFamily="ui-monospace, 'JetBrains Mono', monospace"
                    className="pointer-events-none select-none"
                  >
                    {count}
                  </text>
                </g>
              );
            })}
        </svg>

        {/* Hover tooltip (country + count only, no city) */}
        {hoveredNode && (
            <div className="absolute top-3 left-3 backdrop-blur-sm border border-cipher-cyan/20 rounded-lg px-4 py-3 shadow-2xl z-10 pointer-events-none bg-cipher-surface-solid">
            <div className="flex items-center gap-2">
              <span className="text-lg">{getFlagEmoji(hoveredNode.countryCode)}</span>
              <span className="font-semibold text-primary text-sm">{hoveredNode.country}</span>
            </div>
            <div className="flex items-center gap-3 text-xs mt-1.5">
              <span className="font-mono font-bold" style={{ color: getNodeTier(hoveredNode.nodeCount).fill }}>
                {hoveredNode.nodeCount} node{hoveredNode.nodeCount > 1 ? 's' : ''}
              </span>
              {hoveredNode.avgPingMs != null && hoveredNode.avgPingMs > 0 && (
                <span className="text-muted font-mono">{hoveredNode.avgPingMs.toFixed(0)}ms</span>
              )}
            </div>
            {(hoveredNode.topClient || hoveredNode.topIsp) && (
              <div className="flex items-center gap-2 text-[11px] font-mono text-muted mt-1">
                {hoveredNode.topClient && (
                  <span>Mostly {clientLabel(hoveredNode.topClient)}</span>
                )}
                {hoveredNode.topClient && hoveredNode.topIsp && hoveredNode.topIsp !== 'Unresolved' && (
                  <span className="text-muted/40">&middot;</span>
                )}
                {hoveredNode.topIsp && hoveredNode.topIsp !== 'Unresolved' && (
                  <span className="truncate max-w-[160px]">{hoveredNode.topIsp}</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Legend */}
        <div className="absolute bottom-3 left-3 backdrop-blur-sm border border-cipher-border rounded-lg px-3 py-2 text-[10px] pointer-events-none bg-cipher-surface-solid">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: NODE_TIERS.high.fill, boxShadow: `0 0 6px ${NODE_TIERS.high.glow}` }}></span>
              <span className="text-muted">{NODE_TIERS.high.label}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: NODE_TIERS.medium.fill }}></span>
              <span className="text-muted">{NODE_TIERS.medium.label}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: NODE_TIERS.low.fill }}></span>
              <span className="text-muted">{NODE_TIERS.low.label}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: NODE_TIERS.single.fill }}></span>
              <span className="text-muted">{NODE_TIERS.single.label}</span>
            </div>
          </div>
        </div>
      </div>

      {/* CTA — full client breakdown, topology graph & health scoring live on /network/nodes.
          One muted sentence, one hover state — this card already has its own color
          language (tier dots, trend deltas); the link shouldn't add another. */}
      <Link
        href="/network/nodes"
        className="flex items-center justify-between gap-2 border-t border-cipher-border px-4 py-3 sm:px-6 text-xs font-mono text-muted hover:text-primary transition-colors group"
      >
        <span>Client breakdown, network topology &amp; health scoring</span>
        <svg
          className="w-3.5 h-3.5 flex-shrink-0 group-hover:translate-x-0.5 transition-transform"
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </Link>

      {/* Trends */}
      {trends && (
        <div className="px-4 sm:px-6 py-3 border-t border-cipher-border">
          <div className="flex items-center gap-4">
            <span className="text-[10px] text-muted uppercase tracking-wider font-mono">Trend</span>
            {[
              { label: '24h', value: trends.change24h },
              { label: '7d', value: trends.change7d },
              { label: '30d', value: trends.change30d },
            ].map(({ label, value }) => (
              value !== null && value !== undefined ? (
                <div key={label} className="flex items-center gap-1">
                  <span className="text-[10px] text-muted font-mono">{label}</span>
                  <span className={`text-xs font-mono font-semibold ${
                    value > 0 ? 'text-cipher-green' : value < 0 ? 'text-danger' : 'text-muted'
                  }`}>
                    {value > 0 ? '+' : ''}{value}%
                  </span>
                </div>
              ) : null
            ))}
          </div>
        </div>
      )}

      {/* Top Countries */}
      {topCountries.length > 0 && (
        <div className="px-4 sm:px-6 py-4 border-t border-cipher-border">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-secondary">Top Countries</h3>
            {stats?.lastUpdated && (
              <span className="text-[10px] text-muted font-mono hidden sm:inline">
                Last sync: {new Date(stats.lastUpdated).toLocaleString()}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {topCountries.slice(0, 10).map((country) => {
              const isActive = selectedCountry === country.countryCode;
              return (
                <button
                  key={country.countryCode}
                  onClick={() => setSelectedCountry(isActive ? null : country.countryCode)}
                  className={`flex items-center gap-1.5 sm:gap-2 rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 transition-all ${
                    isActive
                      ? 'bg-cipher-cyan/10 border border-cipher-cyan/30 ring-1 ring-cipher-cyan/20'
                      : 'bg-cipher-bg/50 border border-transparent hover:bg-cipher-bg hover:border-cipher-border'
                  }`}
                >
                  <span className="text-sm sm:text-base">{getFlagEmoji(country.countryCode)}</span>
                  <span className={`text-[10px] sm:text-xs ${isActive ? 'text-primary font-semibold' : 'text-secondary'}`}>{country.country}</span>
                  <span className="text-[10px] sm:text-xs font-mono font-bold" style={{ color: getNodeTier(country.nodeCount).fill }}>
                    {country.nodeCount}
                  </span>
                </button>
              );
            })}
            {(() => {
              const top10Sum = topCountries.slice(0, 10).reduce((s, c) => s + c.nodeCount, 0);
              const othersCount = (stats?.activeNodes || 0) - top10Sum;
              return othersCount > 0 ? (
                <span className="flex items-center gap-1.5 rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 bg-cipher-bg/50 border border-transparent">
                  <span className="text-[10px] sm:text-xs text-muted">Others</span>
                  <span className="text-[10px] sm:text-xs font-mono font-bold text-muted">{othersCount}</span>
                </span>
              ) : null;
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

export default NodeMap;
