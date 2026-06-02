'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { formatRelativeTime, formatDateUTC } from '@/lib/utils';
import { API_CONFIG } from '@/lib/api-config';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

const API_URL = API_CONFIG.POSTGRES_API_URL;

interface OrphanedBlock {
  id: number;
  height: number;
  hash: string;
  canonicalHash: string | null;
  timestamp: number | null;
  transactionCount: number;
  size: number;
  difficulty: string | null;
  minerAddress: string | null;
  source: string;
  reportedBy: string | null;
  consensusValid: boolean | null;
  detectedAt: string;
  forkEventId: number | null;
}

interface ForkEvent {
  id: number;
  forkHeight: number;
  depth: number;
  canonicalTip: number | null;
  orphanedCount: number;
  source: string;
  description: string | null;
  detectedAt: string;
  resolvedAt: string | null;
}

interface Stats {
  totalOrphanedBlocks: number;
  totalForkEvents: number;
  reportsLast24h: number;
  deepestReorg: number;
}

export default function UnclesPage() {
  const [tab, setTab] = useState<'orphans' | 'forks'>('forks');
  const [orphans, setOrphans] = useState<OrphanedBlock[]>([]);
  const [forks, setForks] = useState<ForkEvent[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [statsRes, orphansRes, forksRes] = await Promise.all([
        fetch(`${API_URL}/api/uncles/stats`),
        fetch(`${API_URL}/api/uncles?limit=50`),
        fetch(`${API_URL}/api/uncles/forks?limit=20`),
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        if (statsData.success) setStats(statsData);
      }

      if (orphansRes.ok) {
        const orphansData = await orphansRes.json();
        if (orphansData.success) setOrphans(orphansData.orphanedBlocks || []);
      }

      if (forksRes.ok) {
        const forksData = await forksRes.json();
        if (forksData.success) setForks(forksData.forks || []);
      }
    } catch (err) {
      console.error('Error fetching reorg data:', err);
      setError('Failed to load reorg data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const StatCard = ({ label, value, color = 'text-primary' }: { label: string; value: string | number; color?: string }) => (
    <Card variant="compact">
      <CardBody className="text-center py-4">
        <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
        <div className="text-[10px] uppercase tracking-wider text-muted mt-1">{label}</div>
      </CardBody>
    </Card>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Header */}
      <div className="mb-8">
        <span className="text-[10px] font-mono text-muted tracking-wider">&gt; FORK_WATCH</span>
        <h1 className="text-2xl sm:text-3xl font-bold font-mono text-primary mt-1">
          Fork Watch
        </h1>
        <p className="text-xs text-muted mt-2 max-w-2xl">
          Monitor chain forks, orphaned blocks, and competing tips on the Zcash network.
          When miners produce blocks at the same height, the network resolves to a single chain — losing blocks become orphans.
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <StatCard label="Fork Events" value={stats.totalForkEvents} />
          <StatCard label="Orphaned Blocks" value={stats.totalOrphanedBlocks} />
          <StatCard label="Longest Reorg" value={stats.deepestReorg > 0 ? `${stats.deepestReorg} blocks` : '—'} color={stats.deepestReorg > 3 ? 'text-cipher-orange' : 'text-primary'} />
          <StatCard label="Reports (24h)" value={stats.reportsLast24h} />
        </div>
      )}

      {/* Tab Switcher */}
      <div className="flex gap-1 mb-6 border-b border-cipher-border">
        <button
          onClick={() => setTab('forks')}
          className={`px-4 py-2 text-xs font-mono transition-colors border-b-2 ${
            tab === 'forks'
              ? 'border-cipher-cyan text-cipher-cyan'
              : 'border-transparent text-muted hover:text-secondary'
          }`}
        >
          Fork Events ({forks.length})
        </button>
        <button
          onClick={() => setTab('orphans')}
          className={`px-4 py-2 text-xs font-mono transition-colors border-b-2 ${
            tab === 'orphans'
              ? 'border-cipher-cyan text-cipher-cyan'
              : 'border-transparent text-muted hover:text-secondary'
          }`}
        >
          Orphaned Blocks ({orphans.length})
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <Card>
          <CardBody className="text-center py-12">
            <div className="animate-pulse text-muted font-mono text-sm">Loading reorg data...</div>
          </CardBody>
        </Card>
      )}

      {/* Error */}
      {error && !loading && (
        <Card>
          <CardBody className="text-center py-12">
            <p className="text-cipher-orange font-mono text-sm mb-4">{error}</p>
            <button onClick={fetchData} className="text-xs font-mono text-cipher-cyan hover:underline">
              Retry
            </button>
          </CardBody>
        </Card>
      )}

      {/* Empty State */}
      {!loading && !error && orphans.length === 0 && forks.length === 0 && (
        <Card>
          <CardBody className="text-center py-16">
            <div className="text-4xl mb-4">&#x1f6e1;&#xfe0f;</div>
            <h2 className="text-lg font-bold font-mono text-primary mb-2">No Reorg Events Recorded</h2>
            <p className="text-xs text-muted max-w-md mx-auto">
              Chain reorganization events will appear here when detected.
              External nodes can report competing tips via the <code className="text-cipher-cyan">POST /api/uncle/report</code> endpoint.
            </p>
          </CardBody>
        </Card>
      )}

      {/* Fork Events Table */}
      {!loading && !error && tab === 'forks' && forks.length > 0 && (
        <Card>
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-cipher-border">
                    <th className="text-left text-[11px] uppercase tracking-wider text-muted px-4 py-3">Fork Height</th>
                    <th className="text-center text-[11px] uppercase tracking-wider text-muted px-4 py-3">Reorg Length</th>
                    <th className="text-center text-[11px] uppercase tracking-wider text-muted px-4 py-3">Orphans</th>
                    <th className="text-left text-[11px] uppercase tracking-wider text-muted px-4 py-3">Source</th>
                    <th className="text-left text-[11px] uppercase tracking-wider text-muted px-4 py-3 hidden sm:table-cell">Description</th>
                    <th className="text-right text-[11px] uppercase tracking-wider text-muted px-4 py-3">Detected</th>
                  </tr>
                </thead>
                <tbody>
                  {forks.map((fork) => (
                    <tr key={fork.id} className="border-b border-cipher-border hover:bg-[var(--color-hover)] transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/block/${fork.forkHeight}`} className="text-cipher-cyan hover:underline font-mono text-xs">
                          #{fork.forkHeight.toLocaleString()}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge color={fork.depth > 3 ? 'orange' : fork.depth > 1 ? 'cyan' : 'muted'}>
                          {fork.depth} block{fork.depth !== 1 ? 's' : ''}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-xs text-secondary">
                        {fork.orphanedCount}
                      </td>
                      <td className="px-4 py-3">
                        <Badge color={fork.source === 'external' ? 'purple' : 'cyan'}>
                          {fork.source}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-secondary hidden sm:table-cell max-w-[300px] truncate">
                        {fork.description || '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-muted font-mono">
                        {fork.detectedAt ? formatRelativeTime(new Date(fork.detectedAt).getTime() / 1000) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Orphaned Blocks Table */}
      {!loading && !error && tab === 'orphans' && orphans.length > 0 && (
        <Card>
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-cipher-border">
                    <th className="text-left text-[11px] uppercase tracking-wider text-muted px-4 py-3">Height</th>
                    <th className="text-left text-[11px] uppercase tracking-wider text-muted px-4 py-3">Orphaned Hash</th>
                    <th className="text-left text-[11px] uppercase tracking-wider text-muted px-4 py-3 hidden md:table-cell">Canonical Hash</th>
                    <th className="text-center text-[11px] uppercase tracking-wider text-muted px-4 py-3">TXs</th>
                    <th className="text-left text-[11px] uppercase tracking-wider text-muted px-4 py-3 hidden sm:table-cell">Miner</th>
                    <th className="text-left text-[11px] uppercase tracking-wider text-muted px-4 py-3">Source</th>
                    <th className="text-right text-[11px] uppercase tracking-wider text-muted px-4 py-3">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {orphans.map((block) => (
                    <tr key={block.id} className="border-b border-cipher-border hover:bg-[var(--color-hover)] transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/block/${block.height}`} className="text-cipher-cyan hover:underline font-mono text-xs">
                          #{block.height.toLocaleString()}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <code className="text-xs text-cipher-orange font-mono" title={block.hash}>
                          {block.hash.slice(0, 10)}...{block.hash.slice(-6)}
                        </code>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {block.canonicalHash ? (
                          <code className="text-xs text-cipher-green font-mono" title={block.canonicalHash}>
                            {block.canonicalHash.slice(0, 10)}...{block.canonicalHash.slice(-6)}
                          </code>
                        ) : (
                          <span className="text-xs text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-xs text-secondary">
                        {block.transactionCount ?? '—'}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        {block.minerAddress ? (
                          <Link href={`/address/${block.minerAddress}`} className="text-xs font-mono text-secondary hover:text-cipher-cyan truncate block max-w-[120px]">
                            {block.minerAddress.slice(0, 8)}...
                          </Link>
                        ) : (
                          <span className="text-xs text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge color={block.source === 'external' ? 'purple' : block.source === 'reindex' ? 'cyan' : 'muted'}>
                          {block.source}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-muted font-mono whitespace-nowrap">
                        {block.timestamp ? formatRelativeTime(block.timestamp) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Report Endpoint Info */}
      <Card className="mt-8">
        <CardBody>
          <h3 className="text-sm font-bold font-mono text-primary mb-3">Report Competing Tips</h3>
          <p className="text-xs text-secondary mb-3">
            Node operators can help monitor chain health by reporting their tip block hash.
            If your node sees a different block at the same height, it will be recorded as a potential fork.
          </p>
          <div className="bg-[var(--color-surface)] rounded-lg p-4 border border-cipher-border">
            <code className="text-xs text-cipher-cyan font-mono block mb-2">
              POST {API_URL}/api/uncle/report
            </code>
            <pre className="text-xs text-muted font-mono">
{`{
  "height": 3363000,
  "hash": "0000000000...",
  "node_id": "my-zebra-node"  // optional
}`}
            </pre>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
