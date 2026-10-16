import assert from "node:assert/strict";
import test from "node:test";
import { generateMatrix } from "./qr.ts";

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
