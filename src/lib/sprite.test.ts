import assert from "node:assert/strict";
import test from "node:test";
import { SHAPES, SPRITE_SPECS } from "./shapes.ts";
import { defineSprite, validateSprite, type SpriteSpec } from "./sprite.ts";

const rows = [
  "L.......",
  "........",
  "........",
  "........",
  "........",
  "........",
  "........",
  "T......T",
];
const spec: SpriteSpec = { id: "fx", label: "Fixture", rows, legend: { L: "canopy", T: "trunk" } };

test("mask maps corners and edges", () => {
  const s = defineSprite(spec);
  assert.equal(s.mask(0, 1), "canopy");
  assert.equal(s.mask(0, 0), "trunk");
  assert.equal(s.mask(1, 0), "trunk");
  assert.equal(s.mask(1, 1), null);
  assert.equal(s.mask(0.5, 0.5), null);
});

test("outside the unit square is empty", () => {
  const s = defineSprite(spec);
  assert.equal(s.mask(-0.01, 0.5), null);
  assert.equal(s.mask(0.5, 1.01), null);
  assert.equal(s.mask(NaN, 0.5), null);
  assert.equal(s.mask(Infinity, 0.5), null);
  assert.equal(s.mask(0.5, -Infinity), null);
});

test("validateSprite throws", () => {
  const bad = (patch: Partial<SpriteSpec>, msg: string) =>
    assert.throws(() => validateSprite({ ...spec, ...patch }), new RegExp(msg));
  bad({ rows: [...rows.slice(0, 7), "T......"] }, "ragged");
  bad({ rows: [...rows.slice(0, 7), "T.....X."] }, "missing from legend");
  bad({ legend: { L: "canopy", T: "leaf" as never } }, "invalid region");
  bad({ rows: [...rows.slice(0, 7), "........"] }, "cannot ground");
  bad({ rows: rows.slice(1) }, "at least 8 rows");
  bad({ rows: rows.map((r) => r.slice(0, 7)) }, "at least 8 columns");
  bad({ legend: { L: "canopy", T: "trunk", TT: "trunk" } }, "exactly one character");
  bad({ legend: { L: "canopy", T: "trunk", ".": "body" } }, "reserved");
  bad({ id: "" }, "non-empty id");
});

test("every registry sprite validates, is at least 8x8, and is registered", () => {
  for (const sp of SPRITE_SPECS) {
    validateSprite(sp);
    assert.ok(sp.rows.length >= 8 && sp.rows[0].length >= 8, sp.id);
  }
  assert.deepEqual(Object.keys(SHAPES), SPRITE_SPECS.map((sp) => sp.id));
});
