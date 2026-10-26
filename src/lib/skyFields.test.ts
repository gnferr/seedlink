import test from "node:test";
import assert from "node:assert/strict";
import { buildSkyFields } from "./skyFields.ts";

const W = 96, H = 64;
const f = buildSkyFields(W, H, 51);
const fields = [f.density, f.shade, f.milky];

test("buildSkyFields: every field is width * height", () => {
  assert.equal(f.width, W);
  assert.equal(f.height, H);
  for (const a of fields) assert.equal(a.length, W * H);
});

test("buildSkyFields: every value is in [0, 1]", () => {
  for (const a of fields) for (const x of a) assert.ok(x >= 0 && x <= 1, String(x));
});

test("buildSkyFields: same arguments give identical fields", () => {
  const g = buildSkyFields(W, H, 51);
  assert.deepEqual([g.density, g.shade, g.milky], fields);
});

test("buildSkyFields: density is 0 outside the cloud band", () => {
  for (let y = 0; y < H; y++) {
    const v = y / H;
    if (v >= 0.14 && v <= 0.66) continue;
    for (let x = 0; x < W; x++) assert.equal(f.density[y * W + x], 0, `row ${y}`);
  }
});

test("buildSkyFields: has some cloud and some milky way", () => {
  assert.ok(f.density.some((x) => x > 0));
  assert.ok(f.milky.some((x) => x > 0));
});
