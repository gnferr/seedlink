"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { blockBox } from "@/lib/blockGeometry";
import type { Block } from "@/lib/solver";
import type { Theme } from "@/lib/themes";

const dummy = new THREE.Object3D();

function Group({
  blocks,
  color,
  theme,
  offset,
}: {
  blocks: Block[];
  color: string;
  theme: Theme;
  offset: number;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    blocks.forEach((b, i) => {
      const { x, y, z, h } = blockBox(b, offset);
      dummy.position.set(x, y, z);
      dummy.scale.set(1, h, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [blocks, offset]);

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
  size: number;
}) {
  const offset = (size - 1) / 2;

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
        <Group key={g.key} blocks={g.blocks} color={g.color} theme={theme} offset={offset} />
      ))}
    </>
  );
}
