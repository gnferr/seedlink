import assert from "node:assert/strict";
import test from "node:test";
import { COVERAGE_GRID, silhouetteCoverage } from "./coverage.ts";
import { generateMatrix } from "./qr.ts";
import { SHAPES, type Shape } from "./shapes.ts";
import { solve, screenBand, screenU, groundW, heightFor, type Block } from "./solver.ts";

const CASES = [
  { text: "https://example.com", size: 29, min: 0.85 },
  { text: "https://example.com/" + "x".repeat(980), size: 161, min: 0.95 },
];

test("registry coverage", () => {
  for (const { text, size, min } of CASES) {
    const m = generateMatrix(text);
    assert.equal(m.size, size);
    for (const shape of Object.values(SHAPES)) {
      const c = silhouetteCoverage(solve(m, shape, 30), m.size, shape, 30);
      assert.ok(c >= min, `${shape.id} at size ${size}: ${c.toFixed(3)} < ${min}`);
    }
  }
});

test("a shape with nothing in it scores 0", () => {
  const empty: Shape = { id: "e", label: "e", mask: () => null };
  assert.equal(silhouetteCoverage([], 29, empty, 30), 0);
});

test("a block cloud filling the unit square scores 1", () => {
  const size = 29;
  const full: Shape = { id: "f", label: "f", mask: () => "body" };
  const phi = (30 * Math.PI) / 180;
  const { lo, span } = screenBand(size);
  const uMax = (size - 1) / Math.SQRT2;
  const blocks: Block[] = [];
  const n = COVERAGE_GRID;
  // One block per cell centre, placed by inverting the projection.
  for (let c = 0; c < n; c++) {
    for (let r = 0; r < n; r++) {
      const u = ((c + 0.5) / n) * 2 * uMax - uMax;
      const x = (u * Math.SQRT2 + (size - 1)) / 2;
      const z = (size - 1) / 2 - (u * Math.SQRT2) / 2;
      const y = heightFor(lo + ((r + 0.5) / n) * span, groundW(x, z, size), phi);
      assert.ok(Math.abs(screenU(x, z) - u) < 1e-9);
      blocks.push({ x, z, y, grounded: false, region: "body" });
    }
  }
  assert.equal(silhouetteCoverage(blocks, size, full, 30), 1);
});
