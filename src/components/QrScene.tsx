"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  OrthographicCamera,
  PerspectiveCamera,
} from "@react-three/drei";
import * as THREE from "three";
import { QUIET_ZONE, type QrMatrix } from "@/lib/qr";
import type { Theme } from "@/lib/themes";

export type ViewMode = "SCAN" | "EXPLORE";

const dummy = new THREE.Object3D();

// TEMPORARY: a stand-in for the real anamorphic solver (src/lib/solver.ts, Task 3,
// not yet wired in here — that's Task 6/8). This is only here so the page renders
// again while the rebuild is mid-flight; same deterministic-hash approach v1 used.
function placeholderHeight(x: number, z: number): number {
  const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return 1 + (h - Math.floor(h)) * 6;
}

function Voxels({
  matrix,
  theme,
}: {
  matrix: QrMatrix;
  theme: Theme;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);

  const dark = useMemo(() => {
    const out: Array<[number, number]> = [];
    const { cells, size } = matrix;
    for (let z = 0; z < size; z++) {
      for (let x = 0; x < size; x++) {
        if (cells[z * size + x]) out.push([x, z]);
      }
    }
    return out;
  }, [matrix]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const offset = (matrix.size - 1) / 2;
    dark.forEach(([x, z], i) => {
      const h = placeholderHeight(x, z);
      dummy.position.set(x - offset, h / 2, z - offset);
      dummy.scale.set(1, h, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.count = dark.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [dark, matrix.size]);

  return (
    // key: InstancedMesh allocates its buffer from count
    <instancedMesh key={dark.length} ref={ref} args={[undefined, undefined, dark.length]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        color={theme.colorScan}
        roughness={theme.roughness}
        metalness={theme.metalness}
      />
    </instancedMesh>
  );
}

function Base({ size, colorLight }: { size: number; colorLight: string }) {
  const span = size + QUIET_ZONE * 2;
  return (
    // Basic (unshaded) material: top-down contrast must never be dimmed by shading.
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
      <planeGeometry args={[span, span]} />
      <meshBasicMaterial color={colorLight} />
    </mesh>
  );
}

function Cameras({ mode, size }: { mode: ViewMode; size: number }) {
  const viewport = useThree((s) => s.size);
  const ortho = useRef<THREE.OrthographicCamera>(null);
  const span = size + QUIET_ZONE * 2;
  const zoom = Math.min(viewport.width, viewport.height) / span;

  // up is along -Z because a straight-down lookAt is degenerate with the default up.
  useLayoutEffect(() => {
    ortho.current?.lookAt(0, 0, 0);
  }, [mode, zoom]);

  return (
    <>
      <PerspectiveCamera
        makeDefault={mode === "EXPLORE"}
        fov={45}
        near={0.1}
        far={1000}
        position={[span * 0.75, span * 0.7, span * 0.75]}
      />
      <OrthographicCamera
        ref={ortho}
        makeDefault={mode === "SCAN"}
        position={[0, 100, 0]}
        up={[0, 0, -1]}
        zoom={zoom}
        near={0.1}
        far={400}
      />
    </>
  );
}

export default function QrScene({
  matrix,
  mode,
  theme,
}: {
  matrix: QrMatrix;
  mode: ViewMode;
  theme: Theme;
}) {
  return (
    <Canvas dpr={[1, 2]} gl={{ preserveDrawingBuffer: true }}>
      <color attach="background" args={[theme.background]} />
      <Cameras mode={mode} size={matrix.size} />
      {/* No shadows: cast shadows would break top-down module contrast. */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[6, 12, 8]} intensity={1.6} />
      <Base size={matrix.size} colorLight={theme.colorLight} />
      <Voxels matrix={matrix} theme={theme} />
      {mode === "EXPLORE" && <OrbitControls makeDefault target={[0, 0, 0]} />}
    </Canvas>
  );
}
