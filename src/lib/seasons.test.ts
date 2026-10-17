import test from "node:test";
import assert from "node:assert/strict";
import {
  SEASONS,
  mixHex,
  phaseColour,
  seasonColour,
  seasonTheme,
  shortestPhaseTarget,
  skyColour,
} from "./seasons.ts";
import { THEMES } from "./themes.ts";
import { relativeLuminance } from "./verify.ts";
import type { ShapeRegion } from "./shapes.ts";

const SUMMER_GREEN = "#4f9d3a";
const REGIONS: ShapeRegion[] = ["trunk", "canopy", "body"];

function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

test("SUMMER leaves every region and the sky unchanged", () => {
  for (const r of REGIONS) assert.equal(seasonColour(SUMMER_GREEN, r, "SUMMER"), SUMMER_GREEN);
  assert.equal(skyColour("#d5e6ef", 0), "#d5e6ef");
});

test("the body region is season-immune", () => {
  for (const s of SEASONS) assert.equal(seasonColour(SUMMER_GREEN, "body", s), SUMMER_GREEN);
});

test("autumn canopy is orange", () => {
  const [r, g, b] = channels(seasonColour(SUMMER_GREEN, "canopy", "AUTUMN"));
  assert.ok(r > g && g > b);
  assert.ok(r >= 0xb0 && r <= 0xd9);
});

test("winter canopy is near-white", () => {
  const [r, g, b] = channels(seasonColour(SUMMER_GREEN, "canopy", "WINTER"));
  assert.ok(relativeLuminance(r, g, b) > 0.8);
});

test("spring canopy is a fresher green than summer", () => {
  const [, g] = channels(seasonColour(SUMMER_GREEN, "canopy", "SPRING"));
  assert.ok(g > 0x9d);
});

test("phaseColour at integer phases equals seasonColour", () => {
  SEASONS.forEach((s, i) => {
    for (const r of REGIONS) assert.equal(phaseColour(SUMMER_GREEN, r, i), seasonColour(SUMMER_GREEN, r, s));
  });
  assert.equal(phaseColour(SUMMER_GREEN, "canopy", 4), phaseColour(SUMMER_GREEN, "canopy", 0));
  assert.equal(phaseColour(SUMMER_GREEN, "canopy", -1), seasonColour(SUMMER_GREEN, "canopy", "SPRING"));
});

test("phaseColour at 0.5 is the mix of its neighbours", () => {
  assert.equal(
    phaseColour(SUMMER_GREEN, "canopy", 0.5),
    mixHex(seasonColour(SUMMER_GREEN, "canopy", "SUMMER"), seasonColour(SUMMER_GREEN, "canopy", "AUTUMN"), 0.5),
  );
});

test("shortestPhaseTarget", () => {
  assert.equal(shortestPhaseTarget(0, "WINTER"), 2);
  assert.equal(shortestPhaseTarget(0, "SPRING"), -1);
  assert.equal(shortestPhaseTarget(3, "SUMMER"), 4);
  assert.equal(shortestPhaseTarget(1, "SPRING"), 3);
});

test("seasonTheme never touches the scan-relevant fields", () => {
  const t = THEMES.MINECRAFT;
  for (const s of SEASONS) {
    const o = seasonTheme(t, s);
    assert.equal(o.colorScan, t.colorScan);
    assert.equal(o.colorLight, t.colorLight);
    assert.equal(o.roughness, t.roughness);
    assert.equal(o.metalness, t.metalness);
    if (s === "SUMMER") assert.equal(o.background, t.background);
    else assert.notEqual(o.background, t.background);
  }
});

test("mixHex with an invalid colour returns the first argument", () => {
  assert.equal(mixHex("#4f9d3a", "nope", 0.5), "#4f9d3a");
  assert.equal(mixHex("bad", "#ffffff", 0.5), "bad");
});
