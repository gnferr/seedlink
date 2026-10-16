"use client";

// THROWAWAY SPIKE — ways to combine grounded and floating. Not product code.

import { useRef, useLayoutEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, OrthographicCamera } from "@react-three/drei";
import * as THREE from "three";
import { generateMatrix, QUIET_ZONE } from "@/lib/qr";

const dummy = new THREE.Object3D();
const matrix = generateMatrix("https://example.com");
const SIZE = matrix.size;
const COS_P = Math.cos(Math.PI / 6);
const SIN_P = Math.sin(Math.PI / 6);
const SQRT2 = Math.SQRT2;

const screenU = (x: number, z: number) => (x - z) / SQRT2;
const groundW = (x: number, z: number) => (x + z - (SIZE - 1)) / SQRT2;
const heightFor = (v: number, w: number) => (v + w * SIN_P) / COS_P;

const V_LO = 11;
const V_SPAN = 26;

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

/** Centre height per block, plus whether the shape is solid from the floor up to it. */
const SOLVED: Array<{ y: number; slot: number; canGround: boolean }> = new Array(darkCells.length);
{
  const columns = new Map<number, number[]>();
  darkCells.forEach(([x, z], i) => {
    const key = Math.round(screenU(x, z) * SQRT2);
    if (!columns.has(key)) columns.set(key, []);
    columns.get(key)!.push(i);
  });
  for (const [, members] of columns) {
    const [x0, z0] = darkCells[members[0]];
    const a = toU01(screenU(x0, z0));
    const filled: number[] = [];
    for (let i = 0; i <= 60; i++) if (inTree(a, i / 60)) filled.push(i / 60);

    // Only the run of shape that starts at the floor may become real columns;
    // grounding anything above it would fill the gaps that make the shape readable.
    let groundTop = -1;
    if (filled.length && filled[0] <= 0.1) {
      groundTop = filled[0];
      for (let i = 1; i < filled.length; i++) {
        if (filled[i] - filled[i - 1] > 1.5 / 60) break;
        groundTop = filled[i];
      }
    }

    members.forEach((idx, k) => {
      const [x, z] = darkCells[idx];
      if (!filled.length) {
        SOLVED[idx] = { y: 0.8, slot: 0, canGround: false };
        return;
      }
      const slot = filled[Math.floor((k * filled.length) / members.length)];
      SOLVED[idx] = {
        y: heightFor(V_LO + slot * V_SPAN, groundW(x, z)),
        slot,
        canGround: slot <= groundTop,
      };
    });
  }
}

type Variant = "floating" | "stems" | "partial";

function Blocks({ variant }: { variant: Variant }) {
  const blocks = useRef<THREE.InstancedMesh>(null);
  const stems = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const bm = blocks.current, sm = stems.current;
    if (!bm || !sm) return;
    const offset = (SIZE - 1) / 2;
    let stemCount = 0;

    darkCells.forEach(([x, z], i) => {
      const { y, canGround } = SOLVED[i];
      const grounded = variant === "partial" && canGround;
      if (grounded) {
        const h = Math.max(0.8, y + 0.8);
        dummy.position.set(x - offset, h / 2, z - offset);
        dummy.scale.set(1, h, 1);
      } else {
        dummy.position.set(x - offset, y, z - offset);
        dummy.scale.set(1, 1.6, 1);
      }
      dummy.updateMatrix();
      bm.setMatrixAt(i, dummy.matrix);

      if (variant === "stems" && !grounded) {
        const stemH = Math.max(0.1, y - 0.8);
        dummy.position.set(x - offset, stemH / 2, z - offset);
        dummy.scale.set(0.2, stemH, 0.2);
        dummy.updateMatrix();
        sm.setMatrixAt(stemCount++, dummy.matrix);
      }
    });

    bm.instanceMatrix.needsUpdate = true;
    bm.computeBoundingSphere();
    sm.count = stemCount;
    sm.instanceMatrix.needsUpdate = true;
    sm.computeBoundingSphere();
  }, [variant]);

  return (
    <>
      <instancedMesh ref={blocks} args={[undefined, undefined, darkCells.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#111114" roughness={0.45} metalness={0.2} />
      </instancedMesh>
      <instancedMesh ref={stems} args={[undefined, undefined, darkCells.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#3f3f46" roughness={0.7} />
      </instancedMesh>
    </>
  );
}

function Tile({ variant, title, note }: { variant: Variant; title: string; note: string }) {
  const span = SIZE + QUIET_ZONE * 2;
  const d = SIZE * 2.4;
  return (
    <div className="flex flex-col gap-2">
      <div className="h-[400px] overflow-hidden rounded-xl border border-zinc-300 bg-zinc-100">
        <Canvas dpr={[1, 2]}>
          <color attach="background" args={["#ededee"]} />
          <OrthographicCamera
            makeDefault
            position={[(d * COS_P) / SQRT2, d * SIN_P, (d * COS_P) / SQRT2]}
            zoom={185 / span}
            near={-500}
            far={500}
            onUpdate={(c) => c.lookAt(0, 14, 0)}
          />
          <ambientLight intensity={0.4} />
          <directionalLight position={[14, 26, 10]} intensity={2} />
          <directionalLight position={[-18, 10, -14]} intensity={0.8} color="#9fb6ff" />
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
            <planeGeometry args={[span, span]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
          <Blocks variant={variant} />
          <OrbitControls target={[0, 14, 0]} />
        </Canvas>
      </div>
      <div>
        <p className="text-sm font-semibold text-zinc-900">{title}</p>
        <p className="text-sm text-zinc-600">{note}</p>
      </div>
    </div>
  );
}

export default function Combined() {
  return (
    <main className="min-h-full bg-zinc-50 p-8">
      <h1 className="mb-1 text-2xl font-semibold text-zinc-900">Combining grounded and floating</h1>
      <p className="mb-6 max-w-3xl text-zinc-600">
        Same tree, same viewpoint. Pure floating on the left as the reference.
      </p>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Tile variant="floating" title="Pure floating" note="reference — blocks hover, nothing touches down" />
        <Tile variant="stems" title="Stems" note="every floating block gets a thin support to the plane" />
        <Tile variant="partial" title="Contact grounded" note="columns only where the shape touches the floor — gaps survive" />
      </div>
    </main>
  );
}
