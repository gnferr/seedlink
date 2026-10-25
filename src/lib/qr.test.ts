import assert from "node:assert/strict";
import test from "node:test";
import { darkModules, generateMatrix, isFinder } from "./qr.ts";

test("finder cells are the three 7x7 corners and nothing else", () => {
  const { size } = generateMatrix("https://example.com");
  let n = 0;
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) if (isFinder(x, z, size)) n++;
  assert.equal(n, 3 * 49);
  assert.ok(isFinder(0, 0, size) && isFinder(size - 1, 0, size) && isFinder(0, size - 1, size));
  assert.ok(!isFinder(size - 1, size - 1, size), "bottom-right has no finder");
  assert.ok(!isFinder(7, 0, size) && !isFinder(0, 7, size));
});

test("matrix is a square grid of 0/1 with a plausible QR size", () => {
  const { cells, size } = generateMatrix("https://example.com");
  assert.ok(size >= 21 && (size - 21) % 4 === 0, `odd QR size: ${size}`);
  assert.equal(cells.length, size * size);
  assert.ok(cells.every((c) => c === 0 || c === 1));
  assert.ok(cells.some((c) => c === 1), "no dark modules");
});

test("empty input is rejected rather than encoding a blank", () => {
  assert.throws(() => generateMatrix(""));
});

test("darkModules lists every dark cell once, centred on the slab", () => {
  const m = generateMatrix("https://example.com");
  const d = darkModules(m);
  assert.equal(d.length, [...m.cells].filter((c) => c === 1).length);
  const half = (m.size - 1) / 2;
  for (const { col, row, x, z } of d) {
    assert.equal(m.cells[row * m.size + col], 1);
    assert.equal(x, col - half);
    assert.equal(z, row - half);
  }
  assert.deepEqual(d[0], { col: 0, row: 0, x: -half, z: -half }); // finder corner is dark
});
