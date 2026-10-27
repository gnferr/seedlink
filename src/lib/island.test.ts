import assert from "node:assert/strict";
import { test } from "node:test";
import { growIsland, ISLAND_VOXEL_BUDGET } from "./island.ts";
import { QUIET_ZONE, REF_SIZE } from "./qr.ts";

const seeds = Array.from({ length: 20 }, (_, i) => i);

test("same seed gives the same island", () => {
  assert.deepEqual(growIsland(7), growIsland(7));
});

test("different seeds give different islands", () => {
  const a = growIsland(1);
  const b = growIsland(2);
  assert.notDeepEqual(a.voxels, b.voxels);
});

test("slabHalf follows REF_SIZE and the quiet zone", () => {
  assert.equal(growIsland(3).slabHalf, (REF_SIZE - 1) / 2 + QUIET_ZONE);
});

test("slab is fully covered by pad and the rest of the top layer is grass", () => {
  {
    const size = REF_SIZE;
    for (const seed of seeds) {
      const { slabHalf, voxels } = growIsland(seed);
      const top = new Map<string, string>();
      for (const v of voxels) if (v.depth === 0) top.set(`${v.x},${v.z}`, v.kind);
      for (let x = -slabHalf; x <= slabHalf; x++)
        for (let z = -slabHalf; z <= slabHalf; z++)
          assert.equal(top.get(`${x},${z}`), "pad", `size ${size} seed ${seed} cell ${x},${z}`);
      for (const v of voxels)
        if (v.depth === 0 && (Math.abs(v.x) > slabHalf || Math.abs(v.z) > slabHalf))
          assert.equal(v.kind, "grass");
    }
  }
});

test("voxel budget holds", () => {
  for (const seed of seeds) assert.ok(growIsland(seed).voxels.length <= ISLAND_VOXEL_BUDGET);
});

test("deco and waterfall stay off the slab", () => {
  {
    for (const seed of seeds) {
      const { slabHalf, deco, waterfall } = growIsland(seed);
      for (const d of deco) assert.ok(Math.abs(d.x) > slabHalf || Math.abs(d.z) > slabHalf);
      assert.ok(Math.abs(waterfall.x) > slabHalf || Math.abs(waterfall.z) > slabHalf);
    }
  }
});

test("slab corners keep a grass ring and an underside rim beyond them", () => {
  {
    const size = REF_SIZE;
    for (const seed of seeds) {
      const { slabHalf: s, voxels } = growIsland(seed);
      const at = new Set(voxels.map((v) => `${v.x},${v.z},${v.depth}`));
      for (let x = -s - 1; x <= s + 1; x++)
        for (let z = -s - 1; z <= s + 1; z++)
          assert.ok(at.has(`${x},${z},0`), `size ${size} seed ${seed} cell ${x},${z}`);
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          const ok = voxels.some(
            (v) => v.depth === 1 && v.x * sx >= s && v.z * sz >= s && (v.x * sx >= s + 1 || v.z * sz >= s + 1),
          );
          assert.ok(ok, `size ${size} seed ${seed} quadrant ${sx},${sz}`);
        }
    }
  }
});
