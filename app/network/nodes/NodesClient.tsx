'use client';

import { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import Link from 'next/link';
import { getApiUrl } from '@/lib/api-config';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/ui/SectionHeader';

const TopologyGraph = lazy(() =>
  import('@/components/network/TopologyGraph').then(m => ({ default: m.TopologyGraph }))
);

interface NodeEntry {
  id: number;
  client: string;
  version: string | null;
  protocolVersion: number | null;
  country: string | null;
  countryCode: string | null;
  lat: number | null;
  lon: number | null;
  isTor: boolean;
  torType: string | null;
  pingMs: number | null;
  isActive: boolean;
  firstSeen: string;
  lastSeen: string;
  source: string;
}

interface NodeStats {
  activeNodes: number;
  totalNodes: number;
  countries: number;
  cities: number;
  avgPingMs: number | null;
  torNodes: number;
  lastUpdated: string | null;
}

interface ClientEntry {
  client: string;
  count: number;
}

interface VersionEntry {
  client: string;
  version: string;
  count: number;
}

export default function NodesClient() {
  const [nodes, setNodes] = useState<NodeEntry[]>([]);
  const [stats, setStats] = useState<NodeStats | null>(null);
  const [clients, setClients] = useState<ClientEntry[]>([]);
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('last_seen');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const apiUrl = getApiUrl();

  const fetchData = useCallback(async () => {
    try {
      const [nodeRes, statsRes] = await Promise.all([
        fetch(`${apiUrl}/api/network/nodes/list?limit=100&sort=${sortBy}&dir=${sortDir}`),
        fetch(`${apiUrl}/api/network/nodes/stats`),
      ]);

      if (nodeRes.ok) {
        const nodeData = await nodeRes.json();
        setNodes(nodeData.nodes || []);
        setTotal(nodeData.total || 0);
      }

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData.stats || null);
        setClients(statsData.clients?.distribution || []);
        setVersions(statsData.clients?.versions || []);
      }
    } catch (err) {
      console.error('Failed to fetch node data:', err);
    } finally {
      setLoading(false);
    }
  }, [apiUrl, sortBy, sortDir]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSort = (col: string) => {
    if (col === sortBy) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir('desc');
    }
  };

  const clientColors: Record<string, string> = {
    Zebra: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    Zakura: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    zcashd: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    Unknown: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <PageHeader
        eyebrow="Network"
        title={<>Zcash Nodes</>}
        subtitle="Verified reachable nodes discovered via network crawl"
        actions={
          <Link href="/network" className="text-xs text-muted hover:text-secondary font-mono">
            &larr; Network Overview
          </Link>
        }
      />

      {/* Stats Hero */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
          <StatCard label="Reachable" value={stats.activeNodes} />
          <StatCard label="Countries" value={stats.countries} />
          <StatCard label="Tor Nodes" value={stats.torNodes} />
          <StatCard label="Avg Ping" value={stats.avgPingMs ? `${stats.avgPingMs}ms` : '—'} />
          <StatCard label="Total Seen" value={stats.totalNodes} />
          <StatCard label="Cities" value={stats.cities} />
        </div>
      )}

      {/* Client Distribution */}
      {clients.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardBody>
              <h3 className="text-sm font-mono text-secondary uppercase tracking-wider mb-4">
                Client Distribution
              </h3>
              <div className="space-y-3">
                {clients.map(c => {
                  const pct = stats?.activeNodes ? ((c.count / stats.activeNodes) * 100).toFixed(1) : '0';
                  return (
                    <div key={c.client} className="flex items-center gap-3">
                      <span className="text-sm font-mono text-primary w-20">{c.client}</span>
                      <div className="flex-1 h-2 bg-cipher-bg rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent/60 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted font-mono w-20 text-right">
                        {c.count} ({pct}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <h3 className="text-sm font-mono text-secondary uppercase tracking-wider mb-4">
                Version Breakdown
              </h3>
              <div className="space-y-2">
                {versions.map((v, i) => (
                  <div key={`${v.client}-${v.version}-${i}`} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className={`text-[10px] ${clientColors[v.client] || clientColors.Unknown}`}>
                        {v.client}
                      </Badge>
                      <span className="text-xs font-mono text-primary">{v.version}</span>
                    </div>
                    <span className="text-xs text-muted font-mono">{v.count}</span>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Topology Graph */}
      <Card className="mb-8">
        <CardBody>
          <Suspense fallback={<div className="h-[400px] flex items-center justify-center text-muted text-sm">Loading graph...</div>}>
            <TopologyGraph />
          </Suspense>
        </CardBody>
      </Card>

      {/* Node Table */}
      <Card>
        <CardBody>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-mono text-secondary uppercase tracking-wider">
              Node List
            </h3>
            <span className="text-xs text-muted font-mono">{total} total</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-pulse text-muted text-sm">Loading nodes...</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-cipher-border text-muted font-mono uppercase tracking-wider">
                    <SortHeader label="Client" col="client_impl" current={sortBy} dir={sortDir} onClick={handleSort} />
                    <th className="px-3 py-2 text-left">Version</th>
                    <SortHeader label="Country" col="country_code" current={sortBy} dir={sortDir} onClick={handleSort} />
                    <th className="px-3 py-2 text-left">Tor</th>
                    <th className="px-3 py-2 text-right">Ping</th>
                    <SortHeader label="Last Seen" col="last_seen" current={sortBy} dir={sortDir} onClick={handleSort} align="right" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-cipher-border/50">
                  {nodes.map(node => (
                    <tr key={node.id} className="hover:bg-cipher-card/50 transition-colors">
                      <td className="px-3 py-2">
                        <Badge className={`text-[10px] ${clientColors[node.client] || clientColors.Unknown}`}>
                          {node.client}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 font-mono text-primary">
                        {node.version || '—'}
                      </td>
                      <td className="px-3 py-2 text-muted">
                        {node.countryCode ? (
                          <span title={node.country || ''}>
                            {node.countryCode}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2">
                        {node.isTor && (
                          <Badge className="text-[10px] bg-purple-500/20 text-purple-300 border-purple-500/30">
                            {node.torType === 'exit' ? 'Exit' : node.torType === 'hidden' ? 'Hidden' : 'Tor'}
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-muted">
                        {node.pingMs ? `${node.pingMs.toFixed(0)}ms` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-muted">
                        {formatRelativeTime(node.lastSeen)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-cipher-card border border-cipher-border rounded-lg p-3">
      <div className="text-[10px] text-muted font-mono uppercase tracking-wider mb-1">{label}</div>
      <div className="text-lg font-bold text-primary font-mono">{value}</div>
    </div>
  );
}

function SortHeader({
  label, col, current, dir, onClick, align = 'left',
}: {
  label: string; col: string; current: string; dir: string; onClick: (col: string) => void; align?: 'left' | 'right';
}) {
  const active = col === current;
  return (
    <th
      className={`px-3 py-2 cursor-pointer hover:text-primary transition-colors text-${align}`}
      onClick={() => onClick(col)}
    >
      {label} {active && (dir === 'asc' ? '↑' : '↓')}
    </th>
  );
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
