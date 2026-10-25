"use client";

import { useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { PALETTES } from "@/lib/palette";
import { hash3 } from "@/lib/rng";
import type { Season } from "@/lib/seasons";
import type { Tree } from "@/lib/tree";
import type { FoldState } from "./IslandScene";

const COUNT = 40;
const dummy = new THREE.Object3D();

/** One small system whose look follows the season (the spike's petals, fireflies, leaves, snow); it shrinks away as the tree folds. */
export default function Particles({ tree, season, fold }: { tree: Tree; season: Season; fold: RefObject<FoldState> }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const { particle, particleKind: kind } = PALETTES[season];
  const seeds = useMemo(() => Array.from({ length: COUNT }, (_, i) => [0, 1, 2, 3].map((k) => hash3(i, k, 0, 9))), []);
  const crownY = tree.trunkHeight + tree.crownRadius * 0.35;
  const R = tree.crownRadius * 0.9;

  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    const time = clock.elapsedTime;
    const hide = 1 - fold.current.t;
    for (let i = 0; i < COUNT; i++) {
      const seed = seeds[i];
      const a = seed[0], b = seed[1], c = seed[2], d = seed[3];
      let s = 1;
      if (kind === "firefly") {
        const ang = a * 6.28 + time * 0.3 * (b + 0.5);
        dummy.position.set(Math.cos(ang) * R * (0.6 + c), crownY * (0.3 + d) + Math.sin(time * 2 + a * 9) * 1.5, Math.sin(ang) * R * (0.6 + c));
        s = 0.5 + 0.5 * Math.sin(time * 4 + i);
      } else {
        const fall = (time * (kind === "snow" ? 2 : 3) * (0.6 + b) + a * 40) % 40;
        dummy.position.set((c - 0.5) * R * 2.6 + Math.sin(time + i) * 1.5, crownY + 12 - fall, (d - 0.5) * R * 2.6 + Math.cos(time * 0.8 + i) * 1.5);
        if (kind === "snow") s = 0.6;
      }
      dummy.rotation.set(time * b, time * c, 0);
      dummy.scale.setScalar(Math.max(1e-4, s * hide));
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, COUNT]} frustumCulled={false}>
      <boxGeometry args={[0.35, 0.35, 0.35]} />
      <meshBasicMaterial color={particle} />
    </instancedMesh>
  );
}
