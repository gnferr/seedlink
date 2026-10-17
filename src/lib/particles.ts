import type { Season } from "./seasons.ts";

export type ParticleKind = "PETAL" | "FIREFLY" | "LEAF" | "SNOW";
export type ParticleSet = {
  kind: ParticleKind;
  colors: string[];
  size: number;
  fallSpeed: number;
  drift: number;
  loopSeconds: number;
  pulseHz: number;
};

export const PARTICLE_SETS: Record<Season, ParticleSet> = {
  SPRING: { kind: "PETAL", colors: ["#f9a8d4", "#fbcfe8", "#ffffff"], size: 0.18, fallSpeed: 0.6, drift: 0.4, loopSeconds: 6, pulseHz: 0 },
  SUMMER: { kind: "FIREFLY", colors: ["#fde047", "#facc15", "#fef08a"], size: 0.18, fallSpeed: 0, drift: 0.45, loopSeconds: 9, pulseHz: 0.5 },
  AUTUMN: { kind: "LEAF", colors: ["#ea580c", "#dc2626", "#eab308"], size: 0.18, fallSpeed: 0.8, drift: 0.45, loopSeconds: 5, pulseHz: 0 },
  WINTER: { kind: "SNOW", colors: ["#ffffff", "#e0f2fe"], size: 0.18, fallSpeed: 0.5, drift: 0.25, loopSeconds: 8, pulseHz: 0 },
};

export type Bounds = { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };

export function particleBudget(coarsePointer: boolean): number {
  return coarsePointer ? 120 : 300;
}

/** World-space box around the blocks' centres, one module plus a particle of air on every side. */
export function particleBounds(blocks: { x: number; y: number; z: number }[], size: number): Bounds {
  if (blocks.length === 0) return { minX: -1, maxX: 1, minY: 0, maxY: 2, minZ: -1, maxZ: 1 };
  const m = 1 + size;
  const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const p of blocks) {
    b.minX = Math.min(b.minX, p.x); b.maxX = Math.max(b.maxX, p.x);
    b.minY = Math.min(b.minY, p.y); b.maxY = Math.max(b.maxY, p.y);
    b.minZ = Math.min(b.minZ, p.z); b.maxZ = Math.max(b.maxZ, p.z);
  }
  return { minX: b.minX - m, maxX: b.maxX + m, minY: 0, maxY: b.maxY + m, minZ: b.minZ - m, maxZ: b.maxZ + m };
}

/** Integer hash of (i, salt) to [0, 1); deterministic, no Math.random. */
function hash(i: number, salt: number): number {
  let h = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const TAU = Math.PI * 2;
// Spawn ranges are inset by the drift so the sway never leaves the bounds.
const span = (lo: number, hi: number, inset: number, u: number) => {
  const a = lo + inset, c = hi - inset;
  return a >= c ? (lo + hi) / 2 : a + u * (c - a);
};

export function particlePose(
  i: number,
  t: number,
  set: ParticleSet,
  b: Bounds,
): { x: number; y: number; z: number; rot: number; scale: number } {
  const d = set.drift;
  const x0 = span(b.minX, b.maxX, d, hash(i, 0));
  const z0 = span(b.minZ, b.maxZ, d, hash(i, 1));
  const ph = hash(i, 2) * TAU;
  const w = TAU / set.loopSeconds;

  if (set.kind === "FIREFLY") {
    const y0 = span(b.minY, b.maxY, d, hash(i, 3));
    return {
      x: x0 + d * Math.sin(w * t + ph),
      y: y0 + d * Math.sin(1.7 * w * t + 2 * ph),
      z: z0 + d * Math.sin(1.3 * w * t + 3 * ph),
      rot: 0,
      scale: 0.5 + 0.5 * Math.sin(TAU * set.pulseHz * t + ph),
    };
  }

  const h = Math.max(b.maxY - b.minY, 1e-6);
  const f = (((hash(i, 3) * h + t * set.fallSpeed) % h) + h) % h / h; // 0 top .. 1 bottom
  // Fade at the wrap so particles never pop in or out.
  const scale = Math.min(1, f * 8, (1 - f) * 8);
  return {
    x: x0 + d * Math.sin(w * t + ph),
    y: b.maxY - f * h,
    z: z0 + d * Math.cos(w * t + ph),
    rot: ph + t * (0.5 + hash(i, 4)),
    scale,
  };
}

export const BURST_MIN = 8, BURST_MAX = 16, BURST_LIFE_SECONDS = 1.2;

export function burstPose(
  k: number,
  age: number,
  origin: { x: number; y: number; z: number },
  set: ParticleSet,
): { x: number; y: number; z: number; scale: number } {
  const a = hash(k, 10) * TAU;
  const up = 1 + hash(k, 11);
  const out = 0.8 + hash(k, 12) * (set.drift + 0.8);
  return {
    x: origin.x + Math.cos(a) * out * age,
    y: origin.y + up * 2 * age - 3 * age * age,
    z: origin.z + Math.sin(a) * out * age,
    scale: Math.min(1, Math.max(0, 1 - age / BURST_LIFE_SECONDS)),
  };
}
