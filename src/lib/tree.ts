// Semi-realistic pixel trees as leaf cards and tapered branch segments. A 3D port of the species mockup's
// tree() (.superpowers/brainstorm/.../tree-pixel-variants.html): limbs radiate around the trunk in azimuth and the
// mockup's 2D fan becomes elevation spread. Pure: a function of (species, seed, size).
import { REF_SIZE } from "./qr.ts";
import { hash3, hashString, mulberry32 } from "./rng.ts";

export type Species = "oak" | "lushOak" | "willow" | "acacia" | "birch" | "cherry";
export const SPECIES: readonly Species[] = ["oak", "lushOak", "willow", "acacia", "birch", "cherry"];
export type LeafCard = { x: number; y: number; z: number; rotY: number; tilt: number; size: number; shade: number; speck: boolean }; // speck = fruit/petal card, never a carrier
export type Segment = { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; r0: number; r1: number }; // tapered limb piece
export type Tree = { species: Species; cards: LeafCard[]; segments: Segment[]; top: number; trunkHeight: number; crownRadius: number };
export const CARD_BUDGET = 6000, SEGMENT_BUDGET = 1500;

type Cfg = {
  trunkH: number; trunkW: number; limbs: number; fan: number; limbLow: number; limbLen: number; taper: number; depth: number;
  split: number; fork: number; lift: number; bend: number; inner: number; clump: number; perClump: number; flat: number;
  strands: number; strandLen: number; specks: number;
};
// Mockup VARIANTS (lush -> lushOak; sparse/autumn dropped). Colours live in palette.ts.
const BASE: Cfg = { trunkH: 8, trunkW: 0.9, limbs: 7, fan: 2.6, limbLow: 0.62, limbLen: 5.2, taper: 0.5, depth: 3, split: 0.62, fork: 0.4, lift: 0.15, bend: 0.25, inner: 0.5, clump: 1.4, perClump: 22, flat: 0.78, strands: 0, strandLen: 0, specks: 2 }; // every species gets a few spring petal specks
const VARIANTS: Record<Species, Cfg> = {
  oak: { ...BASE },
  lushOak: { ...BASE, clump: 1.9, perClump: 34, inner: 0.7, specks: 4 },
  willow: { ...BASE, limbs: 6, fan: 2.9, lift: -0.25, bend: 0.5, clump: 1.2, perClump: 16, strands: 5, strandLen: 6 },
  acacia: { ...BASE, trunkH: 6.5, limbs: 5, fan: 1.6, limbLow: 0.85, limbLen: 6.2, lift: 0.05, split: 0.8, clump: 2.2, perClump: 30, flat: 0.32, inner: 0.15 },
  birch: { ...BASE, trunkH: 20, trunkW: 0.55, limbs: 9, fan: 1.4, limbLow: 0.35, limbLen: 4.4, taper: 0.2, depth: 2, lift: 0.35, clump: 1.05, perClump: 16, inner: 0.6 },
  cherry: { ...BASE, trunkH: 6.5, limbs: 8, fan: 2.8, limbLow: 0.7, limbLen: 5.8, lift: 0, clump: 1.5, perClump: 24, flat: 0.62, inner: 0.4, specks: 4 },
};

const SHAPE_SCALE = 0.85; // the mockup's proportions at full TS overshoot the slab ~1.4x

type Clump = { x: number; y: number; z: number; r: number; front: number };

/** The tree generator's version. Bump it only on purpose: it changes the tree behind every link already shared. */
export const TREE_VERSION = 1;

/** Same link, same tree: the species and the growth seed both come from the link. */
export function treeFor(text: string): { species: Species; seed: number } {
  const r = mulberry32(hashString(`tree-v${TREE_VERSION}:${text}`));
  return { species: SPECIES[Math.floor(r() * SPECIES.length)], seed: Math.floor(r() * 2 ** 31) };
}

const NAME_A = ["Quiet", "Mossy", "Sunny", "Misty", "Gentle", "Brave", "Sleepy", "Lucky", "Bright", "Hidden", "Golden", "Silver", "Wild", "Little", "Old", "Humble", "Merry", "Dreamy", "Steady", "Windy", "Rainy", "Starry", "Velvet", "Amber"];
const NAME_B = ["Ember", "Lantern", "Meadow", "River", "Pebble", "Feather", "Hollow", "Cloud", "Comet", "Thistle", "Clover", "Harbor", "Moon", "Ridge", "Fern", "Brook", "Acorn", "Petal", "Echo", "Lark", "Dune", "Frost", "Sparrow", "Spark"];
const SPECIES_NAME: Record<Species, string> = { oak: "Oak", lushOak: "Oak", willow: "Willow", acacia: "Acacia", birch: "Birch", cherry: "Cherry" };

/** The tree's name ("Quiet Ember Willow"): two words from the link and its species, so it never changes either. */
export function treeName(text: string): string {
  const r = mulberry32(hashString(`name-v${TREE_VERSION}:${text}`));
  const a = NAME_A[Math.floor(r() * NAME_A.length)], b = NAME_B[Math.floor(r() * NAME_B.length)];
  return `${a} ${b} ${SPECIES_NAME[treeFor(text).species]}`;
}

// Grown for the fixed REF_SIZE world (see qr.ts); fitTree then sizes it to the island.
export function growTree(species: Species, seed: number): Tree {
  const cfg = VARIANTS[species], rnd = mulberry32(seed);
  const TS = REF_SIZE / 17, G = TS * SHAPE_SCALE; // G: mockup units -> modules
  const segments: Segment[] = [], cards: LeafCard[] = [], clumps: Clump[] = [];
  const seg = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r0: number, r1: number) => {
    if (segments.length < SEGMENT_BUDGET) segments.push({ x0, y0, z0, x1, y1, z1, r0, r1 });
  };

  // Trunk first, so segments[0] is the base on the slab; the radius curves in like the mockup's quadratic outline.
  const trunkHeight = cfg.trunkH * G, tw = cfg.trunkW * G;
  const trunkR = (y: number) => tw * (0.45 + 0.55 * (1 - y / trunkHeight) ** 2) * 0.6;
  const rows = Math.ceil(trunkHeight);
  for (let i = 0; i < rows; i++) {
    const y0 = (i / rows) * trunkHeight, y1 = ((i + 1) / rows) * trunkHeight;
    seg(0, y0, 0, 0, y1, 0, trunkR(y0), trunkR(y1));
  }
  const roots = 5 + Math.floor(rnd() * 2), rootA = rnd() * Math.PI * 2;
  for (let i = 0; i < roots; i++) {
    const a = rootA + (i / roots) * Math.PI * 2 + (rnd() - 0.5) * 0.5, reach = tw * (1.4 + rnd() * 0.8);
    seg(0, tw * 0.7, 0, Math.cos(a) * reach, 0, Math.sin(a) * reach, trunkR(0) * 0.7, 0.08 * G);
  }

  // e is the mockup's angle measured up from horizontal along azimuth az (e > PI/2 leans back over the trunk).
  const limb = (x: number, y: number, z: number, az: number, e: number, len: number, width: number, depth: number) => {
    const dir = (a: number, el: number, l: number) => [Math.cos(el) * Math.cos(a) * l, Math.sin(el) * l, Math.cos(el) * Math.sin(a) * l];
    const [dx, dy, dz] = dir(az, e, len), [cx, cy, cz] = dir(az, e + cfg.bend, len * 0.5);
    const x2 = x + dx, y2 = Math.max(0.5, y + dy), z2 = z + dz;
    const n = depth >= cfg.depth ? 3 : 2;
    let px = x, py = y, pz = z;
    for (let k = 1; k <= n; k++) {
      const t = k / n, u = 1 - t; // quadratic Bezier through the bent control point
      const qx = u * u * x + 2 * u * t * (x + cx) + t * t * x2, qy = u * u * y + 2 * u * t * (y + cy) + t * t * y2, qz = u * u * z + 2 * u * t * (z + cz) + t * t * z2;
      seg(px, py, pz, qx, Math.max(0, qy), qz, (width / 2) * (1 - 0.4 * (k - 1) / n), (width / 2) * (1 - 0.4 * k / n));
      px = qx; py = Math.max(0, qy); pz = qz;
    }
    if (depth === 0) { clumps.push(clump(x2, y2, z2)); return; }
    const kids = 2 + (rnd() < cfg.fork ? 1 : 0), roll = rnd() * Math.PI * 2;
    for (let i = 0; i < kids; i++) {
      const off = (i - (kids - 1) / 2) * cfg.split;
      const e2 = e + off * Math.cos(roll) + (rnd() - 0.5) * 0.35, az2 = az + off * Math.sin(roll) * 1.2 + (rnd() - 0.5) * 0.35;
      limb(x2, y2, z2, az2, e2 * (1 - cfg.lift) + (Math.PI / 2) * cfg.lift, len * (0.6 + rnd() * 0.12), width * 0.6, depth - 1);
    }
    if (rnd() < cfg.inner) clumps.push(clump(x2, y2, z2));
  };
  const clump = (x: number, y: number, z: number): Clump => ({ x, y, z, r: (cfg.clump + rnd() * cfg.clump * 0.7) * G, front: rnd() < 0.6 ? 0.12 : -0.15 });

  // Seeded slot shuffles: azimuths stay evenly spread and heights stratified up the trunk, so no side or band is empty.
  const shuffled = () => {
    const a = Array.from({ length: cfg.limbs }, (_, i) => i);
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  const azSlot = shuffled(), hSlot = shuffled(), az0 = rnd() * Math.PI * 2;
  for (let i = 0; i < cfg.limbs; i++) {
    const t = cfg.limbs === 1 ? 0.5 : i / (cfg.limbs - 1);
    const az = az0 + (azSlot[i] / cfg.limbs) * Math.PI * 2 + (rnd() - 0.5) * 0.5;
    const e = Math.PI / 2 - Math.abs((t - 0.5) * cfg.fan) + (rnd() - 0.5) * 0.18;
    const hy = trunkHeight * (cfg.limbLow + ((hSlot[i] + rnd()) / cfg.limbs) * (1 - cfg.limbLow));
    limb((rnd() - 0.5) * tw * 0.5, hy, (rnd() - 0.5) * tw * 0.5, az, e, (cfg.limbLen + rnd() * 2) * G * (1 - Math.abs(t - 0.5) * cfg.taper), tw * 0.7, cfg.depth);
  }

  // Leaf cards: per-clump count scales with TS; if leaves + strands + specks overshoot the budget, leaves and
  // strands thin by the same factor (whole strands dropped, so the ones kept stay full length).
  const strandPlan = clumps.map(() => Array.from({ length: cfg.strands }, () => [Math.round(((2 + rnd() * cfg.strandLen) * G) / 0.5), rnd()]));
  const specks = Math.round(cfg.specks * TS), want = Math.round(cfg.perClump * TS);
  const strandTotal = strandPlan.flat().reduce((a, [n]) => a + n, 0), room = CARD_BUDGET - specks * clumps.length;
  const thin = Math.min(1, room / (want * clumps.length + strandTotal));
  const per = Math.max(1, Math.floor(want * thin));
  const card = (x: number, y: number, z: number, shade: number, speck: boolean) => {
    if (cards.length >= CARD_BUDGET) return;
    const s = Math.min(0.999, Math.max(0, shade + (hash3(Math.round(x * 4), Math.round(y * 4), Math.round(z * 4), seed) - 0.5) * 0.3));
    cards.push({ x, y: Math.max(0.3, y), z, rotY: rnd() * Math.PI * 2, tilt: (rnd() - 0.5) * 0.9, size: speck ? 0.3 : 0.55 + rnd() * 0.35, shade: s, speck });
  };
  clumps.forEach((c, ci) => {
    for (let i = 0; i < per; i++) {
      const a = rnd() * Math.PI * 2, v = rnd() * 2 - 1, d = Math.cbrt(rnd()) * c.r, h = Math.sqrt(1 - v * v);
      const ox = Math.cos(a) * h * d, oy = v * d * cfg.flat, oz = Math.sin(a) * h * d;
      card(c.x + ox, c.y + oy, c.z + oz, 0.45 + (oy / c.r) * 0.45 + ((ox - oz) / c.r) * 0.15 + c.front, false);
    }
    for (const [n, keep] of strandPlan[ci]) {
      if (keep >= thin) continue;
      let x = c.x + (rnd() - 0.5) * c.r * 1.4, z = c.z + (rnd() - 0.5) * c.r * 1.4;
      const y0 = c.y - c.r * 0.3 * cfg.flat;
      for (let j = 0; j < n && y0 - j * 0.5 > 0.5; j++) {
        x += (rnd() - 0.5) * 0.3; z += (rnd() - 0.5) * 0.3;
        card(x, y0 - j * 0.5, z, 0.5 - (j / n) * 0.4 + c.front * 0.8, false);
      }
    }
    for (let i = 0; i < specks; i++) card(c.x + (rnd() - 0.5) * c.r * 1.6, c.y + (rnd() - 0.5) * c.r * cfg.flat, c.z + (rnd() - 0.5) * c.r * 1.6, rnd(), true);
  });

  let top = 0, crownRadius = 0;
  for (const g of segments) top = Math.max(top, g.y0, g.y1);
  for (const c of cards) {
    top = Math.max(top, c.y);
    if (!c.speck) crownRadius = Math.max(crownRadius, Math.hypot(c.x, c.z));
  }
  return { species, cards, segments, top, trunkHeight, crownRadius };
}

export const CROWN_TO_ISLAND = 1.5, BIRCH_CROWN_TO_ISLAND = 1.35;
// The tree view frames this height for every tree, so the island never changes size on screen; taller trees
// (mostly birch, up to ~5× the radius) are scaled down to it instead of zooming everything out.
export const MAX_TOP_TO_ISLAND = 3.2;
const STRETCH = 2.2;

// Scales a grown tree so its crown is a fixed multiple of the island, whatever the link length, and no taller
// than MAX_TOP_TO_ISLAND × the island radius; a tree held to that height spreads sideways instead of thinning.
export function fitTree(tree: Tree, islandRadius: number): Tree {
  const crown = (tree.species === "birch" ? BIRCH_CROWN_TO_ISLAND : CROWN_TO_ISLAND) * islandRadius / tree.crownRadius;
  const k = Math.min(crown, MAX_TOP_TO_ISLAND * islandRadius / tree.top);
  // A tree shrunk to the height cap spreads sideways back toward its crown width (at most STRETCH ×), so it isn't a pole.
  const w = k * Math.min(STRETCH, crown / k);
  return {
    ...tree,
    cards: tree.cards.map((c) => ({ ...c, x: c.x * w, y: c.y * k, z: c.z * w, size: c.size * Math.sqrt(k * w) })), // leaves fill the wider crown
    segments: tree.segments.map((s) => ({ x0: s.x0 * w, y0: s.y0 * k, z0: s.z0 * w, x1: s.x1 * w, y1: s.y1 * k, z1: s.z1 * w, r0: s.r0 * k, r1: s.r1 * k })),
    top: tree.top * k, trunkHeight: tree.trunkHeight * k, crownRadius: tree.crownRadius * w,
  };
}
