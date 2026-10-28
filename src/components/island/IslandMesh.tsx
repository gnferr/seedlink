"use client";

import { useLayoutEffect, useMemo, useRef, type Ref, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Toon } from "./toon";
import { grassTexture } from "./grassTexture";
import { groundTexture } from "./groundTexture";
import type { Island, IslandVoxel } from "@/lib/island";
import { INK, PAD, PALETTES, type SeasonPalette } from "@/lib/palette";
import type { DarkModule } from "@/lib/qr";
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
const ink = new THREE.Color(INK);

// The hidden garden: a trimmed meadow on a patchy moss pad, fern clumps on the code and a hedge ring in the tree
// state. The fold shrinks the plants away and turns moss to PAD and the clump beds to INK; the ring frames the code.
const BED = 0.08; // a fern clump's bed height in the tree state
const FROND = { thick: 0.08 };
const RING = { scale: 1.4, lift: 0.2 }; // the ring stands 0.4 above the pad

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

/** A pixel grass tuft card, `h` tall and `w` wide, turned `ang` about the vertical. */
type Card = { x: number; z: number; y0: number; h: number; w: number; ang: number; colour: THREE.Color };
type Garden = { sprigs: Sprig[]; cards: Card[] };

function placeCard(c: Card, s: number, o: THREE.Object3D) {
  o.position.set(c.x, c.y0 * s + (c.h * s) / 2, c.z);
  o.rotation.set(0, c.ang, 0);
  o.scale.set(Math.max(1e-4, c.w * s), Math.max(1e-4, c.h * s), 1);
}

const warm = new THREE.Color("#e6dc8c");

/** A fern clump of `n` fronds and a few upright core leaves at (x, z), all scaled by `size`. */
function fern({ sprigs: out }: Garden, p: SeasonPalette, x: number, z: number, y0: number, n: number, size: number, seed: number) {
  const turn = hash3(seed, 7, 0) * 2;
  for (let k = 0; k < n + 3; k++) {
    const core = k >= n, h = (m: number) => hash3(seed, m * 31 + k, 1);
    out.push({
      x, z, y0, len: (core ? 0.55 + h(1) * 0.5 : 0.4 + h(1) * 0.7) * size, width: (0.18 + h(2) * 0.14) * Math.min(size, 1.2), thick: FROND.thick,
      ang: core ? h(3) * Math.PI * 2 : (k / n) * Math.PI * 2 + turn + (h(3) - 0.5) * 0.9, tilt: core ? 1.25 + h(4) * 0.3 : 0.5 + h(4) * 0.9,
      colour: blend(p, x, z, 0.75 + h(6) * 0.25).multiplyScalar(0.75 + h(5) * 0.5),
    });
  }
}

/** About `n` blades' worth of crossed pixel-grass cards round (x, z); `tall` sets their height. */
function tuft({ cards }: Garden, p: SeasonPalette, x: number, z: number, y0: number, n: number, tall: number, spread: number, seed: number, cozy: boolean) {
  for (let k = 0; k < Math.ceil(n / 3); k++) {
    const h = (m: number) => hash3(seed, m * 17 + k, 2);
    const cx = x + (h(1) - 0.5) * spread, cz = z + (h(2) - 0.5) * spread, ht = tall * (0.9 + h(3) * 0.9), ang = h(4) * Math.PI;
    const colour = blend(p, x, z, h(6) * 0.5).multiplyScalar(0.95 + h(7) * 0.25);
    if (cozy) colour.lerp(warm, 0.18 + h(8) * 0.12);
    for (const turn of [0, Math.PI / 2]) cards.push({ x: cx, z: cz, y0, h: ht, w: ht * 1.1, ang: ang + turn, colour });
  }
}

/**
 * The hidden garden's plants: a fern clump on every dark module (sized and nudged by noise so the code doesn't read
 * as a grid), a wild meadow of uneven grass, flowers and stray ferns on the light pad, and a mixed planting on the
 * hedge ring with grass and vines hanging off its outer face.
 */
function growGarden(cells: IslandVoxel[], dark: DarkModule[], size: number, pitch: number, season: Season): Garden {
  const p = PALETTES[season];
  const g: Garden = { sprigs: [], cards: [] }, out = g.sprigs, cozy = season !== "WINTER";
  const flowers = season === "WINTER" ? ["#ffffff", "#dfe8f3", "#cfe0ff"] : FLOWERS;
  const flower = (x: number, z: number, y0: number, stem: number, seed: number) => {
    out.push({ x, z, y0, len: stem, width: 0.05, thick: 0.05, ang: 0, tilt: Math.PI / 2, colour: new THREE.Color(p.grass[2]).multiplyScalar(0.75) });
    out.push({ x, z, y0: y0 + stem, len: 0.18, width: 0.18, thick: 0.18, ang: 0, tilt: 0, colour: new THREE.Color(flowers[Math.floor(hash3(seed, 3, 3) * 3)]) });
  };
  // Height swells and dips across the island in broad waves, with the odd tall outlier.
  const lift = (x: number, z: number, seed: number) => 0.55 + patch(x / 6 + 40, z / 6) * 0.9 + (hash3(seed, 9, 9) > 0.92 ? 0.5 : 0);

  for (const { x, z, col, row } of dark) {
    const seed = col * 977 + row;
    const jx = (hash3(col, 1, row) - 0.5) * 0.5 * pitch, jz = (hash3(col, 2, row) - 0.5) * 0.5 * pitch;
    fern(g, p, x + jx, z + jz, BED, 9 + Math.floor(hash3(col, 3, row) * 8), pitch * lift(x, z, seed), seed);
  }

  const half = (size - 1) / 2;
  const isDark = new Set(dark.map((d) => d.row * size + d.col));
  for (const { x, z, kind } of cells) {
    if (kind !== "pad") continue;
    const col = Math.round(x / pitch + half), row = Math.round(z / pitch + half);
    if (col >= 0 && col < size && row >= 0 && row < size && isDark.has(row * size + col)) continue;
    const seed = x * 1013 + z * 7 + 5000, h = (n: number) => hash3(x, n, z), wild = patch(x / 3 + 70, z / 3);
    tuft(g, p, x, z, 0, Math.floor(wild * 7), 0.55 * lift(x, z, seed), 1.1, seed, cozy); // bare where the patch is low
    if (h(60) > 0.86) flower(x + (h(63) - 0.5) * 0.6, z + (h(64) - 0.5) * 0.6, 0, 0.35 + h(61) * 0.45, seed);
    if (h(70) > 0.9) fern(g, p, x + (h(71) - 0.5) * 0.8, z + (h(72) - 0.5) * 0.8, 0, 5 + Math.floor(h(73) * 4), 0.5 + h(74) * 0.5, seed + 1);
  }

  // The hedge ring: a mixed planting along the top, and grass and the odd vine hanging off its outer face.
  const rim = Math.max(...cells.filter((v) => v.kind === "hedge").map((v) => Math.abs(v.x)));
  const rock = new THREE.Color(p.stone);
  for (const { x, z, kind } of cells) {
    if (kind !== "hedge") continue;
    const seed = x * 1013 + z * 7 + 9000, h = (n: number) => hash3(x, n, z), pick = h(50);
    const bx = x + (h(51) - 0.5) * 0.5, bz = z + (h(52) - 0.5) * 0.5, top = 0.4;
    if (pick < 0.3) { // bush: a few stacked leaf blocks
      for (let k = 0; k < 2 + Math.floor(h(53) * 3); k++)
        out.push({ x: bx + (h(54 + k) - 0.5) * 0.4, z: bz + (h(58 + k) - 0.5) * 0.4, y0: top + k * 0.15, len: 0.55 - k * 0.1, width: 0.55 - k * 0.1, thick: 0.22,
          ang: h(62 + k), tilt: 0, colour: new THREE.Color(p.hedge).multiplyScalar(0.9 + h(66 + k) * 0.4) });
    } else if (pick < 0.55) tuft(g, p, bx, bz, top, 5 + Math.floor(h(53) * 4), 0.9 * lift(x, z, seed), 0.6, seed, cozy);
    else if (pick < 0.68) fern(g, p, bx, bz, top, 6 + Math.floor(h(53) * 4), 0.6 + h(54) * 0.5, seed);
    else if (pick < 0.78) {
      flower(bx, bz, top, 0.3 + h(53) * 0.4, seed);
      flower(bx + 0.25, bz - 0.2, top, 0.25 + h(54) * 0.3, seed + 1);
      tuft(g, p, bx, bz, top, 3, 0.5, 0.5, seed, cozy);
    } else if (pick < 0.86) out.push({ x: bx, z: bz, y0: top, len: 0.35 + h(53) * 0.25, width: 0.3 + h(54) * 0.2, thick: 0.18 + h(55) * 0.15, ang: h(56) * 3, tilt: 0,
      colour: rock.clone().multiplyScalar(0.85 + h(57) * 0.3) });
    else out.push({ x: bx, z: bz, y0: top, len: 0.45, width: 0.45, thick: 0.15 + h(53) * 0.1, ang: 0, tilt: 0, colour: new THREE.Color(p.hedge).multiplyScalar(1 + h(54) * 0.2) });

    const nx = Math.abs(x) === rim ? Math.sign(x) : 0, nz = Math.abs(z) === rim ? Math.sign(z) : 0;
    // Styles come in patches along the rim, so a stretch of ivy curtain gives way to wisteria, then bare grass.
    const style = Math.floor(patch(x / 4 + z / 4 + 30, 5) * 6);
    for (let k = 0; k < 3; k++) {
      if (h(82 + k) < 0.35) continue;
      const u = (h(84 + k) - 0.5) * 0.9;
      vine(g, p, style, x + nx * 0.55 + (nx ? 0 : u), z + nz * 0.55 + (nz ? 0 : u), nx || 0, nz || 0, 0.4 + h(86 + k) * 3.2, seed + k * 101);
    }
  }
  // Roots trail from the underside.
  for (const { x, y, z, depth, kind } of cells)
    if (kind === "stone" && depth >= 4 && hash3(x, 90, z) > 0.86)
      vine(g, p, 6, x, z, 0, 0, 0.8 + hash3(x, 91, z) * 2.2, x * 31 + z * 7 + depth, y - 0.5);
  return g;
}

const WISTERIA = ["#b48ce0", "#d7a6e8", "#f2b6d0"];
const ROOT = new THREE.Color("#6b4a32");

/**
 * One hanging strand down from (x, top, z), `len` long, in one of seven styles: 0 short grass fringe, 1 plain
 * strand, 2 leafy vine, 3 zigzag vine, 4 ivy curtain (a few strands side by side), 5 flowering wisteria, 6 root.
 * (nx, nz) points out from the face it hangs on.
 */
function vine(g: Garden, p: SeasonPalette, style: number, x: number, z: number, nx: number, nz: number, len: number, seed: number, top = -0.9) {
  const h = (m: number) => hash3(seed, m, 4);
  const tx = nz ? 1 : 0, tz = nx ? 1 : 0; // along the face
  const green = blend(p, x, z, 0.6 + h(1) * 0.4).multiplyScalar(0.8 + h(2) * 0.3);
  const strand = (sx: number, sz: number, l: number, width: number, colour: THREE.Color) =>
    g.sprigs.push({ x: sx, z: sz, y0: top, len: l, width, thick: width * 0.7, ang: 0, tilt: -Math.PI / 2, colour });
  switch (style) {
    case 0: return strand(x, z, 0.2 + len * 0.15, 0.12, blend(p, x, z, 0.2));
    case 1: return strand(x, z, len, 0.1, green);
    case 6: { // a thin root with a side root
      strand(x, z, len, 0.06, ROOT.clone().multiplyScalar(0.8 + h(3) * 0.4));
      if (h(4) > 0.5) g.sprigs.push({ x, z, y0: top - len * 0.4, len: len * 0.4, width: 0.04, thick: 0.04, ang: h(5) * 6.28, tilt: -1.0, colour: ROOT.clone() });
      return;
    }
    case 4: { // ivy curtain
      for (let k = 0; k < 4; k++) strand(x + tx * (k - 1.5) * 0.22, z + tz * (k - 1.5) * 0.22, len * (0.4 + h(10 + k) * 0.6), 0.14, green.clone().multiplyScalar(0.85 + h(20 + k) * 0.3));
      return;
    }
  }
  // Segmented styles: leafy (2), zigzag (3), wisteria (5).
  const steps = Math.max(2, Math.round(len / 0.35));
  for (let i = 0; i < steps; i++) {
    const y = top - i * 0.35, side = i % 2 ? 1 : -1;
    const off = style === 3 ? side * 0.12 : 0;
    g.sprigs.push({ x: x + tx * off, z: z + tz * off, y0: y, len: 0.37, width: 0.08, thick: 0.06, ang: 0, tilt: -Math.PI / 2, colour: green });
    if (style === 2 && h(30 + i) > 0.3)
      g.sprigs.push({ x: x + tx * side * 0.14 + nx * 0.05, z: z + tz * side * 0.14 + nz * 0.05, y0: y - 0.1, len: 0.2, width: 0.2, thick: 0.06, ang: 0, tilt: 0,
        colour: green.clone().multiplyScalar(1.05 + h(40 + i) * 0.2) });
    if (style === 5 && i >= steps / 3)
      g.sprigs.push({ x: x + nx * 0.05, z: z + nz * 0.05, y0: y - 0.15, len: 0.2, width: 0.2, thick: 0.2, ang: 0, tilt: 0,
        colour: new THREE.Color(p === PALETTES.WINTER ? "#ffffff" : WISTERIA[Math.floor(h(50 + i) * 3)]) });
  }
}

/** A plant green between the season's grass and hedge colour: `toward` hedge, nudged by the moss patches. */
function blend(p: SeasonPalette, x: number, z: number, toward: number): THREE.Color {
  const k = Math.min(1, Math.max(0, toward + (patch(x / 4 + 20, z / 4) - 0.5) * 0.5));
  return new THREE.Color(p.grass[1]).lerp(stone.set(p.hedge), k);
}

/** Plants are gone by this far into the fold. */
const shrinkAt = (t: number) => Math.max(0, 1 - t * 1.6);

/**
 * Baked soft shade over the top: darker beside dense fern clumps and round the tree's foot, plus broad sun and
 * shade patches. 1 is full light.
 */
function shadeField(dark: DarkModule[], size: number, pitch: number) {
  const half = (size - 1) / 2;
  const isDark = new Set(dark.map((d) => d.row * size + d.col));
  return (x: number, z: number) => {
    const col = Math.round(x / pitch + half), row = Math.round(z / pitch + half);
    let n = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (isDark.has((row + dz) * size + col + dx)) n++;
    const trunk = Math.exp(-(x * x + z * z) / 14);
    return Math.max(0.4, 1.1 - 0.6 * (n / 9) - 0.5 * trunk - (0.5 - patch(x / 7 + 50, z / 7)) * 0.5);
  };
}

/** Cliffs darken under the island's lip and toward the bottom. */
const cliffShade = (depth: number) => (depth <= 1 ? 0.45 : Math.max(0.4, 1 - 0.06 * depth));

/** Moss creeping down the upper cliffs in patches. */
const mossy = (c: THREE.Color, { x, y, z, depth }: IslandVoxel, hedge: string) =>
  depth <= 4 && patch(x / 2 + z / 3, y + z / 2) > 0.62 - depth * 0.04 ? c.lerp(stone.set(hedge), 0.6) : c;

function voxelColour(v: IslandVoxel, season: Season, t: number, out: THREE.Color, light = 1) {
  const p = PALETTES[season];
  const { x, z, depth: d } = v;
  switch (v.kind) {
    case "pad": return out.set(p.moss).lerp(stone.set(p.hedge), patch(x / 5 + 9, z / 5) * 0.35).lerp(warm, season === "WINTER" ? 0 : 0.12)
      .multiplyScalar((0.9 + patch(x / 2.5, z / 2.5) * 0.2) * light)
      .lerp(stone.set(PAD).multiplyScalar(0.95 + hash3(x, 1, z) * 0.05), t);
    case "hedge": return out.set(p.hedge).multiplyScalar(0.9 + hash3(x, 2, z) * 0.15);
    case "dirt": return mossy(out.set(p.dirt).multiplyScalar(0.85 + hash3(x, d, z) * 0.2), v, p.hedge).multiplyScalar(light);
    case "mix": return mossy(out.set(p.dirt).lerp(stone.set(p.stone), 0.5).multiplyScalar(0.78 + hash3(x, d, z) * 0.25), v, p.hedge).multiplyScalar(light);
    case "stone": return out.set(p.stone).multiplyScalar((0.78 + hash3(x, d, z) * 0.25) * light);
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
  fold,
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
  /** Everything a tap counts as ground. */
  groupRef?: Ref<THREE.Group>;
}) {
  const voxels = useRef<THREE.InstancedMesh>(null);
  const tiles = useRef<THREE.InstancedMesh>(null);
  const plants = useRef<THREE.InstancedMesh>(null);
  const grassCards = useRef<THREE.InstancedMesh>(null);
  const ground = useRef<THREE.InstancedMesh>(null);
  const groundMap = useMemo(() => groundTexture(), []);
  const grassMap = useMemo(() => grassTexture(), []);
  // Grass cards light like the ground they stand on, not like a wall facing sideways.
  const cardGeometry = useMemo(() => {
    const g = new THREE.PlaneGeometry();
    const n = g.getAttribute("normal");
    for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
    return g;
  }, []);
  const { hedge } = PALETTES[season];
  const { voxels: cells } = island;
  // Only the pad changes colour with the fold.
  const folding = useMemo(() => cells.flatMap((v, i) => (v.kind === "pad" ? [i] : [])), [cells]);
  const shade = useMemo(() => shadeField(dark, size, pitch), [dark, size, pitch]);
  const light = useMemo(() => cells.map((v) =>
    v.kind === "pad" ? shade(v.x, v.z) : v.kind === "hedge" ? 1 : cliffShade(v.depth)), [cells, shade]);

  // Ground cover on the meadow floor: a ground-texture tile on every pad cell, spun and flipped so neighbours differ,
  // tinted from the moss below so its strokes read lighter and darker. It shrinks away with the plants.
  const cover = useMemo(() => folding.map((i) => ({ x: cells[i].x, z: cells[i].z, turn: Math.floor(hash3(cells[i].x, 95, cells[i].z) * 4), flip: hash3(cells[i].x, 96, cells[i].z) > 0.5 ? -1 : 1, i })), [folding, cells]);
  const placeCover = (k: number, s: number, o: THREE.Object3D) => {
    const c = cover[k];
    o.position.set(c.x, 0.02, c.z);
    o.rotation.set(-Math.PI / 2, 0, (c.turn * Math.PI) / 2);
    o.scale.set(Math.max(1e-4, s) * c.flip, Math.max(1e-4, s), 1);
  };
  useInstances(ground, cover.length, (k, o) => placeCover(k, shrinkAt(fold.current.t), o),
    (k, c) => voxelColour(cells[cover[k].i], season, 0, c, light[cover[k].i]).multiplyScalar(1.3), [cover, season, light]);

  useInstances(voxels, cells.length, (i, o) => {
    const v = cells[i];
    o.position.set(v.x, v.y + (v.kind === "hedge" ? RING.lift : 0), v.z);
    if (v.kind === "hedge") o.scale.y = RING.scale;
  }, (i, c) => voxelColour(cells[i], season, fold.current.t, c, light[i]), [cells, season, light]);

  const tilePlace = (i: number, t: number, o: THREE.Object3D) => {
    const h = THREE.MathUtils.lerp(BED, TILE.height, t);
    o.position.set(dark[i].x, h / 2, dark[i].z);
    o.scale.set(1, h / TILE.height, 1);
  };
  const tileColour = (i: number, t: number, c: THREE.Color) =>
    c.set(hedge).multiplyScalar(0.9 + hash3(dark[i].col, 3, dark[i].row) * 0.15).lerp(ink, t);
  useInstances(tiles, dark.length, (i, o) => tilePlace(i, fold.current.t, o), (i, c) => tileColour(i, fold.current.t, c),
    [dark, size, hedge]);

  const garden = useMemo(() => {
    const g = growGarden(cells, dark, size, pitch, season);
    for (const p of [...g.sprigs, ...g.cards]) if (p.y0 >= 0) p.colour.multiplyScalar(shade(p.x, p.z));
    return g;
  }, [cells, dark, size, pitch, season, shade]);
  const { sprigs, cards } = garden;
  useInstances(plants, sprigs.length, (i, o) => placeSprig(sprigs[i], shrinkAt(fold.current.t), o), (i, c) => c.copy(sprigs[i].colour), [sprigs]);
  useInstances(grassCards, cards.length, (i, o) => placeCard(cards[i], shrinkAt(fold.current.t), o), (i, c) => c.copy(cards[i].colour), [cards]);

  // The garden follows the fold every frame it moves.
  const last = useRef<{ t: number; key: unknown[]; shrink: number; plants: unknown; cards: unknown }>({ t: NaN, key: [], shrink: NaN, plants: null, cards: null });
  useFrame(() => {
    const { t } = fold.current;
    const l = last.current;
    const vm = voxels.current, tm = tiles.current;
    const key = [vm, tm, cells, dark, season, light];
    if (t !== l.t || key.some((k, i) => k !== l.key[i])) {
      if (vm) {
        for (const i of folding) vm.setColorAt(i, voxelColour(cells[i], season, t, colour, light[i]));
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
      l.t = t;
      l.key = key;
    }
    const pm = plants.current, cm = grassCards.current, gm = ground.current, shrink = shrinkAt(t);
    if (pm && cm && gm && (shrink !== l.shrink || pm !== l.plants || cm !== l.cards)) {
      for (let k = 0; k < cover.length; k++) {
        placeCover(k, shrink, reset(dummy));
        dummy.updateMatrix();
        gm.setMatrixAt(k, dummy.matrix);
      }
      gm.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < sprigs.length; i++) {
        placeSprig(sprigs[i], shrink, reset(dummy));
        dummy.updateMatrix();
        pm.setMatrixAt(i, dummy.matrix);
      }
      for (let i = 0; i < cards.length; i++) {
        placeCard(cards[i], shrink, reset(dummy));
        dummy.updateMatrix();
        cm.setMatrixAt(i, dummy.matrix);
      }
      pm.instanceMatrix.needsUpdate = true;
      cm.instanceMatrix.needsUpdate = true;
      l.shrink = shrink;
      l.plants = pm;
      l.cards = cm;
    }
  });

  return (
    <group ref={groupRef}>
      <instancedMesh key={`v${cells.length}`} ref={voxels} args={[undefined, undefined, cells.length]}>
        <boxGeometry />
        <Toon />
      </instancedMesh>
      {dark.length > 0 && (
        <instancedMesh key={`t${dark.length}|${pitch}`} ref={tiles} args={[undefined, undefined, dark.length]}>
          <boxGeometry args={[pitch, TILE.height, pitch]} />
          <Toon />
        </instancedMesh>
      )}
      {sprigs.length > 0 && (
        <instancedMesh key={`p${sprigs.length}`} ref={plants} args={[undefined, undefined, sprigs.length]}>
          <boxGeometry />
          <Toon windy />
        </instancedMesh>
      )}
      {cover.length > 0 && (
        <instancedMesh key={`c${cover.length}`} ref={ground} args={[undefined, undefined, cover.length]}>
          <planeGeometry />
          <Toon map={groundMap} alphaTest={0.5} side={THREE.DoubleSide} />
        </instancedMesh>
      )}
      {cards.length > 0 && (
        <instancedMesh key={`g${cards.length}`} ref={grassCards} args={[cardGeometry, undefined, cards.length]}>
          <Toon map={grassMap} alphaTest={0.5} side={THREE.DoubleSide} windy />
        </instancedMesh>
      )}
    </group>
  );
}
