import { test } from "node:test";
import assert from "node:assert/strict";
import { renderSky, SKY_WIDTH, SKY_HEIGHT } from "./sky.ts";
import { PALETTES } from "./palette.ts";

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

test("every season renders full-size and opaque", () => {
  for (const s of ["SPRING", "SUMMER", "AUTUMN", "WINTER"] as const) {
    const a = renderSky(s);
    assert.equal(a.length, SKY_WIDTH * SKY_HEIGHT * 4);
    for (let i = 3; i < a.length; i += 4) assert.equal(a[i], 255);
  }
});

test("aurora tints the top band in summer and winter", () => {
  for (const s of ["SUMMER", "WINTER"] as const) {
    const a = renderSky(s), b = renderSky(s, { ...PALETTES[s].sky, aurora: null });
    let diff = 0;
    for (let i = 8 * SKY_WIDTH * 4; i < 41 * SKY_WIDTH * 4; i++) if (a[i] !== b[i]) diff++;
    assert.ok(diff > 0, s);
  }
});
