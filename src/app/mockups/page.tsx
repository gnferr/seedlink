"use client";

// THROWAWAY SPIKE — height-profile mockups for choosing a direction. Not product code.

import { useMemo, useRef, useLayoutEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import { generateMatrix, moduleNoise, QUIET_ZONE } from "@/lib/qr";

const dummy = new THREE.Object3D();
const matrix = generateMatrix("https://example.com");

/** u, v are normalised to [-1, 1]. Return 0..1; it is scaled to real height by the caller. */
type Profile = { name: string; note: string; f: (u: number, v: number, x: number, z: number) => number };

const PROFILES: Profile[] = [
  {
    name: "Random",
    note: "what you have now",
    f: (_u, _v, x, z) => moduleNoise(x, z),
  },
  {
    name: "Pine",
    note: "cone — reads as a tree",
    f: (u, v) => Math.max(0, 1 - Math.hypot(u, v) * 1.15),
  },
  {
    name: "Dome",
    note: "smooth hemisphere",
    f: (u, v) => {
      const r = Math.min(1, Math.hypot(u, v));
      return Math.sqrt(Math.max(0, 1 - r * r));
    },
  },
  {
    name: "Ziggurat",
    note: "stepped pyramid",
    f: (u, v) => {
      const d = Math.max(Math.abs(u), Math.abs(v));
      return Math.round((1 - d) * 4) / 4;
    },
  },
  {
    name: "Ridge",
    note: "mountain range",
    f: (u, v, x, z) => {
      const ridge = 1 - Math.abs(Math.sin(u * 2.2 + Math.cos(v * 1.7) * 0.8));
      return Math.max(0.05, ridge * 0.85 + moduleNoise(x, z) * 0.15);
    },
  },
  {
    name: "Citadel",
    note: "towers on the three finder patterns",
    f: (_u, _v, x, z) => {
      const s = matrix.size;
      // The QR's own anatomy drives the form: three corner eyes become towers.
      const eyes: Array<[number, number]> = [
        [3, 3],
        [s - 4, 3],
        [3, s - 4],
      ];
      const nearest = Math.min(...eyes.map(([ex, ez]) => Math.hypot(x - ex, z - ez)));
      return Math.max(0.08, 1 - nearest / (s * 0.42));
    },
  },
];

function Voxels({ profile }: { profile: Profile }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dark = useMemo(() => {
    const out: Array<[number, number]> = [];
    for (let z = 0; z < matrix.size; z++)
      for (let x = 0; x < matrix.size; x++)
        if (matrix.cells[z * matrix.size + x]) out.push([x, z]);
    return out;
  }, []);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const offset = (matrix.size - 1) / 2;
    dark.forEach(([x, z], i) => {
      const u = (x - offset) / offset;
      const v = (z - offset) / offset;
      const h = 0.6 + profile.f(u, v, x, z) * 9;
      dummy.position.set(x - offset, h / 2, z - offset);
      dummy.scale.set(1, h, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [dark, profile]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, dark.length]} castShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#111114" roughness={0.4} metalness={0.25} />
    </instancedMesh>
  );
}

function Tile({ profile }: { profile: Profile }) {
  const span = matrix.size + QUIET_ZONE * 2;
  return (
    <div className="flex flex-col gap-2">
      <div className="h-[340px] overflow-hidden rounded-xl border border-zinc-300 bg-zinc-100">
        <Canvas dpr={[1, 2]} shadows>
          <color attach="background" args={["#ececed"]} />
          <PerspectiveCamera makeDefault fov={38} position={[span * 0.8, span * 0.62, span * 0.8]} />
          {/* Real key/fill/rim instead of flat ambient, so the form actually reads. */}
          <ambientLight intensity={0.35} />
          <directionalLight position={[14, 22, 10]} intensity={2.1} castShadow />
          <directionalLight position={[-16, 8, -12]} intensity={0.9} color="#9fb6ff" />
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
            <planeGeometry args={[span, span]} />
            <meshStandardMaterial color="#ffffff" roughness={0.95} />
          </mesh>
          <Voxels profile={profile} />
          <OrbitControls target={[0, 2, 0]} />
        </Canvas>
      </div>
      <div>
        <p className="text-sm font-semibold text-zinc-900">{profile.name}</p>
        <p className="text-sm text-zinc-600">{profile.note}</p>
      </div>
    </div>
  );
}

export default function Mockups() {
  return (
    <main className="min-h-full bg-zinc-50 p-8">
      <h1 className="mb-1 text-2xl font-semibold text-zinc-900">Height profiles</h1>
      <p className="mb-6 max-w-2xl text-zinc-600">
        Same QR matrix in every tile — the top-down footprint is identical and still scans.
        Only the height rule changes. Drag any tile to orbit it.
      </p>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        {PROFILES.map((p) => (
          <Tile key={p.name} profile={p} />
        ))}
      </div>
    </main>
  );
}
