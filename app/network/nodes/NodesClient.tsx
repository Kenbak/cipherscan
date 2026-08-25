'use client';

import { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import Link from 'next/link';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
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
  isp: string | null;
  degree: number | null;
  betweenness: number | null;
  closeness: number | null;
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

const CLIENT_COLORS: Record<string, string> = {
  Zebra: '#56D4C8',
  Zakura: '#E8C48D',
  zcashd: '#5B9CF6',
  Seeder: '#9B8AFB',
  Other: '#7D8A9A',
  Unknown: '#4B5563',
};

function clientColor(client: string) {
  return CLIENT_COLORS[client] || CLIENT_COLORS.Other;
}

const CLIENT_BADGE_CLASSES: Record<string, string> = {
  Zebra: 'bg-[#56D4C8]/15 text-[#56D4C8] border-[#56D4C8]/30',
  Zakura: 'bg-[#E8C48D]/15 text-[#E8C48D] border-[#E8C48D]/30',
  zcashd: 'bg-[#5B9CF6]/15 text-[#5B9CF6] border-[#5B9CF6]/30',
  Unknown: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
};

function countryFlag(code: string | null): string {
  if (!code || code.length !== 2) return '';
  const codePoints = [...code.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65);
  return String.fromCodePoint(...codePoints);
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
  const [page, setPage] = useState(0);

  const apiUrl = getApiUrl();
  const PAGE_SIZE = 50;

  const fetchData = useCallback(async () => {
    try {
      const [nodeRes, statsRes] = await Promise.all([
        fetch(`${apiUrl}/api/network/nodes/list?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}&sort=${sortBy}&dir=${sortDir}`),
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
  }, [apiUrl, sortBy, sortDir, page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSort = (col: string) => {
    if (col === sortBy) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir('desc');
    }
    setPage(0);
  };

  const identifiedCount = clients.filter(c => c.client !== 'Unknown').reduce((s, c) => s + c.count, 0);
  const coveragePct = stats?.activeNodes ? ((identifiedCount / stats.activeNodes) * 100).toFixed(0) : '0';
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <PageHeader
        eyebrow="Network"
        title={<>Zcash Nodes</>}
        subtitle="Verified reachable nodes discovered via network crawl"
        actions={
          <Link href="/network" className="text-xs text-muted hover:text-secondary font-mono transition-colors">
            &larr; Network Overview
          </Link>
        }
      />

      {/* Hero Stat Strip */}
      {stats && (
        <Card className="mb-8 animate-fade-in-up">
          <CardBody>
            <div className="flex flex-col sm:flex-row sm:items-end gap-6">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted mb-1">
                  Reachable Nodes
                </div>
                <div className="text-4xl font-bold font-mono text-primary tabular-nums">
                  {stats.activeNodes.toLocaleString()}
                </div>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2 sm:ml-auto text-xs font-mono">
                <StatChip label="Countries" value={stats.countries} />
                <StatChip label="Avg Ping" value={stats.avgPingMs ? `${stats.avgPingMs.toFixed(0)}ms` : '—'} />
                <StatChip label="Tor" value={stats.torNodes} />
                <StatChip label="Total Seen" value={stats.totalNodes.toLocaleString()} />
                <StatChip label="Cities" value={stats.cities} />
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Client Distribution + Version Breakdown */}
      {clients.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 animate-fade-in-up stagger-2">
          {/* Pie Chart */}
          <Card>
            <CardBody>
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-primary">Client Distribution</h3>
                  <p className="mt-1 text-[11px] text-muted">
                    Verified via protocol handshake during network crawl.
                  </p>
                </div>
                <span className="shrink-0 font-mono text-xs text-cipher-cyan">
                  {coveragePct}% identified
                </span>
              </div>

              <div className="grid items-center gap-4 sm:grid-cols-[160px_1fr]">
                <div className="h-[160px]" role="img" aria-label="Client distribution donut chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={clients.filter(c => c.count > 0)}
                        dataKey="count"
                        nameKey="client"
                        cx="50%"
                        cy="50%"
                        innerRadius={44}
                        outerRadius={68}
                        paddingAngle={2}
                        stroke="none"
                      >
                        {clients.filter(c => c.count > 0).map(item => (
                          <Cell key={item.client} fill={clientColor(item.client)} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value, name) => [`${Number(value)} nodes`, String(name)]}
                        contentStyle={{
                          background: 'var(--color-surface-solid)',
                          border: '1px solid var(--color-border)',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="space-y-2.5">
                  {clients.filter(c => c.count > 0).map(item => {
                    const pct = stats?.activeNodes ? ((item.count / stats.activeNodes) * 100).toFixed(1) : '0';
                    return (
                      <div key={item.client} className="flex items-center gap-2 text-xs">
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: clientColor(item.client) }}
                        />
                        <span className="min-w-16 text-secondary">{item.client}</span>
                        <span className="font-mono font-semibold text-primary">{item.count}</span>
                        <span className="ml-auto font-mono text-muted">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Version Breakdown */}
          <Card>
            <CardBody>
              <h3 className="text-sm font-semibold text-primary mb-1">Version Breakdown</h3>
              <p className="text-[11px] text-muted mb-4">
                Self-reported version strings from connected peers.
              </p>
              <div className="space-y-2">
                {versions.slice(0, 12).map((v, i) => (
                  <div
                    key={`${v.client}-${v.version}-${i}`}
                    className="flex items-center gap-3 rounded-lg border border-cipher-border/60 px-3 py-2"
                  >
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: clientColor(v.client) }}
                    />
                    <span className="text-xs text-secondary">{v.client}</span>
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-primary">
                      {v.version}
                    </span>
                    <span className="font-mono text-xs font-semibold text-cipher-cyan">{v.count}</span>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Topology Graph */}
      <Card className="mb-8 animate-fade-in-up stagger-3">
        <CardBody>
          <Suspense fallback={
            <div className="h-[400px] flex items-center justify-center">
              <div className="animate-pulse text-muted text-sm font-mono">Loading topology...</div>
            </div>
          }>
            <TopologyGraph />
          </Suspense>
        </CardBody>
      </Card>

      {/* Node Table */}
      <Card className="animate-fade-in-up stagger-4">
        <CardBody>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-primary">Node List</h3>
              <p className="text-[11px] text-muted mt-0.5">
                {total.toLocaleString()} nodes discovered across {stats?.countries ?? 0} countries
              </p>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-2 py-1 text-xs font-mono rounded border border-cipher-border text-muted hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Prev
                </button>
                <span className="text-xs font-mono text-muted">
                  {page + 1}/{totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-2 py-1 text-xs font-mono rounded border border-cipher-border text-muted hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-pulse text-muted text-sm font-mono">Loading nodes...</div>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-cipher-border text-muted font-mono uppercase tracking-wider">
                    <SortHeader label="Client" col="client_impl" current={sortBy} dir={sortDir} onClick={handleSort} />
                    <th className="px-3 py-2.5 text-left">Version</th>
                    <SortHeader label="Country" col="country_code" current={sortBy} dir={sortDir} onClick={handleSort} />
                    <th className="px-3 py-2.5 text-left">Tor</th>
                    <SortHeader label="Peers" col="degree" current={sortBy} dir={sortDir} onClick={handleSort} align="right" />
                    <SortHeader label="Ping" col="ping_ms" current={sortBy} dir={sortDir} onClick={handleSort} align="right" />
                    <SortHeader label="Last Seen" col="last_seen" current={sortBy} dir={sortDir} onClick={handleSort} align="right" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-cipher-border/40">
                  {nodes.map(node => (
                    <tr key={node.id} className="hover:bg-cipher-card/50 transition-colors">
                      <td className="px-3 py-2.5">
                        <Badge className={`text-[10px] ${CLIENT_BADGE_CLASSES[node.client] || CLIENT_BADGE_CLASSES.Unknown}`}>
                          {node.client}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-primary">
                        {node.version || <span className="text-muted">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        {node.countryCode ? (
                          <span className="inline-flex items-center gap-1.5" title={node.country || ''}>
                            <span className="text-sm leading-none">{countryFlag(node.countryCode)}</span>
                            <span className="text-muted">{node.countryCode}</span>
                          </span>
                        ) : <span className="text-muted">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        {node.isTor && (
                          <Badge className="text-[10px] bg-purple-500/15 text-purple-300 border-purple-500/30">
                            {node.torType === 'exit' ? 'Exit' : node.torType === 'relay' ? 'Hidden' : 'Tor'}
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-muted">
                        {node.degree ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-muted">
                        {node.pingMs ? `${node.pingMs.toFixed(0)}ms` : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-muted">
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

function StatChip({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-muted uppercase tracking-wider text-[10px]">{label}</span>
      <span className="font-semibold text-primary">{value}</span>
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
      className={`px-3 py-2.5 cursor-pointer hover:text-primary transition-colors text-${align} select-none`}
      onClick={() => onClick(col)}
    >
      {label}
      {active && <span className="ml-0.5 text-cipher-cyan">{dir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  );
}

function formatRelativeTime(iso: string): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
