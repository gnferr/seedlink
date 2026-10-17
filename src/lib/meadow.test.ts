import assert from "node:assert/strict";
import test from "node:test";
import { MAX_DECOR, PAD_CLEAR, meadowLayout } from "./meadow.ts";

// Slab-frame coordinates (see MeadowLayout): along runs toward the Reveal camera, across side to side.
const slabFrame = (d: { x: number; z: number }) => ({ along: (d.x + d.z) / Math.SQRT2, across: (d.x - d.z) / Math.SQRT2 });

test("same seed deep-equals, different seed differs", () => {
  assert.deepEqual(meadowLayout(37), meadowLayout(37));
  assert.deepEqual(meadowLayout(37, 5), meadowLayout(37, 5));
  assert.notDeepEqual(meadowLayout(37, 1), meadowLayout(37, 2));
});

for (const plane of [25, 37, 169]) {
  test(`plane ${plane}: decoration outside pad, on the slab, counts, bushes, clouds`, () => {
    const m = meadowLayout(plane);
    const clear = plane / 2 + PAD_CLEAR;
    const all = [...m.tufts, ...m.flowers, ...m.bushes];
    assert.equal(m.tufts.length, 220);
    assert.equal(m.flowers.length, 90);
    assert.equal(m.bushes.length, 4);
    assert.equal(m.clouds.length, 6);
    assert.ok(all.length <= MAX_DECOR);
    for (const d of all) {
      assert.ok(Math.abs(d.x) > clear || Math.abs(d.z) > clear, "inside clear zone");
      const { along, across } = slabFrame(d);
      assert.ok(along >= -m.slabFar && along <= m.slabNear && Math.abs(across) <= m.slabSize / 2, "off the slab");
      assert.ok(d.tint >= 0 && d.tint < 1);
    }
    for (let i = 0; i < m.bushes.length; i++)
      for (let j = i + 1; j < m.bushes.length; j++)
        assert.ok(Math.hypot(m.bushes[i].x - m.bushes[j].x, m.bushes[i].z - m.bushes[j].z) >= 3);
    assert.equal(m.slabSize, 4.5 * plane);
    assert.equal(m.slabFar, plane);
    assert.equal(m.slabNear, 2.5 * plane);
    // The pad's far corner must stay on the slab, with room for the rim.
    assert.ok(m.slabFar > (plane / Math.SQRT2) + 1);
    assert.equal(m.pad.half, plane / 2);
    assert.ok(m.clouds.every((c) => c.z < 0 && c.speed > 0));
  });
}

test("bad plane returns an empty layout", () => {
  for (const p of [0, -5, NaN, Infinity]) {
    const m = meadowLayout(p);
    assert.equal(m.slabSize, 0);
    assert.equal(m.slabFar + m.slabNear, 0);
    assert.equal(m.tufts.length + m.flowers.length + m.bushes.length + m.clouds.length, 0);
  }
});
