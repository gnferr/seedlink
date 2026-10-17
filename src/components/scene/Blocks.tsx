"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Block } from "@/lib/solver";
import type { Theme } from "@/lib/themes";

const BLOCK_HEIGHT = 1.6;
const HALF_BLOCK = BLOCK_HEIGHT / 2;

const dummy = new THREE.Object3D();

function Group({
  blocks,
  color,
  theme,
  offsetX,
  offsetZ,
}: {
  blocks: Block[];
  color: string;
  theme: Theme;
  offsetX: number;
  offsetZ: number;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    blocks.forEach((b, i) => {
      if (b.grounded) {
        const h = b.y + HALF_BLOCK;
        dummy.position.set(b.x - offsetX, h / 2, b.z - offsetZ);
        dummy.scale.set(1, h, 1);
      } else {
        dummy.position.set(b.x - offsetX, b.y, b.z - offsetZ);
        dummy.scale.set(1, BLOCK_HEIGHT, 1);
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [blocks, offsetX, offsetZ]);

  if (blocks.length === 0) return null;
  return (
    <instancedMesh
      key={blocks.length}
      ref={ref}
      args={[undefined, undefined, blocks.length]}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        color={color}
        roughness={theme.roughness}
        metalness={theme.metalness}
      />
    </instancedMesh>
  );
}

export default function Blocks({
  blocks,
  theme,
  flatten,
  size,
}: {
  blocks: Block[];
  theme: Theme;
  flatten: boolean;
  /** Matrix size; centres the grid. Falls back to the largest block index + 1, which is off-centre if the outer cells are light. */
  size?: number;
}) {
  const n = size ?? blocks.reduce((m, b) => Math.max(m, b.x, b.z), -1) + 1;
  const offset = (n - 1) / 2;

  const groups = useMemo(() => {
    if (flatten) return [{ key: "scan", color: theme.colorScan, blocks }];
    const { trunk, canopy, body } = theme.regionColors;
    return [
      { key: "trunk", color: trunk, blocks: blocks.filter((b) => b.region === "trunk") },
      { key: "canopy", color: canopy, blocks: blocks.filter((b) => b.region === "canopy") },
      { key: "body", color: body, blocks: blocks.filter((b) => b.region === "body" || b.region === null) },
    ];
  }, [blocks, flatten, theme]);

  return (
    <>
      {groups.map((g) => (
        <Group key={g.key} blocks={g.blocks} color={g.color} theme={theme} offsetX={offset} offsetZ={offset} />
      ))}
    </>
  );
}
