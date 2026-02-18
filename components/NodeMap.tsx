'use client';

import { useEffect, useState, useMemo } from 'react';
import { getApiUrl } from '@/lib/api-config';
import { feature } from 'topojson-client';

// ==========================================================================
// TYPES
// ==========================================================================

interface NodeLocation {
  country: string;
  countryCode: string;
  city: string;
  lat: number;
  lon: number;
  nodeCount: number;
  avgPingMs: number | null;
}

interface NodeStats {
  activeNodes: number;
  totalNodes: number;
  countries: number;
  cities: number;
  avgPingMs: number | null;
  lastUpdated: string;
}

interface TopCountry {
  country: string;
  countryCode: string;
  nodeCount: number;
}

interface DotPosition {
  x: number;
  y: number;
}

// ==========================================================================
// CONSTANTS
// ==========================================================================

const WORLD_TOPO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json';
const DOT_SPACING = 2.5;
const MAP_WIDTH = 960;
const MAP_HEIGHT = 500;
const DOT_RADIUS = 2.4;

// Color tiers based on node count
const NODE_TIERS = {
  high: { fill: '#3ff4c6', glow: '#3ff4c6', label: '10+' },     // cipher-cyan
  medium: { fill: '#22d3ee', glow: '#22d3ee', label: '5-9' },    // cyan-400
  low: { fill: '#0891b2', glow: '#0891b2', label: '2-4' },       // cyan-700
  single: { fill: '#a855f7', glow: '#a855f7', label: '1' },      // purple
};

function getNodeTier(count: number) {
  if (count >= 10) return NODE_TIERS.high;
  if (count >= 5) return NODE_TIERS.medium;
  if (count >= 2) return NODE_TIERS.low;
  return NODE_TIERS.single;
}

// ==========================================================================
// GEOMETRY HELPERS
// ==========================================================================

function project(lat: number, lon: number): { x: number; y: number } {
  const x = ((lon + 180) / 360) * MAP_WIDTH;
  const y = ((90 - lat) / 180) * MAP_HEIGHT;
  return { x, y };
}

function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if (
      (yi > lat) !== (yj > lat) &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function isPointOnLand(lat: number, lon: number, features: any[]): boolean {
  for (const feat of features) {
    const geom = feat.geometry || feat;
    if (geom.type === 'Polygon') {
      if (pointInRing(lon, lat, geom.coordinates[0])) return true;
    } else if (geom.type === 'MultiPolygon') {
      for (const polygon of geom.coordinates) {
        if (pointInRing(lon, lat, polygon[0])) return true;
      }
    }
  }
  return false;
}

function generateWorldDots(landFeatures: any[]): DotPosition[] {
  const dots: DotPosition[] = [];
  for (let lat = 84; lat >= -60; lat -= DOT_SPACING) {
    for (let lon = -180; lon < 180; lon += DOT_SPACING) {
      if (isPointOnLand(lat, lon, landFeatures)) {
        dots.push(project(lat, lon));
      }
    }
  }
  return dots;
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

export function NodeMap() {
  const [worldDots, setWorldDots] = useState<DotPosition[]>([]);
  const [locations, setLocations] = useState<NodeLocation[]>([]);
  const [stats, setStats] = useState<NodeStats | null>(null);
  const [topCountries, setTopCountries] = useState<TopCountry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<NodeLocation | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);

  // Fetch world topology for dot matrix background
  useEffect(() => {
    fetch(WORLD_TOPO_URL)
      .then((res) => res.json())
      .then((topology: any) => {
        const land = feature(topology, topology.objects.land) as any;
        const features = land.features ? land.features : [land];
        const dots = generateWorldDots(features);
        setWorldDots(dots);
      })
      .catch((err) => {
        console.error('Failed to load world topology:', err);
      });
  }, []);

  // Fetch node data from API
  useEffect(() => {
    const fetchNodes = async () => {
      try {
        const apiUrl = getApiUrl();
        const [nodesRes, statsRes] = await Promise.all([
          fetch(`${apiUrl}/api/network/nodes`),
          fetch(`${apiUrl}/api/network/nodes/stats`),
        ]);

        if (!nodesRes.ok || !statsRes.ok) throw new Error('Failed to fetch node data');

        const nodesData = await nodesRes.json();
        const statsData = await statsRes.json();

        setLocations(nodesData.locations || []);
        setStats(statsData.stats);
        setTopCountries(statsData.topCountries || []);
        setError(null);
      } catch (err: any) {
        console.error('Error fetching nodes:', err);
        setError(err.message || 'Failed to load node map');
      } finally {
        setLoading(false);
      }
    };

    fetchNodes();
    const interval = setInterval(fetchNodes, 300000);
    return () => clearInterval(interval);
  }, []);

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
        clusters.set(key, {
          lat: (existing.lat * existing.nodeCount + loc.lat * loc.nodeCount) / total,
          lon: (existing.lon * existing.nodeCount + loc.lon * loc.nodeCount) / total,
          nodeCount: total,
          country: existing.nodeCount >= loc.nodeCount ? existing.country : loc.country,
          countryCode: existing.nodeCount >= loc.nodeCount ? existing.countryCode : loc.countryCode,
          city: existing.nodeCount >= loc.nodeCount ? existing.city : loc.city,
          avgPingMs: loc.avgPingMs,
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
      <div className="bg-cipher-card border border-cipher-border rounded-xl p-6">
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-cipher-cyan border-t-transparent" />
          <span className="ml-3 text-secondary font-mono">Loading node map...</span>
        </div>
      </div>
    );
  }

  if (error && locations.length === 0) {
    return (
      <div className="bg-cipher-card border border-cipher-border rounded-xl p-6">
        <div className="text-center py-12">
          <p className="text-secondary mb-2">Node map unavailable</p>
          <p className="text-xs text-muted font-mono">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-cipher-card border border-cipher-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-cipher-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cipher-cyan/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-cipher-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-primary">Network Node Map</h2>
              <p className="text-xs text-muted">Global distribution of Zcash full nodes</p>
            </div>
          </div>

          {stats && (
            <div className="flex items-center gap-6">
              <div className="text-center">
                <div className="font-bold text-cipher-cyan font-mono text-xl">{stats.activeNodes}</div>
                <div className="text-[10px] text-muted uppercase tracking-wider">Nodes</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-cipher-green font-mono text-xl">{stats.countries}</div>
                <div className="text-[10px] text-muted uppercase tracking-wider">Countries</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dot Matrix Map */}
      <div className="relative" style={{ backgroundColor: 'var(--color-bg)' }}>
        {/* Active filter indicator */}
        {selectedCountryData && (
          <button
            onClick={() => setSelectedCountry(null)}
            className="absolute top-3 right-3 z-10 flex items-center gap-2 backdrop-blur-sm border border-cipher-cyan/30 rounded-lg px-3 py-1.5 text-xs font-mono transition-all hover:border-cipher-cyan/60"
            style={{ backgroundColor: 'var(--color-surface-solid)' }}
          >
            <span>{getFlagEmoji(selectedCountryData.countryCode)}</span>
            <span className="text-cipher-cyan font-semibold">{selectedCountryData.country}</span>
            <span className="text-muted">({selectedCountryData.nodeCount})</span>
            <span className="text-muted hover:text-primary ml-1">✕</span>
          </button>
        )}

        <svg
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          className="w-full h-auto"
          style={{ maxHeight: '520px' }}
          onMouseLeave={() => setHoveredNode(null)}
        >
          <defs>
            {/* Glow filters for each tier */}
            <filter id="glow-high" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
              <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0.247  0 0 0 0 0.957  0 0 0 0 0.776  0 0 0 0.6 0" />
              <feMerge>
                <feMergeNode />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="glow-medium" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
              <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0.133  0 0 0 0 0.827  0 0 0 0 0.933  0 0 0 0.5 0" />
              <feMerge>
                <feMergeNode />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="glow-low" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
              <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0.031  0 0 0 0 0.569  0 0 0 0 0.698  0 0 0 0.4 0" />
              <feMerge>
                <feMergeNode />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="glow-single" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
              <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0.659  0 0 0 0 0.333  0 0 0 0 0.969  0 0 0 0.4 0" />
              <feMerge>
                <feMergeNode />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {/* Scan line animation */}
            <linearGradient id="scanGradient" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="transparent" />
              <stop offset="50%" stopColor="#3ff4c6" stopOpacity="0.08" />
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
            <div className="absolute top-3 left-3 backdrop-blur-sm border border-cipher-cyan/20 rounded-lg px-4 py-3 shadow-2xl z-10 pointer-events-none" style={{ backgroundColor: 'var(--color-surface-solid)' }}>
            <div className="flex items-center gap-2">
              <span className="text-lg">{getFlagEmoji(hoveredNode.countryCode)}</span>
              <span className="font-semibold text-primary text-sm">{hoveredNode.country}</span>
            </div>
            <div className="flex items-center gap-3 text-xs mt-1.5">
              <span className="font-mono font-bold" style={{ color: getNodeTier(hoveredNode.nodeCount).fill }}>
                {hoveredNode.nodeCount} node{hoveredNode.nodeCount > 1 ? 's' : ''}
              </span>
              {hoveredNode.avgPingMs && (
                <span className="text-muted font-mono">{hoveredNode.avgPingMs.toFixed(0)}ms</span>
              )}
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="absolute bottom-3 left-3 backdrop-blur-sm border border-cipher-border rounded-lg px-3 py-2 text-[10px] pointer-events-none" style={{ backgroundColor: 'var(--color-surface-solid)' }}>
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

      {/* Top Countries */}
      {topCountries.length > 0 && (
        <div className="px-6 py-4 border-t border-cipher-border">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-secondary">Top Countries</h3>
            {stats?.lastUpdated && (
              <span className="text-[10px] text-muted font-mono">
                Last sync: {new Date(stats.lastUpdated).toLocaleString()}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {topCountries.slice(0, 10).map((country) => {
              const isActive = selectedCountry === country.countryCode;
              return (
                <button
                  key={country.countryCode}
                  onClick={() => setSelectedCountry(isActive ? null : country.countryCode)}
                  className={`flex items-center gap-2 rounded-lg px-3 py-1.5 transition-all ${
                    isActive
                      ? 'bg-cipher-cyan/10 border border-cipher-cyan/30 ring-1 ring-cipher-cyan/20'
                      : 'bg-cipher-bg/50 border border-transparent hover:bg-cipher-bg hover:border-cipher-border'
                  }`}
                >
                  <span className="text-base">{getFlagEmoji(country.countryCode)}</span>
                  <span className={`text-xs ${isActive ? 'text-primary font-semibold' : 'text-secondary'}`}>{country.country}</span>
                  <span className="text-xs font-mono font-bold" style={{ color: getNodeTier(country.nodeCount).fill }}>
                    {country.nodeCount}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default NodeMap;
