import test from "node:test";
import assert from "node:assert/strict";
import { SEASONS } from "./seasons.ts";

test("the four seasons run in cycle order", () => {
  assert.deepEqual([...SEASONS], ["SUMMER", "AUTUMN", "WINTER", "SPRING"]);
});
