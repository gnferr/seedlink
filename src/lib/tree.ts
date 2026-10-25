// Big voxel tree whose crown overhangs the QR slab. Port of the spike's tree; pure and deterministic.
import { hash3 } from "./rng.ts";

export type TreeKind = "trunk" | "root" | "leaf" | "vine";
export type TreeVoxel = { x: number; y: number; z: number; kind: TreeKind; shade: number }; // y = cube centre, shade in [0, 1)
export type Tree = { voxels: TreeVoxel[]; top: number; trunkHeight: number; crownRadius: number };
export const TREE_VOXEL_BUDGET = 8000;
export const TREE_GROWTH_CAP = 37;

const CLUMP_SCALE = 0.9;
const BASE: [number, number, number, number][] = [[0, 15, 0, 6.5], [5, 13.5, 2, 4.8], [-5, 13.5, -1, 4.8], [1, 13.5, -5.5, 4.6], [-2, 14, 5, 4.4], [4, 15.5, -3, 4], [-4, 16, 3, 3.6], [0, 17.5, 0, 3.8]];
const FACES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

export function growTree(size: number): Tree {
  const TS = Math.max(1.1, Math.min(size, TREE_GROWTH_CAP) / 17);
  const voxels: TreeVoxel[] = [];
  const add = (x: number, y: number, z: number, kind: TreeKind) => voxels.push({ x, y, z, kind, shade: hash3(x, y, z, 4) });

  const trunkHeight = Math.round(9 * TS), tw = TS > 1.25 ? 1 : 0;
  for (let y = 0; y < trunkHeight; y++) for (let x = -tw; x <= tw; x++) for (let z = -tw; z <= tw; z++) add(x, y + 0.5, z, "trunk");
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let i = 1; i <= 2; i++) add(dx * (tw + i), 0.3, dz * (tw + i), "root");
  for (const [dx, dz, len] of [[1, 0, 5], [-1, 0, 4], [0, 1, 4], [0, -1, 5], [1, 1, 3], [-1, -1, 3]]) {
    for (let i = 1; i <= Math.round(len * TS * 0.8); i++) add(dx * (i + tw), trunkHeight - 3 + Math.floor(i * 0.6) + 0.5, dz * (i + tw), "trunk");
  }

  const s = TS * CLUMP_SCALE;
  const clumps = BASE.map(([x, y, z, r]) => [x * s, trunkHeight + (y - 12) * s, z * s, r * s]);
  const crown = new Set<string>();
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const R = Math.ceil(11 * TS), yMax = trunkHeight + 14 * TS;
  for (let y = trunkHeight - 4; y < yMax; y++) for (let z = -R; z <= R; z++) for (let x = -R; x <= R; x++) {
    let best = 9;
    for (const [cx, cy, cz, r] of clumps) best = Math.min(best, Math.hypot((x - cx) / r, (y - cy) / (r * 0.7), (z - cz) / r));
    if (best < 1 && (best < 0.86 || hash3(x, y, z, 1) < 0.5)) crown.add(key(x, y, z));
  }
  for (const k of crown) {
    const [x, y, z] = k.split(",").map(Number);
    if (!FACES.every(([a, b, c]) => crown.has(key(x + a, y + b, z + c)))) add(x, y + 0.5, z, "leaf");
  }
  for (let i = 0; i < 22; i++) {
    const a = i * 2.39, r = R * (0.55 + hash3(i, 0, 0, 3) * 0.3), x = Math.round(Math.cos(a) * r), z = Math.round(Math.sin(a) * r);
    let y0: number | null = null;
    for (let y = trunkHeight - 4; y < yMax; y++) if (crown.has(key(x, y, z))) { y0 = y; break; }
    if (y0 === null) continue;
    for (let k = 1; k <= 2 + Math.floor(hash3(i, 1, 0, 3) * 6); k++) add(x, y0 - k + 0.5, z, "vine");
  }

  const top = Math.max(...voxels.map((v) => v.y));
  const crownRadius = Math.max(0, ...voxels.filter((v) => v.kind === "leaf").map((v) => Math.hypot(v.x, v.z)));
  return { voxels, top, trunkHeight, crownRadius };
}
