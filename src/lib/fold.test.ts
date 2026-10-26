import assert from "node:assert/strict";
import { test } from "node:test";
import { darkModules, generateMatrix, modulePitch } from "./qr.ts";
import { growTree, SPECIES } from "./tree.ts";
import { cardShown, easeInOutCubic, extraPose, foldPieces, inkPose, piecePose, planFold, MODULE_BLOCK, type Pose } from "./fold.ts";

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} !~ ${b}`);
const blank = (): Pose => ({ x: 0, y: 0, z: 0, sx: 0, sy: 0, sz: 0, rotY: 0, ink: 0 });
const SIZES = [21, 25, 37];
// a text whose code is exactly `size` modules wide
function codeOf(size: number) {
  for (let n = 1; n < 400; n++) {
    const m = generateMatrix("x".repeat(n));
    if (m.size === size) return m;
  }
  throw new Error("no code of size " + size);
}
const darks = new Map(SIZES.map((s) => [s, darkModules(codeOf(s))]));

function eachCase(fn: (c: { species: string; size: number; winter: boolean; tree: ReturnType<typeof growTree>; pieces: ReturnType<typeof foldPieces>; dark: ReturnType<typeof darkModules>; plan: ReturnType<typeof planFold> }) => void) {
  for (const species of SPECIES) for (const size of SIZES) for (const winter of [false, true]) {
    const tree = growTree(species, 5, size), pieces = foldPieces(tree, winter ? 0.08 : 1), dark = darks.get(size)!;
    fn({ species, size, winter, tree, pieces, dark, plan: planFold(pieces, tree.top, dark, 1, 1) });
  }
}

test("every dark module appears once across carriers and extras", () => {
  eachCase(({ plan, dark }) => {
    const seen = [...plan.carrier].filter((c) => c >= 0).concat(plan.extras).sort((a, b) => a - b);
    assert.deepEqual(seen, dark.map((_, i) => i));
  });
});

test("winter cards and specks never carry", () => {
  eachCase(({ winter, tree, plan }) => {
    tree.cards.forEach((c, i) => { if (winter || c.speck) assert.equal(plan.carrier[i], -1); });
  });
});

test("t = 1: ink blocks sit on their modules, pieces are gone", () => {
  eachCase(({ pieces, dark, plan }) => {
    const o = blank();
    dark.forEach((m, j) => {
      inkPose(plan, pieces, dark, j, 1, o);
      near(o.x, m.x); near(o.y, MODULE_BLOCK.y); near(o.z, m.z);
      near(o.sx, 1); near(o.sy, 0.6); near(o.sz, 1);
    });
    pieces.forEach((_, i) => { piecePose(plan, pieces, dark, i, 1, o); near(o.sx, 0); near(o.sy, 0); near(o.sz, 0); });
  });
});

test("t = 0: ink blocks are hidden, pieces sit at their start", () => {
  eachCase(({ pieces, dark, plan }) => {
    const o = blank();
    dark.forEach((_, j) => { inkPose(plan, pieces, dark, j, 0, o); near(o.sx, 0); near(o.sy, 0); near(o.sz, 0); });
    pieces.forEach((v, i) => {
      piecePose(plan, pieces, dark, i, 0, o);
      near(o.x, v.x); near(o.y, v.y); near(o.z, v.z); near(o.sx, 1); near(o.sy, 1); near(o.sz, 1); near(o.ink, 0);
    });
  });
});

test("plans are deterministic", () => {
  const tree = growTree("oak", 3, 25), pieces = foldPieces(tree, 1), dark = darks.get(25)!;
  const a = planFold(pieces, tree.top, dark, 9, 1), b = planFold(pieces, tree.top, dark, 9, 1);
  assert.deepEqual(a.carrier, b.carrier);
  assert.deepEqual(a.delay, b.delay);
});

test("cards carry before segments", () => {
  const tree = growTree("oak", 3, 25), pieces = foldPieces(tree, 1), dark = darks.get(25)!;
  const plan = planFold(pieces, tree.top, dark, 1, 1);
  const carrying = tree.cards.filter((c) => !c.speck).length;
  const cardCarriers = [...plan.carrier].slice(0, tree.cards.length).filter((c) => c >= 0).length;
  assert.equal(cardCarriers, Math.min(dark.length, carrying));
});

test("birch in winter at size 37 still covers every module once", () => {
  const tree = growTree("birch", 9, 37), pieces = foldPieces(tree, 0.08), dark = darks.get(37)!;
  const plan = planFold(pieces, tree.top, dark, 4, 1);
  const seen = [...plan.carrier].filter((c) => c >= 0).concat(plan.extras).sort((a, b) => a - b);
  assert.deepEqual(seen, dark.map((_, i) => i));
});

test("extraPose grows in over the second half", () => {
  const m = darks.get(21)![0];
  const o = extraPose(m, 1, blank(), 1);
  near(o.x, m.x); near(o.y, 0.3); near(o.z, m.z); near(o.sx, 1); near(o.sy, 0.6); near(o.sz, 1);
  const s = extraPose(m, 0.4, blank(), 1);
  near(s.sx, 0); near(s.sy, 0);
});

test("autumn: only shown leaf cards carry, and every module is still covered once", () => {
  for (const species of SPECIES) for (const size of SIZES) {
    const tree = growTree(species, 5, size), pieces = foldPieces(tree, 0.6), dark = darks.get(size)!;
    const plan = planFold(pieces, tree.top, dark, 1, 1);
    tree.cards.forEach((c, i) => { if (c.speck || !cardShown(i, 0.6)) assert.equal(plan.carrier[i], -1); });
    assert.ok(tree.cards.some((c, i) => !c.speck && !cardShown(i, 0.6)), "autumn hides some cards");
    const seen = [...plan.carrier].filter((c) => c >= 0).concat(plan.extras).sort((a, b) => a - b);
    assert.deepEqual(seen, dark.map((_, i) => i));
  }
});

test("pitch 0.5: ink and extras land half-size at the scaled module", () => {
  const dark = darkModules(codeOf(25), 0.5), tree = growTree("oak", 5, 25), pieces = foldPieces(tree, 1);
  const plan = planFold(pieces, tree.top, dark, 1, 0.5), o = blank();
  assert.equal(plan.pitch, 0.5);
  dark.forEach((m, j) => {
    inkPose(plan, pieces, dark, j, 1, o);
    near(o.x, m.x); near(o.y, 0.3); near(o.z, m.z); near(o.sx, 0.5); near(o.sy, 0.6); near(o.sz, 0.5);
  });
  const e = extraPose(dark[0], 1, blank(), 0.5);
  near(e.x, dark[0].x); near(e.z, dark[0].z); near(e.sx, 0.5); near(e.sy, 0.6); near(e.sz, 0.5);
});

test("every dark module is covered once at sizes 21, 37 and 57 with their pitch", () => {
  for (const size of [21, 37, 57]) {
    const p = modulePitch(size), dark = darkModules(codeOf(size), p);
    for (const species of SPECIES) for (const keep of [1, 0.6, 0.08]) {
      const tree = growTree(species, 5, size), pieces = foldPieces(tree, keep), plan = planFold(pieces, tree.top, dark, 1, p);
      const seen = [...plan.carrier].filter((c) => c >= 0).concat(plan.extras).sort((a, b) => a - b);
      assert.deepEqual(seen, dark.map((_, i) => i));
    }
  }
});

test("easeInOutCubic endpoints", () => {
  near(easeInOutCubic(0), 0); near(easeInOutCubic(1), 1); near(easeInOutCubic(0.5), 0.5);
});
