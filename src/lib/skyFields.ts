// The sky's precomputed parts: the Milky Way, built once per viewport size (one value per sky cell, rows top-down),
// and the cloud tile, built once and slid across the sky.

export type SkyFields = { milky: Float32Array; width: number; height: number };

/** Seeded value-noise fBm on a 256x256 grid (Park-Miller), returning [0, 1]. */
function makeNoise(seed: number) {
  let sd = seed;
  const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const G = 256, grid = new Float32Array(G * G);
  for (let i = 0; i < grid.length; i++) grid[i] = r();
  const at = (x: number, y: number) => grid[(y & (G - 1)) * G + (x & (G - 1))];
  const sm = (t: number) => t * t * (3 - 2 * t);
  const n2 = (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
  return (x: number, y: number, oct: number) => {
    let v = 0, amp = 0.5, f = 1, sum = 0;
    for (let o = 0; o < oct; o++) { v += n2(x * f, y * f) * amp; sum += amp; amp *= 0.5; f *= 2.03; }
    return v / sum;
  };
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** milky: the Milky Way's brightness before the night fade. */
export function buildSkyFields(width: number, height: number, seed: number): SkyFields {
  const fbm = makeNoise(seed), fbm2 = makeNoise(seed + 99);
  const milky = new Float32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = x / width, v = y / height;
    const band = Math.max(0, 1 - Math.abs(v - 0.12 - (u - 0.2) * 0.55) * 4.2) ** 2;
    if (band > 0) milky[y * width + x] = clamp01(band * Math.max(0, fbm(u * 5, v * 6, 4) * 1.4 - 0.35) * (1 - Math.max(0, fbm2(u * 9, v * 14, 5) - 0.48) * 2.2));
  }
  return { milky, width, height };
}

export const CLOUD_TILE = { width: 768, layer: 160 }; // cells; the tile wraps sideways

/**
 * Two layers of Ghibli-style cumulus, far (top half of the tile) and near (bottom half), as RGBA bytes:
 * r is cover and g light (0 shadowed underside to 255 sunlit top), both soft so the clouds blend and slide smoothly.
 * Each cloud is a heap of round puffs with feathered edges, lit from above and a little from the left. The near layer
 * ends in a long bank along its bottom, the sea of clouds the island floats over.
 */
export function buildCloudTile(seed: number): Uint8Array {
  let sd = seed;
  const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const { width: W, layer: L } = CLOUD_TILE;
  const out = new Uint8Array(W * L * 2 * 4);
  type Puff = { x: number; y: number; r: number };
  const heap = (cx: number, base: number, w: number, h: number, n: number): Puff[] => {
    const ps: Puff[] = [{ x: cx, y: base, r: h * 0.45 }];
    for (let i = 0; i < n; i++) {
      const u = r(), v = r(), rise = Math.sin(u * Math.PI);
      ps.push({ x: cx + (u - 0.5) * w, y: base - rise * h * (0.4 + v * 0.6), r: (0.25 + v * 0.35) * h * (0.6 + rise * 0.6) });
    }
    return ps;
  };
  const paint = (top: number, puffs: Puff[]) => {
    // One light gradient over the whole heap (bright crown, shaded base) so it reads as one mass, not a pile of
    // balls; each puff only nudges it a little.
    const crown = Math.min(...puffs.map((p) => p.y - p.r)), base = Math.max(...puffs.map((p) => p.y + p.r * 0.6));
    for (const p of puffs)
      for (let y = Math.max(0, Math.floor(p.y - p.r)); y <= Math.min(L - 1, Math.ceil(p.y + p.r)); y++)
        for (let x = Math.floor(p.x - p.r); x <= Math.ceil(p.x + p.r); x++) {
          const d = Math.hypot(x - p.x, y - p.y);
          const edge = Math.min(1, Math.max(0, (p.r - d) / (p.r * 0.3))); // feathered rim
          if (edge <= 0) continue;
          const lit = Math.min(1, Math.max(0, 1.05 - (y - crown) / (base - crown) + (p.y - y) / (p.r * 6) + (p.x - x) / (p.r * 10)));
          const i = ((top + y) * W + (((x % W) + W) % W)) * 4;
          out[i] = Math.max(out[i], Math.round(edge * 255));
          out[i + 1] = Math.max(out[i + 1], Math.round(lit * edge * 255));
        }
  };
  // Far: small flat clouds scattered high.
  for (let k = 0; k < 9; k++) paint(0, heap((k + r() * 0.6) * (W / 9), 40 + r() * 90, 50 + r() * 70, 10 + r() * 14, 7));
  // Near: towering heaps, then the bank along the bottom.
  for (let k = 0; k < 5; k++) paint(L, heap((k + r() * 0.5) * (W / 5), 132 + r() * 12, 110 + r() * 60, 42 + r() * 30, 16));
  for (let x = 0; x < W; x += 26) paint(L, heap(x + r() * 12, 150 + r() * 6, 60, 22 + r() * 12, 4));
  // Below the bank's puffs the sea of clouds is solid, darkening downward.
  for (let y = 152; y < L; y++) for (let x = 0; x < W; x++) {
    const i = ((L + y) * W + x) * 4;
    out[i] = 255;
    out[i + 1] = Math.max(out[i + 1], Math.round(90 * (1 - (y - 152) / (L - 152))));
  }
  return out;
}
