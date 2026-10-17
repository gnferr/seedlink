import assert from "node:assert/strict";
import test from "node:test";
import { COVERAGE_GRID, silhouetteCoverage, silhouetteSpill } from "./coverage.ts";
import { generateMatrix } from "./qr.ts";
import { SHAPES, type Shape } from "./shapes.ts";
import { solve, screenBand, screenU, groundW, heightFor, type Block } from "./solver.ts";

// Spill measured at 30 deg for the oak: 0.271 (size 29), 0.263 (size 161). About a quarter of the
// blocks legitimately sit beside the tree (the sprite is padded with empty columns, so those
// columns hold low body blocks); the ceiling is measured + ~0.05 and well under 0.5.
const CASES = [
  { text: "https://example.com", size: 29, min: 0.85, maxSpill: 0.32 },
  { text: "https://example.com/" + "x".repeat(980), size: 161, min: 0.95, maxSpill: 0.32 },
];

test("registry coverage", () => {
  for (const { text, size, min, maxSpill } of CASES) {
    const m = generateMatrix(text);
    assert.equal(m.size, size);
    for (const shape of Object.values(SHAPES)) {
      const c = silhouetteCoverage(solve(m, shape, 30), m.size, shape, 30);
      assert.ok(c >= min, `${shape.id} at size ${size}: ${c.toFixed(3)} < ${min}`);
      const sp = silhouetteSpill(solve(m, shape, 30), m.size, shape, 30);
      assert.ok(sp <= maxSpill, `${shape.id} at size ${size}: spill ${sp.toFixed(3)} > ${maxSpill}`);
      if (shape.id === "MINECRAFT_TREE") {
        const t = silhouetteCoverage(solve(m, shape, 30), m.size, shape, 30, "trunk");
        assert.ok(t > 0.5, `trunk coverage at size ${size}: ${t.toFixed(3)}`);
      }
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

test("no blocks means zero spill, not NaN", () => {
  assert.equal(silhouetteSpill([], 29, SHAPES.MINECRAFT_TREE, 30), 0);
});

test("spill counts blocks outside the shape and outside the grid", () => {
  const left: Shape = { id: "l", label: "l", mask: (a) => (a < 0.5 ? "body" : null) };
  const out = [{ x: 14, z: 14, y: 0, grounded: false, region: null }, { x: 0, z: 28, y: 100, grounded: false, region: null }] as Block[];
  assert.equal(silhouetteSpill(out, 29, left, 30), 1); // centre column is a>=0.5 -> empty; second is off the grid
});

test("a grounded block at a high row fills the pillar below it; a floating one does not", () => {
  const size = 29;
  const full: Shape = { id: "f", label: "f", mask: () => "body" };
  const base = { x: 14, z: 14, y: 40, region: "body" as const };
  const up = silhouetteCoverage([{ ...base, grounded: true }], size, full, 30);
  const floating = silhouetteCoverage([{ ...base, grounded: false }], size, full, 30);
  assert.ok(up > floating, `${up} vs ${floating}`);
});
