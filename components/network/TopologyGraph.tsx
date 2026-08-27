'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Instances, Instance, Html } from '@react-three/drei';
import * as THREE from 'three';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceX,
  forceY,
  forceZ,
  type Simulation,
  type SimulationNode,
} from 'd3-force-3d';
import { getApiUrl } from '@/lib/api-config';

interface ApiNode {
  id: number;
  client: string;
  isTor: boolean;
  countryCode: string | null;
  betweenness: number | null;
  closeness: number | null;
  degree: number | null;
}

interface ApiEdge {
  source: number;
  target: number;
}

interface SimNode extends SimulationNode {
  id: number;
  client: string;
  isTor: boolean;
  countryCode: string | null;
  betweenness: number | null;
  degree: number | null;
}

interface PositionedNode extends SimNode {
  x: number;
  y: number;
  z: number;
  radius: number;
  color: string;
}

const CLIENT_COLORS: Record<string, string> = {
  Zebra: '#56D4C8',
  Zakura: '#E8C48D',
  zcashd: '#5B9CF6',
  Seeder: '#9B8AFB',
  Unidentified: '#6B7280',
  Other: '#8B5CF6',
};
const TOR_COLOR = '#A855F7';

function nodeColor(n: { client: string; isTor: boolean }) {
  if (n.isTor) return TOR_COLOR;
  return CLIENT_COLORS[n.client] || CLIENT_COLORS.Other;
}

function NodeLabel({ node, primary }: { node: PositionedNode; primary?: boolean }) {
  return (
    <Html
      position={[node.x, node.y + node.radius + 1.2, node.z]}
      center
      distanceFactor={primary ? 110 : 150}
      zIndexRange={[20, 0]}
      style={{ pointerEvents: 'none', transform: 'translateY(-50%)' }}
    >
      <div
        className={`whitespace-nowrap rounded px-1.5 py-0.5 font-mono leading-tight ${
          primary
            ? 'bg-cipher-card/95 border border-cipher-cyan/40 text-primary text-[11px]'
            : 'bg-cipher-card/70 border border-cipher-border/60 text-secondary text-[10px]'
        }`}
      >
        {node.client === 'Unknown' ? 'Unidentified' : node.client}
        {node.countryCode ? ` · ${node.countryCode}` : ''}
        {node.degree != null ? ` · ${node.degree}p` : ''}
      </div>
    </Html>
  );
}

function Scene({
  nodes,
  linePositions,
  edgePairs,
  hovered,
  onHover,
}: {
  nodes: PositionedNode[];
  linePositions: Float32Array;
  edgePairs: [number, number][];
  hovered: PositionedNode | null;
  onHover: (n: PositionedNode | null) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);

  const lineGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
    return g;
  }, [linePositions]);

  const posById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  // Top hubs get a persistent label so the graph reads as a map, not just dots.
  const hubs = useMemo(
    () => [...nodes].sort((a, b) => (b.degree || 0) - (a.degree || 0)).slice(0, 6),
    [nodes]
  );

  // On hover, light up only the edges touching the hovered node.
  const highlightGeom = useMemo(() => {
    if (!hovered) return null;
    const pts: number[] = [];
    for (const [s, t] of edgePairs) {
      if (s !== hovered.id && t !== hovered.id) continue;
      const a = posById.get(s);
      const b = posById.get(t);
      if (!a || !b) continue;
      pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
    return g;
  }, [hovered, edgePairs, posById]);

  // Gentle auto-rotation for the "galaxy" feel; pauses while inspecting a node.
  useFrame((_, delta) => {
    if (groupRef.current && !hovered) groupRef.current.rotation.y += delta * 0.04;
  });

  return (
    <group ref={groupRef}>
      <lineSegments geometry={lineGeom}>
        <lineBasicMaterial
          color="#56D4C8"
          transparent
          opacity={hovered ? 0.04 : 0.12}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </lineSegments>

      {highlightGeom && (
        <lineSegments geometry={highlightGeom}>
          <lineBasicMaterial
            color="#8CE8DD"
            transparent
            opacity={0.7}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </lineSegments>
      )}

      <Instances limit={nodes.length} range={nodes.length}>
        <sphereGeometry args={[1, 12, 12]} />
        <meshStandardMaterial
          roughness={0.35}
          metalness={0.1}
          emissiveIntensity={0.55}
          toneMapped={false}
        />
        {nodes.map((n) => {
          const isHovered = hovered?.id === n.id;
          const c = new THREE.Color(n.color);
          if (isHovered) c.multiplyScalar(1.9);
          return (
            <Instance
              key={n.id}
              position={[n.x, n.y, n.z]}
              scale={isHovered ? n.radius * 1.8 : n.radius}
              color={c}
              onPointerOver={(e) => {
                e.stopPropagation();
                onHover(n);
              }}
              onPointerOut={() => onHover(null)}
            />
          );
        })}
      </Instances>

      {hubs.map((n) => (
        hovered?.id === n.id ? null : <NodeLabel key={`hub-${n.id}`} node={n} />
      ))}
      {hovered && <NodeLabel node={hovered} primary />}
    </group>
  );
}

export function TopologyGraph() {
  const [loading, setLoading] = useState(true);
  const [nodes, setNodes] = useState<PositionedNode[]>([]);
  const [linePositions, setLinePositions] = useState<Float32Array>(new Float32Array(0));
  const [edgePairs, setEdgePairs] = useState<[number, number][]>([]);
  const [edgeCount, setEdgeCount] = useState(0);
  const [hovered, setHovered] = useState<PositionedNode | null>(null);

  useEffect(() => {
    let cancelled = false;
    const apiUrl = getApiUrl();

    async function run() {
      try {
        const res = await fetch(`${apiUrl}/api/network/topology`);
        if (!res.ok) { if (!cancelled) setLoading(false); return; }
        const data = await res.json();
        if (!data.nodes?.length) { if (!cancelled) setLoading(false); return; }

        const simNodes: SimNode[] = (data.nodes as ApiNode[]).map((n) => ({
          id: n.id,
          client: n.client,
          isTor: n.isTor,
          countryCode: n.countryCode,
          betweenness: n.betweenness,
          degree: n.degree,
        }));

        const idSet = new Set(simNodes.map((n) => n.id));
        const links = (data.edges as ApiEdge[])
          .filter((e) => idSet.has(e.source) && idSet.has(e.target))
          .map((e) => ({ source: e.source, target: e.target }));

        // Run a 3D force layout to a settled state, then render statically.
        const sim: Simulation<SimNode> = forceSimulation<SimNode>(simNodes, 3)
          .force('link', forceLink<SimNode, { source: number; target: number }>(links)
            .id((d: SimNode) => d.id)
            .distance(18)
            .strength(0.35))
          .force('charge', forceManyBody<SimNode>().strength(-24).distanceMax(220))
          .force('center', forceCenter<SimNode>(0, 0, 0))
          .force('x', forceX<SimNode>(0).strength(0.045))
          .force('y', forceY<SimNode>(0).strength(0.045))
          .force('z', forceZ<SimNode>(0).strength(0.045))
          .stop();

        const iterations = 320;
        for (let i = 0; i < iterations; i++) sim.tick();

        const maxDegree = Math.max(1, ...simNodes.map((n) => n.degree || 0));
        const positioned: PositionedNode[] = simNodes.map((n) => ({
          ...n,
          x: n.x ?? 0,
          y: n.y ?? 0,
          z: n.z ?? 0,
          radius: 0.7 + Math.sqrt((n.degree || 0) / maxDegree) * 2.6,
          color: nodeColor(n),
        }));

        const posById = new Map(positioned.map((n) => [n.id, n]));
        const linePos = new Float32Array(links.length * 6);
        const pairs: [number, number][] = [];
        let li = 0;
        for (const link of links) {
          const s = posById.get(link.source);
          const t = posById.get(link.target);
          if (!s || !t) continue;
          linePos[li++] = s.x; linePos[li++] = s.y; linePos[li++] = s.z;
          linePos[li++] = t.x; linePos[li++] = t.y; linePos[li++] = t.z;
          pairs.push([link.source, link.target]);
        }

        if (!cancelled) {
          setNodes(positioned);
          setLinePositions(linePos.subarray(0, li));
          setEdgePairs(pairs);
          setEdgeCount(links.length);
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to fetch topology:', err);
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-mono text-secondary uppercase tracking-wider">
          Network Topology
        </h3>
        {!loading && nodes.length > 0 && (
          <span className="text-[10px] text-muted font-mono">
            {nodes.length} nodes · {edgeCount} edges · drag to rotate
          </span>
        )}
      </div>

      <div className="relative w-full h-[460px] rounded-lg border border-cipher-border overflow-hidden bg-[radial-gradient(ellipse_at_center,#0b1220_0%,#060910_70%,#04060c_100%)]">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <span className="text-sm text-muted animate-pulse font-mono">Computing layout…</span>
          </div>
        ) : nodes.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <span className="text-sm text-muted">No topology data available yet.</span>
          </div>
        ) : (
          <Canvas
            camera={{ position: [0, 0, 190], fov: 55, near: 0.1, far: 2000 }}
            dpr={[1, 2]}
            gl={{ antialias: true, alpha: true }}
          >
            <ambientLight intensity={0.6} />
            <pointLight position={[100, 100, 100]} intensity={1.2} />
            <pointLight position={[-100, -80, -60]} intensity={0.5} color="#5B9CF6" />
            <Scene
              nodes={nodes}
              linePositions={linePositions}
              edgePairs={edgePairs}
              hovered={hovered}
              onHover={setHovered}
            />
            <OrbitControls
              enablePan={false}
              enableDamping
              dampingFactor={0.08}
              rotateSpeed={0.6}
              minDistance={70}
              maxDistance={520}
            />
          </Canvas>
        )}

        {hovered && (
          <div className="absolute bottom-3 left-3 bg-cipher-card/95 border border-cipher-border rounded-md px-3 py-2 backdrop-blur-sm pointer-events-none z-10">
            <div className="text-xs font-mono text-primary">
              {hovered.client === 'Unidentified' ? 'Unidentified' : hovered.client}
              {hovered.isTor ? ' · Tor' : ''}
              {hovered.countryCode ? ` · ${hovered.countryCode}` : ''}
            </div>
            <div className="text-[10px] text-muted font-mono mt-0.5">
              Peers: {hovered.degree ?? '—'} · Betweenness: {hovered.betweenness != null ? hovered.betweenness.toFixed(4) : '—'}
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mt-3 text-[10px] font-mono text-muted">
        {Object.entries(CLIENT_COLORS).filter(([k]) => k !== 'Other').map(([name, color]) => (
          <span key={name} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            {name}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: TOR_COLOR }} />
          Tor
        </span>
        <span className="ml-auto text-[10px] text-muted/70">Node size ∝ peer count</span>
      </div>
    </div>
  );
}
