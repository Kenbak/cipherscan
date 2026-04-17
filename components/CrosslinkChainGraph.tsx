'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  type Node,
  type Edge,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { getApiUrl } from '@/lib/api-config';
import { displayPubkey } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Data model
// ---------------------------------------------------------------------------

interface PowBlock {
  height: number;
  hash: string;
  timestamp: number;
  transaction_count: number;
  size: number;
  finality_status?: string | null;
}

interface BftDecision {
  referenced_hash: string;
  signature_count: number;
  pow_blocks_in_decision: number;
  first_seen_at_pow_height: number;
  last_seen_at_pow_height: number;
  signer_keys: string[];
}

interface BftTip {
  votedBlockHash: string | null;
  signatureCount: number;
}

interface CrosslinkStats {
  tipHeight: number;
  finalizedHeight: number;
  finalityGap: number;
  finalizerCount: number;
}

// ---------------------------------------------------------------------------
// Layout math
// ---------------------------------------------------------------------------

const POW_X = 0;
const BFT_X = 420;
const ROW_HEIGHT = 92;          // vertical spacing between PoW blocks
const POW_WIDTH = 320;
const POW_HEIGHT = 64;
const BFT_RADIUS = 22;          // visual size of BFT circle

/**
 * Log-scaled block size ratio. Coinbase-only blocks are ~1 KB; full blocks
 * can be 60+ KB. Use log so the thin ones don't become invisible bars.
 */
function sizeScale(size: number, maxSize: number): number {
  if (maxSize <= 0) return 0.2;
  const logMax = Math.log10(Math.max(maxSize, 2048));
  const logS = Math.log10(Math.max(size, 1024));
  return Math.max(0.15, Math.min(1, logS / logMax));
}

function fmtAge(epoch: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000 - epoch));
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

// ---------------------------------------------------------------------------
// Custom nodes
// ---------------------------------------------------------------------------

interface PowNodeData extends Record<string, unknown> {
  block: PowBlock;
  scale: number;
  state: 'finalized' | 'voting' | 'pending';
}

function PowBlockNode({ data }: NodeProps<Node<PowNodeData>>) {
  const { block, scale, state } = data;

  const ring =
    state === 'voting'
      ? 'ring-2 ring-cipher-orange/60 border-cipher-orange/40 animate-pulse'
      : state === 'finalized'
      ? 'border-cipher-green/30'
      : 'border-cipher-cyan/30';
  const dot =
    state === 'voting'
      ? 'bg-cipher-orange animate-pulse'
      : state === 'finalized'
      ? 'bg-cipher-green'
      : 'bg-cipher-cyan/70';
  const bar =
    state === 'voting'
      ? 'bg-cipher-orange/60'
      : state === 'finalized'
      ? 'bg-cipher-green/50'
      : 'bg-cipher-cyan/50';

  return (
    <Link
      href={`/block/${block.height}`}
      className={`group block w-[320px] rounded-lg border bg-cipher-bg/90 backdrop-blur-sm px-3 py-2.5 transition-all hover:border-cipher-cyan hover:bg-cipher-hover/60 ${ring}`}
    >
      <Handle
        type="target"
        position={Position.Right}
        id="pow-target"
        className="!bg-transparent !border-0 !w-2 !h-2"
      />

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${dot}`} />
          <span className="font-mono text-sm font-semibold text-primary truncate group-hover:text-cipher-cyan transition-colors">
            #{block.height.toLocaleString()}
          </span>
          <code className="font-mono text-[10px] text-muted truncate">
            {block.hash.slice(0, 10)}…{block.hash.slice(-6)}
          </code>
        </div>
        <span className="text-[10px] font-mono text-muted shrink-0">
          {fmtAge(block.timestamp)}
        </span>
      </div>

      <div className="mt-1.5 flex items-center gap-2">
        <div className="flex-1 h-[3px] rounded-full bg-cipher-border/40 overflow-hidden">
          <div
            className={`h-full rounded-full ${bar} transition-all`}
            style={{ width: `${scale * 100}%` }}
          />
        </div>
        <div className="text-[10px] font-mono text-muted whitespace-nowrap">
          {block.transaction_count} tx · {fmtBytes(block.size)}
        </div>
      </div>
    </Link>
  );
}

interface BftNodeData extends Record<string, unknown> {
  decision: BftDecision;
  finalizerCount: number;
  compact?: boolean;
}

function BftDecisionNode({ data }: NodeProps<Node<BftNodeData>>) {
  const { decision, finalizerCount } = data;
  const quorumPct = finalizerCount > 0 ? (decision.signature_count / finalizerCount) * 100 : 0;

  return (
    <div className="group relative cursor-default">
      <Handle
        type="source"
        position={Position.Left}
        id="bft-source"
        className="!bg-transparent !border-0 !w-2 !h-2"
      />

      {/* The circle */}
      <div
        className="w-[44px] h-[44px] rounded-full bg-cipher-green/15 border border-cipher-green/50 flex items-center justify-center relative shadow-[0_0_20px_rgba(74,222,128,0.15)] hover:shadow-[0_0_28px_rgba(74,222,128,0.3)] transition-shadow"
      >
        <span className="font-mono text-[11px] font-semibold text-cipher-green">
          {decision.signature_count}
        </span>
      </div>

      {/* Label to the right */}
      <div className="absolute left-[52px] top-1/2 -translate-y-1/2 pointer-events-none whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono text-cipher-green/90 uppercase tracking-wider">
            BFT
          </span>
          <span className="text-[10px] font-mono text-muted">
            {decision.signature_count}/{finalizerCount} · {quorumPct.toFixed(0)}%
          </span>
        </div>
        <div className="text-[9px] font-mono text-muted/70">
          ref #{decision.last_seen_at_pow_height.toLocaleString()}
          {decision.pow_blocks_in_decision > 1 &&
            ` (covers ${decision.pow_blocks_in_decision} blocks)`}
        </div>
      </div>

      {/* Hover popover with signer list */}
      <div className="absolute left-[52px] top-[52px] pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50">
        <div className="card p-2.5 min-w-[260px] shadow-xl">
          <div className="text-[9px] font-mono text-muted uppercase tracking-wider mb-1.5">
            Signers ({decision.signer_keys.length})
          </div>
          <div className="space-y-0.5 max-h-40 overflow-y-auto">
            {decision.signer_keys.slice(0, 20).map((k) => (
              <div key={k} className="text-[10px] font-mono text-secondary truncate">
                {displayPubkey(k).slice(0, 16)}…{displayPubkey(k).slice(-6)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const nodeTypes = {
  pow: PowBlockNode,
  bft: BftDecisionNode,
};

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ---------------------------------------------------------------------------
// The graph itself
// ---------------------------------------------------------------------------

export function CrosslinkChainGraph({
  blocksToShow = 40,
}: {
  blocksToShow?: number;
}) {
  const [blocks, setBlocks] = useState<PowBlock[]>([]);
  const [decisions, setDecisions] = useState<BftDecision[]>([]);
  const [stats, setStats] = useState<CrosslinkStats | null>(null);
  const [bftTip, setBftTip] = useState<BftTip | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const api = getApiUrl();
      const [blocksRes, bftChainRes, crossRes, bftTipRes] = await Promise.all([
        fetch(`${api}/api/blocks?limit=${blocksToShow}`),
        fetch(`${api}/api/crosslink/bft-chain?limit=${blocksToShow}`),
        fetch(`${api}/api/crosslink`),
        fetch(`${api}/api/crosslink/bft-tip`),
      ]);

      if (blocksRes.ok) {
        const d = await blocksRes.json();
        setBlocks(d.blocks || []);
      }
      if (bftChainRes.ok) {
        const d = await bftChainRes.json();
        if (d.success) setDecisions(d.decisions || []);
      }
      if (crossRes.ok) {
        const d = await crossRes.json();
        if (d.success) {
          setStats({
            tipHeight: d.tipHeight,
            finalizedHeight: d.finalizedHeight,
            finalityGap: d.finalityGap,
            finalizerCount: d.finalizerCount,
          });
        }
      }
      if (bftTipRes.ok) {
        const d = await bftTipRes.json();
        if (d.success) {
          setBftTip({
            votedBlockHash: d.votedBlockHash,
            signatureCount: d.signatureCount,
          });
        }
      }
    } catch (err) {
      console.error('ChainGraph fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [blocksToShow]);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 10_000);
    return () => clearInterval(id);
  }, [fetchData]);

  // ----- Build react-flow nodes + edges ------------------------------------

  const { nodes, edges } = useMemo<{ nodes: Node[]; edges: Edge[] }>(() => {
    if (blocks.length === 0) return { nodes: [], edges: [] };

    const maxSize = blocks.reduce((m, b) => Math.max(m, b.size || 0), 0);
    const finalized = stats?.finalizedHeight ?? 0;
    const votedHash = bftTip?.votedBlockHash;

    // PoW blocks: oldest at the bottom (y increases downward in RF, so newest = smallest y).
    // Ordering blocks newest-first matches our API response; lay out 0→N downward.
    const powNodes: Node[] = blocks.map((b, i) => ({
      id: `pow-${b.hash}`,
      type: 'pow',
      position: { x: POW_X, y: i * ROW_HEIGHT },
      data: {
        block: b,
        scale: sizeScale(b.size || 0, maxSize),
        state:
          b.hash === votedHash
            ? 'voting'
            : b.height <= finalized
            ? 'finalized'
            : 'pending',
      } satisfies PowNodeData,
      draggable: false,
    }));

    // BFT decisions: place each decision vertically aligned with the PoW block it references.
    // Index blocks by hash so we can look up vertical positions.
    const posByHash = new Map<string, number>();
    blocks.forEach((b, i) => posByHash.set(b.hash, i * ROW_HEIGHT));

    const bftNodes: Node[] = [];
    const bftEdges: Edge[] = [];
    for (const d of decisions) {
      const y = posByHash.get(d.referenced_hash);
      if (y === undefined) continue; // decision points at a block outside our window

      // Offset BFT circle to center it vertically next to the PoW block
      bftNodes.push({
        id: `bft-${d.referenced_hash}`,
        type: 'bft',
        position: {
          x: BFT_X,
          y: y + (POW_HEIGHT / 2 - BFT_RADIUS),
        },
        data: {
          decision: d,
          finalizerCount: stats?.finalizerCount ?? 0,
        } satisfies BftNodeData,
        draggable: false,
      });

      // Edge from the BFT circle back to the PoW block it references (solid green)
      bftEdges.push({
        id: `edge-${d.referenced_hash}`,
        source: `bft-${d.referenced_hash}`,
        sourceHandle: 'bft-source',
        target: `pow-${d.referenced_hash}`,
        targetHandle: 'pow-target',
        type: 'smoothstep',
        animated: false,
        style: {
          stroke: 'rgba(74, 222, 128, 0.55)', // cipher-green/55
          strokeWidth: 1.5,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 14,
          height: 14,
          color: 'rgba(74, 222, 128, 0.7)',
        },
      });
    }

    // Extra edge: current BFT vote (if we know what it's voting on)
    if (bftTip?.votedBlockHash) {
      const y = posByHash.get(bftTip.votedBlockHash);
      const alreadyHasBft = decisions.some((d) => d.referenced_hash === bftTip.votedBlockHash);
      if (y !== undefined && !alreadyHasBft) {
        const pendingId = 'bft-pending';
        bftNodes.push({
          id: pendingId,
          type: 'bft',
          position: { x: BFT_X, y: y + (POW_HEIGHT / 2 - BFT_RADIUS) },
          data: {
            decision: {
              referenced_hash: bftTip.votedBlockHash,
              signature_count: bftTip.signatureCount,
              pow_blocks_in_decision: 0,
              first_seen_at_pow_height: 0,
              last_seen_at_pow_height: 0,
              signer_keys: [],
            },
            finalizerCount: stats?.finalizerCount ?? 0,
          } satisfies BftNodeData,
          draggable: false,
        });
        bftEdges.push({
          id: 'edge-pending',
          source: pendingId,
          target: `pow-${bftTip.votedBlockHash}`,
          type: 'smoothstep',
          animated: true,
          style: {
            stroke: 'rgba(251, 146, 60, 0.6)', // cipher-orange
            strokeWidth: 1.5,
            strokeDasharray: '4 2',
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 14,
            height: 14,
            color: 'rgba(251, 146, 60, 0.8)',
          },
        });
      }
    }

    return { nodes: [...powNodes, ...bftNodes], edges: bftEdges };
  }, [blocks, decisions, stats, bftTip]);

  return (
    <div className="relative w-full h-[calc(100vh-180px)] min-h-[600px] card p-0 overflow-hidden">
      {loading && nodes.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-cipher-cyan border-t-transparent" />
        </div>
      ) : null}

      {/* Top overlay: live stats + column labels */}
      {stats && (
        <div className="absolute top-3 left-3 right-3 z-10 flex items-start justify-between pointer-events-none">
          <div className="bg-cipher-bg/80 backdrop-blur-md border border-cipher-border/60 rounded-lg p-3 pointer-events-auto">
            <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1">
              Crosslink dual chain
            </div>
            <div className="flex items-center gap-4 text-sm font-mono">
              <span className="text-primary">
                <span className="text-muted text-[10px]">tip </span>
                #{stats.tipHeight.toLocaleString()}
              </span>
              <span className="text-cipher-green">
                <span className="text-muted text-[10px]">final </span>
                #{stats.finalizedHeight.toLocaleString()}
              </span>
              <span
                className={
                  stats.finalityGap > 20 ? 'text-cipher-orange' : 'text-muted'
                }
              >
                <span className="text-muted text-[10px]">gap </span>
                {stats.finalityGap}
              </span>
              <span className="text-muted text-[10px] hidden sm:inline">
                {stats.finalizerCount} finalizers
              </span>
            </div>
          </div>

          <div className="hidden sm:flex gap-3 text-[10px] font-mono uppercase tracking-wider">
            <span className="px-2 py-1 rounded bg-cipher-bg/80 border border-cipher-cyan/30 text-cipher-cyan">
              PoW
            </span>
            <span className="px-2 py-1 rounded bg-cipher-bg/80 border border-cipher-green/30 text-cipher-green">
              PoS · BFT
            </span>
          </div>
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
        minZoom={0.3}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
        // Avoid react-flow's "background" applying a body style
        style={{ background: 'transparent' }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="rgba(148, 163, 184, 0.08)"
        />
        <Controls
          position="top-right"
          showInteractive={false}
          className="!bg-cipher-bg/80 !border !border-cipher-border/60 !rounded-lg !shadow-none"
        />
        <MiniMap
          position="bottom-right"
          pannable
          zoomable
          maskColor="rgba(0,0,0,0.6)"
          nodeColor={(n) => {
            const d = n.data as PowNodeData | BftNodeData;
            if (n.type === 'bft') return 'rgba(74,222,128,0.9)';
            const state = (d as PowNodeData).state;
            if (state === 'voting') return 'rgba(251,146,60,0.9)';
            if (state === 'finalized') return 'rgba(74,222,128,0.7)';
            return 'rgba(103,232,249,0.6)';
          }}
          nodeBorderRadius={4}
          className="!bg-cipher-bg/80 !border !border-cipher-border/60 !rounded-lg !w-40 !h-28"
        />
      </ReactFlow>

      {/* Legend (bottom-left) */}
      <div className="absolute bottom-3 left-3 z-10 bg-cipher-bg/80 backdrop-blur-md border border-cipher-border/60 rounded-lg p-2.5 flex gap-3 text-[10px] font-mono">
        <span className="flex items-center gap-1.5">
          <span className="block w-2 h-2 rounded-full bg-cipher-green" />
          <span className="text-secondary">finalized</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="block w-2 h-2 rounded-full bg-cipher-orange animate-pulse" />
          <span className="text-secondary">voting</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="block w-2 h-2 rounded-full bg-cipher-cyan/70" />
          <span className="text-secondary">pending</span>
        </span>
      </div>
    </div>
  );
}
