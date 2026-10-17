import assert from "node:assert/strict";
import { test } from "node:test";
import { nextRadioIndex } from "./radioNav.ts";

test("arrows wrap, Home/End jump, other keys are ignored", () => {
  assert.equal(nextRadioIndex(3, "ArrowRight", 4), 0);
  assert.equal(nextRadioIndex(0, "ArrowLeft", 4), 3);
  assert.equal(nextRadioIndex(1, "ArrowDown", 4), 2);
  assert.equal(nextRadioIndex(2, "ArrowUp", 4), 1);
  assert.equal(nextRadioIndex(2, "Home", 4), 0);
  assert.equal(nextRadioIndex(1, "End", 4), 3);
  assert.equal(nextRadioIndex(1, "Tab", 4), null);
});
