import { test } from "node:test";
import assert from "node:assert/strict";
import { THEMES } from "./themes.ts";
import { contrastRatio, relativeLuminance } from "./verify.ts";

test("no preset carries a deleted v1 field", () => {
  for (const t of Object.values(THEMES) as Record<string, unknown>[]) {
    for (const dead of ["geometryType", "heightVariance", "colorDark", "ambientIntensity", "keyIntensity"]) {
      assert.ok(!(dead in t), `${dead} still present`);
    }
  }
});

test("every preset colours all three regions plus scan, light and background", () => {
  const hex = /^#[0-9a-fA-F]{6}$/;
  for (const t of Object.values(THEMES)) {
    for (const r of ["trunk", "canopy", "body"] as const) assert.match(t.regionColors[r], hex);
    for (const k of ["colorScan", "colorLight", "background"] as const) assert.match(t[k], hex);
  }
});

test("the default Minecraft preset keeps its scan pair well above 10:1", () => {
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    return relativeLuminance(n >> 16, (n >> 8) & 255, n & 255);
  };
  const { colorScan, colorLight } = THEMES.MINECRAFT;
  assert.ok(contrastRatio(lum(colorScan), lum(colorLight)) > 10);
});
