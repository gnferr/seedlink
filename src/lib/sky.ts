import type { Season } from "./seasons.ts";
import { PALETTES, type SkySpec } from "./palette.ts";
import { hashString, mulberry32 } from "./rng.ts";

export const SKY_WIDTH = 240, SKY_HEIGHT = 160, SKY_STEPS = 14;
const W = SKY_WIDTH, H = SKY_HEIGHT, N = SKY_STEPS;
type RGB = [number, number, number];

function hsb(h: number, s: number, b: number): RGB {
  h = ((h % 360) + 360) % 360; s /= 100; b /= 100;
  const f = (n: number) => { const k = (n + h / 60) % 6; return Math.round((b - b * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255); };
  return [f(5), f(3), f(1)];
}
const mixRGB = (a: RGB, b: RGB, t: number): RGB => a.map((v, i) => Math.round(v + (b[i] - v) * t)) as RGB;

// 8x8 Bayer threshold matrix in (0, 1).
const B8 = (() => {
  const m = [[0, 2], [3, 1]];
  let b = m;
  for (let n = 2; n < 8; n *= 2) b = Array.from({ length: n * 2 }, (_, y) => Array.from({ length: n * 2 }, (_, x) => 4 * b[y % n][x % n] + m[Math.floor(y / n)][Math.floor(x / n)]));
  return b.map((r) => r.map((v) => (v + 0.5) / 64));
})();

export function skyRamp(spec: SkySpec): RGB[] {
  const { hue, hueStep, bright: [b0, b1], sat: [s0, s1] } = spec;
  return Array.from({ length: N }, (_, i) => {
    const t = i / (N - 1);
    return hsb(hue + hueStep * i, s0 + (s1 - s0) * t, b0 + (b1 - b0) * (1 - Math.pow(1 - t, 1.35)));
  });
}

export function renderSky(season: Season): Uint8ClampedArray {
  const spec = PALETTES[season].sky, ramp = skyRamp(spec);
  const d = new Uint8ClampedArray(W * H * 4);
  const r = mulberry32(hashString(season));
  const fAt = (x: number, y: number) => {
    let f = Math.pow(Math.min(1, y / (H * 0.82)), 0.9) * (N - 1);
    const dx = (x - W * 0.5) / (W * 0.42), dy = (y - H * 0.47) / (H * 0.5);
    f += 2.2 * Math.max(0, 1 - Math.hypot(dx, dy)) ** 1.6; // glow behind the island
    f -= 1.6 * Math.max(0, Math.abs(x / W - 0.5) * 2 - 0.55) / 0.45; // vignette
    return Math.max(0, Math.min(N - 1, f));
  };
  const pick = (f: number, x: number, y: number) => { const i = Math.floor(f); return Math.min(N - 1, i + (f - i > B8[y & 7][x & 7] ? 1 : 0)); };
  const put = (x: number, y: number, c: RGB) => { const o = (y * W + x) * 4; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, ramp[pick(fAt(x, y), x, y)]);
  for (let i = 0; i < spec.stars; i++) {
    const x = Math.floor(r() * W), y = Math.floor(Math.pow(r(), 1.7) * H * 0.5);
    if (fAt(x, y) < N * 0.45) put(x, y, i % 3 ? ramp[N - 1] : [255, 248, 228]);
  }
  if (spec.moon) {
    const mx = Math.round(W * 0.78), my = 24, MR = 7;
    for (let y = Math.max(0, my - 22); y <= my + 22; y++) for (let x = mx - 22; x <= Math.min(W - 1, mx + 22); x++) {
      const dd = Math.hypot(x - mx, y - my);
      if (dd <= MR) { if (spec.moon === "crescent" && Math.hypot(x - mx - 3, y - my + 2) < 6.4) continue; put(x, y, (x - mx) - (y - my) > 3 ? [255, 252, 238] : [238, 232, 214]); }
      else if (dd < MR + 20) put(x, y, ramp[pick(fAt(x, y) + 2.4 * (1 - (dd - MR) / 20) ** 2, x, y)]);
    }
  }
  if (spec.sun) {
    const sx = Math.round(W * 0.72), sy = Math.round(H * 0.72), SR = 13;
    for (let y = sy - 40; y < H; y++) for (let x = sx - 40; x <= Math.min(W - 1, sx + 40); x++) {
      const dd = Math.hypot(x - sx, y - sy);
      if (dd <= SR) put(x, y, (y > sy + 3 && (y - sy) % 4 < 1) ? ramp[N - 3] : mixRGB(hsb(42, 45, 100), [255, 246, 220], Math.max(0, 1 - dd / SR)));
      else if (dd < SR + 30) put(x, y, ramp[pick(fAt(x, y) + 3 * (1 - (dd - SR) / 30) ** 2, x, y)]);
    }
  }
  // Cloud sea along the bottom.
  const top = Math.floor(H * 0.82), bumps = Array.from({ length: 9 }, (_, i) => [i * W / 8, 4 + r() * 8, 10 + r() * 12]);
  for (let y = top - 14; y < H; y++) for (let x = 0; x < W; x++) {
    const surf = top - Math.max(...bumps.map(([bx, h, w]) => { const q = Math.abs(x - bx); return q < w ? h * Math.sqrt(1 - (q / w) ** 2) : 0; }));
    if (y >= surf) put(x, y, ramp[Math.max(0, pick(N - 1.2 - (y - surf) * 0.16, x, y))]);
  }
  return d;
}
