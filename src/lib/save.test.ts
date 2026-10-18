import test from "node:test";
import assert from "node:assert/strict";
import { saveState, SAVE_EXPLORE_REASON } from "./save.ts";

const ok = { scan: null, reveal: null };

test("Explore is never enabled", () => {
  assert.deepEqual(saveState("EXPLORE", ok), { target: null, reason: SAVE_EXPLORE_REASON });
  assert.deepEqual(saveState("EXPLORE", { scan: "a", reveal: "b" }), { target: null, reason: SAVE_EXPLORE_REASON });
  assert.deepEqual(saveState("EXPLORE", { scan: "a", reveal: null }), { target: null, reason: SAVE_EXPLORE_REASON });
});

test("Explore shows a shared failure", () => {
  const s = "Enter a link or text first.";
  assert.deepEqual(saveState("EXPLORE", { scan: s, reveal: s }), { target: null, reason: s });
});

test("Scan and Reveal follow their own blocked reason", () => {
  assert.deepEqual(saveState("SCAN", ok), { target: "scan", reason: null });
  assert.deepEqual(saveState("REVEAL", ok), { target: "reveal", reason: null });
  assert.deepEqual(saveState("SCAN", { scan: "x", reveal: null }), { target: "scan", reason: "x" });
  assert.deepEqual(saveState("REVEAL", { scan: null, reveal: "y" }), { target: "reveal", reason: "y" });
});

test("shared failure in Scan/Reveal", () => {
  const s = "Enter a link or text first.";
  assert.equal(saveState("SCAN", { scan: s, reveal: s }).reason, s);
  assert.equal(saveState("REVEAL", { scan: s, reveal: s }).reason, s);
});
