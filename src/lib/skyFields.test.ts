import test from "node:test";
import assert from "node:assert/strict";
import { buildCloudTile, buildSkyFields, CLOUD_TILE } from "./skyFields.ts";

const W = 96, H = 64;
const f = buildSkyFields(W, H, 51);

test("buildSkyFields: the Milky Way is width * height, in [0, 1], and not empty", () => {
  assert.equal(f.width, W);
  assert.equal(f.height, H);
  assert.equal(f.milky.length, W * H);
  for (const x of f.milky) assert.ok(x >= 0 && x <= 1, String(x));
  assert.ok(f.milky.some((x) => x > 0));
});

test("buildSkyFields: same arguments give identical fields", () => {
  assert.deepEqual(buildSkyFields(W, H, 51).milky, f.milky);
});

const tile = buildCloudTile(7), { width: TW, layer: L } = CLOUD_TILE;
const cover = (x: number, y: number) => tile[(y * TW + x) * 4];

test("buildCloudTile: two layers of RGBA, the same for the same seed", () => {
  assert.equal(tile.length, TW * L * 2 * 4);
  assert.deepEqual(buildCloudTile(7), tile);
});

test("buildCloudTile: edges are soft, and light never exceeds cover", () => {
  let soft = 0;
  for (let i = 0; i < tile.length; i += 4) {
    if (tile[i] > 0 && tile[i] < 255) soft++;
    assert.ok(tile[i + 1] <= tile[i], `light ${tile[i + 1]} over cover ${tile[i]}`);
  }
  assert.ok(soft > 1000, String(soft));
});

test("buildCloudTile: the near layer ends in a solid bank, lit on top and shaded below; the far layer is sparse", () => {
  for (let x = 0; x < TW; x++) assert.equal(cover(x, 2 * L - 2), 255, `bank column ${x}`);
  let lit = 0, shaded = 0;
  for (let i = L * TW * 4; i < tile.length; i += 4) {
    if (tile[i] !== 255) continue;
    if (tile[i + 1] > 200) lit++;
    else if (tile[i + 1] < 60) shaded++;
  }
  assert.ok(lit > 0 && shaded > 0, `${lit} ${shaded}`);
  let far = 0;
  for (let y = 0; y < L; y++) for (let x = 0; x < TW; x++) far += cover(x, y) ? 1 : 0;
  assert.ok(far > 0 && far < TW * L * 0.5, String(far));
});

test("buildCloudTile: no cloud touches a layer's top row, so none is cut flat", () => {
  for (const top of [0, L]) for (let x = 0; x < TW; x++) assert.equal(cover(x, top), 0, `layer row ${top} column ${x}`);
});
