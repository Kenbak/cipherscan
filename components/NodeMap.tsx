'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { getApiUrl } from '@/lib/api-config';

// Dynamic import for Globe (no SSR - uses WebGL)
const Globe = dynamic(() => import('react-globe.gl'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[500px] bg-cipher-bg/50">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-cipher-cyan border-t-transparent"></div>
    </div>
  ),
});

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

// Country flag emoji from country code
function getFlagEmoji(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return '';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

export function NodeMap() {
  const [locations, setLocations] = useState<NodeLocation[]>([]);
  const [stats, setStats] = useState<NodeStats | null>(null);
  const [topCountries, setTopCountries] = useState<TopCountry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const globeRef = useRef<any>(null);

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
    
    // Refresh every 5 minutes
    const interval = setInterval(fetchNodes, 300000);
    return () => clearInterval(interval);
  }, []);

  // Auto-rotate globe
  useEffect(() => {
    if (globeRef.current) {
      // Set initial position
      globeRef.current.pointOfView({ lat: 30, lng: 10, altitude: 2.2 }, 0);
      
      // Auto-rotate
      const controls = globeRef.current.controls();
      if (controls) {
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.5;
      }
    }
  }, [loading]);

  // Point color based on node count
  const getPointColor = useCallback((d: any) => {
    const count = d.nodeCount || 1;
    if (count >= 5) return '#3ff4c6'; // Cyan for large clusters
    if (count >= 2) return '#22d3ee'; // Light cyan
    return '#a855f7'; // Purple for single nodes
  }, []);

  // Point size based on node count
  const getPointAltitude = useCallback((d: any) => {
    const count = d.nodeCount || 1;
    return 0.01 + Math.sqrt(count) * 0.02;
  }, []);

  const getPointRadius = useCallback((d: any) => {
    const count = d.nodeCount || 1;
    return 0.3 + Math.sqrt(count) * 0.4;
  }, []);

  // Tooltip content
  const getLabel = useCallback((d: any) => {
    return `
      <div style="
        background: rgba(15, 23, 42, 0.95);
        border: 1px solid rgba(63, 244, 198, 0.3);
        border-radius: 8px;
        padding: 12px 16px;
        font-family: system-ui, -apple-system, sans-serif;
        color: white;
        min-width: 150px;
      ">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
          <span style="font-size: 18px;">${getFlagEmoji(d.countryCode)}</span>
          <span style="font-weight: 600; font-size: 14px;">${d.city}</span>
        </div>
        <div style="color: rgba(255,255,255,0.7); font-size: 12px; margin-bottom: 8px;">
          ${d.country}
        </div>
        <div style="display: flex; align-items: center; gap: 12px; font-size: 12px;">
          <span style="color: #3ff4c6; font-weight: 600; font-family: monospace;">
            ${d.nodeCount} node${d.nodeCount > 1 ? 's' : ''}
          </span>
          ${d.avgPingMs ? `<span style="color: rgba(255,255,255,0.5);">${d.avgPingMs.toFixed(0)}ms</span>` : ''}
        </div>
      </div>
    `;
  }, []);

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
              <p className="text-xs text-muted">
                Global distribution of Zcash full nodes
              </p>
            </div>
          </div>
          
          {/* Stats badges */}
          {stats && (
            <div className="flex items-center gap-4 text-sm">
              <div className="text-center">
                <div className="font-bold text-cipher-cyan font-mono">{stats.activeNodes}</div>
                <div className="text-[10px] text-muted uppercase">Nodes</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-cipher-green font-mono">{stats.countries}</div>
                <div className="text-[10px] text-muted uppercase">Countries</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-purple-400 font-mono">{stats.cities}</div>
                <div className="text-[10px] text-muted uppercase">Cities</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Globe Container */}
      <div className="relative h-[500px] bg-[#0a0a0f]">
        <Globe
          ref={globeRef}
          globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
          backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
          pointsData={locations}
          pointLat="lat"
          pointLng="lon"
          pointColor={getPointColor}
          pointAltitude={getPointAltitude}
          pointRadius={getPointRadius}
          pointLabel={getLabel}
          pointsMerge={false}
          atmosphereColor="#3ff4c6"
          atmosphereAltitude={0.15}
          enablePointerInteraction={true}
          width={typeof window !== 'undefined' ? Math.min(window.innerWidth - 48, 1200) : 800}
          height={500}
        />

        {/* Legend overlay */}
        <div className="absolute bottom-4 left-4 bg-cipher-card/90 backdrop-blur border border-cipher-border rounded-lg px-3 py-2 text-xs">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-[#3ff4c6]"></span>
              <span className="text-muted">5+ nodes</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#22d3ee]"></span>
              <span className="text-muted">2-4 nodes</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#a855f7]"></span>
              <span className="text-muted">1 node</span>
            </div>
          </div>
        </div>

        {/* Controls hint */}
        <div className="absolute top-4 right-4 text-[10px] text-muted/50">
          Drag to rotate • Scroll to zoom
        </div>
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
            {topCountries.slice(0, 8).map((country) => (
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
