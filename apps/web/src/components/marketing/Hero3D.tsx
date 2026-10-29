'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, Environment, Float, Instance, Instances, Lightformer, RoundedBox, Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import { OPTIONS, STAGES, useExamStory } from './examStory';

/* ---------------------------------------------------------------- laptop screen (exam UI drawn on a canvas texture) */

const W = 1560;
const H = 962;
const C = { ink: '#0f172a', muted: '#64748b', border: '#e2e8f0', soft: '#f1f5f9', primary: '#0A4DA6', primarySoft: '#eff6ff', danger: '#dc2626', dangerSoft: '#fef2f2', success: '#16a34a', warning: '#f59e0b' };

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill?: string, stroke?: string) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = 3; g.stroke(); }
}

/** Draws one frame of the exam story; the page's own fonts are used so it matches the site. */
function drawExam(g: CanvasRenderingContext2D, s: (typeof STAGES)[number], clock: string, fonts: { heading: string; body: string }) {
  const text = (t: string, x: number, y: number, size: number, color: string, weight = 500, family = fonts.body) => {
    g.font = `${weight} ${size}px ${family}`;
    g.fillStyle = color;
    g.fillText(t, x, y);
    return g.measureText(t).width;
  };
  g.textBaseline = 'middle';
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, W, H);

  // Tab strip
  g.fillStyle = C.soft;
  g.fillRect(0, 0, W, 104);
  g.fillStyle = C.border;
  g.fillRect(0, 103, W, 3);
  roundRect(g, 32, 24, 290, 56, 14, '#fff', C.border);
  text('Exam · CPA-26', 58, 53, 28, C.primary, 600);
  if (s.tab) {
    roundRect(g, 340, 24, 260, 56, 14, '#fff', '#fecaca');
    g.beginPath(); g.arc(372, 52, 11, 0, Math.PI * 2); g.strokeStyle = C.danger; g.lineWidth = 3.5; g.stroke();
    text('chatgpt.com', 394, 53, 28, C.ink, 500);
  }
  roundRect(g, W - 220, 24, 188, 56, 14, C.primarySoft);
  text(clock, W - 172, 53, 30, C.primary, 700, 'ui-monospace, Consolas, monospace');

  // Question
  text('QUESTION 7 OF 30', 56, 158, 24, C.muted, 700);
  text('What is the average time complexity', 56, 214, 40, C.ink, 600, fonts.heading);
  text('of binary search on a sorted array?', 56, 266, 40, C.ink, 600, fonts.heading);
  OPTIONS.forEach((o, i) => {
    const x = 56 + (i % 2) * 560;
    const y = 316 + Math.floor(i / 2) * 118;
    const on = i === 3;
    roundRect(g, x, y, 530, 96, 20, on ? C.primarySoft : '#fff', on ? C.primary : C.border);
    g.beginPath(); g.arc(x + 46, y + 48, 14, 0, Math.PI * 2);
    if (on) { g.fillStyle = C.primary; g.fill(); g.beginPath(); g.arc(x + 46, y + 48, 5, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill(); }
    else { g.strokeStyle = '#cbd5e1'; g.lineWidth = 3; g.stroke(); }
    text(o, x + 80, y + 50, 32, on ? C.primary : C.ink, 500);
  });

  // Risk panel
  roundRect(g, 1220, 140, 300, 300, 26, '#fff', C.border);
  text('RISK', 1252, 186, 24, C.muted, 700);
  text(String(s.risk), 1252, 262, 84, C.ink, 700, fonts.heading);
  roundRect(g, 1252, 330, 236, 16, 8, C.border);
  roundRect(g, 1252, 330, Math.max(16, (236 * s.risk) / 100), 16, 8, s.risk >= 50 ? C.danger : s.risk >= 25 ? C.warning : C.success);
  text('Face verified', 1252, 384, 24, C.muted);
  text('Kiosk locked', 1252, 418, 24, C.muted);

  // Status bar
  const alert = s.alert && !s.verdict;
  g.fillStyle = alert ? C.dangerSoft : C.soft;
  g.fillRect(0, H - 150, W, 150);
  g.fillStyle = alert ? '#fecaca' : C.border;
  g.fillRect(0, H - 150, W, 3);
  const dot = (color: string) => { g.beginPath(); g.arc(80, H - 75, 14, 0, Math.PI * 2); g.fillStyle = color; g.fill(); };
  if (!s.alert) {
    dot(C.success);
    text('All signals normal. Answers autosaved.', 116, H - 73, 32, C.muted);
  } else if (s.verdict) {
    dot(C.primary);
    const w = text('Proctor reviewing the evidence', 116, H - 73, 32, C.ink, 700);
    text('· confirm or overrule, with a reason', 130 + w, H - 73, 32, C.muted);
  } else {
    dot(C.danger);
    const w = text('AI query detected', 116, H - 73, 32, C.danger, 700);
    text('“time complexity of binary search” typed on chatgpt.com', 134 + w, H - 73, 30, C.muted);
  }
}

function useScreenTexture(reduce: boolean) {
  const { s, clock } = useExamStory(reduce);
  const { canvas, texture } = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    return { canvas, texture };
  }, []);
  useEffect(() => {
    const g = canvas.getContext('2d');
    if (!g) return;
    const fonts = {
      heading: getComputedStyle(document.querySelector('h1') ?? document.body).fontFamily,
      body: getComputedStyle(document.body).fontFamily,
    };
    drawExam(g, s, clock, fonts);
    texture.needsUpdate = true;
  }, [canvas, texture, s, clock]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

/* ---------------------------------------------------------------- laptop */

const ALUMINIUM = { color: '#d7deea', metalness: 0.85, roughness: 0.28, clearcoat: 0.6, clearcoatRoughness: 0.25 } as const;

/** 14 × 4 keys plus a space bar, instanced so the whole keyboard is one draw call. */
const KEYS: [number, number, number][] = [];
for (let row = 0; row < 4; row++) for (let col = 0; col < 14; col++) KEYS.push([-1.69 + col * 0.26, 0, -0.95 + row * 0.26]);

function Laptop({ reduce }: { reduce: boolean }) {
  const screen = useScreenTexture(reduce);
  return (
    <group position={[0, -0.95, 0]}>
      {/* Base */}
      <RoundedBox args={[4.2, 0.14, 2.8]} radius={0.06} smoothness={4} castShadow receiveShadow>
        <meshPhysicalMaterial {...ALUMINIUM} />
      </RoundedBox>
      <mesh position={[0, 0.071, -0.5]} receiveShadow>
        <boxGeometry args={[3.8, 0.004, 1.2]} />
        <meshStandardMaterial color="#1b2333" roughness={0.8} />
      </mesh>
      <Instances limit={KEYS.length + 1} position={[0, 0.09, 0]}>
        <boxGeometry args={[0.22, 0.03, 0.22]} />
        <meshStandardMaterial color="#2a3446" roughness={0.6} />
        {KEYS.map((p, i) => <Instance key={i} position={p} />)}
        <Instance position={[0, 0, 0.09]} scale={[7, 1, 1]} />
      </Instances>
      <RoundedBox args={[1.5, 0.006, 0.85]} radius={0.003} position={[0, 0.072, 0.78]}>
        <meshPhysicalMaterial color="#c7cfdc" metalness={0.6} roughness={0.35} />
      </RoundedBox>

      {/* Lid, hinged at the back edge and opened about 108° */}
      <group position={[0, 0.07, -1.38]} rotation={[-0.3, 0, 0]}>
        <RoundedBox args={[4.2, 2.7, 0.09]} radius={0.06} smoothness={4} position={[0, 1.35, 0]} castShadow>
          <meshPhysicalMaterial {...ALUMINIUM} />
        </RoundedBox>
        {/* Bezel */}
        <mesh position={[0, 1.35, 0.047]}>
          <planeGeometry args={[4.08, 2.58]} />
          <meshStandardMaterial color="#05070c" roughness={0.3} metalness={0.2} />
        </mesh>
        {/* Screen */}
        <mesh position={[0, 1.37, 0.048]}>
          <planeGeometry args={[3.92, 2.42]} />
          <meshBasicMaterial map={screen} toneMapped={false} />
        </mesh>
        {/* Camera dot */}
        <mesh position={[0, 2.6, 0.05]}>
          <circleGeometry args={[0.025, 16]} />
          <meshBasicMaterial color="#22d3ee" toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

/* ---------------------------------------------------------------- shield with an eye */

function useShieldGeometry() {
  return useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, 0.62);
    s.bezierCurveTo(0.22, 0.5, 0.42, 0.46, 0.55, 0.46);
    s.bezierCurveTo(0.55, 0.0, 0.42, -0.42, 0, -0.68);
    s.bezierCurveTo(-0.42, -0.42, -0.55, 0.0, -0.55, 0.46);
    s.bezierCurveTo(-0.42, 0.46, -0.22, 0.5, 0, 0.62);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 6, curveSegments: 32 });
    g.center();
    return g;
  }, []);
}

function Shield({ reduce }: { reduce: boolean }) {
  const orbit = useRef<THREE.Group>(null);
  const iris = useRef<THREE.Mesh>(null);
  const geometry = useShieldGeometry();

  useFrame(({ clock, pointer }) => {
    if (!orbit.current) return;
    const t = clock.getElapsedTime();
    if (!reduce) orbit.current.rotation.y = t * 0.35;
    // The eye glances toward the cursor.
    if (iris.current) {
      iris.current.position.x = THREE.MathUtils.lerp(iris.current.position.x, pointer.x * 0.06, 0.08);
      iris.current.position.y = THREE.MathUtils.lerp(iris.current.position.y, 0.04 + pointer.y * 0.05, 0.08);
    }
  });

  return (
    <group ref={orbit} position={[0, 0.2, 0]}>
      <Float speed={reduce ? 0 : 2} rotationIntensity={0.3} floatIntensity={0.6}>
        <group position={[2.05, 0.8, 0.2]} rotation={[0, -0.6, 0]} scale={0.75}>
          <mesh geometry={geometry} castShadow>
            <meshPhysicalMaterial color="#1E6FF0" metalness={0.25} roughness={0.12} transmission={0.55} thickness={0.6} ior={1.4} clearcoat={1} emissive="#0A4DA6" emissiveIntensity={0.35} />
          </mesh>
          {/* Eye */}
          <mesh position={[0, 0.04, 0.2]}>
            <torusGeometry args={[0.22, 0.035, 16, 64]} />
            <meshBasicMaterial color="#FFB020" toneMapped={false} />
          </mesh>
          <mesh ref={iris} position={[0, 0.04, 0.21]}>
            <sphereGeometry args={[0.09, 32, 32]} />
            <meshStandardMaterial color="#e0f2fe" emissive="#38bdf8" emissiveIntensity={2.2} toneMapped={false} />
          </mesh>
          <pointLight position={[0, 0, 0.5]} color="#38bdf8" intensity={3} distance={2.5} />
        </group>
      </Float>
    </group>
  );
}

/* ---------------------------------------------------------------- scan rings */

function ScanRings({ reduce }: { reduce: boolean }) {
  const rings = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!rings.current || reduce) return;
    const t = clock.getElapsedTime();
    rings.current.children.forEach((ring, i) => {
      const k = (t * 0.35 + i / 3) % 1;
      ring.scale.setScalar(1 + k * 1.6);
      ((ring as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - k);
    });
  });
  return (
    <group ref={rings} position={[0, -1.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      {[0, 1, 2].map((i) => (
        <mesh key={i}>
          <ringGeometry args={[2.3, 2.34, 96]} />
          <meshBasicMaterial color="#7dd3fc" transparent opacity={0.35} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

/* ---------------------------------------------------------------- scene */

function Rig({ reduce, children }: { reduce: boolean; children: React.ReactNode }) {
  const group = useRef<THREE.Group>(null);
  useFrame(({ pointer, clock }) => {
    if (!group.current) return;
    const idle = reduce ? 0 : Math.sin(clock.getElapsedTime() * 0.4) * 0.06;
    group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, -0.32 + pointer.x * 0.22 + idle, 0.05);
    group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, 0.08 - pointer.y * 0.08, 0.05);
  });
  return <group ref={group}>{children}</group>;
}

/** Interactive 3D hero: a laptop running the exam, guarded by an orbiting shield. */
export default function Hero3D({ reduce }: { reduce: boolean }) {
  return (
    <div className="relative h-[440px] w-full sm:h-[520px]" role="img" aria-label="3D illustration: a laptop running a proctored exam in which a ChatGPT query is flagged and reviewed, with a glowing shield orbiting it">
      <Canvas shadows="percentage" dpr={[1, 1.75]} camera={{ position: [0, 1.5, 8.4], fov: 34 }} gl={{ antialias: true, alpha: true }} frameloop={reduce ? 'demand' : 'always'}>
        <ambientLight intensity={0.35} />
        <directionalLight position={[4, 6, 5]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
        <pointLight position={[-5, 2, -3]} color="#1E6FF0" intensity={30} distance={14} />
        {/* Studio reflections from light panels, so no environment map is downloaded. */}
        <Environment resolution={256}>
          <Lightformer form="rect" intensity={2.2} color="#ffffff" position={[0, 5, -6]} scale={[10, 3, 1]} />
          <Lightformer form="rect" intensity={1.4} color="#9cc8ff" position={[-6, 1, 2]} rotation-y={Math.PI / 2} scale={[6, 4, 1]} />
          <Lightformer form="ring" intensity={1.2} color="#FFB020" position={[6, 2, 3]} rotation-y={-Math.PI / 2} scale={3} />
        </Environment>

        <Rig reduce={reduce}>
          <Float speed={reduce ? 0 : 1.2} rotationIntensity={0.08} floatIntensity={0.25}>
            <Laptop reduce={reduce} />
          </Float>
          <Shield reduce={reduce} />
          <ScanRings reduce={reduce} />
        </Rig>

        <Sparkles count={70} scale={[9, 4.5, 6]} size={2.2} speed={reduce ? 0 : 0.35} color="#bfdbfe" opacity={0.8} />
        <ContactShadows position={[0, -1.05, 0]} opacity={0.45} scale={12} blur={2.6} far={3} color="#020817" />
      </Canvas>
    </div>
  );
}
