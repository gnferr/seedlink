import assert from "node:assert/strict";
import { test } from "node:test";
import { CARD_BUDGET, fitTree, growTree, pickSpecies, SEGMENT_BUDGET, SPECIES, type Species } from "./tree.ts";

test("six species", () => {
  assert.deepEqual([...SPECIES].sort(), ["acacia", "birch", "cherry", "lushOak", "oak", "willow"]);
});

for (const s of SPECIES) {
  test(`${s}: deterministic per seed, different across seeds`, () => {
    assert.deepEqual(growTree(s, 42, 25), growTree(s, 42, 25));
    assert.notDeepEqual(growTree(s, 42, 25), growTree(s, 43, 25));
    assert.equal(growTree(s, 42, 25).species, s);
  });

  test(`${s}: budget at size 37, growth capped`, () => {
    const big = growTree(s, 1, 37), huge = growTree(s, 1, 101);
    assert.ok(big.cards.length <= CARD_BUDGET, `${big.cards.length} cards`);
    assert.ok(big.segments.length <= SEGMENT_BUDGET, `${big.segments.length} segments`);
    assert.equal(huge.cards.length, big.cards.length);
    assert.equal(huge.segments.length, big.segments.length);
  });

  test(`${s}: trunk stands on the slab`, () => {
    const t = growTree(s, 42, 25);
    const low = t.segments.reduce((a, b) => (b.y0 < a.y0 ? b : a));
    assert.equal(low.y0, 0);
    assert.ok(Math.abs(low.x0) <= 1.5 && Math.abs(low.z0) <= 1.5, `${low.x0},${low.z0}`);
    assert.ok(t.segments.every((g) => g.y0 >= 0 && g.y1 >= 0));
  });
}

for (const size of [21, 25, 37]) {
  for (const seed of [1, 7, 42]) {
    test(`crowns overhang a ${size}-module code, birch is tallest (seed ${seed})`, () => {
      const need = (size - 1) / 2;
      const trees = Object.fromEntries(SPECIES.map((s) => [s, growTree(s, seed, size)])) as Record<Species, ReturnType<typeof growTree>>;
      for (const s of SPECIES) {
        const min = s === "birch" ? 0.6 * need : need;
        assert.ok(trees[s].crownRadius >= min, `${s} crownRadius ${trees[s].crownRadius} < ${min}`);
        if (s !== "birch") assert.ok(trees.birch.top > trees[s].top, `birch top ${trees.birch.top} <= ${s} top ${trees[s].top}`);
      }
    });
  }
}

test("crownRadius ignores specks; top is the max y", () => {
  const t = growTree("cherry", 42, 25);
  assert.ok(t.cards.some((c) => c.speck));
  const leaves = t.cards.filter((c) => !c.speck);
  assert.equal(t.crownRadius, Math.max(...leaves.map((c) => Math.hypot(c.x, c.z))));
  assert.equal(t.top, Math.max(...t.cards.map((c) => c.y), ...t.segments.flatMap((g) => [g.y0, g.y1])));
  assert.ok(t.cards.every((c) => c.shade >= 0 && c.shade < 1));
});

test("pickSpecies never repeats and is even", () => {
  const counts = new Map<Species, number>();
  for (let i = 0; i < 1000; i++) {
    const s = pickSpecies("oak", i / 1000);
    assert.notEqual(s, "oak");
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  for (const s of SPECIES) if (s !== "oak") assert.ok((counts.get(s) ?? 0) >= 150, `${s}: ${counts.get(s)}`);
  const all = new Set<Species>();
  for (let i = 0; i < 1000; i++) all.add(pickSpecies(null, i / 1000));
  assert.equal(all.size, 6);
});

for (const s of SPECIES) {
  test(`${s}: fitTree sizes the crown to the island, purely`, () => {
    for (const seed of [1, 7, 42]) {
      const t = growTree(s, seed, 25), before = structuredClone(t), f = fitTree(t, 30);
      assert.ok(Math.abs(f.crownRadius - (s === "birch" ? 1.1 : 1.5) * 30) < 1e-6);
      assert.equal(f.cards.length, t.cards.length);
      assert.equal(f.segments.length, t.segments.length);
      assert.deepEqual(t, before);
      assert.equal(f.segments[0].y0, 0);
    }
  });
}
