'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
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
import { clientColor as sharedClientColor, clientLabel as sharedClientLabel, CLIENT_COLORS } from '@/lib/network-colors';

interface ApiNode {
  id: number;
  client: string | null;
  reachable: boolean;
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
  client: string | null;
  reachable: boolean;
  isTor: boolean;
  countryCode: string | null;
  betweenness: number | null;
  closeness: number | null;
  degree: number | null;
}

interface PositionedNode extends SimNode {
  x: number;
  y: number;
  z: number;
  radius: number;
  color: string;
}

const TOR_COLOR = '#A855F7';
// Known-but-unreachable ("off") nodes: lighter slate so they're visible against
// the dark background while still clearly secondary to the reachable core.
const OFF_COLOR = '#6B7FA0';

function nodeColor(n: { client: string | null; isTor: boolean; reachable: boolean }) {
  if (!n.reachable) return OFF_COLOR;
  if (n.isTor) return TOR_COLOR;
  return sharedClientColor(n.client);
}

function clientLabel(client: string | null, reachable = true) {
  if (!reachable) return 'Off (unreachable)';
  return sharedClientLabel(client);
}

function nodeCategory(n: { client: string | null; isTor: boolean; reachable: boolean }): string {
  if (!n.reachable) return 'off';
  if (n.isTor) return 'Tor';
  const c = n.client || '';
  if (c in CLIENT_COLORS) return c;
  return 'Unidentified';
}

function countryFlag(code: string | null): string {
  if (!code || code.length !== 2) return '';
  const codePoints = [...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65);
  return String.fromCodePoint(...codePoints);
}

/** Small, fixed-size label that tracks a 3D point (no distance scaling). */
function HubLabel({ node }: { node: PositionedNode }) {
  return (
    <Html
      position={[node.x, node.y + node.radius + 0.8, node.z]}
      center
      zIndexRange={[15, 0]}
      style={{ pointerEvents: 'none' }}
    >
      <div className="whitespace-nowrap rounded bg-cipher-card/70 border border-cipher-border/50 px-1 py-0.5 font-mono text-[9px] leading-none text-secondary/90">
        {clientLabel(node.client, node.reachable)}{node.countryCode ? ` · ${countryFlag(node.countryCode)} ${node.countryCode}` : ''}
      </div>
    </Html>
  );
}

function Scene({
  nodes,
  edgePairs,
  focus,
  pinned,
  hubs,
  hidden,
  onHover,
  onPin,
}: {
  nodes: PositionedNode[];
  edgePairs: [number, number][];
  focus: PositionedNode | null;
  pinned: PositionedNode | null;
  hubs: PositionedNode[];
  hidden: Set<string>;
  onHover: (n: PositionedNode | null) => void;
  onPin: (n: PositionedNode | null) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const { camera, controls } = useThree() as unknown as {
    camera: THREE.PerspectiveCamera;
    controls: { target: THREE.Vector3; update: () => void } | null;
  };

  const flyRef = useRef<{ pos: THREE.Vector3; dir: THREE.Vector3; active: boolean } | null>(null);

  const posById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const isVisible = useCallback((n: PositionedNode) => !hidden.has(nodeCategory(n)), [hidden]);

  const visibleNodes = useMemo(() => nodes.filter(isVisible), [nodes, isVisible]);
  const reachableVisible = useMemo(() => visibleNodes.filter((n) => n.reachable), [visibleNodes]);
  const offVisible = useMemo(() => visibleNodes.filter((n) => !n.reachable), [visibleNodes]);

  // Edges: only drawn between currently-visible nodes.
  const lineGeom = useMemo(() => {
    const pts: number[] = [];
    for (const [s, t] of edgePairs) {
      const a = posById.get(s);
      const b = posById.get(t);
      if (!a || !b) continue;
      if (!isVisible(a) || !isVisible(b)) continue;
      pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
    return g;
  }, [edgePairs, posById, isVisible]);

  const highlightGeom = useMemo(() => {
    if (!focus) return null;
    const pts: number[] = [];
    for (const [s, t] of edgePairs) {
      if (s !== focus.id && t !== focus.id) continue;
      const a = posById.get(s);
      const b = posById.get(t);
      if (!a || !b) continue;
      if (!isVisible(a) || !isVisible(b)) continue;
      pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
    return g;
  }, [focus, edgePairs, posById, isVisible]);

  // When a node is pinned, glide the camera to frame it.
  useEffect(() => {
    if (!pinned || !groupRef.current) return;
    const world = new THREE.Vector3(pinned.x, pinned.y, pinned.z);
    groupRef.current.localToWorld(world);
    const dir = camera.position.clone().sub(world).normalize();
    flyRef.current = { pos: world, dir, active: true };
  }, [pinned, camera]);

  useFrame((_, delta) => {
    // Auto-rotate only when nothing is being inspected.
    if (groupRef.current && !focus) groupRef.current.rotation.y += delta * 0.04;

    // Smooth camera fly-to on pin.
    const fly = flyRef.current;
    if (fly?.active && controls) {
      controls.target.lerp(fly.pos, 0.12);
      const desired = fly.pos.clone().add(fly.dir.clone().multiplyScalar(42));
      camera.position.lerp(desired, 0.12);
      controls.update();
      if (camera.position.distanceTo(desired) < 1.2) fly.active = false;
    }
  });

  return (
    <group ref={groupRef}>
      <lineSegments geometry={lineGeom}>
        <lineBasicMaterial
          color="#56D4C8"
          transparent
          opacity={focus ? 0.05 : 0.2}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </lineSegments>

      {highlightGeom && (
        <lineSegments geometry={highlightGeom}>
          <lineBasicMaterial
            color="#8CE8DD"
            transparent
            opacity={0.75}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </lineSegments>
      )}

      {/* Reachable core — bright, emissive spheres. */}
      {reachableVisible.length > 0 && (
        <Instances limit={reachableVisible.length} range={reachableVisible.length}>
          <sphereGeometry args={[1, 12, 12]} />
          <meshStandardMaterial roughness={0.35} metalness={0.1} emissiveIntensity={0.55} toneMapped={false} />
          {reachableVisible.map((n) => {
            const isFocus = focus?.id === n.id;
            const c = new THREE.Color(n.color);
            if (isFocus) c.multiplyScalar(1.9);
            return (
              <Instance
                key={n.id}
                position={[n.x, n.y, n.z]}
                scale={isFocus ? n.radius * 1.9 : n.radius}
                color={c}
                onPointerOver={(e) => { e.stopPropagation(); onHover(n); }}
                onPointerOut={() => onHover(null)}
                onClick={(e) => { e.stopPropagation(); onPin(n); }}
              />
            );
          })}
        </Instances>
      )}

      {/* Known-but-unreachable ("off") nodes — dim, semi-transparent, matte. */}
      {offVisible.length > 0 && (
        <Instances limit={offVisible.length} range={offVisible.length}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshStandardMaterial roughness={0.7} metalness={0} transparent opacity={0.65} toneMapped={false} />
          {offVisible.map((n) => {
            const isFocus = focus?.id === n.id;
            const c = new THREE.Color(n.color);
            if (isFocus) c.multiplyScalar(2.2);
            return (
              <Instance
                key={n.id}
                position={[n.x, n.y, n.z]}
                scale={isFocus ? n.radius * 2.2 : n.radius}
                color={c}
                onPointerOver={(e) => { e.stopPropagation(); onHover(n); }}
                onPointerOut={() => onHover(null)}
                onClick={(e) => { e.stopPropagation(); onPin(n); }}
              />
            );
          })}
        </Instances>
      )}

      {hubs.filter((n) => isVisible(n)).map((n) => (pinned?.id === n.id ? null : <HubLabel key={`hub-${n.id}`} node={n} />))}
    </group>
  );
}

export function TopologyGraph() {
  const [loading, setLoading] = useState(true);
  const [nodes, setNodes] = useState<PositionedNode[]>([]);
  const [edgePairs, setEdgePairs] = useState<[number, number][]>([]);
  const [edgeCount, setEdgeCount] = useState(0);
  const [counts, setCounts] = useState<{ total: number; reachable: number; off: number; edges: number } | null>(null);
  const [hovered, setHovered] = useState<PositionedNode | null>(null);
  const [pinned, setPinned] = useState<PositionedNode | null>(null);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const toggleCategory = (cat: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });

  // Ignore focus on a node that the current filters have hidden.
  const rawFocus = pinned ?? hovered;
  const focus = rawFocus && !hidden.has(nodeCategory(rawFocus)) ? rawFocus : null;

  const hubs = useMemo(
    () => nodes.filter((n) => n.reachable).sort((a, b) => (b.degree || 0) - (a.degree || 0)).slice(0, 6),
    [nodes]
  );

  // Search over the most-connected reachable nodes (pseudonymous — match by client/country).
  const searchResults = useMemo(() => {
    const top = nodes.filter((n) => n.reachable).sort((a, b) => (b.degree || 0) - (a.degree || 0)).slice(0, 60);
    const q = query.trim().toLowerCase();
    const filtered = q
      ? top.filter((n) =>
          clientLabel(n.client).toLowerCase().includes(q) ||
          (n.countryCode || '').toLowerCase().includes(q))
      : top;
    return filtered.slice(0, 8);
  }, [nodes, query]);

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
          reachable: n.reachable,
          isTor: n.isTor,
          countryCode: n.countryCode,
          betweenness: n.betweenness,
          closeness: n.closeness,
          degree: n.degree,
        }));

        const maxDegree = Math.max(1, ...simNodes.map((n) => n.degree || 0));

        const idSet = new Set(simNodes.map((n) => n.id));
        const links = (data.edges as ApiEdge[])
          .filter((e) => idSet.has(e.source) && idSet.has(e.target))
          .map((e) => ({ source: e.source, target: e.target }));

        // Degree-weighted pull toward the origin: well-connected hubs are drawn to
        // the center ("core"), while low-degree / off nodes drift to the periphery.
        // This makes spatial position match the visual size (peer count).
        const centerPull = (n: SimNode) =>
          0.015 + 0.16 * Math.pow((n.degree || 0) / maxDegree, 1.4);

        const sim: Simulation<SimNode> = forceSimulation<SimNode>(simNodes, 3)
          .force('link', forceLink<SimNode, { source: number; target: number }>(links)
            .id((d: SimNode) => d.id)
            .distance(18)
            .strength(0.35))
          .force('charge', forceManyBody<SimNode>().strength(-18).distanceMax(220))
          .force('center', forceCenter<SimNode>(0, 0, 0))
          .force('x', forceX<SimNode>(0).strength(centerPull))
          .force('y', forceY<SimNode>(0).strength(centerPull))
          .force('z', forceZ<SimNode>(0).strength(centerPull))
          .stop();

        for (let i = 0; i < 320; i++) sim.tick();

        const positioned: PositionedNode[] = simNodes.map((n) => {
          // Reachable nodes scale with peer count; off nodes stay small (background).
          const base = 0.4 + Math.pow((n.degree || 0) / maxDegree, 0.4) * 4.2;
          return {
            ...n,
            x: n.x ?? 0,
            y: n.y ?? 0,
            z: n.z ?? 0,
            radius: n.reachable ? base : Math.min(base * 0.6, 0.7),
            color: nodeColor(n),
          };
        });

        // After force simulation, d3 mutates link source/target into node objects.
        // Extract the numeric IDs back for the Scene's geometry builder.
        const pairs: [number, number][] = links.map((l) => [
          typeof l.source === 'object' ? (l.source as SimNode).id : l.source,
          typeof l.target === 'object' ? (l.target as SimNode).id : l.target,
        ]);

        if (!cancelled) {
          setNodes(positioned);
          setEdgePairs(pairs);
          setEdgeCount(links.length);
          setCounts(data.counts ?? null);
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
        <h3 className="text-sm font-mono text-secondary uppercase tracking-wider">Network Topology</h3>
        {!loading && nodes.length > 0 && (
          <span className="text-[10px] text-muted font-mono">
            {counts ? `${counts.reachable} reachable · ${counts.off} off` : `${nodes.length} nodes`} · {edgeCount} links · drag to rotate · click to pin
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
          <>
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
                edgePairs={edgePairs}
                focus={focus}
                pinned={pinned}
                hubs={hubs}
                hidden={hidden}
                onHover={setHovered}
                onPin={(n) => setPinned((prev) => (prev?.id === n?.id ? null : n))}
              />
              <OrbitControls
                makeDefault
                enablePan={false}
                enableDamping
                dampingFactor={0.08}
                rotateSpeed={0.6}
                minDistance={40}
                maxDistance={520}
              />
            </Canvas>

            {/* Counts badge */}
            {counts && (
              <div className="absolute top-3 right-3 z-20 rounded-md bg-cipher-card/80 border border-cipher-border px-2.5 py-1 text-[10px] font-mono text-muted backdrop-blur-sm">
                {counts.reachable} reachable · {counts.off} off · {counts.edges} links
              </div>
            )}

            {/* Search */}
            <div className="absolute top-3 left-3 z-20 w-52">
              <input
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSearchOpen(true); }}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
                placeholder="Find a hub (client / country)…"
                className="w-full rounded-md bg-cipher-card/90 border border-cipher-border px-2.5 py-1.5 text-[11px] font-mono text-primary placeholder:text-muted/70 backdrop-blur-sm focus:outline-none focus:border-cipher-cyan/50"
              />
              {searchOpen && searchResults.length > 0 && (
                <div className="mt-1 rounded-md bg-cipher-card/95 border border-cipher-border backdrop-blur-sm overflow-hidden">
                  {searchResults.map((n) => (
                    <button
                      key={n.id}
                      onMouseDown={(e) => { e.preventDefault(); setPinned(n); setSearchOpen(false); }}
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] font-mono hover:bg-cipher-bg/60 transition-colors"
                    >
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: nodeColor(n) }} />
                      <span className="text-secondary">{clientLabel(n.client)}</span>
                      <span className="text-muted">{n.countryCode ? `${countryFlag(n.countryCode)} ${n.countryCode}` : '—'}</span>
                      <span className="ml-auto text-primary">{n.degree ?? 0}p</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Detail panel (fixed size, single source of truth) */}
            {focus && (
              <div className="absolute bottom-3 right-3 z-20 w-52 rounded-md bg-cipher-card/95 border border-cipher-border px-3 py-2.5 backdrop-blur-sm">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: nodeColor(focus) }} />
                  <span className="text-xs font-mono text-primary">
                    {clientLabel(focus.client, focus.reachable)}{focus.reachable && focus.isTor ? ' · Tor' : ''}
                  </span>
                  {pinned && (
                    <button
                      onClick={() => setPinned(null)}
                      className="ml-auto text-muted hover:text-primary text-xs leading-none"
                      aria-label="Unpin node"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <dl className="mt-2 space-y-1 text-[10px] font-mono">
                  <Row label="Status" value={focus.reachable ? 'Reachable' : 'Known / unreachable'} />
                  <Row label="Country" value={focus.countryCode ? `${countryFlag(focus.countryCode)} ${focus.countryCode}` : 'Unknown'} />
                  <Row label={focus.reachable ? 'Peers' : 'Gossiped by'} value={focus.degree != null ? String(focus.degree) : '—'} />
                  <Row label="Betweenness" value={focus.betweenness != null ? focus.betweenness.toFixed(4) : '—'} />
                  <Row label="Closeness" value={focus.closeness != null ? focus.closeness.toFixed(4) : '—'} />
                </dl>
                {!pinned && <div className="mt-2 text-[9px] text-muted/70">Click node to pin</div>}
              </div>
            )}
          </>
        )}
      </div>

      {/* Legend (clickable filters) */}
      <div className="flex flex-wrap items-center gap-3 mt-3 text-[10px] font-mono text-muted">
        {Object.entries(CLIENT_COLORS).filter(([k]) => k !== 'Other' && k !== 'Unknown').map(([name, color]) => (
          <button
            key={name}
            onClick={() => toggleCategory(name)}
            className={`flex items-center gap-1.5 transition-opacity ${hidden.has(name) ? 'opacity-30 line-through' : 'opacity-100 hover:opacity-80'}`}
          >
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            {name}
          </button>
        ))}
        <button
          onClick={() => toggleCategory('Tor')}
          className={`flex items-center gap-1.5 transition-opacity ${hidden.has('Tor') ? 'opacity-30 line-through' : 'opacity-100 hover:opacity-80'}`}
        >
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: TOR_COLOR }} />
          Tor
        </button>
        <button
          onClick={() => toggleCategory('off')}
          className={`flex items-center gap-1.5 transition-opacity ${hidden.has('off') ? 'opacity-30 line-through' : 'opacity-100 hover:opacity-80'}`}
        >
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: OFF_COLOR }} />
          Known / unreachable
        </button>
        <span className="ml-auto text-[10px] text-muted/70">click to filter · size ∝ peer count</span>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-primary tabular-nums">{value}</dd>
    </div>
  );
}
