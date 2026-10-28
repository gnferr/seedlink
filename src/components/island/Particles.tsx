"use client";

import { useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { PALETTES } from "@/lib/palette";
import { hash3 } from "@/lib/rng";
import type { Season } from "@/lib/seasons";
import type { Tree } from "@/lib/tree";
import type { FoldState } from "./IslandScene";
import { windAt } from "./toon";

const COUNT = 40;
const TUFTS = 6; // in summer, the last few pieces are dandelion tufts riding the wind among the pollen
const TUFT = new THREE.Color("#ffffff");
const dummy = new THREE.Object3D();
const tint = new THREE.Color();

/**
 * One small system whose look follows the season (petals; pollen rising with a few seed tufts; leaves; snow), carried
 * by the garden's wind; it shrinks away as the tree folds. Fireflies are the night's, in Life.
 */
export default function Particles({ tree, season, time: dayTime, fold }: { tree: Tree; season: Season; time: number; fold: RefObject<FoldState> }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const { particle, particleKind: kind } = PALETTES[season];
  const seeds = useMemo(() => Array.from({ length: COUNT }, (_, i) => [0, 1, 2, 3].map((k) => hash3(i, k, 0, 9))), []);
  // How far the wind has carried each falling piece (x, z) since it last started at the top, and its last fall.
  const carried = useRef({ xz: new Float32Array(COUNT * 2), fall: new Float32Array(COUNT) });
  const crownY = tree.trunkHeight + tree.crownRadius * 0.35;
  const R = tree.crownRadius * 0.9;

  const tinted = useRef<string | null>(null);

  useFrame(({ clock }, delta) => {
    const m = mesh.current;
    if (!m) return;
    // Colours before the first draw, so the material compiles with per-instance colour.
    if (tinted.current !== kind) {
      tinted.current = kind;
      for (let i = 0; i < COUNT; i++) m.setColorAt(i, kind === "pollen" && i >= COUNT - TUFTS ? TUFT : tint.set(particle));
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    const time = clock.elapsedTime, dt = Math.min(delta, 0.1);
    // Pollen and tufts settle after sunset (time 0..1 is 06:00..23:00), as Life's fireflies come out.
    const settle = kind === "pollen" ? Math.min(1, Math.max(0, (19.5 - (6 + dayTime * 17)) / 1.5)) : 1;
    const hide = (1 - fold.current.t) * settle, drift = carried.current;
    for (let i = 0; i < COUNT; i++) {
      const seed = seeds[i];
      const a = seed[0], b = seed[1], c = seed[2], d = seed[3];
      const tuft = kind === "pollen" && i >= COUNT - TUFTS;
      let s = 1, x: number, y: number, z: number, carry = 5;
      if (kind === "pollen" && !tuft) {
        // Pollen floats up out of the meadow and crown over ~14 s, fading in and out, glinting now and then.
        const u = (time / 14 * (0.7 + b * 0.6) + a) % 1;
        if (u < drift.fall[i]) drift.xz[i * 2] = drift.xz[i * 2 + 1] = 0; // back at the bottom
        drift.fall[i] = u;
        const r = R * 1.2 * Math.sqrt(c), ang = d * 6.28;
        x = Math.cos(ang) * r + Math.sin(time * 0.9 + i) * 0.6 + drift.xz[i * 2];
        z = Math.sin(ang) * r + Math.cos(time * 0.7 + i) * 0.6 + drift.xz[i * 2 + 1];
        y = 0.5 + u * crownY * 1.6;
        s = Math.min(1, u * 6, (1 - u) * 4) * (0.7 + 0.6 * Math.max(0, Math.sin(time * 3.1 + a * 30)) ** 6);
        carry = 3;
      } else {
        const fall = (time * (kind === "snow" ? 2 : tuft ? 1.2 : 3) * (0.6 + b) + a * 40) % 40;
        if (fall < drift.fall[i]) drift.xz[i * 2] = drift.xz[i * 2 + 1] = 0; // back at the top
        drift.fall[i] = fall;
        x = (c - 0.5) * R * 2.6 + Math.sin(time + i) * 1.5 + drift.xz[i * 2];
        z = (d - 0.5) * R * 2.6 + Math.cos(time * 0.8 + i) * 1.5 + drift.xz[i * 2 + 1];
        y = crownY + 12 - fall;
        if (kind === "snow") s = 0.6;
        if (tuft) carry = 9 * (0.5 + d); // each tuft catches the wind differently
      }
      const [wx, wz] = windAt(x, z);
      drift.xz[i * 2] += wx * dt * carry;
      drift.xz[i * 2 + 1] += wz * dt * carry;
      dummy.position.set(x, y, z);
      dummy.rotation.set(time * b * (tuft ? 0.3 : 1), time * c, 0);
      s = Math.max(1e-4, s * hide);
      if (tuft) dummy.scale.set(s * 2.2, s * 0.7, s * 2.2); // a soft flat puff
      else dummy.scale.setScalar(s);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, COUNT]} frustumCulled={false}>
      <boxGeometry args={[0.35, 0.35, 0.35]} />
      <meshBasicMaterial />
    </instancedMesh>
  );
}
