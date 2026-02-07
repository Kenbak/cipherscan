'use client';

import { useEffect, useState, useMemo } from 'react';
import { getApiUrl } from '@/lib/api-config';

// Simplified world map dot coordinates (lat, lon) - major landmasses
const WORLD_DOTS = generateWorldDots();

function generateWorldDots(): { lat: number; lon: number }[] {
  const dots: { lat: number; lon: number }[] = [];
  
  // North America
  for (let lat = 25; lat <= 70; lat += 4) {
    for (let lon = -170; lon <= -50; lon += 4) {
      if (isLand(lat, lon, 'north_america')) {
        dots.push({ lat, lon });
      }
    }
  }
  
  // South America
  for (let lat = -55; lat <= 15; lat += 4) {
    for (let lon = -80; lon <= -35; lon += 4) {
      if (isLand(lat, lon, 'south_america')) {
        dots.push({ lat, lon });
      }
    }
  }
  
  // Europe
  for (let lat = 35; lat <= 72; lat += 4) {
    for (let lon = -10; lon <= 60; lon += 4) {
      if (isLand(lat, lon, 'europe')) {
        dots.push({ lat, lon });
      }
    }
  }
  
  // Africa
  for (let lat = -35; lat <= 38; lat += 4) {
    for (let lon = -18; lon <= 52; lon += 4) {
      if (isLand(lat, lon, 'africa')) {
        dots.push({ lat, lon });
      }
    }
  }
  
  // Asia
  for (let lat = 5; lat <= 75; lat += 4) {
    for (let lon = 60; lon <= 180; lon += 4) {
      if (isLand(lat, lon, 'asia')) {
        dots.push({ lat, lon });
      }
    }
  }
  
  // Australia
  for (let lat = -45; lat <= -10; lat += 4) {
    for (let lon = 110; lon <= 155; lon += 4) {
      if (isLand(lat, lon, 'australia')) {
        dots.push({ lat, lon });
      }
    }
  }
  
  return dots;
}

// Simplified land detection (rough approximation)
function isLand(lat: number, lon: number, region: string): boolean {
  switch (region) {
    case 'north_america':
      if (lon < -140 && lat < 55) return false; // Pacific
      if (lon > -55 && lat < 45) return false; // Atlantic
      if (lat > 50 && lon > -100 && lon < -60) return true; // Canada
      if (lat >= 25 && lat <= 50 && lon >= -130 && lon <= -65) return true; // USA
      if (lat >= 15 && lat <= 32 && lon >= -120 && lon <= -85) return true; // Mexico
      if (lat >= 55 && lon >= -170 && lon <= -135) return true; // Alaska
      return false;
      
    case 'south_america':
      if (lon < -80 || lon > -35) return false;
      if (lat > 12) return false;
      if (lat < -55) return false;
      if (lat < -45 && lon < -72) return false; // Chile tip
      return true;
      
    case 'europe':
      if (lat < 36 && lon > 25) return false; // Mediterranean
      if (lat < 43 && lon < -5) return false; // Atlantic
      if (lon > 55 && lat < 45) return false; // Caspian area
      return true;
      
    case 'africa':
      if (lat > 35 && lon > 30) return false; // Mediterranean
      if (lat < -30 && lon < 18) return false; // Atlantic
      if (lat < 5 && lon > 45) return false; // Indian Ocean
      return true;
      
    case 'asia':
      if (lat < 10 && lon > 100 && lon < 140) return Math.random() > 0.5; // SE Asia islands
      if (lat > 70) return lon > 100 && lon < 180; // Siberia
      if (lat < 25 && lon < 70) return false; // Indian Ocean
      if (lon > 170) return false; // Pacific
      return true;
      
    case 'australia':
      if (lat < -40) return false;
      if (lon < 115 || lon > 153) return false;
      if (lat > -12) return false;
      return true;
      
    default:
      return false;
  }
}

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

// Country flag emoji
function getFlagEmoji(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return '';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

// Convert lat/lon to x/y on map
function latLonToXY(lat: number, lon: number, width: number, height: number) {
  const x = ((lon + 180) / 360) * width;
  const latRad = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
  const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  const y = height / 2 - (mercN * height) / (2 * Math.PI) * 0.8;
  return { x, y };
}

export function NodeMap() {
  const [locations, setLocations] = useState<NodeLocation[]>([]);
  const [stats, setStats] = useState<NodeStats | null>(null);
  const [topCountries, setTopCountries] = useState<TopCountry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<NodeLocation | null>(null);

  const mapWidth = 900;
  const mapHeight = 450;

  // Fetch node data
  useEffect(() => {
    const fetchNodes = async () => {
      try {
        const apiUrl = getApiUrl();
        const [nodesRes, statsRes] = await Promise.all([
          fetch(`${apiUrl}/api/network/nodes`),
          fetch(`${apiUrl}/api/network/nodes/stats`),
        ]);

        if (!nodesRes.ok || !statsRes.ok) {
          throw new Error('Failed to fetch node data');
        }

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

  // Pre-calculate dot positions
  const worldDotPositions = useMemo(() => {
    return WORLD_DOTS.map(dot => latLonToXY(dot.lat, dot.lon, mapWidth, mapHeight));
  }, []);

  // Cluster nearby nodes for cleaner display
  const clusteredNodes = useMemo(() => {
    // Group by approximate location
    const clusters: Map<string, NodeLocation> = new Map();
    
    locations.forEach(loc => {
      const key = `${Math.round(loc.lat / 5) * 5},${Math.round(loc.lon / 10) * 10}`;
      const existing = clusters.get(key);
      
      if (existing) {
        clusters.set(key, {
          ...existing,
          nodeCount: existing.nodeCount + loc.nodeCount,
          lat: (existing.lat + loc.lat) / 2,
          lon: (existing.lon + loc.lon) / 2,
        });
      } else {
        clusters.set(key, { ...loc });
      }
    });
    
    return Array.from(clusters.values());
  }, [locations]);

  if (loading) {
    return (
      <div className="bg-cipher-card border border-cipher-border rounded-xl p-6">
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-cipher-cyan border-t-transparent"></div>
          <span className="ml-3 text-secondary">Loading node map...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-cipher-card border border-cipher-border rounded-xl p-6">
        <div className="text-center py-12">
          <p className="text-secondary mb-2">Node map unavailable</p>
          <p className="text-xs text-muted">{error}</p>
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
            <div className="flex items-center gap-6 text-sm">
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
      <div className="relative bg-[#0a0a0f] p-4">
        <svg
          viewBox={`0 0 ${mapWidth} ${mapHeight}`}
          className="w-full h-auto"
          style={{ maxHeight: '500px' }}
        >
          {/* World outline dots */}
          {worldDotPositions.map((pos, i) => (
            <circle
              key={`dot-${i}`}
              cx={pos.x}
              cy={pos.y}
              r={1.5}
              fill="#374151"
              opacity={0.6}
            />
          ))}

          {/* Node clusters */}
          {clusteredNodes.map((node, i) => {
            const pos = latLonToXY(node.lat, node.lon, mapWidth, mapHeight);
            const isHovered = hoveredNode === node;
            const radius = Math.max(16, Math.min(30, 12 + node.nodeCount * 2));
            
            return (
              <g
                key={`node-${i}`}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredNode(node)}
                onMouseLeave={() => setHoveredNode(null)}
              >
                {/* Glow effect */}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={radius + 8}
                  fill="#3ff4c6"
                  opacity={isHovered ? 0.3 : 0.15}
                  className="transition-opacity duration-200"
                />
                
                {/* Main circle */}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={radius}
                  fill={isHovered ? '#3ff4c6' : '#22d3ee'}
                  stroke={isHovered ? '#fff' : 'transparent'}
                  strokeWidth={2}
                  className="transition-all duration-200"
                />
                
                {/* Node count */}
                <text
                  x={pos.x}
                  y={pos.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={isHovered ? '#0a0a0f' : '#0a0a0f'}
                  fontSize={radius > 20 ? 12 : 10}
                  fontWeight="bold"
                  fontFamily="monospace"
                >
                  {node.nodeCount}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Tooltip */}
        {hoveredNode && (
          <div className="absolute top-4 left-4 bg-cipher-card/95 backdrop-blur border border-cipher-cyan/30 rounded-lg px-4 py-3 shadow-xl z-10">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{getFlagEmoji(hoveredNode.countryCode)}</span>
              <span className="font-semibold text-primary">{hoveredNode.city}</span>
            </div>
            <div className="text-xs text-secondary mb-2">{hoveredNode.country}</div>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-cipher-cyan font-mono font-bold">
                {hoveredNode.nodeCount} node{hoveredNode.nodeCount > 1 ? 's' : ''}
              </span>
              {hoveredNode.avgPingMs && (
                <span className="text-muted">{hoveredNode.avgPingMs.toFixed(0)}ms ping</span>
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
              <span className="text-[10px] text-muted">
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
