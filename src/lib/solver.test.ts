import assert from "node:assert/strict";
import test from "node:test";
import { generateMatrix, type QrMatrix } from "./qr.ts";
import { SHAPES } from "./shapes.ts";
import { type Block, groundW, screenBand, screenU, solve } from "./solver.ts";

const m = generateMatrix("https://example.com");
const tree = SHAPES.MINECRAFT_TREE;

function countDarkCells(matrix: QrMatrix): number {
  let n = 0;
  for (const c of matrix.cells) if (c) n++;
  return n;
}

function groupByScreenColumn(blocks: Block[]): Map<number, Block[]> {
  const columns = new Map<number, Block[]>();
  for (const b of blocks) {
    const key = Math.round(screenU(b.x, b.z) * Math.SQRT2);
    const members = columns.get(key);
    if (members) members.push(b);
    else columns.set(key, [b]);
  }
  return columns;
}

test("one block per dark module, and the footprint is unchanged", () => {
  const dark = countDarkCells(m);
  const blocks = solve(m, tree, 30);
  assert.equal(blocks.length, dark);
  const cells = new Set(blocks.map((b) => `${b.x},${b.z}`));
  assert.equal(cells.size, dark);
  for (const b of blocks) assert.equal(m.cells[b.z * m.size + b.x], 1);
});

test("every block sits on or above the plane", () => {
  for (const b of solve(m, tree, 30)) assert.ok(b.y > 0);
});

test("the screen band scales with matrix size", () => {
  assert.ok(screenBand(57).span > screenBand(21).span);
});

test("elevation is clamped to a safe range, so cos never reaches zero", () => {
  const bad = [-10, 0, 90, 180, NaN, undefined as unknown as number];
  for (const deg of bad) {
    for (const b of solve(m, tree, deg)) assert.ok(Number.isFinite(b.y));
  }
});

test("cells sharing a diagonal share a screen column", () => {
  assert.ok(Math.abs(screenU(5, 2) - screenU(8, 5)) < 1e-9);
});

test("grounding happens only where the shape meets the floor", () => {
  const blocks = solve(m, tree, 30);
  assert.ok(blocks.some((b) => b.grounded));
  for (const b of blocks) if (b.grounded) assert.equal(b.region, "trunk");
});

test("cells in a column are ordered by ground depth", () => {
  const blocks = solve(m, tree, 30).filter((b) => b.region && !b.grounded);
  const col = groupByScreenColumn(blocks);
  for (const members of col.values()) {
    const sorted = [...members].sort(
      (p, q) => groundW(p.x, p.z, m.size) - groundW(q.x, q.z, m.size),
    );
    for (let i = 1; i < sorted.length; i++) {
      assert.ok(sorted[i].y >= sorted[i - 1].y - 1e-9);
    }
  }
});

// Amended (Ruling C11): the original asserted distinct `y`, which cannot fail —
// `w` is unique per cell within a column, so `y` is strictly increasing no matter
// what the slot logic does. Assert in screen-`v` space instead, where the
// sub-sample offset is the only thing that separates cells sharing a slot.
test("surplus cells sharing a slot are separated by the sub-sample offset", () => {
  const m2 = generateMatrix("x".repeat(400));
  const blocks = solve(m2, tree, 30);
  const col = groupByScreenColumn(blocks);
  // Every covered column, not just the largest: the largest here (58 members, 58
  // mask samples) happens to carry no surplus at all, so it never shares a slot.
  const covered = [...col.values()].filter((ms) => ms.some((b) => b.region !== null));
  // v = y*cos - w*sin recovers the screen height the solver aimed each block at.
  const rad = (30 * Math.PI) / 180;
  for (const crowded of covered) {
    const vs = crowded.map((b) =>
      (b.y * Math.cos(rad) - groundW(b.x, b.z, m2.size) * Math.sin(rad)).toFixed(4),
    );
    assert.equal(new Set(vs).size, vs.length, "two blocks were aimed at the same screen height");
  }
});

test("cells outside the shape still get placed, low and quiet", () => {
  const blocks = solve(m, tree, 30);
  const outside = blocks.filter((b) => b.region === null);
  assert.ok(outside.length > 0);
  const inside = blocks.filter((b) => b.region !== null);
  assert.ok(
    Math.max(...outside.map((b) => b.y)) < Math.max(...inside.map((b) => b.y)),
  );
});
