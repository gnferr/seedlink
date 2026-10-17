import test from "node:test";
import assert from "node:assert/strict";
import {
  SHAKE_CAP,
  SWAY_CAP,
  calmFor,
  createEnvironment,
  isEnvIdle,
  shakeOffset,
  swayOffset,
} from "./motion.ts";
import { restGate, rampStateGain, sweepSeason, triggerShake } from "./motionTweens.ts";

const grid: { x: number; y: number; z: number; time: number }[] = [];
for (const x of [-20, -3.5, 0, 7, 31])
  for (const y of [0, 0.5, 3, 9])
    for (const z of [-12, 0, 4.25, 40])
      for (const time of [0, 0.37, 5, 123.4]) grid.push({ x, y, z, time });
const height = 9;

test("calmFor", () => {
  assert.equal(calmFor(0), 1);
  assert.equal(calmFor(0.9), 1);
  assert.ok(Math.abs(calmFor(0.95) - 0.5) < 1e-9);
  assert.equal(calmFor(1), 0);
  assert.equal(calmFor(NaN), 1);
  assert.equal(calmFor(2), 0);
  assert.equal(calmFor(-1), 1);
});

test("sway is exactly zero when stateGain is zero", () => {
  for (const p of grid) {
    const { dx, dz } = swayOffset({ ...p, height, stateGain: 0, calm: 1 });
    assert.ok(dx === 0 && dz === 0);
  }
});

test("sway is exactly zero on the ground and when calm is zero", () => {
  for (const p of grid) {
    const a = swayOffset({ ...p, y: 0, height, stateGain: 1, calm: 1 });
    assert.ok(a.dx === 0 && a.dz === 0);
    const b = swayOffset({ ...p, height, stateGain: 1, calm: 0 });
    assert.ok(b.dx === 0 && b.dz === 0);
  }
});

test("sway never exceeds the cap", () => {
  let max = 0;
  for (const p of grid) {
    const { dx, dz } = swayOffset({ ...p, height, stateGain: 1, calm: 1 });
    assert.ok(Math.abs(dx) <= SWAY_CAP && Math.abs(dz) <= 0.6 * SWAY_CAP);
    max = Math.max(max, Math.abs(dx));
  }
  assert.ok(max > 0.05);
});

test("shake is exactly zero when stateGain or shake is zero, and capped", () => {
  let max = 0;
  for (const p of grid) {
    for (const [stateGain, shake] of [[0, 1], [1, 0]]) {
      const z = shakeOffset({ ...p, height, stateGain, shake });
      assert.ok(z.dx === 0 && z.dz === 0);
    }
    const { dx, dz } = shakeOffset({ ...p, height, stateGain: 1, shake: 1 });
    assert.ok(Math.abs(dx) <= SHAKE_CAP && Math.abs(dz) <= 0.6 * SHAKE_CAP);
    max = Math.max(max, Math.abs(dx));
  }
  assert.ok(max > 0.1);
});

test("isEnvIdle", () => {
  const rest = { stateGain: 0, calm: 0, shake: 0 };
  assert.equal(isEnvIdle("SCAN", rest, false), true);
  assert.equal(isEnvIdle("SCAN", rest, true), false);
  assert.equal(isEnvIdle("SCAN", { ...rest, stateGain: 1e-9 }, false), false);
  assert.equal(isEnvIdle("SCAN", { ...rest, shake: 0.01 }, false), false);
  assert.equal(isEnvIdle("EXPLORE", rest, false), false);
});

test("createEnvironment", () => {
  assert.equal(createEnvironment("WINTER").phase.value, 2);
  assert.deepEqual(createEnvironment().gate, { stateGain: 1, calm: 1, shake: 0 });
});

test("instant paths assign exact values without GSAP", () => {
  const env = createEnvironment();
  rampStateGain(env, 0, 0);
  assert.equal(env.gate.stateGain, 0);
  env.gate.shake = 0.7;
  env.gate.calm = 0.3;
  restGate(env);
  assert.deepEqual(env.gate, { stateGain: 0, calm: 0, shake: 0 });
  sweepSeason(env, "WINTER", true);
  assert.equal(env.phase.value, 2);
  triggerShake(env, true);
  assert.equal(env.gate.shake, 0);
});
