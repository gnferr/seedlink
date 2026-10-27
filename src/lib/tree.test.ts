import assert from "node:assert/strict";
import { test } from "node:test";
import { CARD_BUDGET, fitTree, growTree, MAX_TOP_TO_ISLAND, pickSpecies, SEGMENT_BUDGET, SPECIES, type Species } from "./tree.ts";

test("six species", () => {
  assert.deepEqual([...SPECIES].sort(), ["acacia", "birch", "cherry", "lushOak", "oak", "willow"]);
});

for (const s of SPECIES) {
  test(`${s}: deterministic per seed, different across seeds`, () => {
    assert.deepEqual(growTree(s, 42), growTree(s, 42));
    assert.notDeepEqual(growTree(s, 42), growTree(s, 43));
    assert.equal(growTree(s, 42).species, s);
  });

  test(`${s}: within the card and segment budgets`, () => {
    const t = growTree(s, 1);
    assert.ok(t.cards.length <= CARD_BUDGET, `${t.cards.length} cards`);
    assert.ok(t.segments.length <= SEGMENT_BUDGET, `${t.segments.length} segments`);
  });

  test(`${s}: trunk stands on the slab`, () => {
    const t = growTree(s, 42);
    const low = t.segments.reduce((a, b) => (b.y0 < a.y0 ? b : a));
    assert.equal(low.y0, 0);
    assert.ok(Math.abs(low.x0) <= 1.5 && Math.abs(low.z0) <= 1.5, `${low.x0},${low.z0}`);
    assert.ok(t.segments.every((g) => g.y0 >= 0 && g.y1 >= 0));
  });
}

{
  const size = 25; // REF_SIZE: the world every tree grows for
  for (const seed of [1, 7, 42]) {
    test(`crowns overhang the code, birch is tallest (seed ${seed})`, () => {
      const need = (size - 1) / 2;
      const trees = Object.fromEntries(SPECIES.map((s) => [s, growTree(s, seed)])) as Record<Species, ReturnType<typeof growTree>>;
      for (const s of SPECIES) {
        const min = s === "birch" ? 0.6 * need : need;
        assert.ok(trees[s].crownRadius >= min, `${s} crownRadius ${trees[s].crownRadius} < ${min}`);
        if (s !== "birch") assert.ok(trees.birch.top > trees[s].top, `birch top ${trees.birch.top} <= ${s} top ${trees[s].top}`);
      }
    });
  }
}

test("crownRadius ignores specks; top is the max y", () => {
  const t = growTree("cherry", 42);
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
  test(`${s}: fitTree sizes the crown to the island, capped in height, purely`, () => {
    for (const seed of [1, 7, 42]) {
      const t = growTree(s, seed), before = structuredClone(t), f = fitTree(t, 30);
      const crown = (s === "birch" ? 1.35 : 1.5) * 30, cap = MAX_TOP_TO_ISLAND * 30;
      // The crown ratio holds unless that would make the tree taller than the cap; then the top sits on the cap and
      // the crown spreads sideways back toward its width, never past it.
      assert.ok(f.top <= cap + 1e-6);
      const shrunk = t.crownRadius * (cap / t.top);
      assert.ok(Math.abs(f.crownRadius - crown) < 1e-6 || (Math.abs(f.top - cap) < 1e-6 && f.crownRadius >= shrunk - 1e-6 && f.crownRadius <= crown + 1e-6));
      assert.equal(f.cards.length, t.cards.length);
      assert.equal(f.segments.length, t.segments.length);
      assert.deepEqual(t, before);
      assert.equal(f.segments[0].y0, 0);
    }
  });
}

test("a birch shortened by the height cap spreads wider than a plain shrink", () => {
  const cap = MAX_TOP_TO_ISLAND * 30;
  const capped = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => growTree("birch", seed)).find((t) => fitTree(t, 30).top >= cap - 1e-6);
  assert.ok(capped, "some birch reaches the cap");
  assert.ok(fitTree(capped, 30).crownRadius > capped.crownRadius * (cap / capped.top) * 1.05);
});

test("only birch, the tallest species, is ever shortened by the height cap", () => {
  for (const s of SPECIES) for (let seed = 1; seed <= 40; seed++) {
    const f = fitTree(growTree(s, seed), 30);
    if (s !== "birch") assert.ok(Math.abs(f.crownRadius - 45) < 1e-6, `${s} seed ${seed} crown ${f.crownRadius}`);
  }
});
