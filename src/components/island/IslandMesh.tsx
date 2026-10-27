"use client";

import { useLayoutEffect, useMemo, useRef, type Ref, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Island, IslandVoxel } from "@/lib/island";
import { INK, PAD, PALETTES } from "@/lib/palette";
import type { DarkModule } from "@/lib/qr";
import { skyState } from "@/lib/daycycle";
import { hash3 } from "@/lib/rng";
import type { Season } from "@/lib/seasons";
import type { FoldState } from "./IslandScene";

const dummy = new THREE.Object3D();
const reset = (o: THREE.Object3D) => {
  o.position.set(0, 0, 0);
  o.rotation.set(0, 0, 0, "XYZ");
  o.scale.set(1, 1, 1);
  return o;
};
const colour = new THREE.Color();
const stone = new THREE.Color();
const TILE = { height: 0.2 }; // folded height; a full pitch wide, so neighbouring dark tiles join
const FLOWERS = ["#f4e27a", "#ffb0cc", "#ffffff"];
const WATER = ["#b6e2ff", "#7cc4ff", "#7cc4ff"];
const ink = new THREE.Color(INK);

// The hidden garden: a trimmed meadow on a patchy moss pad, fern clumps on the code and a hedge ring in the tree
// state. The fold shrinks the plants away, turns moss to PAD and the clump beds to INK, and dims the grass beyond
// the ring so the hedge frames the folded code.
const BED = 0.08; // a fern clump's bed height in the tree state
const FROND = { count: 6, tilt: 0.55, width: 0.16, thick: 0.05 }; // per dark module; sizes in module pitches
const RING = { scale: 1.4, lift: 0.2 }; // the ring stands 0.4 above the grass
const DIM = 0.85; // how far the fold sinks the grass beyond the ring into the sky behind it
const dusk = new THREE.Color();

/** Smooth value noise in [0, 1] for the moss patches. */
function patch(x: number, z: number): number {
  const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi;
  const a = hash3(xi, 4, zi), b = hash3(xi + 1, 4, zi), c = hash3(xi, 4, zi + 1), d = hash3(xi + 1, 4, zi + 1);
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** One plant part: a box `len` long that leans `tilt` up from flat (π/2 stands straight) toward `ang`, from (x, y0, z). */
type Sprig = { x: number; z: number; y0: number; len: number; width: number; thick: number; ang: number; tilt: number; colour: THREE.Color };

function placeSprig(p: Sprig, s: number, o: THREE.Object3D) {
  const half = (p.len * s) / 2;
  o.position.set(p.x + Math.cos(p.ang) * Math.cos(p.tilt) * half, p.y0 * s + Math.sin(p.tilt) * half, p.z - Math.sin(p.ang) * Math.cos(p.tilt) * half);
  o.rotation.set(0, p.ang, p.tilt, "YZX");
  o.scale.set(Math.max(1e-4, p.len * s), p.thick * s, p.width * s);
}

/** Ferns on every dark module and a trimmed meadow (short grass, a few flowers) on the light pad between them. */
function growGarden(cells: IslandVoxel[], dark: DarkModule[], size: number, pitch: number, season: Season): Sprig[] {
  const p = PALETTES[season];
  const out: Sprig[] = [];
  for (const { x, z, col, row } of dark) {
    const turn = hash3(col, 7, row) * 2;
    for (let k = 0; k < FROND.count; k++)
      out.push({
        x, z, y0: BED, len: (0.45 + hash3(col, 8 + k, row) * 0.2) * pitch, width: FROND.width * pitch, thick: FROND.thick,
        ang: (k / FROND.count) * Math.PI * 2 + turn, tilt: FROND.tilt,
        colour: new THREE.Color(p.hedge).multiplyScalar(0.85 + hash3(col, 20 + k, row) * 0.35),
      });
  }
  const half = (size - 1) / 2;
  const isDark = new Set(dark.map((d) => d.row * size + d.col));
  const flowers = season === "WINTER" ? ["#ffffff", "#dfe8f3", "#cfe0ff"] : FLOWERS;
  for (const { x, z, kind } of cells) {
    if (kind !== "pad") continue;
    const col = Math.round(x / pitch + half), row = Math.round(z / pitch + half);
    if (col >= 0 && col < size && row >= 0 && row < size && isDark.has(row * size + col)) continue;
    for (let k = 0; k < 2; k++)
      out.push({
        x: x + (hash3(x, 30 + k, z) - 0.5) * 0.7, z: z + (hash3(x, 32 + k, z) - 0.5) * 0.7, y0: 0,
        len: 0.2 + hash3(x, 34 + k, z) * 0.2, width: 0.07, thick: 0.07, ang: 0, tilt: Math.PI / 2,
        colour: new THREE.Color(p.grass[1]).multiplyScalar(0.8 + hash3(x, 36 + k, z) * 0.3),
      });
    if (hash3(x, 40, z) > 0.8) {
      out.push({ x, z, y0: 0, len: 0.3, width: 0.05, thick: 0.05, ang: 0, tilt: Math.PI / 2, colour: new THREE.Color(p.grass[2]).multiplyScalar(0.75) });
      out.push({ x, z, y0: 0.3, len: 0.18, width: 0.18, thick: 0.18, ang: 0, tilt: 0, colour: new THREE.Color(flowers[Math.floor(hash3(x, 41, z) * 3)]) });
    }
  }
  return out;
}

/** Plants are gone by this far into the fold. */
const shrinkAt = (t: number) => Math.max(0, 1 - t * 1.6);

function voxelColour(v: IslandVoxel, season: Season, t: number, out: THREE.Color) {
  const p = PALETTES[season];
  const { x, z, depth: d } = v;
  switch (v.kind) {
    case "pad": return out.set(p.moss).multiplyScalar(0.9 + patch(x / 2.5, z / 2.5) * 0.2)
      .lerp(stone.set(PAD).multiplyScalar(0.95 + hash3(x, 1, z) * 0.05), t);
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
      place(i, reset(dummy));
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
  time,
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
  /** Time of day; the folded grass fades toward the sky at that time. */
  time: number;
  fold: RefObject<FoldState>;
  reducedMotion: boolean;
  /** Everything a tap counts as ground. */
  groupRef?: Ref<THREE.Group>;
}) {
  const voxels = useRef<THREE.InstancedMesh>(null);
  const tiles = useRef<THREE.InstancedMesh>(null);
  const deco = useRef<THREE.InstancedMesh>(null);
  const plants = useRef<THREE.InstancedMesh>(null);
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
    const h = THREE.MathUtils.lerp(BED, TILE.height, t);
    o.position.set(dark[i].x, h / 2, dark[i].z);
    o.scale.set(1, h / TILE.height, 1);
  };
  const tileColour = (i: number, t: number, c: THREE.Color) =>
    c.set(hedge).multiplyScalar(0.9 + hash3(dark[i].col, 3, dark[i].row) * 0.15).lerp(ink, t);
  useInstances(tiles, dark.length, (i, o) => tilePlace(i, fold.current.t, o), (i, c) => tileColour(i, fold.current.t, c),
    [dark, size, hedge]);

  const garden = useMemo(() => growGarden(cells, dark, size, pitch, season), [cells, dark, size, pitch, season]);
  useInstances(plants, garden.length, (i, o) => placeSprig(garden[i], shrinkAt(fold.current.t), o), (i, c) => c.copy(garden[i].colour), [garden]);

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
  const last = useRef<{ t: number; key: unknown[]; flow: number; shrink: number; plants: unknown }>({ t: NaN, key: [], flow: -1, shrink: NaN, plants: null });
  useFrame(({ clock }) => {
    const { t } = fold.current;
    const l = last.current;
    const vm = voxels.current, tm = tiles.current, dm = deco.current;
    const key = [vm, tm, dm, cells, dark, decos, season, time];
    if (t !== l.t || key.some((k, i) => k !== l.key[i])) {
      const [r, g, b] = skyState(time).sky[2];
      dusk.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
      if (vm) {
        for (const i of folding) vm.setColorAt(i, voxelColour(cells[i], season, t, colour));
        if (vm.instanceColor) vm.instanceColor.needsUpdate = true;
      }
      if (tm) {
        for (let i = 0; i < dark.length; i++) {
          tilePlace(i, t, reset(dummy));
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
    const pm = plants.current, shrink = shrinkAt(t);
    if (pm && (shrink !== l.shrink || pm !== l.plants)) {
      for (let i = 0; i < garden.length; i++) {
        placeSprig(garden[i], shrink, reset(dummy));
        dummy.updateMatrix();
        pm.setMatrixAt(i, dummy.matrix);
      }
      pm.instanceMatrix.needsUpdate = true;
      l.shrink = shrink;
      l.plants = pm;
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
      {garden.length > 0 && (
        <instancedMesh key={`p${garden.length}`} ref={plants} args={[undefined, undefined, garden.length]}>
          <boxGeometry />
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
