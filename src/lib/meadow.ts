export type Deco = { x: number; z: number; scale: number; tint: number };
export type Cloud = { x: number; y: number; z: number; w: number; d: number; speed: number };
export type MeadowLayout = {
  slabSize: number;
  slabDepth: number;
  pad: { half: number };
  tufts: Deco[];
  flowers: Deco[];
  bushes: Deco[];
  clouds: Cloud[];
};

export const MAX_DECOR = 600;
export const PAD_CLEAR = 1.5;
export const SLAB_DEPTH = 6;
export const BUSH_GAP = 3;

const TUFTS = 220;
const FLOWERS = 90;
const BUSHES = 4;
const CLOUDS = 6;
const MAX_TRIES = 200;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function meadowLayout(plane: number, seed = 1337): MeadowLayout {
  const empty: MeadowLayout = {
    slabSize: 0,
    slabDepth: 0,
    pad: { half: 0 },
    tufts: [],
    flowers: [],
    bushes: [],
    clouds: [],
  };
  if (!Number.isFinite(plane) || plane <= 0) return empty;

  const rand = mulberry32(Number.isFinite(seed) ? seed : 1337);
  const half = plane / 2;
  const clear = half + PAD_CLEAR;
  const reach = 1.8 * plane;

  const point = () => {
    for (let i = 0; i < MAX_TRIES; i++) {
      const x = (rand() * 2 - 1) * reach;
      const z = (rand() * 2 - 1) * reach;
      if (Math.abs(x) > clear || Math.abs(z) > clear) return { x, z };
    }
    // fallback keeps the loop bounded: a point just outside the clear zone
    return { x: clear + rand() * (reach - clear), z: 0 };
  };

  const scatter = (n: number, lo: number, hi: number): Deco[] =>
    Array.from({ length: n }, () => {
      const { x, z } = point();
      return { x, z, scale: lo + rand() * (hi - lo), tint: rand() };
    });

  const tufts = scatter(TUFTS, 0.6, 1.2);
  const flowers = scatter(FLOWERS, 0.7, 1.1);

  const bushes: Deco[] = [];
  for (let n = 0; n < BUSHES; n++) {
    for (let i = 0; i < MAX_TRIES; i++) {
      const { x, z } = point();
      if (bushes.every((b) => Math.hypot(b.x - x, b.z - z) >= BUSH_GAP)) {
        bushes.push({ x, z, scale: 1.4 + rand() * 0.8, tint: rand() });
        break;
      }
    }
  }

  const clouds: Cloud[] = Array.from({ length: CLOUDS }, (_, i) => ({
    x: ((i + rand() * 0.8) / CLOUDS - 0.5) * 3.6 * plane,
    y: 1.1 * plane + (rand() - 0.5) * 0.2 * plane,
    z: -(0.8 + rand() * 0.9) * plane,
    w: 4 + rand() * 4,
    d: 3 + rand() * 3,
    speed: 0.3 + rand() * 0.5,
  }));

  return { slabSize: 5 * plane, slabDepth: SLAB_DEPTH, pad: { half }, tufts, flowers, bushes, clouds };
}
