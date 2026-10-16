"use client";

// THROWAWAY SPIKE — grounded vs floating anamorphic. Not product code.

import { useMemo, useRef, useLayoutEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, OrthographicCamera } from "@react-three/drei";
import * as THREE from "three";
import { generateMatrix, QUIET_ZONE } from "@/lib/qr";

const dummy = new THREE.Object3D();
const matrix = generateMatrix("https://example.com");
const SIZE = matrix.size;

// Solve angle: azimuth 45 degrees, elevation 30 degrees.
const COS_P = Math.cos(Math.PI / 6);
const SIN_P = Math.sin(Math.PI / 6);
const SQRT2 = Math.SQRT2;

/** Screen axes for that fixed camera. u is locked by the cell; only v is ours to choose. */
const screenU = (x: number, z: number) => (x - z) / SQRT2;
const groundW = (x: number, z: number) => (x + z - (SIZE - 1)) / SQRT2;
/** Invert v = y*cos(p) - w*sin(p) for the height that lands a cell at screen height v. */
const heightFor = (v: number, w: number) => (v + w * SIN_P) / COS_P;

const V_LO = 11;
const V_SPAN = 26;

/** A bold tree: canopy blobs over a narrow trunk, in a unit box. */
function inTree(a: number, b: number) {
  const blob = (cx: number, cy: number, r: number) => Math.hypot(a - cx, b - cy) < r;
  if (blob(0.5, 0.66, 0.29) || blob(0.33, 0.53, 0.22) || blob(0.67, 0.53, 0.22)) return true;
  return Math.abs(a - 0.5) < 0.06 && b > 0.06 && b < 0.42;
}

const darkCells: Array<[number, number]> = [];
for (let z = 0; z < SIZE; z++)
  for (let x = 0; x < SIZE; x++)
    if (matrix.cells[z * SIZE + x]) darkCells.push([x, z]);

const U_MAX = (SIZE - 1) / SQRT2;
const toU01 = (u: number) => (u + U_MAX) / (2 * U_MAX);

/** Grounded: every column rises from the plane to the shape's top edge at its screen column. */
function groundedHeights() {
  return darkCells.map(([x, z]) => {
    const a = toU01(screenU(x, z));
    let top = 0;
    for (let i = 60; i >= 0; i--) {
      if (inTree(a, i / 60)) { top = i / 60; break; }
    }
    const v = V_LO + top * V_SPAN;
    return Math.max(0.6, heightFor(v, groundW(x, z)));
  });
}

/** Floating: each block is parked at a screen height that is inside the shape, gaps included. */
function floatingCenters() {
  const columns = new Map<number, number[]>();
  darkCells.forEach(([x, z], i) => {
    const key = Math.round(screenU(x, z) * SQRT2);
    if (!columns.has(key)) columns.set(key, []);
    columns.get(key)!.push(i);
  });
  const out = new Array<number>(darkCells.length).fill(0.6);
  for (const [, members] of columns) {
    const [x0, z0] = darkCells[members[0]];
    const a = toU01(screenU(x0, z0));
    const filled: number[] = [];
    for (let i = 0; i <= 60; i++) if (inTree(a, i / 60)) filled.push(i / 60);
    if (!filled.length) continue;
    members.forEach((idx, k) => {
      const slot = filled[Math.floor((k * filled.length) / members.length)];
      const [x, z] = darkCells[idx];
      out[idx] = heightFor(V_LO + slot * V_SPAN, groundW(x, z));
    });
  }
  return out;
}

const GROUNDED = groundedHeights();
const FLOATING = floatingCenters();

function Blocks({ mode }: { mode: "grounded" | "floating" }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const offset = (SIZE - 1) / 2;
    darkCells.forEach(([x, z], i) => {
      if (mode === "grounded") {
        const h = GROUNDED[i];
        dummy.position.set(x - offset, h / 2, z - offset);
        dummy.scale.set(1, h, 1);
      } else {
        dummy.position.set(x - offset, FLOATING[i], z - offset);
        dummy.scale.set(1, 1.6, 1);
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [mode]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, darkCells.length]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#111114" roughness={0.45} metalness={0.2} />
    </instancedMesh>
  );
}

type View = "solve" | "other" | "top";

function Tile({ mode, view, title, note }: { mode: "grounded" | "floating"; view: View; title: string; note: string }) {
  const span = SIZE + QUIET_ZONE * 2;
  const d = SIZE * 2.4;
  const pos: [number, number, number] =
    view === "solve"
      ? [d * COS_P / SQRT2, d * SIN_P, d * COS_P / SQRT2]
      : view === "other"
        ? [-d * 0.75, d * 0.45, d * 0.2]
        : [0, d * 1.4, 0];
  const zoom = view === "top" ? 300 / span : 190 / span;

  return (
    <div className="flex flex-col gap-2">
      <div className="h-[380px] overflow-hidden rounded-xl border border-zinc-300 bg-zinc-100">
        <Canvas dpr={[1, 2]}>
          <color attach="background" args={["#ededee"]} />
          <OrthographicCamera
            makeDefault
            position={pos}
            up={view === "top" ? [0, 0, -1] : [0, 1, 0]}
            zoom={zoom}
            near={-500}
            far={500}
            onUpdate={(c) => c.lookAt(0, view === "top" ? 0 : 14, 0)}
          />
          <ambientLight intensity={0.4} />
          <directionalLight position={[14, 26, 10]} intensity={2} />
          <directionalLight position={[-18, 10, -14]} intensity={0.8} color="#9fb6ff" />
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
            <planeGeometry args={[span, span]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
          <Blocks mode={mode} />
          {view !== "top" && <OrbitControls target={[0, 14, 0]} />}
        </Canvas>
      </div>
      <div>
        <p className="text-sm font-semibold text-zinc-900">{title}</p>
        <p className="text-sm text-zinc-600">{note}</p>
      </div>
    </div>
  );
}

export default function Anamorphic() {
  return (
    <main className="min-h-full bg-zinc-50 p-8">
      <h1 className="mb-1 text-2xl font-semibold text-zinc-900">Grounded vs floating</h1>
      <p className="mb-6 max-w-3xl text-zinc-600">
        Same QR, same target shape (a tree), two techniques. Top row is the one angle the
        shape is solved for. Bottom row shows what floating looks like from elsewhere, and
        from straight above.
      </p>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Tile mode="grounded" view="solve" title="A · Grounded columns" note="every block reaches the ground — the shape fills in solid" />
        <Tile mode="floating" view="solve" title="B · Floating blocks" note="blocks parked in mid-air — gaps survive, so the trunk reads" />
        <Tile mode="floating" view="other" title="B from another angle" note="abstract from anywhere else — that is the puzzle" />
        <Tile mode="floating" view="top" title="B from straight above" note="still the same scannable code" />
      </div>
    </main>
  );
}
