import { hash3 } from "./rng.ts";
import type { DarkModule } from "./qr.ts";
import type { TreeVoxel } from "./tree.ts";

export const FOLD_SECONDS = 1.8;
export const FLIGHT = 0.45; // fraction of the timeline one voxel spends flying
export const MODULE_BLOCK = { y: 0.3, width: 0.98, height: 0.6 }; // a folded module block

export type FoldPlan = {
  carrier: Int32Array; // per tree voxel: index into dark modules, or -1
  extras: number[]; // dark-module indices with no tree voxel left; they rise from the slab
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

export function planFold(tree: TreeVoxel[], top: number, dark: DarkModule[], seed: number): FoldPlan {
  const n = tree.length;
  const carrier = new Int32Array(n).fill(-1);
  const order = tree.map((_, i) => i).sort((a, b) => hash3(a, 7, 7, seed) - hash3(b, 7, 7, seed));
  const used = Math.min(n, dark.length);
  for (let j = 0; j < used; j++) carrier[order[j]] = j;
  const extras: number[] = [];
  for (let j = used; j < dark.length; j++) extras.push(j);

  let rx = 0, rz = 0;
  for (const m of dark) { rx = Math.max(rx, Math.abs(m.x)); rz = Math.max(rz, Math.abs(m.z)); }
  const delay = new Float32Array(n), arc = new Float32Array(n), spin = new Float32Array(n), scatter = new Float32Array(n * 2);
  tree.forEach((v, i) => {
    // capped so every voxel has landed by t = 1
    delay[i] = Math.min(1 - FLIGHT, ((top - v.y) / top) * 0.5 + hash3(i, 3, 3, seed) * 0.08);
    arc[i] = 1.5 + hash3(i, 4, 4, seed) * 3;
    spin[i] = (hash3(i, 5, 5, seed) - 0.5) * 6;
    scatter[i * 2] = (hash3(i, 1, 2, seed) - 0.5) * 2 * rx;
    scatter[i * 2 + 1] = (hash3(i, 2, 1, seed) - 0.5) * 2 * rz;
  });
  return { carrier, extras, delay, arc, spin, scatter };
}

export function voxelPose(plan: FoldPlan, tree: TreeVoxel[], dark: DarkModule[], i: number, t: number, out: Pose): Pose {
  const v = tree[i];
  const e = easeInOutCubic(clamp01((t - plan.delay[i]) / FLIGHT));
  const j = plan.carrier[i];
  const ex = j >= 0 ? dark[j].x : plan.scatter[i * 2];
  const ey = j >= 0 ? MODULE_BLOCK.y : 0.2;
  const ez = j >= 0 ? dark[j].z : plan.scatter[i * 2 + 1];
  out.x = v.x + (ex - v.x) * e;
  out.y = v.y + (ey - v.y) * e + Math.sin(Math.PI * e) * plan.arc[i];
  out.z = v.z + (ez - v.z) * e;
  out.rotY = e * (1 - e) * plan.spin[i];
  if (j >= 0) {
    out.sx = out.sz = 1 + (MODULE_BLOCK.width - 1) * e;
    out.sy = 1 + (MODULE_BLOCK.height - 1) * e;
    out.ink = e;
  } else {
    out.sx = out.sy = out.sz = 1 - e;
    out.ink = 0;
  }
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
