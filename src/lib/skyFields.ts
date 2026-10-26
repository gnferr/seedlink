// The sky's expensive noise, built once per viewport size (one value per 2 CSS px cell, rows top-down).
// Port of the day-cycle mockup's makeNoise + makeCycle precompute.

export type SkyFields = { density: Float32Array; shade: Float32Array; milky: Float32Array; width: number; height: number };

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

/**
 * density: cloud cover in the band 0.14 < v < 0.66; shade: cloud self-shadow, stored as (n + 1) / 2
 * (the shader decodes it back to [-1, 1]); milky: the Milky Way's brightness before the night fade.
 */
export function buildSkyFields(width: number, height: number, seed: number): SkyFields {
  const fbm = makeNoise(seed), fbm2 = makeNoise(seed + 99);
  const n = width * height;
  const density = new Float32Array(n), shade = new Float32Array(n).fill(0.5), milky = new Float32Array(n);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = x / width, v = y / height, i = y * width + x;
    if (v > 0.14 && v < 0.66) {
      const edge = Math.min((v - 0.14) / 0.06, (0.66 - v) / 0.08, 1);
      const c = fbm(u * 3.2 + 3, v * 7, 6);
      density[i] = clamp01(((c - 0.62) / 0.38) * edge);
      shade[i] = clamp01((fbm(u * 3.2 + 3.03, v * 7 - 0.04, 5) - c + 1) / 2);
    }
    const band = Math.max(0, 1 - Math.abs(v - 0.12 - (u - 0.2) * 0.55) * 4.2) ** 2;
    if (band > 0) milky[i] = clamp01(band * Math.max(0, fbm(u * 5, v * 6, 4) * 1.4 - 0.35) * (1 - Math.max(0, fbm2(u * 9, v * 14, 5) - 0.48) * 2.2));
  }
  return { density, shade, milky, width, height };
}
