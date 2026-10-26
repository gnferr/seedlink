"use client";

import { useLayoutEffect, useRef, type Ref, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Island, IslandVoxel } from "@/lib/island";
import { INK, PAD, PALETTES } from "@/lib/palette";
import { isFinder, type DarkModule } from "@/lib/qr";
import { hash3 } from "@/lib/rng";
import type { Season } from "@/lib/seasons";
import type { FoldState } from "./IslandScene";

const dummy = new THREE.Object3D();
const colour = new THREE.Color();
const stone = new THREE.Color();
const TILE = { height: 0.2, y: 0.1 }; // a full pitch wide, so neighbouring dark tiles join
const FLOWERS = ["#f4e27a", "#ffb0cc", "#ffffff"];
const WATER = ["#b6e2ff", "#7cc4ff", "#7cc4ff"];
const ink = new THREE.Color(INK);

function voxelColour(v: IslandVoxel, season: Season, out: THREE.Color) {
  const p = PALETTES[season];
  const { x, z, depth: d } = v;
  switch (v.kind) {
    case "pad": return out.set(PAD).multiplyScalar(0.95 + hash3(x, 1, z) * 0.05);
    case "grass": return out.set(p.grass[Math.floor(hash3(x, 0, z, 5) * 3)]);
    case "dirt": return out.set(p.dirt).multiplyScalar(0.85 + hash3(x, d, z) * 0.2);
    case "mix": return out.set(p.dirt).lerp(stone.set(p.stone), 0.5).multiplyScalar(0.78 + hash3(x, d, z) * 0.25);
    case "stone": return out.set(p.stone).multiplyScalar(0.78 + hash3(x, d, z) * 0.25);
  }
}

/** Writes every instance's matrix (and colour) once, then refreshes the bounds used for culling and raycasts. */
export function useInstances(
  ref: React.RefObject<THREE.InstancedMesh | null>,
  count: number,
  place: (i: number, o: THREE.Object3D) => void,
  paint: (i: number, c: THREE.Color) => void,
  deps: unknown[],
) {
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    for (let i = 0; i < count; i++) {
      dummy.position.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      place(i, dummy);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      paint(i, colour);
      mesh.setColorAt(i, colour);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor!.needsUpdate = true;
    mesh.computeBoundingSphere();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export default function IslandMesh({
  island,
  dark,
  size,
  pitch,
  season,
  fold,
  reducedMotion,
  groupRef,
}: {
  island: Island;
  dark: DarkModule[];
  /** Module count, for finder lookup. */
  size: number;
  /** Module width in world units. */
  pitch: number;
  season: Season;
  fold: RefObject<FoldState>;
  reducedMotion: boolean;
  /** Everything a tap counts as ground. */
  groupRef?: Ref<THREE.Group>;
}) {
  const voxels = useRef<THREE.InstancedMesh>(null);
  const tiles = useRef<THREE.InstancedMesh>(null);
  const deco = useRef<THREE.InstancedMesh>(null);
  const water = useRef<THREE.InstancedMesh>(null);
  const grass = PALETTES[season].grass;
  const { voxels: cells, deco: decos, waterfall } = island;

  useInstances(voxels, cells.length, (i, o) => o.position.set(cells[i].x, cells[i].y, cells[i].z),
    (i, c) => voxelColour(cells[i], season, c), [cells, season]);

  // Finders read as grass in the tree state.
  useInstances(tiles, dark.length, (i, o) => o.position.set(dark[i].x, TILE.y, dark[i].z),
    (i, c) => (isFinder(dark[i].col, dark[i].row, size) ? c.set(grass[1]).multiplyScalar(1.05) : c.set(INK)),
    [dark, size, grass]);

  useInstances(deco, decos.length, (i, o) => {
    const { x, z, kind, tint } = decos[i];
    const flower = kind === "flower";
    o.position.set(x + (tint - 0.9) * 2, flower ? 0.2 : 0.25, z);
    o.scale.set(flower ? 0.3 : 0.18, flower ? 0.35 : 0.5, flower ? 0.3 : 0.18);
  }, (i, c) => {
    const { kind, tint } = decos[i];
    if (kind === "tuft") return c.set(grass[2]).multiplyScalar(0.85);
    return c.set(season === "WINTER" ? "#dfe8f3" : FLOWERS[Math.floor(tint * 100) % 3]);
  }, [decos, season, grass]);

  // Finders read as grass in the tree state and turn ink as the tree folds; the waterfall flows until folded.
  const last = useRef<{ t: number; tiles: unknown; grass: unknown; dark: unknown; flow: number }>({ t: NaN, tiles: null, grass: null, dark: null, flow: -1 });
  useFrame(({ clock }) => {
    const { t } = fold.current;
    const l = last.current;
    const tm = tiles.current;
    if (tm && (t !== l.t || tm !== l.tiles || grass !== l.grass || dark !== l.dark)) {
      for (let i = 0; i < dark.length; i++) {
        if (isFinder(dark[i].col, dark[i].row, size)) tm.setColorAt(i, colour.set(grass[1]).multiplyScalar(1.05).lerp(ink, t));
      }
      if (tm.instanceColor) tm.instanceColor.needsUpdate = true;
      l.t = t;
      l.tiles = tm;
      l.grass = grass;
      l.dark = dark;
    }
    const wm = water.current;
    const flow = Math.floor(clock.elapsedTime * 8);
    if (wm && !reducedMotion && t < 1 && flow !== l.flow) {
      for (let k = 0; k < waterfall.length; k++) wm.setColorAt(k, colour.set(WATER[(k + flow) % 3]));
      if (wm.instanceColor) wm.instanceColor.needsUpdate = true;
      l.flow = flow;
    }
  });

  useInstances(water, waterfall.length, (k, o) => o.position.set(waterfall.x, -0.5 - k, waterfall.z),
    (k, c) => c.set(WATER[k % 3]), [waterfall]);

  return (
    <group ref={groupRef}>
      <instancedMesh key={`v${cells.length}`} ref={voxels} args={[undefined, undefined, cells.length]}>
        <boxGeometry />
        <meshLambertMaterial />
      </instancedMesh>
      {dark.length > 0 && (
        <instancedMesh key={`t${dark.length}|${pitch}`} ref={tiles} args={[undefined, undefined, dark.length]}>
          <boxGeometry args={[pitch, TILE.height, pitch]} />
          <meshLambertMaterial />
        </instancedMesh>
      )}
      {decos.length > 0 && (
        <instancedMesh key={`d${decos.length}`} ref={deco} args={[undefined, undefined, decos.length]}>
          <boxGeometry />
          <meshLambertMaterial />
        </instancedMesh>
      )}
      <instancedMesh key={`w${waterfall.length}`} ref={water} args={[undefined, undefined, waterfall.length]}>
        <boxGeometry />
        <meshBasicMaterial transparent opacity={0.85} />
      </instancedMesh>
    </group>
  );
}
