'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { formatRelativeTime, formatDateUTC } from '@/lib/utils';
import { API_CONFIG } from '@/lib/api-config';
import { Card, CardBody, Badge, DataTable, HashLink, type DataTableColumn } from '@/components/ui';

const API_URL = API_CONFIG.POSTGRES_API_URL;

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function isUnknownPool(pool: string | null | undefined) {
  return !pool || /^Unknown/i.test(pool);
}

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
  minerPool: string | null;
  source: string;
  reportedBy: string | null;
  consensusValid: boolean | null;
  detectedAt: string;
  forkEventId: number | null;
  canonicalBlock?: ReorgBlockSide | null;
}

interface ReorgBlockSide {
  hash: string;
  timestamp: number | null;
  transactionCount: number | null;
  size: number | null;
  minerAddress: string | null;
  minerPool: string | null;
  minerPoolUrl?: string | null;
  minerPoolRegion?: string | null;
  source?: string;
}

interface ReorgComparison {
  height: number;
  orphaned: ReorgBlockSide;
  canonical: ReorgBlockSide | null;
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
  comparisons?: ReorgComparison[];
}

interface Stats {
  totalOrphanedBlocks: number;
  totalForkEvents: number;
  reportsLast24h: number;
  deepestReorg: number;
}

interface MonitoredNode {
  name: string;
  host: string;
  nodeImpl: string | null;
  version: string | null;
  height: number | null;
  hash: string | null;
  ourHash: string | null;
  status: 'pending' | 'agree' | 'behind' | 'ahead' | 'fork' | 'syncing' | 'offline';
  lastChecked: string | null;
  error: string | null;
  forkHeight: number | null;
  commonAncestor: number | null;
}

interface NodesSummary {
  total: number;
  online: number;
  forking: number;
}

const forkColumns: DataTableColumn<ForkEvent>[] = [
  {
    id: 'height',
    header: 'Height',
    cell: (fork) => (
      <Link href={`/block/${fork.forkHeight}`} className="text-cipher-cyan hover:underline font-mono text-xs">
        #{fork.forkHeight.toLocaleString()}
      </Link>
    ),
  },
  {
    id: 'depth',
    header: 'Depth',
    align: 'center',
    cell: (fork) => (
      <Badge color={fork.depth > 3 ? 'orange' : fork.depth > 1 ? 'cyan' : 'muted'}>
        {fork.depth} block{fork.depth !== 1 ? 's' : ''}
      </Badge>
    ),
  },
  {
    id: 'blocks',
    header: 'Blocks',
    align: 'center',
    cell: (fork) => (
      <span className="font-mono text-xs text-secondary">
        {fork.orphanedCount || fork.comparisons?.length || '—'}
      </span>
    ),
  },
  {
    id: 'source',
    header: 'Source',
    cell: (fork) => (
      <Badge color={fork.source === 'external' ? 'purple' : 'cyan'}>
        {fork.source}
      </Badge>
    ),
  },
  {
    id: 'description',
    header: 'Description',
    className: 'hidden sm:table-cell',
    cell: (fork) => (
      <span className="text-xs text-secondary truncate block max-w-[250px]">
        {fork.description || '—'}
      </span>
    ),
  },
  {
    id: 'detected',
    header: 'Detected',
    align: 'right',
    cell: (fork) => (
      <span className="text-xs text-muted font-mono whitespace-nowrap">
        {fork.detectedAt ? formatRelativeTime(new Date(fork.detectedAt).getTime() / 1000) : '—'}
      </span>
    ),
  },
];

const NODE_STATUS_COLOR: Record<string, string> = {
  agree: 'text-cipher-green',
  behind: 'text-cipher-yellow',
  ahead: 'text-cipher-cyan',
  fork: 'text-cipher-orange',
  offline: 'text-red-500',
  pending: 'text-muted',
  syncing: 'text-muted',
};

const NODE_STATUS_LABEL: Record<string, string> = {
  agree: 'Agrees',
  behind: 'Behind',
  ahead: 'Ahead',
  fork: 'FORK',
  offline: 'Offline',
  pending: 'Pending',
  syncing: 'Syncing',
};

const nodeColumns: DataTableColumn<MonitoredNode>[] = [
  {
    id: 'node',
    header: 'Node',
    cell: (node) => (
      <span className="font-mono text-xs text-primary font-medium">{node.name}</span>
    ),
  },
  {
    id: 'host',
    header: 'Host',
    className: 'hidden sm:table-cell',
    cell: (node) => <code className="text-xs text-muted font-mono">{node.host}</code>,
  },
  {
    id: 'version',
    header: 'Version',
    align: 'center',
    className: 'hidden sm:table-cell',
    cell: (node) =>
      node.version ? (
        <span className="text-xs font-mono text-secondary">
          {node.nodeImpl ? `${node.nodeImpl} ` : ''}{node.version}
        </span>
      ) : (
        <span className="text-xs text-muted">—</span>
      ),
  },
  {
    id: 'height',
    header: 'Height',
    align: 'center',
    cell: (node) => (
      <span className="font-mono text-xs text-secondary">
        {node.height ? node.height.toLocaleString() : '—'}
      </span>
    ),
  },
  {
    id: 'tipHash',
    header: 'Tip Hash',
    className: 'hidden md:table-cell',
    cell: (node) =>
      node.hash ? (
        <HashLink
          value={node.hash}
          lead={10}
          tail={6}
          linkClassName={`text-xs font-mono ${node.status === 'fork' ? 'text-cipher-orange' : 'text-secondary'}`}
        />
      ) : (
        <span className="text-xs text-muted">—</span>
      ),
  },
  {
    id: 'status',
    header: 'Status',
    align: 'center',
    cell: (node) => (
      <>
        <span className={`text-xs font-mono font-bold ${NODE_STATUS_COLOR[node.status] || 'text-muted'}`}>
          {NODE_STATUS_LABEL[node.status] || node.status}
        </span>
        {node.status === 'fork' && node.commonAncestor != null && node.height != null && (
          <span className="block text-[10px] text-muted mt-0.5">
            depth: {node.height - node.commonAncestor} · split @ #{node.commonAncestor.toLocaleString()}
          </span>
        )}
      </>
    ),
  },
  {
    id: 'lastCheck',
    header: 'Last Check',
    align: 'right',
    cell: (node) => (
      <span className="text-xs text-muted font-mono">
        {node.lastChecked ? formatRelativeTime(new Date(node.lastChecked).getTime() / 1000) : '—'}
      </span>
    ),
  },
];

export default function UnclesPage() {
  const [tab, setTab] = useState<'forks' | 'orphans' | 'nodes'>('forks');
  const [orphans, setOrphans] = useState<OrphanedBlock[]>([]);
  const [forks, setForks] = useState<ForkEvent[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [nodes, setNodes] = useState<MonitoredNode[]>([]);
  const [nodesSummary, setNodesSummary] = useState<NodesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedOrphan, setExpandedOrphan] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [statsRes, orphansRes, forksRes, nodesRes] = await Promise.all([
        fetch(`${API_URL}/api/uncles/stats`),
        fetch(`${API_URL}/api/uncles?limit=50`),
        fetch(`${API_URL}/api/uncles/forks?limit=20`),
        fetch(`${API_URL}/api/uncles/nodes`),
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

      if (nodesRes.ok) {
        const nodesData = await nodesRes.json();
        if (nodesData.success) {
          setNodes(nodesData.nodes || []);
          setNodesSummary(nodesData.summary || null);
        }
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

  const PoolBadge = ({ pool, url, variant, minerAddress }: { pool: string | null; url?: string | null; variant: 'orphan' | 'canonical'; minerAddress?: string | null }) => {
    if (isUnknownPool(pool)) {
      if (minerAddress) {
        return (
          <Link href={`/address/${minerAddress}`} className="text-xs font-mono text-cipher-cyan hover:underline" title={minerAddress}>
            {truncateAddress(minerAddress)}
          </Link>
        );
      }
      return <span className="text-xs text-muted font-mono">—</span>;
    }
    const colorClass = variant === 'orphan'
      ? 'bg-orange-950/50 text-cipher-orange border-orange-500/30'
      : 'bg-emerald-950/50 text-cipher-green border-emerald-500/30';
    const content = (
      <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-mono font-semibold border ${colorClass}`}>
        {pool}
      </span>
    );
    if (url) {
      return (
        <a href={url} target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity">
          {content}
        </a>
      );
    }
    return content;
  };

  const BlockSideCard = ({
    label,
    block,
    variant,
    height,
  }: {
    label: string;
    block: ReorgBlockSide;
    variant: 'orphan' | 'canonical';
    height: number;
  }) => {
    const isOrphan = variant === 'orphan';
    const borderColor = isOrphan ? 'border-orange-500/30' : 'border-emerald-500/30';
    const bgGradient = isOrphan
      ? 'from-orange-950/30 to-red-950/20'
      : 'from-emerald-950/30 to-cyan-950/20';
    const labelColor = isOrphan ? 'text-cipher-orange' : 'text-cipher-green';

    return (
      <div className={`flex-1 rounded-lg border ${borderColor} bg-gradient-to-br ${bgGradient} p-4`}>
        <div className="flex items-center justify-between mb-3">
          <span className={`text-[10px] font-mono uppercase tracking-wider font-bold ${labelColor}`}>
            {label}
          </span>
          <Badge color={isOrphan ? 'orange' : 'green'}>
            {isOrphan ? 'Orphaned' : 'Canonical'}
          </Badge>
        </div>
        <div className="space-y-2.5">
          <div>
            <span className="text-[10px] text-muted font-mono uppercase">Height</span>
            <div className="text-sm font-mono text-primary">#{height.toLocaleString()}</div>
          </div>
          <div>
            <span className="text-[10px] text-muted font-mono uppercase">Hash</span>
            <Link
              href={isOrphan ? `/block/${block.hash}` : `/block/${height}`}
              className={`text-xs font-mono break-all hover:underline block mt-0.5 ${isOrphan ? 'text-cipher-orange' : 'text-cipher-green'}`}
            >
              {block.hash}
            </Link>
          </div>
          <div>
            <span className="text-[10px] text-muted font-mono uppercase">Miner / Pool</span>
            <div className="mt-1">
              <PoolBadge pool={block.minerPool} url={block.minerPoolUrl} variant={variant} minerAddress={block.minerAddress} />
            </div>
          </div>
          <div className="flex gap-4">
            <div>
              <span className="text-[10px] text-muted font-mono uppercase">TXs</span>
              <div className="text-xs font-mono text-secondary">{block.transactionCount ?? '—'}</div>
            </div>
            <div>
              <span className="text-[10px] text-muted font-mono uppercase">Time</span>
              <div className="text-xs font-mono text-secondary">
                {block.timestamp ? formatRelativeTime(block.timestamp) : '—'}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

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
          <StatCard label="Nodes Monitored" value={nodesSummary ? `${nodesSummary.online}/${nodesSummary.total}` : '—'} color={nodesSummary && nodesSummary.forking > 0 ? 'text-cipher-orange' : 'text-primary'} />
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
          Reorg History ({forks.length})
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
        <button
          onClick={() => setTab('nodes')}
          className={`px-4 py-2 text-xs font-mono transition-colors border-b-2 ${
            tab === 'nodes'
              ? 'border-cipher-cyan text-cipher-cyan'
              : 'border-transparent text-muted hover:text-secondary'
          }`}
        >
          Monitored Nodes ({nodes.length})
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

      {/* Fork Events — Summary list */}
      {!loading && !error && tab === 'forks' && forks.length > 0 && (
        <DataTable
          columns={forkColumns}
          rows={forks}
          rowKey={(fork) => fork.id}
        />
      )}

      {/* Orphaned Blocks Table with expandable comparison */}
      {/* Expandable rows — DataTable doesn't support expansion yet; classes mirror its conventions */}
      {!loading && !error && tab === 'orphans' && orphans.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Height</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Orphaned Hash</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border hidden md:table-cell">Canonical Hash</th>
                  <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">TXs</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border hidden sm:table-cell">Miner</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Source</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Time</th>
                </tr>
              </thead>
              <tbody>
                {orphans.map((block) => (
                  <React.Fragment key={block.id}>
                    <tr
                      className={`group transition-colors duration-100 hover:bg-cipher-hover cursor-pointer ${expandedOrphan === block.id ? 'bg-cipher-hover' : ''}`}
                      onClick={() => setExpandedOrphan(expandedOrphan === block.id ? null : block.id)}
                    >
                      <td className="px-4 h-[44px] border-b border-cipher-border">
                        <Link href={`/block/${block.height}`} className="text-cipher-cyan hover:underline font-mono text-xs" onClick={e => e.stopPropagation()}>
                          #{block.height.toLocaleString()}
                        </Link>
                      </td>
                      <td className="px-4 h-[44px] border-b border-cipher-border">
                        <Link href={`/block/${block.hash}`} className="text-xs text-cipher-orange font-mono hover:underline" title={block.hash} onClick={e => e.stopPropagation()}>
                          {block.hash.slice(0, 10)}...{block.hash.slice(-6)}
                        </Link>
                      </td>
                      <td className="px-4 h-[44px] border-b border-cipher-border hidden md:table-cell">
                        {(block.canonicalBlock?.hash || block.canonicalHash) ? (
                          <Link
                            href={`/block/${block.height}`}
                            className="text-xs text-cipher-green font-mono hover:underline"
                            title={block.canonicalBlock?.hash || block.canonicalHash || ''}
                            onClick={e => e.stopPropagation()}
                          >
                            {(block.canonicalBlock?.hash || block.canonicalHash)!.slice(0, 10)}...
                            {(block.canonicalBlock?.hash || block.canonicalHash)!.slice(-6)}
                          </Link>
                        ) : (
                          <span className="text-xs text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 h-[44px] border-b border-cipher-border text-center font-mono text-xs text-secondary">
                        {block.transactionCount ?? '—'}
                      </td>
                      <td className="px-4 h-[44px] border-b border-cipher-border hidden sm:table-cell">
                        {isUnknownPool(block.minerPool) ? (
                          block.minerAddress ? (
                            <Link href={`/address/${block.minerAddress}`} className="text-xs font-mono text-secondary hover:text-cipher-cyan truncate block max-w-[120px]" title={block.minerAddress} onClick={e => e.stopPropagation()}>
                              {truncateAddress(block.minerAddress)}
                            </Link>
                          ) : (
                            <span className="text-xs text-muted">—</span>
                          )
                        ) : block.minerAddress ? (
                          <Link href={`/address/${block.minerAddress}`} className="text-xs font-mono text-cipher-cyan hover:underline truncate block max-w-[120px]" title={block.minerAddress} onClick={e => e.stopPropagation()}>
                            {block.minerPool}
                          </Link>
                        ) : (
                          <span className="text-xs font-mono text-cipher-cyan">{block.minerPool}</span>
                        )}
                      </td>
                      <td className="px-4 h-[44px] border-b border-cipher-border">
                        <Badge color={block.source === 'external' ? 'purple' : block.source === 'reindex' ? 'cyan' : 'muted'}>
                          {block.source}
                        </Badge>
                      </td>
                      <td className="px-4 h-[44px] border-b border-cipher-border text-right text-xs text-muted font-mono whitespace-nowrap">
                        {block.timestamp ? formatRelativeTime(block.timestamp) : '—'}
                      </td>
                    </tr>
                    {expandedOrphan === block.id && (
                      <tr>
                        <td colSpan={7} className="px-4 py-4 bg-cipher-surface">
                          <div className="flex flex-col lg:flex-row gap-3">
                            <BlockSideCard
                              label="Orphaned Block"
                              block={{
                                hash: block.hash,
                                timestamp: block.timestamp,
                                transactionCount: block.transactionCount,
                                size: block.size,
                                minerAddress: block.minerAddress,
                                minerPool: block.minerPool,
                              }}
                              variant="orphan"
                              height={block.height}
                            />
                            <div className="hidden lg:flex items-center justify-center px-2">
                              <div className="text-muted font-mono text-xs">vs</div>
                            </div>
                            {block.canonicalBlock ? (
                              <BlockSideCard
                                label="Canonical Block"
                                block={block.canonicalBlock}
                                variant="canonical"
                                height={block.height}
                              />
                            ) : (
                              <div className="flex-1 rounded-lg border border-cipher-border bg-glass-2 p-4 flex items-center justify-center">
                                <span className="text-xs text-muted font-mono">Canonical block not indexed</span>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Monitored Nodes Table */}
      {!loading && !error && tab === 'nodes' && (
        <DataTable
          columns={nodeColumns}
          rows={nodes}
          rowKey={(node) => node.name}
        />
      )}

      {/* Report Endpoint Info */}
      <Card className="mt-8">
        <CardBody>
          <h3 className="text-sm font-bold font-mono text-primary mb-3">Report Competing Tips</h3>
          <p className="text-xs text-secondary mb-3">
            Node operators can help monitor chain health by reporting their tip block hash.
            If your node sees a different block at the same height, it will be recorded as a potential fork.
          </p>
          <div className="bg-cipher-surface rounded-lg p-4 border border-cipher-border">
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
