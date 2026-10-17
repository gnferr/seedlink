"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { blockBox } from "@/lib/blockGeometry";
import type { Environment } from "@/lib/motion";
import type { Block } from "@/lib/solver";
import type { Theme } from "@/lib/themes";
import { createSwayMaterial, updateSwayMaterial, type SwayKind } from "./blockMaterial";

const dummy = new THREE.Object3D();

function Group({
  blocks,
  color,
  theme,
  offset,
  material,
}: {
  blocks: Block[];
  color: string;
  theme: Theme;
  offset: number;
  material?: THREE.Material;
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
      {...(material && { material, frustumCulled: false })}
    >
      <boxGeometry args={[1, 1, 1]} />
      {!material && (
        <meshStandardMaterial
          color={color}
          roughness={theme.roughness}
          metalness={theme.metalness}
        />
      )}
    </instancedMesh>
  );
}

function useSwayMaterial(kind: SwayKind, theme: Theme, height: number) {
  const { roughness, metalness } = theme;
  const material = useMemo(
    () => createSwayMaterial(kind, { roughness, metalness, height }),
    [kind, roughness, metalness, height],
  );
  useEffect(() => () => material.dispose(), [material]);
  return material;
}

export default function Blocks({
  blocks,
  theme,
  flatten,
  size,
  env,
}: {
  blocks: Block[];
  theme: Theme;
  flatten: boolean;
  size: number;
  env: Environment;
}) {
  const offset = (size - 1) / 2;
  const height = useMemo(
    () => blocks.reduce((top, b) => {
      const { y, h } = blockBox(b, offset);
      return Math.max(top, y + h / 2);
    }, 0),
    [blocks, offset],
  );
  const canopyMaterial = useSwayMaterial("canopy", theme, height);
  const trunkMaterial = useSwayMaterial("trunk", theme, height);

  // One reused argument object so the frame loop allocates nothing.
  const frame = useRef({ time: 0, env, summerColour: "", kind: "canopy" as SwayKind });
  useFrame((state) => {
    if (flatten) return;
    const f = frame.current;
    f.time = state.clock.elapsedTime;
    f.env = env;
    f.kind = "canopy";
    f.summerColour = theme.regionColors.canopy;
    updateSwayMaterial(canopyMaterial, f);
    f.kind = "trunk";
    f.summerColour = theme.regionColors.trunk;
    updateSwayMaterial(trunkMaterial, f);
  });

  const groups = useMemo(() => {
    if (flatten) return [{ key: "scan", color: theme.colorScan, blocks }];
    const { trunk, canopy, body } = theme.regionColors;
    return [
      { key: "trunk", color: trunk, blocks: blocks.filter((b) => b.region === "trunk"), material: trunkMaterial },
      { key: "canopy", color: canopy, blocks: blocks.filter((b) => b.region === "canopy"), material: canopyMaterial },
      { key: "body", color: body, blocks: blocks.filter((b) => b.region === "body" || b.region === null) },
    ];
  }, [blocks, flatten, theme, trunkMaterial, canopyMaterial]);

  return (
    <>
      {groups.map((g) => (
        <Group
          key={g.key}
          blocks={g.blocks}
          color={g.color}
          theme={theme}
          offset={offset}
          material={"material" in g ? g.material : undefined}
        />
      ))}
    </>
  );
}
