'use client';

/**
 * TurnstileScene — the 3D centerpiece of the Ironwood migration dashboard.
 *
 * A physical metaphor for ZIP-318: value (particles) flows from the Orchard pool
 * (violet, left) through a glass turnstile gate into the Ironwood pool (gold, right).
 *
 * - Pre-activation: particles swirl in the Orchard pool behind a locked gate.
 * - Activated: the gate opens and particles stream across in a continuous flow;
 *   pool "levels" reflect the migrated fraction.
 *
 * Rendered only client-side (dynamic import, ssr:false) via TurnstileHero, which
 * also handles the reduced-motion / no-WebGL fallback. Numbers are drawn as DOM
 * overlay in the Hero, not in WebGL, so they stay crisp and accessible.
 */

import { useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const ORCHARD = new THREE.Color('#A78BFA');
const IRONWOOD = new THREE.Color('#F4B728');

const ORCHARD_X = -2.7;
const IRONWOOD_X = 2.7;
const POOL_Y = -0.9;

// Soft round particle sprite so points glow instead of rendering as squares.
function makeSprite(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface PoolParticle {
  radius: number;
  angle: number;
  speed: number;
  y: number;
  bob: number;
  bobPhase: number;
}

/** A swirling cloud of particles sitting in one of the pools. */
function PoolCloud({
  centerX,
  color,
  count,
  sprite,
  spin = 1,
}: {
  centerX: number;
  color: THREE.Color;
  count: number;
  sprite: THREE.Texture;
  spin?: number;
}) {
  const pointsRef = useRef<THREE.Points>(null);

  const { positions, params } = useMemo(() => {
    if (count === 0) return { positions: new Float32Array(0), params: [] as PoolParticle[] };
    const positions = new Float32Array(count * 3);
    const params: PoolParticle[] = [];
    for (let i = 0; i < count; i++) {
      const radius = 0.15 + Math.pow(Math.random(), 0.6) * 1.35;
      const angle = Math.random() * Math.PI * 2;
      params.push({
        radius,
        angle,
        speed: (0.12 + Math.random() * 0.35) * spin,
        y: POOL_Y + Math.random() * 0.5,
        bob: 0.04 + Math.random() * 0.12,
        bobPhase: Math.random() * Math.PI * 2,
      });
      positions[i * 3] = centerX + Math.cos(angle) * radius;
      positions[i * 3 + 1] = params[i].y;
      positions[i * 3 + 2] = Math.sin(angle) * radius;
    }
    return { positions, params };
  }, [count, centerX, spin]);

  useFrame((_, delta) => {
    const pts = pointsRef.current;
    if (!pts) return;
    const arr = pts.geometry.attributes.position.array as Float32Array;
    const t = performance.now() / 1000;
    const clamped = Math.min(delta, 0.05);
    for (let i = 0; i < params.length; i++) {
      const p = params[i];
      p.angle += p.speed * clamped;
      arr[i * 3] = centerX + Math.cos(p.angle) * p.radius;
      arr[i * 3 + 1] = p.y + Math.sin(t + p.bobPhase) * p.bob;
      arr[i * 3 + 2] = Math.sin(p.angle) * p.radius;
    }
    pts.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={sprite}
        color={color}
        size={0.14}
        sizeAttenuation
        transparent
        opacity={0.9}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

interface FlowParticle {
  t: number;
  speed: number;
  fromR: number;
  fromA: number;
  toR: number;
  toA: number;
  arc: number;
}

/** Particles crossing the gate Orchard → Ironwood (only when activated). */
function FlowStream({ count, sprite }: { count: number; sprite: THREE.Texture }) {
  const pointsRef = useRef<THREE.Points>(null);

  const { positions, colors, params } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const params: FlowParticle[] = [];
    for (let i = 0; i < count; i++) {
      params.push(makeFlow(Math.random()));
      positions[i * 3] = ORCHARD_X;
      positions[i * 3 + 1] = POOL_Y;
      positions[i * 3 + 2] = 0;
    }
    return { positions, colors, params };
  }, [count]);

  function makeFlow(t: number): FlowParticle {
    return {
      t,
      speed: 0.18 + Math.random() * 0.22,
      fromR: 0.1 + Math.random() * 1.1,
      fromA: Math.random() * Math.PI * 2,
      toR: 0.1 + Math.random() * 1.1,
      toA: Math.random() * Math.PI * 2,
      arc: 0.9 + Math.random() * 0.5,
    };
  }

  useFrame((_, delta) => {
    const pts = pointsRef.current;
    if (!pts) return;
    const pos = pts.geometry.attributes.position.array as Float32Array;
    const col = pts.geometry.attributes.color.array as Float32Array;
    const clamped = Math.min(delta, 0.05);
    for (let i = 0; i < params.length; i++) {
      const p = params[i];
      p.t += p.speed * clamped;
      if (p.t >= 1) Object.assign(p, makeFlow(0));
      const e = p.t;
      const fromX = ORCHARD_X + Math.cos(p.fromA) * p.fromR;
      const fromZ = Math.sin(p.fromA) * p.fromR;
      const toX = IRONWOOD_X + Math.cos(p.toA) * p.toR;
      const toZ = Math.sin(p.toA) * p.toR;
      // Pinch: particles funnel to a tight point at center (e=0.5)
      const spread = Math.pow(Math.abs(e - 0.5) * 2, 0.5);
      const rawZ = fromZ + (toZ - fromZ) * e;
      pos[i * 3] = fromX + (toX - fromX) * e;
      pos[i * 3 + 1] = POOL_Y + Math.sin(e * Math.PI) * p.arc;
      pos[i * 3 + 2] = rawZ * spread;
      // Blend violet → gold across the crossing.
      const r = ORCHARD.r + (IRONWOOD.r - ORCHARD.r) * e;
      const g = ORCHARD.g + (IRONWOOD.g - ORCHARD.g) * e;
      const b = ORCHARD.b + (IRONWOOD.b - ORCHARD.b) * e;
      col[i * 3] = r;
      col[i * 3 + 1] = g;
      col[i * 3 + 2] = b;
    }
    pts.geometry.attributes.position.needsUpdate = true;
    pts.geometry.attributes.color.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={sprite}
        vertexColors
        size={0.16}
        sizeAttenuation
        transparent
        opacity={0.95}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}


/** Basin rim discs under each pool for grounding. */
function Basins({ orchardScale, ironwoodScale, ironwoodEmpty, lightMode }: { orchardScale: number; ironwoodScale: number; ironwoodEmpty: boolean; lightMode?: boolean }) {
  return (
    <>
      <mesh position={[ORCHARD_X, POOL_Y - 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={orchardScale}>
        <ringGeometry args={[1.35, 1.6, 48]} />
        <meshBasicMaterial color={ORCHARD} transparent opacity={lightMode ? 0.6 : 0.35} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[IRONWOOD_X, POOL_Y - 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={ironwoodScale}>
        <ringGeometry args={[1.35, 1.6, 48]} />
        <meshBasicMaterial color={IRONWOOD} transparent opacity={ironwoodEmpty ? (lightMode ? 0.25 : 0.12) : (lightMode ? 0.6 : 0.35)} side={THREE.DoubleSide} />
      </mesh>
    </>
  );
}

function Rig({ pulseRef }: { pulseRef: React.MutableRefObject<number> }) {
  const { camera, pointer } = useThree();
  useFrame(() => {
    // Subtle mouse parallax + gentle idle drift.
    const t = performance.now() / 1000;
    const targetX = pointer.x * 0.6 + Math.sin(t * 0.15) * 0.15;
    const targetY = 1.4 + pointer.y * 0.3;
    camera.position.x += (targetX - camera.position.x) * 0.04;
    camera.position.y += (targetY - camera.position.y) * 0.04;
    camera.lookAt(0, -0.2, 0);
    // Decay the block-tick pulse.
    pulseRef.current *= 0.92;
  });
  return null;
}

export interface TurnstileSceneProps {
  lightMode?: boolean;
  activated: boolean;
  balanced: boolean;
  migratedPct: number; // 0..100
  /** Bumped by the parent whenever a new block arrives, to fire a ripple pulse. */
  blockPulseKey: number;
  /** When true the render loop is stopped (offscreen / tab hidden). */
  paused?: boolean;
}

export default function TurnstileScene({ activated, balanced, migratedPct, blockPulseKey, paused, lightMode }: TurnstileSceneProps) {
  const sprite = useMemo(() => makeSprite(), []);
  const pulseRef = useRef(0);
  const lastKey = useRef(blockPulseKey);

  if (blockPulseKey !== lastKey.current) {
    lastKey.current = blockPulseKey;
    pulseRef.current = 1.2;
  }

  const frac = Math.min(1, Math.max(0, migratedPct / 100));
  const orchardCount = activated ? Math.round(2200 * (1 - frac)) : 2200;
  const ironwoodCount = activated ? Math.round(2200 * frac) : 0;
  const orchardScale = activated ? 0.4 + (1 - frac) * 0.6 : 1;
  const ironwoodScale = activated ? 0.4 + frac * 0.6 : 0.4;

  return (
    <Canvas
      frameloop={paused ? 'never' : 'always'}
      camera={{ position: [0, 1.4, 7.2], fov: 46 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      style={{ background: 'transparent' }}
    >
      <ambientLight intensity={lightMode ? 1.2 : 0.4} />
      <Rig pulseRef={pulseRef} />
      <Basins orchardScale={orchardScale} ironwoodScale={ironwoodScale} ironwoodEmpty={ironwoodCount === 0} lightMode={lightMode} />
      <PoolCloud centerX={ORCHARD_X} color={ORCHARD} count={orchardCount} sprite={sprite} spin={1} />
      <PoolCloud centerX={IRONWOOD_X} color={IRONWOOD} count={ironwoodCount} sprite={sprite} spin={-0.8} />
      {activated && frac > 0 && frac < 1 && <FlowStream count={Math.round(120 + 400 * frac)} sprite={sprite} />}

    </Canvas>
  );
}
