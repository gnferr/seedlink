import assert from "node:assert/strict";
import test from "node:test";
import { DECO, MAX_DECOR, PAD_CLEAR, cloudOffset, meadowLayout, type DecoKind } from "./meadow.ts";

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
    const all = [...m.tufts, ...m.flowers, ...m.bushes, ...m.leaves];
    assert.equal(m.tufts.length, 220);
    assert.equal(m.flowers.length, 90);
    assert.equal(m.bushes.length, 4);
    assert.equal(m.leaves.length, 60);
    assert.equal(m.clouds.length, 6);
    assert.ok(all.length <= MAX_DECOR);
    for (const d of all) {
      assert.ok(Math.abs(d.x) > clear || Math.abs(d.z) > clear, "inside clear zone");
      const { along, across } = slabFrame(d);
      assert.ok(along >= -m.slabFar && along <= m.slabNear && Math.abs(across) <= m.slabSize / 2, "off the slab");
      assert.ok(d.tint >= 0 && d.tint < 1);
    }
    const kinds: [DecoKind, typeof all][] = [["tuft", m.tufts], ["flower", m.flowers], ["bush", m.bushes], ["leaf", m.leaves]];
    for (const [k, list] of kinds)
      for (const d of list) {
        // The scaled footprint square (axis-aligned; instances turn by quarter turns) clears the pad zone...
        const f = DECO[k].half * d.scale;
        assert.ok(d.scale >= DECO[k].lo && d.scale <= DECO[k].hi, `${k} scale`);
        assert.ok(Math.abs(d.x) - f > clear || Math.abs(d.z) - f > clear, `${k} footprint on the pad clear zone`);
        // ...and stays on the slab: turned 45° to the slab, it reaches f·√2 along each slab axis.
        const { along, across } = slabFrame(d);
        const r = f * Math.SQRT2;
        assert.ok(along - r >= -m.slabFar && along + r <= m.slabNear && Math.abs(across) + r <= m.slabSize / 2, `${k} overhangs the slab`);
        if (k === "bush") {
          assert.ok(along + m.slabFar >= 2 && m.slabNear - along >= 2 && m.slabSize / 2 - Math.abs(across) >= 2, "bush edge margin");
        }
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
    assert.ok(m.clouds.every((c) => slabFrame(c).along < 0 && c.y > 0 && c.speed > 0), "clouds behind the tree");
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

test("cloudOffset holds prev exactly when not driven or given bad input", () => {
  const prev = 1.2345678901234;
  for (const [dt, speed, drive, wrapAt] of [
    [0.016, 0.5, 0, 50],
    [0.016, 0.5, -1, 50],
    [NaN, 0.5, 1, 50],
    [Infinity, 0.5, 1, 50],
    [-0.016, 0.5, 1, 50],
    [0.016, NaN, 1, 50],
    [0.016, Infinity, 1, 50],
    [0.016, 0.5, NaN, 50],
    [0.016, 0.5, Infinity, 50],
    [0.016, 0.5, 1, NaN],
    [0.016, 0.5, 1, 0],
  ])
    assert.equal(cloudOffset(prev, dt, speed, drive, wrapAt), prev);
  assert.ok(Number.isNaN(cloudOffset(NaN, 0.016, 0.5, 1, 50)));
});

test("cloudOffset advances in proportion to dt, speed and drive", () => {
  const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
  near(cloudOffset(2, 0.1, 0.5, 1, 50), 2.05);
  near(cloudOffset(2, 0.1, 0.5, 0.5, 50), 2.025);
  near(cloudOffset(2, 0.2, 1, 1, 50), 2.2);
});

test("cloudOffset wraps into [-wrapAt, wrapAt] both ways", () => {
  const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
  near(cloudOffset(9.9, 1, 0.3, 1, 10), -9.8);
  near(cloudOffset(-9.9, 1, -0.3, 1, 10), 9.8);
});
