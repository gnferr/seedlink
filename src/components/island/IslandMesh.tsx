"use client";

import { useLayoutEffect, useMemo, useRef, type Ref, type RefObject } from "react";
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
const TILE = { height: 0.2 }; // folded height; a full pitch wide, so neighbouring dark tiles join
const FLOWERS = ["#f4e27a", "#ffb0cc", "#ffffff"];
const WATER = ["#b6e2ff", "#7cc4ff", "#7cc4ff"];
const ink = new THREE.Color(INK);

// The hidden garden: moss pad, hedge code and a hedge ring in the tree state. The fold turns moss to PAD and
// hedges to INK and flattens them, and dims the grass beyond the ring so the hedge frames the folded code.
const HEDGE = { tall: 0.8, low: 0.5 }; // finder and module hedge heights in the tree state
const RING = { scale: 1.4, lift: 0.2 }; // the ring stands 0.4 above the grass
const DIM = 0.85; // how far the fold sinks the grass beyond the ring into the night
const dusk = new THREE.Color("#1d2140");

function voxelColour(v: IslandVoxel, season: Season, t: number, out: THREE.Color) {
  const p = PALETTES[season];
  const { x, z, depth: d } = v;
  switch (v.kind) {
    case "pad": return out.set(p.moss).lerp(stone.set(PAD), t).multiplyScalar(0.95 + hash3(x, 1, z) * 0.05);
    case "hedge": return out.set(p.hedge).multiplyScalar(0.9 + hash3(x, 2, z) * 0.15);
    case "grass": return out.set(p.grass[Math.floor(hash3(x, 0, z, 5) * 3)]).lerp(dusk, DIM * t);
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
  const { grass, hedge } = PALETTES[season];
  const { voxels: cells, deco: decos, waterfall } = island;
  // Only the pad and the grass top change colour with the fold.
  const folding = useMemo(() => cells.flatMap((v, i) => (v.kind === "pad" || v.kind === "grass" ? [i] : [])), [cells]);

  useInstances(voxels, cells.length, (i, o) => {
    const v = cells[i];
    o.position.set(v.x, v.y + (v.kind === "hedge" ? RING.lift : 0), v.z);
    if (v.kind === "hedge") o.scale.y = RING.scale;
  }, (i, c) => voxelColour(cells[i], season, fold.current.t, c), [cells, season]);

  const tilePlace = (i: number, t: number, o: THREE.Object3D) => {
    const h = THREE.MathUtils.lerp(isFinder(dark[i].col, dark[i].row, size) ? HEDGE.tall : HEDGE.low, TILE.height, t);
    o.position.set(dark[i].x, h / 2, dark[i].z);
    o.scale.set(1, h / TILE.height, 1);
  };
  const tileColour = (i: number, t: number, c: THREE.Color) =>
    c.set(hedge).multiplyScalar(0.9 + hash3(dark[i].col, 3, dark[i].row) * 0.15).lerp(ink, t);
  useInstances(tiles, dark.length, (i, o) => tilePlace(i, fold.current.t, o), (i, c) => tileColour(i, fold.current.t, c),
    [dark, size, hedge]);

  const decoColour = (i: number, t: number, c: THREE.Color) => {
    const { kind, tint } = decos[i];
    if (kind === "tuft") c.set(grass[2]).multiplyScalar(0.85);
    else c.set(season === "WINTER" ? "#dfe8f3" : FLOWERS[Math.floor(tint * 100) % 3]);
    return c.lerp(dusk, DIM * t);
  };
  useInstances(deco, decos.length, (i, o) => {
    const { x, z, kind, tint } = decos[i];
    const flower = kind === "flower";
    o.position.set(x + (tint - 0.9) * 2, flower ? 0.2 : 0.25, z);
    o.scale.set(flower ? 0.3 : 0.18, flower ? 0.35 : 0.5, flower ? 0.3 : 0.18);
  }, (i, c) => decoColour(i, fold.current.t, c), [decos, season, grass]);

  // The garden follows the fold every frame it moves; the waterfall flows until folded.
  const last = useRef<{ t: number; key: unknown[]; flow: number }>({ t: NaN, key: [], flow: -1 });
  useFrame(({ clock }) => {
    const { t } = fold.current;
    const l = last.current;
    const vm = voxels.current, tm = tiles.current, dm = deco.current;
    const key = [vm, tm, dm, cells, dark, decos, season];
    if (t !== l.t || key.some((k, i) => k !== l.key[i])) {
      if (vm) {
        for (const i of folding) vm.setColorAt(i, voxelColour(cells[i], season, t, colour));
        if (vm.instanceColor) vm.instanceColor.needsUpdate = true;
      }
      if (tm) {
        for (let i = 0; i < dark.length; i++) {
          dummy.position.set(0, 0, 0);
          dummy.scale.set(1, 1, 1);
          tilePlace(i, t, dummy);
          dummy.updateMatrix();
          tm.setMatrixAt(i, dummy.matrix);
          tm.setColorAt(i, tileColour(i, t, colour));
        }
        tm.instanceMatrix.needsUpdate = true;
        if (tm.instanceColor) tm.instanceColor.needsUpdate = true;
      }
      if (dm) {
        for (let i = 0; i < decos.length; i++) dm.setColorAt(i, decoColour(i, t, colour));
        if (dm.instanceColor) dm.instanceColor.needsUpdate = true;
      }
      l.t = t;
      l.key = key;
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
