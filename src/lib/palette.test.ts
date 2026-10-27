import { test } from "node:test";
import assert from "node:assert/strict";
import { INK, PAD, PALETTES, LEAF_SWATCHES, leafShade, treeColours } from "./palette.ts";
import { relativeLuminance, contrastRatio, MIN_SCAN_CONTRAST } from "./verify.ts";
import type { Season } from "./seasons.ts";
import type { Species } from "./tree.ts";

const seasons = Object.keys(PALETTES) as Season[];
const lum = (hex: string) => relativeLuminance(parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16));

test("INK on PAD has generous contrast", () => {
  assert.ok(contrastRatio(lum(INK), lum(PAD)) >= 3 * MIN_SCAN_CONTRAST);
});

test("hedge on moss hides the code: visible but far below scan contrast", () => {
  for (const s of seasons) {
    const c = contrastRatio(lum(PALETTES[s].hedge), lum(PALETTES[s].moss));
    assert.ok(c > 1.5 && c < contrastRatio(lum(INK), lum(PAD)) / 2, `${s} ${c}`);
  }
});

test("INK differs from every grass colour", () => {
  for (const s of seasons) for (const g of PALETTES[s].grass) assert.notEqual(g, INK);
});

test("leaf swatches are 8 unique", () => {
  assert.equal(LEAF_SWATCHES.length, 8);
  assert.equal(new Set(LEAF_SWATCHES.map((w) => w.name)).size, 8);
  assert.equal(new Set(LEAF_SWATCHES.map((w) => w.hex)).size, 8);
});

test("leafShade returns hex, lighter when sunlit or high shade", () => {
  const base = "#4fae5e";
  assert.match(leafShade(base, 0.5, false), /^#[0-9a-f]{6}$/);
  assert.ok(lum(leafShade(base, 0.9, false)) > lum(leafShade(base, 0.1, false)));
  assert.ok(lum(leafShade(base, 0.5, true)) > lum(leafShade(base, 0.5, false)));
});

const SPECIES_LIST: Species[] = ["oak", "lushOak", "willow", "acacia", "birch", "cherry"];
const HEX = /^#[0-9a-f]{6}$/;

test("treeColours: every season and species gives at least 4 hex leaf colours", () => {
  for (const s of seasons) for (const sp of SPECIES_LIST) {
    const c = treeColours(s, sp, null);
    assert.ok(c.leaves.length >= 4, `${s} ${sp}`);
    for (const l of c.leaves) assert.match(l, HEX);
    assert.match(c.bark, HEX);
    assert.match(c.twig, HEX);
  }
});

test("treeColours: winter drops leaves and caps with snow", () => {
  for (const sp of SPECIES_LIST) {
    const c = treeColours("WINTER", sp, null);
    assert.ok(c.leafKeep < 0.15, sp);
    assert.equal(c.snowCap, "#f4f8ff");
  }
});

test("treeColours: only winter has a snow cap and low leafKeep", () => {
  for (const s of seasons.filter((x) => x !== "WINTER")) assert.equal(treeColours(s, "oak", null).snowCap, null);
});

test("treeColours: spring has white specks and the cherry pink leaves", () => {
  for (const sp of SPECIES_LIST) {
    const c = treeColours("SPRING", sp, null);
    assert.equal(c.speck, "#ffffff");
    assert.deepEqual(c.leaves, ["#b04a76", "#d86a96", "#f08cb2", "#ffb0cc", "#ffd6e6"]);
    assert.equal(c.leafKeep, 1);
  }
});

test("treeColours: autumn uses the autumn ramp and leafKeep 0.6", () => {
  const c = treeColours("AUTUMN", "oak", null);
  assert.deepEqual(c.leaves, ["#7a2c18", "#a8401e", "#d2622a", "#ec8a36", "#f7b04a", "#ffd37a"]);
  assert.equal(c.leafKeep, 0.6);
});

test("treeColours: birch has pale bark and dark marks", () => {
  const c = treeColours("SUMMER", "birch", null);
  assert.equal(c.bark, "#e8e4dc");
  assert.equal(c.barkMarks, "#2a2420");
});

test("treeColours: lush oak has a yellow speck in summer only", () => {
  assert.equal(treeColours("SUMMER", "lushOak", null).speck, "#ecf27a");
  assert.equal(treeColours("SUMMER", "oak", null).speck, null);
});

test("treeColours: a leaf override changes leaves in summer but not in winter", () => {
  const summer = treeColours("SUMMER", "oak", null).leaves;
  const overridden = treeColours("SUMMER", "oak", "#7aa7ff").leaves;
  assert.equal(overridden.length, 5);
  assert.notDeepEqual(overridden, summer);
  assert.deepEqual(treeColours("WINTER", "oak", "#7aa7ff").leaves, treeColours("WINTER", "oak", null).leaves);
});
