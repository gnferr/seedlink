import assert from "node:assert/strict";
import { test } from "node:test";
import { growTree, TREE_VOXEL_BUDGET } from "./tree.ts";

test("growTree is deterministic", () => {
  assert.deepEqual(growTree(25), growTree(25));
});

test("growth is capped", () => {
  assert.equal(growTree(37).voxels.length, growTree(101).voxels.length);
  assert.ok(growTree(37).voxels.length <= TREE_VOXEL_BUDGET);
});

for (const size of [21, 25, 37]) {
  test(`crown overhangs a ${size}-module code, trunk stays thin`, () => {
    const t = growTree(size);
    assert.ok(t.crownRadius >= (size - 1) / 2, `${t.crownRadius}`);
    // branches (also kind "trunk") start 3 below the top; the stem proper is thin
    const stem = t.voxels.filter((v) => v.kind === "trunk" && v.y < t.trunkHeight - 3);
    assert.ok(stem.every((v) => Math.abs(v.x) <= 1 && Math.abs(v.z) <= 1));
  });
}

test("interior leaves are culled; top is max y", () => {
  const t = growTree(25);
  const leaves = new Set(t.voxels.filter((v) => v.kind === "leaf").map((v) => `${v.x},${v.y},${v.z}`));
  for (const v of t.voxels) {
    if (v.kind !== "leaf") continue;
    const all = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].every(([a, b, c]) => leaves.has(`${v.x + a},${v.y + b},${v.z + c}`));
    assert.ok(!all);
  }
  assert.equal(t.top, Math.max(...t.voxels.map((v) => v.y)));
});
