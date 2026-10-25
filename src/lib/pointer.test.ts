import assert from "node:assert/strict";
import test from "node:test";
import { isTap, nextFoldTarget, TAP_SLOP_PX } from "./pointer.ts";
import type { FoldPhase } from "./status.ts";

test("isTap: within the slop is a tap, past it is a drag", () => {
  assert.equal(TAP_SLOP_PX, 6);
  assert.equal(isTap({ x: 10, y: 10 }, { x: 10, y: 10 }), true);
  assert.equal(isTap({ x: 0, y: 0 }, { x: 6, y: 0 }), true);
  assert.equal(isTap({ x: 0, y: 0 }, { x: 0, y: -6 }), true);
  assert.equal(isTap({ x: 0, y: 0 }, { x: 6.1, y: 0 }), false);
});

test("nextFoldTarget: every phase x hit", () => {
  type Hit = "tree" | "ground" | "none";
  type Action = "fold" | "grow" | "poke" | null;
  const table: Record<FoldPhase, Record<Hit, Action>> = {
    tree: { tree: "fold", ground: "poke", none: null },
    folded: { tree: "grow", ground: "grow", none: "grow" },
    folding: { tree: null, ground: null, none: null },
    growing: { tree: null, ground: null, none: null },
  };
  for (const [phase, row] of Object.entries(table) as [FoldPhase, Record<Hit, Action>][])
    for (const [hit, want] of Object.entries(row) as [Hit, Action][])
      assert.equal(nextFoldTarget(phase, hit), want, `${phase} + ${hit}`);
});
