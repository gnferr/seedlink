import assert from "node:assert/strict";
import test from "node:test";
import { classifySeparation, contrastRatio, relativeLuminance } from "./verify.ts";

test("black on white is 21:1", () => {
  const r = contrastRatio(relativeLuminance(0, 0, 0), relativeLuminance(255, 255, 255));
  assert.ok(Math.abs(r - 21) < 0.05);
});
test("identical colours are 1:1", () => {
  const l = relativeLuminance(120, 120, 120);
  assert.ok(Math.abs(contrastRatio(l, l) - 1) < 1e-9);
});
test("overlapping populations are not separated", () => {
  assert.equal(classifySeparation([10, 200], [150, 220]).separated, false);
});
test("disjoint populations are separated and report the worst pair", () => {
  const s = classifySeparation([5, 9], [200, 240]);
  assert.equal(s.separated, true);
  assert.ok(s.worstCaseContrast > 10);
});
test("matched counts samples on the correct side of the midpoint between the closest values", () => {
  // Closest pair 200 and 150 gives threshold 175: dark 10 and light 220 are correct,
  // dark 200 and light 150 are on the wrong side.
  const s = classifySeparation([10, 200], [150, 220]);
  assert.equal(s.matched, 2);
  assert.equal(s.total, 4);
});
test("empty populations are degenerate: no throw, not separated, contrast 1", () => {
  assert.deepEqual(classifySeparation([], []), {
    matched: 0,
    total: 0,
    worstCaseContrast: 1,
    separated: false,
  });
  const s = classifySeparation([], [200]);
  assert.equal(s.separated, false);
  assert.equal(s.worstCaseContrast, 1);
});
