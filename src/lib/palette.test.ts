import { test } from "node:test";
import assert from "node:assert/strict";
import { INK, PAD, PALETTES, LEAF_SWATCHES, leafShade } from "./palette.ts";
import { relativeLuminance, contrastRatio, MIN_SCAN_CONTRAST } from "./verify.ts";
import { skyRamp, SKY_STEPS } from "./sky.ts";
import type { Season } from "./seasons.ts";

const seasons = Object.keys(PALETTES) as Season[];
const lum = (hex: string) => relativeLuminance(parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16));

test("INK on PAD has generous contrast", () => {
  assert.ok(contrastRatio(lum(INK), lum(PAD)) >= 3 * MIN_SCAN_CONTRAST);
});

test("INK differs from every grass colour", () => {
  for (const s of seasons) for (const g of PALETTES[s].grass) assert.notEqual(g, INK);
});

test("leaf swatches are 8 unique", () => {
  assert.equal(LEAF_SWATCHES.length, 8);
  assert.equal(new Set(LEAF_SWATCHES.map((w) => w.name)).size, 8);
  assert.equal(new Set(LEAF_SWATCHES.map((w) => w.hex)).size, 8);
});

test("sky ramps strictly brighten", () => {
  for (const s of seasons) {
    const ramp = skyRamp(PALETTES[s].sky);
    assert.equal(ramp.length, SKY_STEPS);
    const l = ramp.map(([r, g, b]) => relativeLuminance(r, g, b));
    for (let i = 1; i < l.length; i++) assert.ok(l[i] > l[i - 1], `${s} step ${i}`);
  }
});

test("leafShade returns hex, lighter when sunlit or high shade", () => {
  const base = "#4fae5e";
  assert.match(leafShade(base, 0.5, false), /^#[0-9a-f]{6}$/);
  assert.ok(lum(leafShade(base, 0.9, false)) > lum(leafShade(base, 0.1, false)));
  assert.ok(lum(leafShade(base, 0.5, true)) > lum(leafShade(base, 0.5, false)));
});
