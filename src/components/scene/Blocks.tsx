"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { blockBox } from "@/lib/blockGeometry";
import type { Environment } from "@/lib/motion";
import { isFinder } from "@/lib/qr";
import { wrapPhase } from "@/lib/seasons";
import type { Block } from "@/lib/solver";
import type { Theme } from "@/lib/themes";
import { renderGround } from "@/lib/world";
import { createSwayMaterial, updateSwayMaterial, type SwayKind } from "./blockMaterial";

const dummy = new THREE.Object3D();

// A flat tile per dark module, so the pad reads as a QR under the tree. Just inside the unit footprint, so a
// grounded pillar on the same cell hides the tile instead of z-fighting with it.
const TILE = 0.98;
const TILE_H = 0.2;

function Tiles({ cells, offset, material }: { cells: Block[]; offset: number; material: THREE.Material }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    cells.forEach((b, i) => {
      dummy.position.set(b.x - offset, TILE_H / 2, b.z - offset);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [cells, offset]);
  if (cells.length === 0) return null;
  return (
    <instancedMesh key={cells.length} ref={ref} args={[undefined, material, cells.length]}>
      <boxGeometry args={[TILE, TILE_H, TILE]} />
    </instancedMesh>
  );
}

// Finder patterns take the meadow's grass colour, following the season like the ground around the pad.
function PadTiles({ blocks, size, offset, theme, env }: { blocks: Block[]; size: number; offset: number; theme: Theme; env: Environment }) {
  const { finders, ink } = useMemo(() => {
    const finders: Block[] = [];
    const ink: Block[] = [];
    for (const b of blocks) (isFinder(b.x, b.z, size) ? finders : ink).push(b);
    return { finders, ink };
  }, [blocks, size]);
  const { roughness, metalness, colorScan } = theme;
  const inkMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: colorScan, roughness, metalness }),
    [colorScan, roughness, metalness],
  );
  const grassMaterial = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 }), []);
  useEffect(() => () => inkMaterial.dispose(), [inkMaterial]);
  useEffect(() => () => grassMaterial.dispose(), [grassMaterial]);
  const lastPhase = useRef(NaN);
  useFrame(() => {
    const phase = wrapPhase(env.phase.value);
    if (phase === lastPhase.current) return;
    lastPhase.current = phase;
    grassMaterial.color.set(renderGround(phase).ground);
  });
  return (
    <>
      <Tiles cells={ink} offset={offset} material={inkMaterial} />
      <Tiles cells={finders} offset={offset} material={grassMaterial} />
    </>
  );
}

function Group({
  blocks,
  color,
  theme,
  offset,
  material,
  onClick,
}: {
  blocks: Block[];
  color: string;
  theme: Theme;
  offset: number;
  material?: THREE.Material;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
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
      onClick={onClick}
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
  pokeEnabled = false,
  onPoke,
}: {
  blocks: Block[];
  theme: Theme;
  flatten: boolean;
  size: number;
  env: Environment;
  pokeEnabled?: boolean;
  onPoke?: (p: { x: number; y: number; z: number }, time: number) => void;
}) {
  const offset = (size - 1) / 2;
  const height = useMemo(
    () => blocks.reduce((top, b) => {
      const { y, h } = blockBox(b, offset);
      return Math.max(top, y + h / 2);
    }, 0),
    [blocks, offset],
  );
  const clock = useThree((s) => s.clock);
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

  const poke = pokeEnabled && onPoke
    ? (e: ThreeEvent<MouseEvent>) => {
        if (e.delta > 3) return; // an orbit drag, not a click
        e.stopPropagation(); // one burst per click, not one per intersected instance
        onPoke(e.point, clock.elapsedTime);
      }
    : undefined;

  const groups = useMemo(() => {
    if (flatten) return [{ key: "scan", color: theme.colorScan, blocks }];
    const { trunk, canopy, body } = theme.regionColors;
    // Off-shape modules (region null) already show as pad tiles, so only the tree rises above the pad.
    return [
      { key: "trunk", color: trunk, blocks: blocks.filter((b) => b.region === "trunk"), material: trunkMaterial },
      { key: "canopy", color: canopy, blocks: blocks.filter((b) => b.region === "canopy"), material: canopyMaterial },
      { key: "body", color: body, blocks: blocks.filter((b) => b.region === "body") },
    ];
  }, [blocks, flatten, theme, trunkMaterial, canopyMaterial]);

  return (
    <>
      {/* Not in Scan: the graded frame stays the flattened blocks alone. */}
      {!flatten && <PadTiles blocks={blocks} size={size} offset={offset} theme={theme} env={env} />}
      {groups.map((g) => (
        <Group
          key={g.key}
          blocks={g.blocks}
          color={g.color}
          theme={theme}
          offset={offset}
          material={"material" in g ? g.material : undefined}
          onClick={g.key === "trunk" || g.key === "canopy" ? poke : undefined}
        />
      ))}
    </>
  );
}
