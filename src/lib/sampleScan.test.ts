import assert from "node:assert/strict";
import test from "node:test";
import { generateMatrix, QUIET_ZONE, type QrMatrix } from "./qr.ts";
import { sampleBuffer, scanPitch } from "./sampleScan.ts";

const W = 600;
const H = 500;

// Paints the matrix as black/white squares at the SCAN camera's pitch; `at` picks which cell each pixel shows.
function paint(m: QrMatrix, at: (x: number, z: number) => number): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(W * H * 4).fill(255);
  const pitch = scanPitch(W, H, m.size);
  const half = m.size / 2;
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const x = Math.floor((px - W / 2) / pitch + half);
      const z = Math.floor((py - H / 2) / pitch + half);
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
const run = (buf: Uint8ClampedArray) => sampleBuffer(buf, W, H, m, scanPitch(W, H, m.size));

test("pitch follows the camera fit including its 0.9 margin", () => {
  assert.equal(scanPitch(W, H, m.size), (Math.min(W, H) / (m.size + QUIET_ZONE * 2)) * 0.9);
});

test("a perfect render separates with every module matched", () => {
  const s = run(paint(m, at));
  assert.equal(s.separated, true);
  assert.equal(s.matched, s.total);
  assert.equal(s.total, m.size * m.size);
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
