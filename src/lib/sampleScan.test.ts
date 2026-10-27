import assert from "node:assert/strict";
import test from "node:test";
import { generateMatrix, QUIET_ZONE, type QrMatrix } from "./qr.ts";
import { bufferScale, sampleBuffer } from "./sampleScan.ts";
import { FIT_MARGIN, scanFit, type ScanInsets } from "./scanFit.ts";

const W = 600;
const H = 500;

// Paints the matrix as black/white squares where the SCAN camera draws them; `at` picks which cell each pixel shows.
function paint(m: QrMatrix, at: (x: number, z: number) => number, insets: ScanInsets = { top: 0, bottom: 0 }): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(W * H * 4).fill(255);
  const { zoom: pitch, dy } = scanFit(W, H, m.size + QUIET_ZONE * 2, insets);
  const half = m.size / 2;
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const x = Math.floor((px - W / 2) / pitch + half);
      const z = Math.floor((py - H / 2 - dy) / pitch + half);
      if (x < 0 || z < 0 || x >= m.size || z >= m.size) continue;
      if (at(x, z) === 1) {
        const i = (py * W + px) * 4;
        buf[i] = buf[i + 1] = buf[i + 2] = 0;
      }
    }
  }
  return buf;
}

const m = generateMatrix("https://example.com");
const at = (x: number, z: number) => m.cells[z * m.size + x];
const run = (buf: Uint8ClampedArray, insets?: ScanInsets) => {
  const { zoom, dy } = scanFit(W, H, m.size + QUIET_ZONE * 2, insets);
  return sampleBuffer(buf, W, H, m, zoom, dy);
};

test("pitch follows the camera fit including its shared margin", () => {
  assert.equal(scanFit(W, H, m.size + QUIET_ZONE * 2).zoom, (Math.min(W, H) / (m.size + QUIET_ZONE * 2)) * FIT_MARGIN);
});

test("insets shrink the fit to the free band and centre the pad in it", () => {
  const plane = m.size + QUIET_ZONE * 2;
  const f = scanFit(W, H, plane, { top: 120, bottom: 60 });
  assert.equal(f.zoom, ((H - 180) / plane) * FIT_MARGIN);
  assert.equal(f.dy, 30);
  // The pad, quiet zone included, lies inside the free band.
  const half = (f.zoom * plane) / 2;
  assert.ok(H / 2 + f.dy - half >= 120 && H / 2 + f.dy + half <= H - 60);
  // Width still bounds it when the band is taller than the view is wide.
  assert.equal(scanFit(300, 900, plane, { top: 100, bottom: 100 }).zoom, (300 / plane) * FIT_MARGIN);
});

test("a perfect render separates with every module matched", () => {
  const s = run(paint(m, at));
  assert.equal(s.separated, true);
  assert.equal(s.matched, s.total);
  assert.equal(s.total, m.size * m.size);
});

test("a render framed between controls is sampled where it is drawn", () => {
  const insets = { top: 140, bottom: 70 };
  const s = run(paint(m, at, insets), insets);
  assert.equal(s.separated, true);
  assert.equal(s.matched, s.total);
  // Sampling it as if there were no controls misses the modules.
  const off = run(paint(m, at, insets));
  assert.ok(!off.separated || off.matched < off.total);
});

test("one wrong module is caught", () => {
  const i = m.cells.indexOf(1);
  const x = i % m.size;
  const z = Math.floor(i / m.size);
  const s = run(paint(m, (a, b) => (a === x && b === z ? 0 : at(a, b))));
  assert.ok(!s.separated || s.matched === s.total - 1);
});

test("a transposed render is detected as broken", () => {
  const s = run(paint(m, (x, z) => at(z, x)));
  assert.ok(!s.separated || s.matched < s.total);
});

test("buffer scale maps CSS insets to buffer pixels, and an off-DOM copy needs it passed", () => {
  assert.equal(bufferScale(1000, 500), 2);
  // An off-DOM canvas has no layout height: it would be read at 1, which frames a 2x buffer wrongly.
  assert.equal(bufferScale(1000, 0), 1);
  const insets = { top: 0, bottom: 70 };
  const k = bufferScale(H, H / 2);
  const scaled = { top: insets.top * k, bottom: insets.bottom * k };
  assert.equal(run(paint(m, at, scaled), scaled).matched, m.size * m.size);
});
