import assert from "node:assert/strict";
import test from "node:test";
import { generateMatrix, moduleHeight, moduleNoise } from "./qr.ts";

test("matrix is a square grid of 0/1 with a plausible QR size", () => {
  const { cells, size } = generateMatrix("https://example.com");
  assert.ok(size >= 21 && (size - 21) % 4 === 0, `odd QR size: ${size}`);
  assert.equal(cells.length, size * size);
  assert.ok(cells.every((c) => c === 0 || c === 1));
  assert.ok(cells.some((c) => c === 1), "no dark modules");
});

test("empty input still produces a matrix", () => {
  assert.ok(generateMatrix("").size >= 21);
});

test("module noise is deterministic and within [0, 1)", () => {
  assert.equal(moduleNoise(3, 7), moduleNoise(3, 7));
  for (let x = 0; x < 30; x++) {
    for (let z = 0; z < 30; z++) {
      const n = moduleNoise(x, z);
      assert.ok(n >= 0 && n < 1, `noise out of range: ${n}`);
    }
  }
});

test("heights stay inside the requested range", () => {
  for (let x = 0; x < 30; x++) {
    for (let z = 0; z < 30; z++) {
      const h = moduleHeight(x, z, 1, 5);
      assert.ok(h >= 1 && h <= 5, `height out of range: ${h}`);
    }
  }
});
