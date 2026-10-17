import test from "node:test";
import assert from "node:assert/strict";
import {
  BURST_LIFE_SECONDS,
  BURST_MAX,
  PARTICLE_SETS,
  burstPose,
  particleBounds,
  particleBudget,
  particlePose,
  type Bounds,
} from "./particles.ts";
import { generateMatrix } from "./qr.ts";
import { SHAPES, DEFAULT_SHAPE_ID } from "./shapes.ts";
import { solve } from "./solver.ts";
import type { Season } from "./seasons.ts";

const seasons: Season[] = ["SPRING", "SUMMER", "AUTUMN", "WINTER"];
const bounds: Bounds = { minX: -10, maxX: 10, minY: 0, maxY: 12, minZ: -8, maxZ: 9 };

test("the four seasons map to the four kinds", () => {
  assert.equal(PARTICLE_SETS.SPRING.kind, "PETAL");
  assert.equal(PARTICLE_SETS.SUMMER.kind, "FIREFLY");
  assert.equal(PARTICLE_SETS.AUTUMN.kind, "LEAF");
  assert.equal(PARTICLE_SETS.WINTER.kind, "SNOW");
});

test("budgets are 300 on desktop and 120 on a phone", () => {
  assert.equal(particleBudget(false), 300);
  assert.equal(particleBudget(true), 120);
});

test("poses are deterministic and finite", () => {
  for (const s of seasons)
    for (let i = 0; i < 300; i++)
      for (let t = 0; t <= 120; t += 7.3) {
        const a = particlePose(i, t, PARTICLE_SETS[s], bounds);
        assert.deepEqual(a, particlePose(i, t, PARTICLE_SETS[s], bounds));
        for (const v of Object.values(a)) assert.ok(Number.isFinite(v));
      }
});

test("poses stay inside the bounds plus a half-unit margin", () => {
  const m = 0.5;
  for (const s of seasons)
    for (let i = 0; i < 300; i++)
      for (let t = 0; t <= 120; t += 0.9) {
        const p = particlePose(i, t, PARTICLE_SETS[s], bounds);
        assert.ok(p.x >= bounds.minX - m && p.x <= bounds.maxX + m, `${s} x ${p.x}`);
        assert.ok(p.y >= bounds.minY - m && p.y <= bounds.maxY + m, `${s} y ${p.y}`);
        assert.ok(p.z >= bounds.minZ - m && p.z <= bounds.maxZ + m, `${s} z ${p.z}`);
      }
});

test("scale stays in [0, 1]", () => {
  for (const s of seasons)
    for (let i = 0; i < 300; i += 7)
      for (let t = 0; t <= 60; t += 0.37) {
        const { scale } = particlePose(i, t, PARTICLE_SETS[s], bounds);
        assert.ok(scale >= 0 && scale <= 1, `${s} ${scale}`);
      }
});

test("fireflies pulse at no more than 1 Hz", () => {
  assert.ok(PARTICLE_SETS.SUMMER.pulseHz <= 1);
  for (let i = 0; i < 20; i++) {
    let prev = -1, rising = false, maxima = 0;
    for (let n = 0; n <= 500; n++) {
      const sc = particlePose(i, n / 100, PARTICLE_SETS.SUMMER, bounds).scale;
      if (sc > prev) rising = true;
      else if (sc < prev && rising) { maxima++; rising = false; }
      prev = sc;
    }
    assert.ok(maxima <= 6, `firefly ${i}: ${maxima} maxima`);
  }
});

test("particleBounds on an empty list is finite", () => {
  for (const v of Object.values(particleBounds([], 0.18))) assert.ok(Number.isFinite(v));
});

test("particleBounds contains every block of the real solver output", () => {
  const m = generateMatrix("https://example.com");
  const offset = (m.size - 1) / 2;
  const blocks = solve(m, SHAPES[DEFAULT_SHAPE_ID], 30).map((b) => ({
    x: b.x - offset,
    y: b.y,
    z: b.z - offset,
  }));
  assert.ok(blocks.length > 0);
  const b = particleBounds(blocks, 0.18);
  for (const p of blocks) {
    assert.ok(p.x >= b.minX && p.x <= b.maxX);
    assert.ok(p.y >= b.minY && p.y <= b.maxY);
    assert.ok(p.z >= b.minZ && p.z <= b.maxZ);
  }
});

test("a burst particle's scale reaches exactly 0 at BURST_LIFE_SECONDS", () => {
  const o = { x: 1, y: 2, z: 3 };
  for (let k = 0; k < BURST_MAX; k++) {
    for (const s of seasons) {
      const set = PARTICLE_SETS[s];
      assert.equal(burstPose(k, BURST_LIFE_SECONDS, o, set).scale, 0);
      for (const age of [0, 0.3, BURST_LIFE_SECONDS]) {
        for (const v of Object.values(burstPose(k, age, o, set))) assert.ok(Number.isFinite(v));
      }
    }
  }
});
