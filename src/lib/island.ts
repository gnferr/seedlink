import { hash3, mulberry32 } from "./rng.ts";
import { QUIET_ZONE, REF_SIZE } from "./qr.ts";

export type IslandKind = "pad" | "hedge" | "dirt" | "mix" | "stone";
export type IslandVoxel = { x: number; y: number; z: number; depth: number; kind: IslandKind };
export type Island = {
  slabHalf: number;
  radius: number;
  depth: number;
  voxels: IslandVoxel[];
};

export const ISLAND_VOXEL_BUDGET = 6000;

// A square island: the QR slab framed by a one-voxel hedge ring, on cliffs that taper to a point below, grown from
// the link's seed (the fixed REF_SIZE world, see qr.ts).
export function growIsland(seed: number): Island {
  const slabHalf = (REF_SIZE - 1) / 2 + QUIET_ZONE;
  const half = slabHalf + 1;
  const r = mulberry32(seed);
  const depth = 12 + Math.floor(r() * 8);
  const taper = 0.8 + r() * 0.4;

  // Half-width of the layer `d` below the top: full for the top two layers, then narrowing, with a ragged edge.
  const reach = (x: number, z: number, d: number) =>
    d <= 1 ? half : half - Math.floor(Math.pow((d - 1) / depth, taper) * (half - 2)) - (hash3(x, d, z, seed) > 0.7 ? 1 : 0);
  const has = (x: number, z: number, d: number) => Math.max(Math.abs(x), Math.abs(z)) <= reach(x, z, d);

  const voxels: IslandVoxel[] = [];
  for (let d = 0; d <= depth; d++)
    for (let z = -half; z <= half; z++)
      for (let x = -half; x <= half; x++) {
        if (!has(x, z, d)) continue;
        const edge = !has(x + 1, z, d) || !has(x - 1, z, d) || !has(x, z + 1, d) || !has(x, z - 1, d);
        if (d > 0 && !edge && d !== depth) continue;
        const top = Math.max(Math.abs(x), Math.abs(z)) <= slabHalf ? "pad" : "hedge";
        const kind: IslandKind = d === 0 ? top : d <= 2 ? "dirt" : d <= 4 ? "mix" : "stone";
        voxels.push({ x, y: -0.5 - d, z, depth: d, kind });
      }

  // The camera and tree fit to `radius`: between the edge and the corner, so the square fills the view like the old rim did.
  return { slabHalf, radius: half * 1.2, depth, voxels };
}
