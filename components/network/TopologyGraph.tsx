'use client';

import { readApiData } from '@/lib/api-client';
import { ChartWatermark } from '@/components/ChartWatermark';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Instances, Instance } from '@react-three/drei';
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
import { useTheme } from '@/contexts/ThemeContext';
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

const TOR_COLOR = '#B6A0E0';
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
  const c = n.client || 'Unknown';
  if (c === 'Unknown') return 'Unidentified';
  return c in CLIENT_COLORS ? c : 'Other';
}

function Scene({
  nodes,
  edgePairs,
  focus,
  pinned,
  hidden,
  onHover,
  onPin,
  palette,
  rotating,
  resetKey,
}: {
  nodes: PositionedNode[];
  edgePairs: [number, number][];
  focus: PositionedNode | null;
  pinned: PositionedNode | null;
  hidden: Set<string>;
  palette: { edge: string; selected: string; tor: string; off: string };
  rotating: boolean;
  resetKey: number;
  onHover: (n: PositionedNode | null) => void;
  onPin: (n: PositionedNode | null) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const { camera, controls, invalidate, size } = useThree() as unknown as {
    camera: THREE.PerspectiveCamera;
    invalidate: () => void;
    size: { width: number; height: number };
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

  // Fit the complete observed graph on initial load, resize or explicit reset.
  useEffect(() => {
    if (!nodes.length || !controls || !groupRef.current || size.width <= 0 || size.height <= 0) return;
    flyRef.current = null;
    groupRef.current.rotation.set(0, 0, 0);
    const bounds = new THREE.Box3();
    nodes.forEach(node => {
      bounds.expandByPoint(new THREE.Vector3(node.x - node.radius, node.y - node.radius, node.z - node.radius));
      bounds.expandByPoint(new THREE.Vector3(node.x + node.radius, node.y + node.radius, node.z + node.radius));
    });
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * size.width / Math.max(1, size.height));
    const distance = sphere.radius / Math.sin(Math.min(verticalFov, horizontalFov) / 2) * 1.06;
    controls.target.copy(sphere.center);
    camera.position.copy(sphere.center).add(new THREE.Vector3(0, 0, Math.max(40, distance)));
    camera.updateProjectionMatrix();
    controls.update();
    invalidate();
  }, [nodes, controls, camera, invalidate, size.width, size.height, resetKey]);
  useEffect(() => () => lineGeom.dispose(), [lineGeom]);
  useEffect(() => () => highlightGeom?.dispose(), [highlightGeom]);

  // When a node is pinned, glide the camera to frame it.
  useEffect(() => {
    if (!pinned || !groupRef.current) return;
    const world = new THREE.Vector3(pinned.x, pinned.y, pinned.z);
    groupRef.current.localToWorld(world);
    const dir = camera.position.clone().sub(world).normalize();
    flyRef.current = { pos: world, dir, active: true };
    invalidate();
  }, [pinned, camera, invalidate]);

  useFrame((_, delta) => {
    // Auto-rotate only when nothing is being inspected.
    if (groupRef.current && rotating && !focus) groupRef.current.rotation.y += delta * 0.04;

    // Smooth camera fly-to on pin.
    const fly = flyRef.current;
    if (fly?.active && controls) {
      controls.target.lerp(fly.pos, 0.12);
      const desired = fly.pos.clone().add(fly.dir.clone().multiplyScalar(42));
      camera.position.lerp(desired, 0.12);
      controls.update();
      if (camera.position.distanceTo(desired) < 1.2) fly.active = false;
      else invalidate();
    }
  });

  return (
    <group ref={groupRef}>
      <lineSegments geometry={lineGeom}>
        <lineBasicMaterial
          color={palette.edge}
          transparent
          opacity={focus ? 0.045 : 0.16}
          blending={THREE.NormalBlending}
          depthWrite={false}
        />
      </lineSegments>

      {highlightGeom && (
        <lineSegments geometry={highlightGeom}>
          <lineBasicMaterial
            color={palette.selected}
            transparent
            opacity={0.75}
            blending={THREE.NormalBlending}
            depthWrite={false}
          />
        </lineSegments>
      )}

      {/* Reachable nodes retain the shared client colors without lighting effects. */}
      {reachableVisible.length > 0 && (
        <Instances limit={reachableVisible.length} range={reachableVisible.length}>
          <sphereGeometry args={[1, 12, 12]} />
          <meshBasicMaterial toneMapped={false} />
          {reachableVisible.map((n) => {
            const isFocus = focus?.id === n.id;
            const c = new THREE.Color(isFocus ? palette.selected : n.isTor ? palette.tor : n.color);
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
          <meshBasicMaterial transparent opacity={0.6} toneMapped={false} />
          {offVisible.map((n) => {
            const isFocus = focus?.id === n.id;
            const c = new THREE.Color(isFocus ? palette.selected : palette.off);
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

    </group>
  );
}

export function TopologyGraph({ active = true }: { active?: boolean }) {
  const { theme } = useTheme();
  const [rotating, setRotating] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [palette, setPalette] = useState({ edge: CLIENT_COLORS.zcashd, selected: CLIENT_COLORS.Zebra, tor: TOR_COLOR, off: OFF_COLOR });
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const styles = getComputedStyle(document.documentElement);
      const rgb = (token: string) => `rgb(${styles.getPropertyValue(token).trim().split(/\s+/).join(',')})`;
      setPalette({ edge: styles.getPropertyValue('--color-text-muted').trim(), selected: rgb('--color-gold-rgb'), tor: rgb('--color-purple-rgb'), off: styles.getPropertyValue('--color-text-muted').trim() });
    });
    return () => cancelAnimationFrame(frame);
  }, [theme]);
  const [loading, setLoading] = useState(true);
  const [nodes, setNodes] = useState<PositionedNode[]>([]);
  const [edgePairs, setEdgePairs] = useState<[number, number][]>([]);
  const [edgeCount, setEdgeCount] = useState(0);
  const [counts, setCounts] = useState<{ total: number; reachable: number; off: number; edges: number } | null>(null);
  const [hovered, setHovered] = useState<PositionedNode | null>(null);
  const [pinned, setPinned] = useState<PositionedNode | null>(null);
  const [query, setQuery] = useState('');
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

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    return nodes.filter(node => !hidden.has(nodeCategory(node)) && (q
      ? `${clientLabel(node.client)} ${node.countryCode || ''} #${node.id}`.toLowerCase().includes(q)
      : node.reachable))
      .sort((a, b) => (b.degree || 0) - (a.degree || 0)).slice(0, 6);
  }, [nodes, query, hidden]);
  const selectNode = (node: PositionedNode) => {
    setPinned(node); setHovered(null); setQuery(''); setRotating(false);
  };
  const resetView = () => {
    setPinned(null); setHovered(null); setQuery(''); setRotating(false); setResetKey(value => value + 1);
  };

  useEffect(() => {
    let cancelled = false;
    const apiUrl = getApiUrl();

    async function run() {
      try {
        const res = await fetch(`${apiUrl}/v1/network/topology`);
        if (!res.ok) { if (!cancelled) setLoading(false); return; }
        const data = await readApiData(res);
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
    <div>
      <div className="border border-cipher-border rounded-lg overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-cipher-border">
          <p className="text-caption text-muted font-mono">{loading ? 'Loading graph observations…' : `${counts?.reachable ?? nodes.filter(node => node.reachable).length} reachable · ${counts?.off ?? nodes.filter(node => !node.reachable).length} unverified · ${edgeCount.toLocaleString()} links`}</p>
          <div className="flex gap-2">
            <button type="button" onClick={resetView} disabled={!nodes.length} className="px-3 py-2 rounded border border-cipher-border text-caption font-mono text-secondary hover:text-primary disabled:opacity-50">Reset view</button>
            <button type="button" aria-pressed={rotating} disabled={!nodes.length} onClick={() => setRotating(value => !value)} className="px-3 py-2 rounded border border-cipher-border text-caption font-mono text-secondary hover:text-primary disabled:opacity-50">{rotating ? 'Pause rotation' : 'Rotate view'}</button>
          </div>
        </div>
        <div className="grid lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="relative min-w-0 h-[360px] sm:h-[500px] bg-cipher-bg" aria-label="Interactive 3D graph of observed peer advertisements">
            {loading ? <div className="absolute inset-0 flex items-center justify-center"><span className="text-sm text-muted font-mono">Computing layout…</span></div>
              : nodes.length === 0 ? <div className="absolute inset-0 flex items-center justify-center"><span className="text-sm text-muted">No topology data available yet.</span></div>
              : <Canvas
                  frameloop={active ? rotating ? 'always' : 'demand' : 'never'}
                  camera={{ position: [0, 0, 190], fov: 55, near: 0.1, far: 2000 }}
                  dpr={[1, 1.5]} gl={{ antialias: true, alpha: true }}
                  onPointerMissed={() => { setPinned(null); setHovered(null); }}
                >
                  <Scene palette={palette} rotating={rotating && active} resetKey={resetKey} nodes={nodes} edgePairs={edgePairs} focus={focus} pinned={pinned} hidden={hidden} onHover={setHovered} onPin={node => { if (node) selectNode(node); }} />
                  <OrbitControls makeDefault enablePan={false} enableDamping dampingFactor={0.08} rotateSpeed={0.6} minDistance={15} maxDistance={1200} />
                </Canvas>}
            <ChartWatermark size="map" />
          </div>
          <aside className="border-t lg:border-t-0 lg:border-l border-cipher-border p-4 min-w-0" aria-label="Node inspector">
            <label htmlFor="topology-search" className="block type-label text-muted mb-2">Find a node</label>
            <input id="topology-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Client, country or #ID" className="w-full min-w-0 rounded border border-cipher-border bg-cipher-bg px-3 py-2.5 text-caption font-mono text-primary placeholder:text-muted focus-visible:outline-cipher-gold" />
            <p className="text-caption text-muted mt-2">IDs refer to this graph snapshot.</p>
            {focus && !query.trim() ? <div className="mt-5">
              <div className="flex items-center justify-between gap-3 mb-4"><h3 className="font-mono text-sm text-primary">Node #{focus.id}</h3>{pinned && <button onClick={() => setPinned(null)} className="text-caption text-muted hover:text-primary underline underline-offset-4">Clear</button>}</div>
              <dl className="space-y-3 text-caption">
                <Row label="Client" value={sharedClientLabel(focus.client)} />
                <Row label="Status" value={focus.reachable ? 'Reachable' : 'Unverified'} />
                <Row label="Country" value={focus.countryCode || 'Unknown'} />
                <Row label="Tor" value={focus.isTor ? 'Yes' : 'No'} />
                <Row label="Degree" value={focus.degree != null ? String(focus.degree) : '—'} />
                <Row label="Betweenness" value={focus.betweenness != null ? focus.betweenness.toFixed(4) : '—'} />
                <Row label="Closeness" value={focus.closeness != null ? focus.closeness.toFixed(4) : '—'} />
              </dl>
              <p className="text-caption text-muted mt-5">{pinned ? 'Highlighted lines are advertisements involving this node.' : 'Click the node to keep these details open.'}</p>
            </div> : <div className="mt-5">
              <p className="text-caption text-muted mb-2">{query.trim() ? 'Matching nodes · highest degree first' : 'Inspect a hub · highest degree first'}</p>
              <div className="divide-y divide-cipher-border">
                {searchResults.map(node => <button key={node.id} onClick={() => selectNode(node)} className="w-full flex items-center gap-2 py-3 text-left text-caption hover:bg-cipher-bg">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: !node.reachable ? palette.off : node.isTor ? palette.tor : nodeColor(node) }} />
                  <span className="min-w-0"><span className="block text-secondary">{clientLabel(node.client, node.reachable)}</span><span className="text-muted font-mono">#{node.id} · {node.countryCode || 'Unknown'}</span></span>
                  <span className="ml-auto font-mono text-muted tabular-nums">{node.degree ?? '—'}</span>
                </button>)}
                {!loading && !searchResults.length && <p className="text-caption text-muted py-4">No matching nodes in the visible categories.</p>}
              </div>
            </div>}
          </aside>
        </div>
      </div>

      {/* Legend (clickable filters) */}
      <div className="flex flex-wrap items-center gap-3 mt-3 text-caption font-mono text-muted">
        {Object.entries(CLIENT_COLORS).filter(([k]) => k !== 'Unknown').map(([name, color]) => (
          <button
            key={name}
            aria-pressed={!hidden.has(name)}
            onClick={() => toggleCategory(name)}
            className={`flex items-center gap-1.5 transition-opacity ${hidden.has(name) ? 'opacity-30 line-through' : 'opacity-100 hover:opacity-80'}`}
          >
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            {name}
          </button>
        ))}
        <button
          aria-pressed={!hidden.has('Tor')}
          onClick={() => toggleCategory('Tor')}
          className={`flex items-center gap-1.5 transition-opacity ${hidden.has('Tor') ? 'opacity-30 line-through' : 'opacity-100 hover:opacity-80'}`}
        >
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: palette.tor }} />
          Tor
        </button>
        <button
          aria-pressed={!hidden.has('off')}
          onClick={() => toggleCategory('off')}
          className={`flex items-center gap-1.5 transition-opacity ${hidden.has('off') ? 'opacity-30 line-through' : 'opacity-100 hover:opacity-80'}`}
        >
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: palette.off }} />
          Unverified
        </button>

      </div>
      <p className="text-caption text-muted mt-3">Drag to orbit · scroll to zoom · select a node to inspect. Node size encodes degree; unverified nodes are shown smaller.</p>
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
