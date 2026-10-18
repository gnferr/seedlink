export type Deco = { x: number; z: number; scale: number; tint: number };
export type Cloud = { x: number; y: number; z: number; w: number; d: number; speed: number };
// The slab is a rectangle turned 45° to face the Reveal camera (which looks from +x+z): `along` runs toward
// the camera, `across` side to side. Its far edge is the Reveal horizon; it reaches further toward the
// camera so the bottom of the frame is always ground. World x = (along + across)/√2, z = (along − across)/√2.
export type MeadowLayout = {
  /** Width across the view, side to side. */
  slabSize: number;
  /** Extent away from the camera (the horizon) and toward it, along the view azimuth from the origin. */
  slabFar: number;
  slabNear: number;
  slabDepth: number;
  pad: { half: number };
  tufts: Deco[];
  flowers: Deco[];
  bushes: Deco[];
  /** Fallen leaves, shown in Autumn. */
  leaves: Deco[];
  clouds: Cloud[];
};

export const MAX_DECOR = 600;
export const PAD_CLEAR = 1.5;
export const SLAB_DEPTH = 6;
export const BUSH_GAP = 3;
export const SLAB_WIDTH = 4.5;
export const SLAB_FAR = 1;
export const SLAB_NEAR = 2.5;
const EDGE_MARGIN = 1.5;

// Half-width of each decoration at scale 1 (the Meadow builds its boxes to these) and its scale range.
// Placement keeps the whole scaled footprint off the pad's clear zone and on the slab, not just the centre.
export const DECO = {
  tuft: { half: 0.4, lo: 0.6, hi: 1.2 },
  flower: { half: 0.35, lo: 0.7, hi: 1.1 },
  bush: { half: 0.625, lo: 1.4, hi: 2.2 },
  leaf: { half: 0.45, lo: 0.8, hi: 1.3 },
} as const;
export type DecoKind = keyof typeof DECO;
/** Footprint half-width at the largest scale. */
export const footprint = (k: DecoKind) => DECO[k].half * DECO[k].hi;
// A footprint square turned 45° to the slab reaches f·√2 along the slab axes; +0.25 keeps bushes >= 2 in.
const edgeMargin = (k: DecoKind) => Math.max(EDGE_MARGIN, footprint(k) * Math.SQRT2 + 0.25);

const TUFTS = 220;
const FLOWERS = 90;
const BUSHES = 4;
const LEAVES = 60;
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
    slabFar: 0,
    slabNear: 0,
    slabDepth: 0,
    pad: { half: 0 },
    tufts: [],
    flowers: [],
    bushes: [],
    leaves: [],
    clouds: [],
  };
  if (!Number.isFinite(plane) || plane <= 0) return empty;

  const rand = mulberry32(Number.isFinite(seed) ? seed : 1337);
  const half = plane / 2;
  const clear = half + PAD_CLEAR;

  const point = (k: DecoKind) => {
    const m = edgeMargin(k);
    const far = SLAB_FAR * plane - m;
    const near = SLAB_NEAR * plane - m;
    const side = (SLAB_WIDTH * plane) / 2 - m;
    const keep = clear + footprint(k);
    for (let i = 0; i < MAX_TRIES; i++) {
      const along = -far + rand() * (far + near);
      const across = (rand() * 2 - 1) * side;
      const x = (along + across) / Math.SQRT2;
      const z = (along - across) / Math.SQRT2;
      if (Math.abs(x) > keep || Math.abs(z) > keep) return { x, z };
    }
    // fallback keeps the loop bounded: a point just outside the footprint's clear zone, on the camera side
    return { x: keep + 0.5, z: keep + 0.5 };
  };

  const scale = (k: DecoKind) => DECO[k].lo + rand() * (DECO[k].hi - DECO[k].lo);
  const scatter = (n: number, k: DecoKind): Deco[] =>
    Array.from({ length: n }, () => {
      const { x, z } = point(k);
      return { x, z, scale: scale(k), tint: rand() };
    });

  const tufts = scatter(TUFTS, "tuft");
  const flowers = scatter(FLOWERS, "flower");

  const bushes: Deco[] = [];
  for (let n = 0; n < BUSHES; n++) {
    for (let i = 0; i < MAX_TRIES; i++) {
      const { x, z } = point("bush");
      if (bushes.every((b) => Math.hypot(b.x - x, b.z - z) >= BUSH_GAP)) {
        bushes.push({ x, z, scale: scale("bush"), tint: rand() });
        break;
      }
    }
  }

  const leaves = scatter(LEAVES, "leaf");

  // Clouds sit behind the tree in the slab frame, with along = -1.22·y: a cloud's Reveal screen height
  // v = y·cosφ - along·sinφ is then 1.28·y at 15°, 1.48·y at 30° and 1.56·y at 60°, i.e. about 0.8, 0.9 and
  // 0.95 plane: beside the crown, and above the 60° horizon (0.87 plane). They alternate sides, clear of the crown.
  const clouds: Cloud[] = Array.from({ length: CLOUDS }, (_, i) => {
    const y = (0.59 + rand() * 0.04) * plane;
    const along = -1.22 * y;
    const across = (i % 2 ? -1 : 1) * (0.55 + ((i >> 1) + rand() * 0.6) * 0.4) * plane;
    return {
      x: (along + across) / Math.SQRT2,
      y,
      z: (along - across) / Math.SQRT2,
      w: (0.14 + rand() * 0.1) * plane,
      d: (0.06 + rand() * 0.03) * plane,
      speed: (0.008 + rand() * 0.012) * plane,
    };
  });

  return {
    slabSize: SLAB_WIDTH * plane,
    slabFar: SLAB_FAR * plane,
    slabNear: SLAB_NEAR * plane,
    slabDepth: SLAB_DEPTH,
    pad: { half },
    tufts,
    flowers,
    bushes,
    leaves,
    clouds,
  };
}

/**
 * Cloud lanes wrap at ±CLOUD_WRAP planes across. The widest Reveal frame at 21:9 reaches 2.09 planes across
 * (60°), Explore at the Reveal azimuth about 2.36; clouds shrink to nothing over the outer CLOUD_FADE of the
 * lane, so the wrap itself is never seen, even from orbit angles that bring the lane ends into frame.
 */
export const CLOUD_WRAP = 3;
const CLOUD_FADE = 0.2;

/** A cloud's position across the Reveal view (the slab's `across` axis): the inverse of the layout's x/z. */
export const cloudAcross = (c: { x: number; z: number }): number => (c.x - c.z) / Math.SQRT2;

/** Scale for a cloud at `across`: 1 inside the lane, falling to 0 at ±wrapAt. */
export function cloudFade(across: number, wrapAt: number): number {
  const k = (wrapAt - Math.abs(across)) / (CLOUD_FADE * wrapAt);
  return Number.isFinite(k) ? Math.min(1, Math.max(0, k)) : 0;
}

/**
 * One frame of cloud drift along its lane. `drive` is the caller's gate product (stateGain · calm): at 0, or with
 * any non-finite input or a non-positive dt, the offset is returned exactly, so a still frame stays bit-identical.
 * Otherwise it advances by speed · dt · drive and wraps into [-wrapAt, wrapAt].
 */
export function cloudOffset(prev: number, dt: number, speed: number, drive: number, wrapAt: number): number {
  if (!(drive > 0) || !(dt > 0) || !(wrapAt > 0) || ![prev, dt, speed, drive, wrapAt].every(Number.isFinite)) return prev;
  const span = 2 * wrapAt;
  return ((((prev + speed * dt * drive + wrapAt) % span) + span) % span) - wrapAt;
}
