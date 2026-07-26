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
 * - flowIntensity (0–1) modulates flow speed + count: 0 = no migration happening,
 *   1 = peak activity. Driven by recent cohort volume or scrubber position.
 */

import { useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const ORCHARD_DARK = new THREE.Color('#A78BFA');
const IRONWOOD_DARK = new THREE.Color('#F4B728');
const ORCHARD_LIGHT = new THREE.Color('#7C3AED');
const IRONWOOD_LIGHT = new THREE.Color('#D49B00');

const ORCHARD_X = -2.7;
const IRONWOOD_X = 2.7;
const POOL_Y = -0.9;

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

function PoolCloud({
  centerX,
  color,
  count,
  sprite,
  spin = 1,
  blending = THREE.AdditiveBlending,
}: {
  centerX: number;
  color: THREE.Color;
  count: number;
  sprite: THREE.Texture;
  spin?: number;
  blending?: THREE.Blending;
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
        blending={blending}
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

function FlowStream({
  count,
  sprite,
  lightMode,
  intensity,
  pulseRef,
}: {
  count: number;
  sprite: THREE.Texture;
  lightMode?: boolean;
  intensity: number;
  pulseRef: React.MutableRefObject<number>;
}) {
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
    const pulseMul = 1 + pulseRef.current * 2;
    const speedMul = (0.3 + intensity * 1.5) * pulseMul;
    const mat = pts.material as THREE.PointsMaterial;
    mat.size = 0.1 + intensity * 0.12;
    const activeCount = Math.round(count * (0.15 + intensity * 0.85));
    for (let i = 0; i < params.length; i++) {
      const p = params[i];
      if (i < activeCount) {
        p.t += p.speed * speedMul * clamped;
        if (p.t >= 1) Object.assign(p, makeFlow(0));
        const e = p.t;
        const fromX = ORCHARD_X + Math.cos(p.fromA) * p.fromR;
        const fromZ = Math.sin(p.fromA) * p.fromR;
        const toX = IRONWOOD_X + Math.cos(p.toA) * p.toR;
        const toZ = Math.sin(p.toA) * p.toR;
        const spread = Math.pow(Math.abs(e - 0.5) * 2, 0.5);
        const rawZ = fromZ + (toZ - fromZ) * e;
        pos[i * 3] = fromX + (toX - fromX) * e;
        pos[i * 3 + 1] = POOL_Y + Math.sin(e * Math.PI) * p.arc;
        pos[i * 3 + 2] = rawZ * spread;
        const srcColor = lightMode ? ORCHARD_LIGHT : ORCHARD_DARK;
        const dstColor = lightMode ? IRONWOOD_LIGHT : IRONWOOD_DARK;
        col[i * 3] = srcColor.r + (dstColor.r - srcColor.r) * e;
        col[i * 3 + 1] = srcColor.g + (dstColor.g - srcColor.g) * e;
        col[i * 3 + 2] = srcColor.b + (dstColor.b - srcColor.b) * e;
      } else {
        pos[i * 3] = 0;
        pos[i * 3 + 1] = -100;
        pos[i * 3 + 2] = 0;
      }
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
        blending={lightMode ? THREE.NormalBlending : THREE.AdditiveBlending}
      />
    </points>
  );
}


function Basins({
  orchardScale,
  ironwoodScale,
  ironwoodEmpty,
  lightMode,
  pulseRef,
}: {
  orchardScale: number;
  ironwoodScale: number;
  ironwoodEmpty: boolean;
  lightMode?: boolean;
  pulseRef: React.MutableRefObject<number>;
}) {
  const orchardColor = lightMode ? ORCHARD_LIGHT : ORCHARD_DARK;
  const ironwoodColor = lightMode ? IRONWOOD_LIGHT : IRONWOOD_DARK;
  const orchardRef = useRef<THREE.Mesh>(null);
  const ironwoodRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const pulse = pulseRef.current;
    if (orchardRef.current) {
      const mat = orchardRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = (lightMode ? 0.6 : 0.35) + pulse * 0.3;
    }
    if (ironwoodRef.current) {
      const mat = ironwoodRef.current.material as THREE.MeshBasicMaterial;
      const base = ironwoodEmpty ? (lightMode ? 0.25 : 0.12) : (lightMode ? 0.6 : 0.35);
      mat.opacity = base + pulse * 0.4;
    }
  });

  return (
    <>
      <mesh ref={orchardRef} position={[ORCHARD_X, POOL_Y - 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={orchardScale}>
        <ringGeometry args={[1.35, 1.6, 48]} />
        <meshBasicMaterial color={orchardColor} transparent opacity={lightMode ? 0.6 : 0.35} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={ironwoodRef} position={[IRONWOOD_X, POOL_Y - 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={ironwoodScale}>
        <ringGeometry args={[1.35, 1.6, 48]} />
        <meshBasicMaterial color={ironwoodColor} transparent opacity={ironwoodEmpty ? (lightMode ? 0.25 : 0.12) : (lightMode ? 0.6 : 0.35)} side={THREE.DoubleSide} />
      </mesh>
    </>
  );
}

function Rig({ pulseRef }: { pulseRef: React.MutableRefObject<number> }) {
  const { camera, pointer } = useThree();
  useFrame(() => {
    const t = performance.now() / 1000;
    const targetX = pointer.x * 0.4 + Math.sin(t * 0.08) * 0.04;
    const targetY = 1.4 + pointer.y * 0.2;
    camera.position.x += (targetX - camera.position.x) * 0.04;
    camera.position.y += (targetY - camera.position.y) * 0.04;
    camera.lookAt(0, -0.2, 0);
    pulseRef.current *= 0.92;
  });
  return null;
}

export interface TurnstileSceneProps {
  lightMode?: boolean;
  activated: boolean;
  migratedPct: number;
  /** 0–1 flow intensity: 0 = idle, 1 = peak migration activity */
  flowIntensity: number;
  blockPulseKey: number;
  paused?: boolean;
  onReady?: () => void;
}

export default function TurnstileScene({
  activated,
  migratedPct,
  flowIntensity,
  blockPulseKey,
  paused,
  lightMode,
  onReady,
}: TurnstileSceneProps) {
  const sprite = useMemo(() => makeSprite(), []);
  const pulseRef = useRef(0);
  const lastKey = useRef(blockPulseKey);

  // Smooth frac with lerp ref so pool levels don't jump on poll
  const targetFrac = Math.min(1, Math.max(0, migratedPct / 100));
  const smoothFrac = useRef(targetFrac);

  if (blockPulseKey !== lastKey.current) {
    lastKey.current = blockPulseKey;
    pulseRef.current = 1.2;
  }

  const ORCHARD = lightMode ? ORCHARD_LIGHT : ORCHARD_DARK;
  const IRONWOOD = lightMode ? IRONWOOD_LIGHT : IRONWOOD_DARK;
  const blending = lightMode ? THREE.NormalBlending : THREE.AdditiveBlending;

  const frac = smoothFrac.current;
  const orchardCount = activated ? Math.round(2200 * (1 - frac)) : 2200;
  const ironwoodCount = activated ? Math.round(2200 * frac) : 0;
  const orchardScale = activated ? 0.4 + (1 - frac) * 0.6 : 1;
  const ironwoodScale = activated ? 0.4 + frac * 0.6 : 0.4;

  const showFlow = activated && frac > 0 && frac < 1;

  return (
    <Canvas
      frameloop={paused ? 'never' : 'always'}
      camera={{ position: [0, 1.4, 7.2], fov: 46 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
      style={{ background: 'transparent' }}
      onCreated={onReady}
    >
      <ambientLight intensity={lightMode ? 1.2 : 0.4} />
      <SmoothFrac targetFrac={targetFrac} smoothRef={smoothFrac} />
      <Rig pulseRef={pulseRef} />
      <Basins orchardScale={orchardScale} ironwoodScale={ironwoodScale} ironwoodEmpty={ironwoodCount === 0} lightMode={lightMode} pulseRef={pulseRef} />
      <PoolCloud centerX={ORCHARD_X} color={ORCHARD} count={orchardCount} sprite={sprite} spin={1} blending={blending} />
      <PoolCloud centerX={IRONWOOD_X} color={IRONWOOD} count={ironwoodCount} sprite={sprite} spin={-0.8} blending={blending} />
      {showFlow && (
        <FlowStream
          count={400}
          sprite={sprite}
          lightMode={lightMode}
          intensity={flowIntensity}
          pulseRef={pulseRef}
        />
      )}
    </Canvas>
  );
}

/** Smoothly lerp frac inside the R3F render loop — fast enough for play mode (~10 frames to converge) */
function SmoothFrac({ targetFrac, smoothRef }: { targetFrac: number; smoothRef: React.MutableRefObject<number> }) {
  useFrame(() => {
    smoothRef.current += (targetFrac - smoothRef.current) * 0.12;
  });
  return null;
}
