import { hash3, mulberry32 } from "./rng.ts";
import { QUIET_ZONE } from "./qr.ts";

export type IslandKind = "pad" | "grass" | "dirt" | "mix" | "stone";
export type IslandVoxel = { x: number; y: number; z: number; depth: number; kind: IslandKind };
export type Deco = { x: number; z: number; kind: "tuft" | "flower"; tint: number };
export type Island = {
  slabHalf: number;
  radius: number;
  depth: number;
  voxels: IslandVoxel[];
  deco: Deco[];
  waterfall: { x: number; z: number; length: number };
};

export const ISLAND_VOXEL_BUDGET = 6000;

// A wobbly rounded square hugging the QR slab, grown from the link's seed.
export function growIsland(seed: number, size: number): Island {
  const slabHalf = (size - 1) / 2 + QUIET_ZONE;
  const r = mulberry32(seed);
  const inSlab = (x: number, z: number) => Math.abs(x) <= slabHalf && Math.abs(z) <= slabHalf;

  const harm = [3, 4, 5, 7].map((k) => [k, r() / Math.sqrt(k), r() * 6.28] as const);
  const lobe = r() < 0.6 ? ([r() * 6.28, 0.35 + r() * 0.3, 2 + r() * 3] as const) : null;
  const depth = 12 + Math.floor(r() * 8);
  const taper = 1 + r() * 0.5;
  const lean = [(r() - 0.5) * 6, (r() - 0.5) * 6];

  const rimAt = (a: number) => {
    const sq = (slabHalf + 2.6) / Math.pow(Math.abs(Math.cos(a)) ** 5 + Math.abs(Math.sin(a)) ** 5, 1 / 5);
    let v = 0;
    for (const [k, amp, ph] of harm) v += amp * Math.sin(k * a + ph);
    let rr = sq + 1.1 * v;
    if (lobe) {
      const q = Math.atan2(Math.sin(a - lobe[0]), Math.cos(a - lobe[0]));
      rr += lobe[2] * Math.exp(-(q * q) / lobe[1] ** 2);
    }
    return Math.max(sq - 0.4, rr);
  };
  const rim = (x: number, z: number) => rimAt(Math.atan2(z, x));

  const has = (x: number, z: number, d: number) => {
    if (d === 0 && inSlab(x, z)) return true;
    const t = d / (depth + 1);
    const cx = lean[0] * t;
    const cz = lean[1] * t;
    return Math.hypot(x - cx, z - cz) <= rim(x - cx, z - cz) * (1 - Math.pow(t, taper)) - (d > 0 ? hash3(x, d, z, seed) * 1.4 : 0);
  };

  const span = Math.ceil(slabHalf + 9);
  const voxels: IslandVoxel[] = [];
  for (let d = 0; d <= depth; d++)
    for (let z = -span; z <= span; z++)
      for (let x = -span; x <= span; x++) {
        if (!has(x, z, d)) continue;
        const edge = !has(x + 1, z, d) || !has(x - 1, z, d) || !has(x, z + 1, d) || !has(x, z - 1, d);
        if (d > 0 && !edge && d !== depth) continue;
        const kind: IslandKind = d === 0 ? (inSlab(x, z) ? "pad" : "grass") : d <= 2 ? "dirt" : d <= 4 ? "mix" : "stone";
        voxels.push({ x, y: -0.5 - d, z, depth: d, kind });
      }

  const deco: Deco[] = [];
  for (const v of voxels) {
    if (v.kind !== "grass") continue;
    const h = hash3(v.x, 0, v.z, seed + 3);
    if (h > 0.82) deco.push({ x: v.x, z: v.z, kind: h > 0.95 ? "flower" : "tuft", tint: h });
  }

  // Waterfall: the far-side rim angle, kept clear of the 45 degree diagonal.
  let best = -Infinity;
  let ba = 0;
  for (let a = -0.4; a < 2; a += 0.05) {
    if (Math.abs(a - 0.785) < 0.55) continue;
    const v = (Math.cos(a) + Math.sin(a)) * rimAt(a);
    if (v > best) {
      best = v;
      ba = a;
    }
  }
  const wr = rimAt(ba) + 0.6;
  const waterfall = { x: Math.round(Math.cos(ba) * wr), z: Math.round(Math.sin(ba) * wr), length: depth + 18 };

  let radius = 0;
  for (let a = 0; a < 6.283; a += 0.1) radius = Math.max(radius, rimAt(a));

  return { slabHalf, radius, depth, voxels, deco, waterfall };
}
