import assert from "node:assert/strict";
import test from "node:test";
import { generateMatrix, QUIET_ZONE } from "./qr.ts";
import { QR_IMAGE, qrPixels } from "./qrImage.ts";
import { sampleBuffer } from "./sampleScan.ts";

const m = generateMatrix("https://example.com");
const img = qrPixels(m);
const M = QR_IMAGE.moduleSize;
const hex = (x: number, y: number) =>
  "#" + [0, 1, 2].map((c) => img.data[(y * img.width + x) * 4 + c].toString(16).padStart(2, "0")).join("");

test("image is a square of (size + 8) modules", () => {
  assert.equal(img.width, (m.size + 8) * M);
  assert.equal(img.height, img.width);
});

test("corners and the quiet-zone ring are white", () => {
  const e = img.width - 1;
  for (const [x, y] of [[0, 0], [e, 0], [0, e], [e, e]]) assert.equal(hex(x, y), "#ffffff");
  const q = QUIET_ZONE * M;
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++)
      if (x < q || y < q || x >= img.width - q || y >= img.height - q) assert.equal(hex(x, y), "#ffffff");
});

test("module centres match the matrix", () => {
  for (let z = 0; z < m.size; z++)
    for (let x = 0; x < m.size; x++) {
      const px = (x + QUIET_ZONE) * M + M / 2, py = (z + QUIET_ZONE) * M + M / 2;
      assert.equal(hex(px, py), m.cells[z * m.size + x] === 1 ? QR_IMAGE.ink : QR_IMAGE.background);
    }
});

test("sampleBuffer separates the image", () => {
  const s = sampleBuffer(img.data, img.width, img.height, m, M);
  assert.equal(s.separated, true);
  assert.equal(s.matched, s.total);
});
