import test from "node:test";
import assert from "node:assert/strict";
import { SEASONS, mixHex } from "./seasons.ts";
import {
  SKY_THEME_WEIGHT,
  cloudColour,
  groundPalette,
  seasonGround,
  seasonSky,
  skyGradient,
} from "./world.ts";

const HEX = /^#[0-9a-f]{6}$/;
const ch = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

test("groundPalette equals the season palette at integer phases", () => {
  SEASONS.forEach((s, i) => assert.deepEqual(groundPalette(i), seasonGround(s)));
});

test("groundPalette at 0.5 lies between the two seasons", () => {
  const mid = groundPalette(0.5);
  const a = seasonGround("SUMMER");
  const b = seasonGround("AUTUMN");
  for (const k of ["grass", "dirt", "blossom"] as const) {
    const [m, x, y] = [mid[k], a[k], b[k]].map(ch);
    m.forEach((v, i) => assert.ok(v >= Math.min(x[i], y[i]) && v <= Math.max(x[i], y[i])));
  }
});

test("phase wraps and non-finite phases act as 0", () => {
  assert.deepEqual(groundPalette(4), groundPalette(0));
  assert.deepEqual(groundPalette(-1), groundPalette(3));
  for (const p of [NaN, Infinity, -Infinity]) {
    assert.deepEqual(groundPalette(p), groundPalette(0));
    assert.equal(cloudColour(p), cloudColour(0));
    assert.deepEqual(skyGradient("#d5e6ef", p), skyGradient("#d5e6ef", 0));
  }
});

test("cloud colours per season", () => {
  assert.deepEqual([0, 1, 2, 3].map(cloudColour), ["#ffffff", "#f6e8d4", "#dfe8f0", "#ffffff"]);
});

test("skyGradient mixes the theme background in (within 1 per channel of mixHex)", () => {
  const g = skyGradient("#d5e6ef", 0);
  for (const [got, end] of [[g.top, "#8fd0f5"], [g.bottom, "#d6efff"]]) {
    const want = ch(mixHex("#d5e6ef", end, SKY_THEME_WEIGHT));
    ch(got).forEach((v, i) => assert.ok(Math.abs(v - want[i]) <= 1));
  }
});

test("a #rgb or invalid background leaves the season colour unmixed", () => {
  for (const bg of ["#fff", "nope", ""]) assert.deepEqual(skyGradient(bg, 2), seasonSky("WINTER"));
});

test("every returned colour is #rrggbb", () => {
  for (const p of [0, 0.3, 1.5, 2.9, -0.7, NaN]) {
    const out = [...Object.values(groundPalette(p)), ...Object.values(skyGradient("#d5e6ef", p)), cloudColour(p)];
    for (const c of out) assert.match(c, HEX);
  }
});
