'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
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
const DOT_SPACING = 3; // degrees between dots
const MAP_WIDTH = 960;
const MAP_HEIGHT = 500;
const DOT_RADIUS = 1.8;

// ==========================================================================
// GEOMETRY HELPERS
// ==========================================================================

/**
 * Equirectangular projection (clean flat map, like Solana Beach)
 */
function project(lat: number, lon: number): { x: number; y: number } {
  const x = ((lon + 180) / 360) * MAP_WIDTH;
  const y = ((90 - lat) / 180) * MAP_HEIGHT;
  return { x, y };
}

/**
 * Ray-casting point-in-polygon
 * GeoJSON rings are [lon, lat] pairs
 */
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

/**
 * Check if a point is on land given GeoJSON features
 */
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

/**
 * Generate world dot positions from GeoJSON land data
 */
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

  // Cluster nearby nodes by rounding to nearest grid
  const clusteredNodes = useMemo(() => {
    const clusters: Map<string, { lat: number; lon: number; nodeCount: number; country: string; countryCode: string; city: string; avgPingMs: number | null }> = new Map();

    locations.forEach((loc) => {
      // Round to 8° grid to cluster nearby cities
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
      <div className="relative bg-[#0b0b12]">
        <svg
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          className="w-full h-auto"
          style={{ maxHeight: '520px' }}
          onMouseLeave={() => setHoveredNode(null)}
        >
          {/* Land dots (gray dot matrix) */}
          {worldDots.map((dot, i) => (
            <circle
              key={`wd-${i}`}
              cx={dot.x}
              cy={dot.y}
              r={DOT_RADIUS}
              fill="#4b5563"
              opacity={0.5}
            />
          ))}

          {/* Node clusters */}
          {clusteredNodes.map((node, i) => {
            const pos = project(node.lat, node.lon);
            const isHovered = hoveredNode === node;
            const count = node.nodeCount;
            const radius = Math.max(14, Math.min(28, 10 + Math.sqrt(count) * 5));

            return (
              <g
                key={`nc-${i}`}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredNode(node as any)}
                onMouseLeave={() => setHoveredNode(null)}
              >
                {/* Outer glow */}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={radius + 6}
                  fill="#22d3ee"
                  opacity={isHovered ? 0.35 : 0.18}
                  className="transition-opacity duration-200"
                />

                {/* Main circle */}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={radius}
                  fill={isHovered ? '#3ff4c6' : '#22d3ee'}
                  opacity={isHovered ? 1 : 0.9}
                  stroke={isHovered ? '#fff' : 'none'}
                  strokeWidth={1.5}
                  className="transition-all duration-200"
                />

                {/* Count number */}
                <text
                  x={pos.x}
                  y={pos.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="#0b0b12"
                  fontSize={radius > 18 ? 12 : 10}
                  fontWeight="bold"
                  fontFamily="ui-monospace, monospace"
                  className="pointer-events-none select-none"
                >
                  {count}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Hover tooltip (fixed top-left) */}
        {hoveredNode && (
          <div className="absolute top-3 left-3 bg-cipher-card/95 backdrop-blur border border-cipher-cyan/30 rounded-lg px-4 py-3 shadow-2xl z-10 pointer-events-none">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{getFlagEmoji(hoveredNode.countryCode)}</span>
              <span className="font-semibold text-primary text-sm">{hoveredNode.country}</span>
            </div>
            <div className="flex items-center gap-3 text-xs mt-1">
              <span className="text-cipher-cyan font-mono font-bold">
                {hoveredNode.nodeCount} node{hoveredNode.nodeCount > 1 ? 's' : ''}
              </span>
              {hoveredNode.avgPingMs && (
                <span className="text-muted font-mono">{hoveredNode.avgPingMs.toFixed(0)}ms</span>
              )}
            </div>
          </div>
        )}
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
            {topCountries.slice(0, 10).map((country) => (
              <div
                key={country.countryCode}
                className="flex items-center gap-2 bg-cipher-bg/50 rounded-lg px-3 py-1.5"
              >
                <span className="text-base">{getFlagEmoji(country.countryCode)}</span>
                <span className="text-xs text-secondary">{country.country}</span>
                <span className="text-xs font-mono font-bold text-cipher-cyan">{country.nodeCount}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default NodeMap;
