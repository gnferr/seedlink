import { test } from "node:test";
import assert from "node:assert/strict";
import { renderSky, SKY_WIDTH, SKY_HEIGHT } from "./sky.ts";

test("renderSky is opaque, sized, and deterministic", () => {
  const a = renderSky("SUMMER");
  assert.equal(a.length, SKY_WIDTH * SKY_HEIGHT * 4);
  for (let i = 3; i < a.length; i += 4) assert.equal(a[i], 255);
  assert.deepEqual(a, renderSky("SUMMER"));
});

test("sky is lighter at the bottom than the top", () => {
  const a = renderSky("SUMMER");
  const row = (y: number) => {
    let s = 0;
    for (let x = 0; x < SKY_WIDTH; x++) { const o = (y * SKY_WIDTH + x) * 4; s += a[o] + a[o + 1] + a[o + 2]; }
    return s;
  };
  assert.ok(row(SKY_HEIGHT - 1) > row(0));
});
