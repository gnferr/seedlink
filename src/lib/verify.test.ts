import assert from "node:assert/strict";
import test from "node:test";
import { classifySeparation, contrastRatio, failureReason, MIN_SCAN_CONTRAST, relativeLuminance } from "./verify.ts";

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
test("ordered but below 3:1 is not separated", () => {
  // #3b4536-ish base against a #1d2618-ish scan colour: correctly ordered, ~1.5:1.
  const s = classifySeparation([36, 36], [66, 70]);
  assert.ok(s.worstCaseContrast < MIN_SCAN_CONTRAST);
  assert.equal(s.separated, false);
});
test("ordered at or above 3:1 is separated", () => {
  const s = classifySeparation([0], [118]);
  assert.ok(s.worstCaseContrast >= MIN_SCAN_CONTRAST, String(s.worstCaseContrast));
  assert.equal(s.separated, true);
});
test("a NaN sample is never separated", () => {
  assert.equal(classifySeparation([0, NaN], [255]).separated, false);
  assert.equal(classifySeparation([0], [255, NaN]).separated, false);
});
test("contrast is order-independent", () => {
  const a = relativeLuminance(30, 30, 30);
  const b = relativeLuminance(200, 200, 200);
  assert.equal(contrastRatio(a, b), contrastRatio(b, a));
});
test("linearisation switches branch at the 0.03928 knee", () => {
  // 10/255 = 0.0392 is on the linear branch, 11/255 = 0.0431 on the power branch.
  assert.ok(Math.abs(relativeLuminance(10, 10, 10) - 10 / 255 / 12.92) < 1e-12);
  assert.ok(Math.abs(relativeLuminance(11, 11, 11) - ((11 / 255 + 0.055) / 1.055) ** 2.4) < 1e-12);
});
test("failureReason names low contrast in words", () => {
  assert.equal(failureReason(classifySeparation([36], [66])), "contrast 1.5:1, needs 3:1");
  assert.equal(failureReason(classifySeparation([0], [255])), "");
  assert.equal(failureReason(classifySeparation([200], [100])), "dark and light modules overlap");
});
