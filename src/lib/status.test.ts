import assert from "node:assert/strict";
import test from "node:test";
import { hintAction, hintText, saveBlockedReason, type StatusInput } from "./status.ts";
import { TOO_SMALL_TO_SCAN } from "./scanFit.ts";

const pass = { matched: 40, total: 40, worstCaseContrast: 21, separated: true };
const fail = { matched: 20, total: 40, worstCaseContrast: 1.2, separated: false };
const failText = "contrast 1.2:1, needs 3:1";

const base: StatusInput = {
  hasCode: true,
  tooLong: false,
  tooSmall: false,
  phase: "folded",
  separation: pass,
  gradedNow: true,
};
const s = (over: Partial<StatusInput>): StatusInput => ({ ...base, ...over });

const NO_CODE = "Type or paste a link to grow your island.";
const TOO_LONG = "The text is too long for one QR code. Shorten it to save.";
const NOT_FOLDED = "Fold the tree into your code first, then save.";
const CHECKING = "Checking the code, one moment.";

test("save copy: no code", () => {
  assert.equal(saveBlockedReason(s({ hasCode: false, phase: "tree", separation: null, gradedNow: false })), NO_CODE);
});
test("save copy: too long", () => {
  assert.equal(saveBlockedReason(s({ tooLong: true })), TOO_LONG);
});
test("save copy: too small uses the scan-fit message", () => {
  assert.equal(saveBlockedReason(s({ tooSmall: true })), TOO_SMALL_TO_SCAN);
});
test("save copy: not folded", () => {
  for (const phase of ["tree", "folding", "growing"] as const) {
    assert.equal(saveBlockedReason(s({ phase, separation: null, gradedNow: false })), NOT_FOLDED);
  }
});
test("save copy: folded without a current graded result", () => {
  assert.equal(saveBlockedReason(s({ separation: null, gradedNow: false })), CHECKING);
  assert.equal(saveBlockedReason(s({ separation: pass, gradedNow: false })), CHECKING);
});
test("save copy: failed check", () => {
  assert.equal(saveBlockedReason(s({ separation: fail })), `This code won't scan: ${failText}.`);
});
test("save is allowed only for folded, separated, graded now", () => {
  assert.equal(saveBlockedReason(s({})), null);
});
test("precedence: no code beats too long and too small", () => {
  assert.equal(saveBlockedReason(s({ hasCode: false, tooLong: true, tooSmall: true })), NO_CODE);
});
test("precedence: too long beats too small and not folded", () => {
  assert.equal(saveBlockedReason(s({ tooLong: true, tooSmall: true, phase: "tree" })), TOO_LONG);
});
test("precedence: too small beats not folded", () => {
  assert.equal(saveBlockedReason(s({ tooSmall: true, phase: "tree" })), TOO_SMALL_TO_SCAN);
});
test("precedence: not folded beats failed check", () => {
  assert.equal(saveBlockedReason(s({ phase: "growing", separation: fail })), NOT_FOLDED);
});

test("hint: no code shows the no-code copy", () => {
  assert.equal(hintText(s({ hasCode: false, phase: "tree", separation: null, gradedNow: false })), NO_CODE);
});
test("hint: too long and too small use their save copy", () => {
  assert.equal(hintText(s({ tooLong: true, phase: "tree" })), TOO_LONG);
  assert.equal(hintText(s({ tooSmall: true, phase: "growing" })), TOO_SMALL_TO_SCAN);
});
test("hint: tree, folding, growing", () => {
  assert.equal(hintText(s({ phase: "tree", separation: null, gradedNow: false })), "Tap the tree to fold it into your code");
  assert.equal(hintText(s({ phase: "folding", separation: null, gradedNow: false })), "Folding…");
  assert.equal(hintText(s({ phase: "growing", separation: null, gradedNow: false })), "Growing…");
});
test("hint: folded checking", () => {
  assert.equal(hintText(s({ separation: null, gradedNow: false })), "Checking the code…");
  assert.equal(hintText(s({ separation: pass, gradedNow: false })), "Checking the code…");
});
test("hint: folded pass", () => {
  assert.equal(hintText(s({})), "Scans. Tap to grow the tree.");
});
test("hint: folded fail", () => {
  assert.equal(hintText(s({ separation: fail })), `Won't scan: ${failText}`);
});

test("hintAction: null while animating, otherwise the next step", () => {
  assert.equal(hintAction("tree"), "Fold into code");
  assert.equal(hintAction("folded"), "Grow the tree");
  assert.equal(hintAction("folding"), null);
  assert.equal(hintAction("growing"), null);
});
