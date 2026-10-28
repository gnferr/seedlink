"use client";

import { useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { skyState } from "@/lib/daycycle";
import { mulberry32 } from "@/lib/rng";
import type { FoldState } from "./IslandScene";
import { Toon, windAt } from "./toon";

// Screen axes of the default iso view on the ground: right, and into the screen.
const RIGHT = new THREE.Vector3(1, 0, -1).normalize();
const BACK = new THREE.Vector3(-1, 0, -1).normalize();
const BUTTERFLY_COLOURS = ["#ffd23f", "#ffffff", "#ff9ccf", "#9fd8ff"];
const SPAN = 200; // a flock's trip across the sky, in world units
const o = new THREE.Object3D();
const c = new THREE.Color();
const base = new THREE.Vector3();

function glowTexture() {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 32;
  const g = cv.getContext("2d")!;
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, "rgba(255,255,255,1)");
  gr.addColorStop(0.25, "rgba(255,255,255,0.6)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(cv);
}

/** One small voxel animal: [x, y, z, sx, sy, sz] boxes, facing +x. */
const RABBIT = [[0, 0.35, 0, 0.7, 0.45, 0.4], [0.42, 0.6, 0, 0.32, 0.3, 0.3], [0.42, 0.95, 0.08, 0.08, 0.4, 0.08], [0.42, 0.95, -0.08, 0.08, 0.4, 0.08], [-0.4, 0.4, 0, 0.16, 0.16, 0.16]];
const FOX = [[0, 0.45, 0, 1.0, 0.4, 0.38], [0.6, 0.62, 0, 0.36, 0.32, 0.32], [0.8, 0.56, 0, 0.2, 0.14, 0.16], [0.56, 0.86, 0.1, 0.08, 0.18, 0.08], [0.56, 0.86, -0.1, 0.08, 0.18, 0.08], [-0.7, 0.5, 0, 0.6, 0.2, 0.22], [0.3, 0.15, 0.1, 0.1, 0.3, 0.1], [-0.3, 0.15, -0.1, 0.1, 0.3, 0.1]];

/**
 * The island's wildlife, lively but small: bird flocks crossing the sky by day, butterflies over the meadow, a
 * rabbit hopping across now and then, a fox at sunset and fireflies after dark. Butterflies and birds ride the
 * garden's wind. Everything hides once the fold starts; with reduced motion the scene doesn't mount this at all.
 */
export default function Life({ time, half, fold }: { time: number; half: number; fold: RefObject<FoldState> }) {
  const group = useRef<THREE.Group>(null);
  const birdMesh = useRef<THREE.InstancedMesh>(null);
  const flyMesh = useRef<THREE.InstancedMesh>(null);
  const rabbit = useRef<THREE.Group>(null);
  const fox = useRef<THREE.Group>(null);
  const fireflies = useRef<THREE.Points>(null);
  const glow = useMemo(() => glowTexture(), []);

  const world = useMemo(() => {
    const r = mulberry32(7);
    const birds = [0, 1, 2].flatMap((f) => {
      const n = 3 + Math.floor(r() * 4), start = r() * SPAN, height = 18 + r() * 16, back = 25 + r() * 20, speed = 5 + r() * 2;
      return Array.from({ length: n }, (_, i) => ({ start: start - i * 2.6, side: (Math.abs(i - n / 2) * 1.2), height, back, speed, phase: r() * 6, flock: f }));
    });
    const flies = Array.from({ length: 8 }, (_, i) => ({ p: new THREE.Vector3((r() - 0.5) * half * 1.6, 1 + r() * 1.5, (r() - 0.5) * half * 1.6), goal: new THREE.Vector3(), phase: r() * 6, colour: BUTTERFLY_COLOURS[i % 4] }));
    const bugs = Array.from({ length: 20 }, () => ({ x: (r() - 0.5) * half * 1.7, y: 0.6 + r() * 6, z: (r() - 0.5) * half * 1.7, phase: r() * 6, speed: 0.5 + r() }));
    return { birds, flies, bugs, positions: new Float32Array(20 * 3), colours: new Float32Array(20 * 3) };
  }, [half]);

  const light = useMemo(() => {
    const s = skyState(time), hour = 6 + time * 17;
    return {
      day: s.sun.up && hour < 18.2, // birds, butterflies, the rabbit
      dusk: hour > 17.5 && hour < 20.5, // the fox
      bugs: Math.min(1, Math.max(0, (hour - 18.5) / 1.5)), // fireflies fade in after sunset
      ink: hour > 18.5 ? "#4a3a5a" : "#3a3550",
    };
  }, [time]);

  useFrame(({ clock }, delta) => {
    const g = group.current;
    if (!g) return;
    g.visible = fold.current.t === 0;
    if (!g.visible) return;
    const t = clock.elapsedTime, dt = Math.min(delta, 0.1);

    const bm = birdMesh.current;
    if (bm) {
      bm.visible = light.day;
      world.birds.forEach((b, i) => {
        const along = ((b.start + t * b.speed) % SPAN) - SPAN / 2, flap = Math.sin(t * 7 + b.phase) * 0.6;
        const [wx, wz] = windAt(along, 0);
        base.set(0, 0, 0).addScaledVector(RIGHT, along).addScaledVector(BACK, b.back + b.side).setY(b.height + Math.sin(t * 0.8 + b.phase) * 1.2);
        base.x += wx * 3; base.z += wz * 3;
        for (const side of [-1, 1]) {
          // Wings spread across the screen (along RIGHT) so the bird reads as a flapping V from the iso view.
          o.position.copy(base).addScaledVector(RIGHT, side * 0.7);
          o.rotation.set(0, Math.PI / 4, side * (0.3 + flap));
          o.scale.set(1.5, 0.15, 0.5);
          o.updateMatrix();
          bm.setMatrixAt(i * 2 + (side > 0 ? 1 : 0), o.matrix);
          bm.setColorAt(i * 2 + (side > 0 ? 1 : 0), c.set(light.ink));
        }
      });
      bm.instanceMatrix.needsUpdate = true;
      if (bm.instanceColor) bm.instanceColor.needsUpdate = true;
    }

    const fm = flyMesh.current;
    if (fm) {
      fm.visible = light.day;
      world.flies.forEach((f, i) => {
        // Wander toward a goal over the meadow, pushed by the wind; pick a new goal on arrival.
        if (f.goal.lengthSq() === 0 || f.p.distanceTo(f.goal) < 0.6) f.goal.set((Math.random() - 0.5) * half * 1.6, 0.9 + Math.random() * 1.6, (Math.random() - 0.5) * half * 1.6);
        const [wx, wz] = windAt(f.p.x, f.p.z);
        f.p.lerp(f.goal, dt * 0.5);
        f.p.x += wx * dt * 2; f.p.z += wz * dt * 2;
        f.p.x = THREE.MathUtils.clamp(f.p.x, -half, half); f.p.z = THREE.MathUtils.clamp(f.p.z, -half, half);
        const flap = Math.abs(Math.sin(t * 14 + f.phase)) * 1.2;
        for (const side of [-1, 1]) {
          o.position.set(f.p.x, f.p.y + Math.sin(t * 3 + f.phase) * 0.15, f.p.z);
          o.rotation.set(0, Math.PI / 4, side * (0.2 + flap));
          o.translateX(side * 0.25);
          o.scale.set(0.5, 0.06, 0.42);
          o.updateMatrix();
          fm.setMatrixAt(i * 2 + (side > 0 ? 1 : 0), o.matrix);
          fm.setColorAt(i * 2 + (side > 0 ? 1 : 0), c.set(f.colour));
        }
      });
      fm.instanceMatrix.needsUpdate = true;
      if (fm.instanceColor) fm.instanceColor.needsUpdate = true;
    }

    // A rabbit (day) or a fox (dusk) crosses the meadow for ~9 s every ~26 s.
    const walk = (grp: THREE.Group | null, show: boolean, cycle: number, hop: number) => {
      if (!grp) return;
      const k = (t % cycle) / 9;
      grp.visible = show && k < 1;
      if (!grp.visible) return;
      const x = THREE.MathUtils.lerp(-half * 0.8, half * 0.7, k), z = THREE.MathUtils.lerp(half * 0.5, -half * 0.3, k);
      grp.position.set(x, hop * Math.abs(Math.sin(t * 6)), z);
      grp.rotation.y = Math.atan2(-(-half * 0.3 - half * 0.5), half * 1.5);
    };
    walk(rabbit.current, light.day, 26, 0.35);
    walk(fox.current, light.dusk, 31, 0.05);

    const pts = fireflies.current;
    if (pts) {
      pts.visible = light.bugs > 0;
      world.bugs.forEach((b, i) => {
        world.positions.set([b.x + Math.sin(t * 0.4 * b.speed + b.phase) * 0.8, b.y + Math.sin(t * 0.3 + b.phase) * 0.5, b.z + Math.cos(t * 0.35 * b.speed + b.phase) * 0.8], i * 3);
        const on = Math.max(0, Math.sin(t * 1.5 * b.speed + b.phase)) * light.bugs;
        world.colours.set([on, on * 0.92, on * 0.55], i * 3);
      });
      pts.geometry.attributes.position.needsUpdate = true;
      pts.geometry.attributes.color.needsUpdate = true;
    }
  });

  const animal = (boxes: number[][], colour: string) =>
    boxes.map(([x, y, z, sx, sy, sz], i) => (
      <mesh key={i} position={[x, y, z]} scale={[sx, sy, sz]}>
        <boxGeometry />
        <Toon color={colour} />
      </mesh>
    ));

  return (
    <group ref={group}>
      <instancedMesh ref={birdMesh} args={[undefined, undefined, world.birds.length * 2]} frustumCulled={false}>
        <boxGeometry />
        <Toon />
      </instancedMesh>
      <instancedMesh ref={flyMesh} args={[undefined, undefined, world.flies.length * 2]} frustumCulled={false}>
        <boxGeometry />
        <Toon />
      </instancedMesh>
      <group ref={rabbit} visible={false} scale={1.8}>{animal(RABBIT, "#ece4d8")}</group>
      <group ref={fox} visible={false} scale={1.8}>{animal(FOX, "#d9733a")}</group>
      <points ref={fireflies} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[world.positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[world.colours, 3]} />
        </bufferGeometry>
        <pointsMaterial map={glow} size={22} sizeAttenuation={false} vertexColors transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>
    </group>
  );
}
