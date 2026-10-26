import { hash3 } from "./rng.ts";
import type { DarkModule } from "./qr.ts";
import type { Tree } from "./tree.ts";

export const FOLD_SECONDS = 1.8;
export const FLIGHT = 0.45; // fraction of the timeline one voxel spends flying
export const MODULE_BLOCK = { y: 0.3, width: 0.98, height: 0.6 }; // a folded module block

export type FoldPlan = {
  carrier: Int32Array; // per piece: index into dark modules, or -1
  owner: Int32Array; // per dark module: carrying piece, or -1 (an extra)
  extras: number[]; // dark-module indices with no piece left; they rise from the slab
  delay: Float32Array; // crown top first
  arc: Float32Array;
  spin: Float32Array;
  scatter: Float32Array; // x,z pairs where non-carriers shrink to, inside the slab
};
export type Pose = { x: number; y: number; z: number; sx: number; sy: number; sz: number; rotY: number; ink: number };

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

export type FoldPiece = { x: number; y: number; z: number; canCarry: boolean; segment?: boolean }; // cards first (index i), then segments (cards.length + j, midpoint)

/** Whether leaf card i is on the tree this season (the season keeps a leafKeep share of the leaves). */
export const cardShown = (i: number, leafKeep: number) => hash3(i, 17, 3, 29) < leafKeep;
const BARE = 0.15; // below this leafKeep (winter) the few cards left never carry

export function foldPieces(tree: Tree, leafKeep: number): FoldPiece[] {
  const cards = tree.cards.map((c, i) => ({ x: c.x, y: c.y, z: c.z, canCarry: leafKeep >= BARE && !c.speck && cardShown(i, leafKeep) }));
  const segs = tree.segments.map((g) => ({ x: (g.x0 + g.x1) / 2, y: (g.y0 + g.y1) / 2, z: (g.z0 + g.z1) / 2, canCarry: true, segment: true }));
  return [...cards, ...segs];
}

export function planFold(pieces: FoldPiece[], top: number, dark: DarkModule[], seed: number): FoldPlan {
  const n = pieces.length;
  const carrier = new Int32Array(n).fill(-1), owner = new Int32Array(dark.length).fill(-1);
  // cards before segments, each group shuffled
  const order = pieces.map((_, i) => i).filter((i) => pieces[i].canCarry)
    .sort((a, b) => Number(!!pieces[a].segment) - Number(!!pieces[b].segment) || hash3(a, 7, 7, seed) - hash3(b, 7, 7, seed));
  const used = Math.min(order.length, dark.length);
  for (let j = 0; j < used; j++) { carrier[order[j]] = j; owner[j] = order[j]; }
  const extras: number[] = [];
  for (let j = used; j < dark.length; j++) extras.push(j);

  let rx = 0, rz = 0;
  for (const m of dark) { rx = Math.max(rx, Math.abs(m.x)); rz = Math.max(rz, Math.abs(m.z)); }
  const delay = new Float32Array(n), arc = new Float32Array(n), spin = new Float32Array(n), scatter = new Float32Array(n * 2);
  pieces.forEach((v, i) => {
    // capped so every piece has landed by t = 1
    delay[i] = Math.min(1 - FLIGHT, ((top - v.y) / top) * 0.5 + hash3(i, 3, 3, seed) * 0.08);
    arc[i] = 1.5 + hash3(i, 4, 4, seed) * 3;
    spin[i] = (hash3(i, 5, 5, seed) - 0.5) * 6;
    scatter[i * 2] = (hash3(i, 1, 2, seed) - 0.5) * 2 * rx;
    scatter[i * 2 + 1] = (hash3(i, 2, 1, seed) - 0.5) * 2 * rz;
  });
  return { carrier, owner, extras, delay, arc, spin, scatter };
}

// The old voxel flight path; returns raw local progress, which drives the 0.7-1 swap between piece and ink block.
function fly(plan: FoldPlan, pieces: FoldPiece[], dark: DarkModule[], i: number, t: number, out: Pose): number {
  const v = pieces[i], p = clamp01((t - plan.delay[i]) / FLIGHT), e = easeInOutCubic(p), j = plan.carrier[i];
  const ex = j >= 0 ? dark[j].x : plan.scatter[i * 2];
  const ey = j >= 0 ? MODULE_BLOCK.y : 0.2;
  const ez = j >= 0 ? dark[j].z : plan.scatter[i * 2 + 1];
  out.x = v.x + (ex - v.x) * e;
  out.y = v.y + (ey - v.y) * e + Math.sin(Math.PI * e) * plan.arc[i];
  out.z = v.z + (ez - v.z) * e;
  out.rotY = e * (1 - e) * plan.spin[i];
  return p;
}
const swap = (p: number) => clamp01((p - 0.7) / 0.3);

export function piecePose(plan: FoldPlan, pieces: FoldPiece[], dark: DarkModule[], i: number, t: number, out: Pose): Pose {
  const p = fly(plan, pieces, dark, i, t, out);
  out.sx = out.sy = out.sz = plan.carrier[i] >= 0 ? 1 - swap(p) : 1 - easeInOutCubic(p);
  out.ink = 0;
  return out;
}

export function inkPose(plan: FoldPlan, pieces: FoldPiece[], dark: DarkModule[], j: number, t: number, out: Pose): Pose {
  const i = plan.owner[j];
  if (i < 0) return extraPose(dark[j], t, out);
  const k = swap(fly(plan, pieces, dark, i, t, out));
  out.sx = out.sz = MODULE_BLOCK.width * k;
  out.sy = MODULE_BLOCK.height * k;
  out.ink = 1;
  return out;
}

export function extraPose(module: DarkModule, t: number, out: Pose): Pose {
  const k = easeInOutCubic(clamp01((t - 0.5) / 0.5));
  out.x = module.x; out.y = MODULE_BLOCK.y * k; out.z = module.z;
  out.sx = out.sz = MODULE_BLOCK.width * k;
  out.sy = MODULE_BLOCK.height * k;
  out.rotY = 0; out.ink = 1;
  return out;
}
