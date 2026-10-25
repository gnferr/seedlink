import assert from "node:assert/strict";
import { test } from "node:test";
import { darkModules, generateMatrix } from "./qr.ts";
import { growTree, type TreeVoxel } from "./tree.ts";
import { easeInOutCubic, extraPose, planFold, voxelPose, type Pose } from "./fold.ts";

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} !~ ${b}`);
const blank = (): Pose => ({ x: 0, y: 0, z: 0, sx: 0, sy: 0, sz: 0, rotY: 0, ink: 0 });
const dark = darkModules(generateMatrix("https://example.com"));
const tree = growTree(25);

function synthetic(n: number): TreeVoxel[] {
  return Array.from({ length: n }, (_, i) => ({ x: i % 5, y: i + 0.5, z: Math.floor(i / 5), kind: "leaf" as const, shade: 0.5 }));
}

test("every dark module appears once across carriers and extras", () => {
  const plan = planFold(tree.voxels, tree.top, dark, 1);
  const seen = [...plan.carrier].filter((c) => c >= 0).concat(plan.extras).sort((a, b) => a - b);
  assert.deepEqual(seen, dark.map((_, i) => i));
});

test("50 voxels, 120 modules: 50 carriers and 70 extras", () => {
  const d = Array.from({ length: 120 }, (_, i) => ({ col: i, row: 0, x: i - 60, z: 0 }));
  const plan = planFold(synthetic(50), 50, d, 3);
  assert.equal([...plan.carrier].filter((c) => c >= 0).length, 50);
  assert.equal(plan.extras.length, 70);
});

test("t = 0 is the tree pose", () => {
  const plan = planFold(tree.voxels, tree.top, dark, 1);
  const o = blank();
  tree.voxels.forEach((v, i) => {
    voxelPose(plan, tree.voxels, dark, i, 0, o);
    near(o.x, v.x); near(o.y, v.y); near(o.z, v.z);
    near(o.sx, 1); near(o.sy, 1); near(o.sz, 1); near(o.ink, 0);
  });
});

test("t = 1 is the flat QR", () => {
  const plan = planFold(tree.voxels, tree.top, dark, 1);
  const o = blank();
  tree.voxels.forEach((_, i) => {
    voxelPose(plan, tree.voxels, dark, i, 1, o);
    const j = plan.carrier[i];
    if (j >= 0) {
      near(o.x, dark[j].x); near(o.y, 0.3); near(o.z, dark[j].z);
      near(o.sx, 0.98); near(o.sy, 0.6); near(o.ink, 1);
    } else {
      near(o.sx, 0); near(o.sy, 0); near(o.sz, 0); near(o.ink, 0);
    }
  });
});

test("extraPose grows in over the second half", () => {
  const m = dark[0];
  const o = extraPose(m, 1, blank());
  near(o.x, m.x); near(o.y, 0.3); near(o.z, m.z); near(o.sx, 0.98); near(o.sy, 0.6); near(o.sz, 0.98);
  const s = extraPose(m, 0.4, blank());
  near(s.sx, 0); near(s.sy, 0);
});

test("crown top falls first", () => {
  const plan = planFold(tree.voxels, tree.top, dark, 1);
  const gap = tree.top * 0.2;
  for (let a = 0; a < tree.voxels.length; a += 7)
    for (let b = 0; b < tree.voxels.length; b += 11)
      if (tree.voxels[a].y - tree.voxels[b].y >= gap) assert.ok(plan.delay[a] <= plan.delay[b]);
});

test("planFold is deterministic", () => {
  assert.deepEqual(planFold(tree.voxels, tree.top, dark, 9), planFold(tree.voxels, tree.top, dark, 9));
});

test("easeInOutCubic endpoints", () => {
  near(easeInOutCubic(0), 0); near(easeInOutCubic(0.5), 0.5); near(easeInOutCubic(1), 1);
});
