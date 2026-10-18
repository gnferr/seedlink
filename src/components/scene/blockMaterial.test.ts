import test from "node:test";
import assert from "node:assert/strict";
import { createEnvironment } from "../../lib/motion.ts";
import { phaseColour } from "../../lib/seasons.ts";
import { SWAY_CHUNK, createSwayMaterial, updateSwayMaterial } from "./blockMaterial.ts";

const SUMMER = "#3f9b3a";
const opts = { roughness: 0.8, metalness: 0, height: 10 };

const compile = (kind: "canopy" | "trunk" | "grass") => {
  const m = createSwayMaterial(kind, opts);
  const fake = { uniforms: {} as Record<string, { value: number }>, vertexShader: "#include <begin_vertex>\n" };
  // @ts-expect-error a minimal stand-in for three's shader object and renderer
  m.onBeforeCompile(fake, undefined);
  return { m, fake };
};

test("the injected program carries the sway chunk and its uniforms", () => {
  const { fake } = compile("canopy");
  assert.ok(fake.vertexShader.includes("#include <begin_vertex>\n" + SWAY_CHUNK));
  assert.ok(fake.vertexShader.includes("0.35"));
  for (const u of ["uTime", "uStateGain", "uCalm", "uShake", "uSwayHeight", "uSwayWeight", "uShakeWeight"])
    assert.ok(u in fake.uniforms, u);
});

test("the chunk skips every offset when the gate is zero", () => {
  assert.match(SWAY_CHUNK, /if \(uStateGain != 0\.0\) \{/);
  assert.match(SWAY_CHUNK, /uSwayHeight > 0\.0/);
});

test("a zero gate writes zero motion uniforms", () => {
  const { m, fake } = compile("canopy");
  const env = createEnvironment();
  env.gate.stateGain = 0;
  env.gate.shake = 0;
  updateSwayMaterial(m, { time: 3, env, summerColour: SUMMER, kind: "canopy" });
  assert.equal(fake.uniforms.uStateGain.value, 0);
  assert.equal(fake.uniforms.uShake.value, 0);
});

test("non-finite gate input is written as a zero gate", () => {
  const { m, fake } = compile("canopy");
  const env = createEnvironment();
  updateSwayMaterial(m, { time: NaN, env, summerColour: SUMMER, kind: "canopy" });
  assert.equal(fake.uniforms.uStateGain.value, 0);
});

test("the colour follows the phase and is only recomputed when the phase changes", () => {
  const { m } = compile("canopy");
  const env = createEnvironment();
  env.phase.value = 2;
  updateSwayMaterial(m, { time: 0, env, summerColour: SUMMER, kind: "canopy" });
  assert.equal("#" + m.color.getHexString(), phaseColour(SUMMER, "canopy", 2));

  m.color.set("#123456");
  updateSwayMaterial(m, { time: 1, env, summerColour: SUMMER, kind: "canopy" });
  assert.equal(m.color.getHexString(), "123456");

  env.phase.value = 1;
  updateSwayMaterial(m, { time: 2, env, summerColour: SUMMER, kind: "canopy" });
  assert.equal("#" + m.color.getHexString(), phaseColour(SUMMER, "canopy", 1));
});

test("the trunk has no sway weight", () => {
  const { fake } = compile("trunk");
  assert.equal(fake.uniforms.uSwayWeight.value, 0);
  assert.equal(fake.uniforms.uShakeWeight.value, 0.3);
});

test("grass carries the gated chunk, writes a zero gate, and sways less than the canopy without shaking", () => {
  const { m, fake } = compile("grass");
  assert.ok(fake.vertexShader.includes("#include <begin_vertex>\n" + SWAY_CHUNK));
  const env = createEnvironment();
  env.gate.stateGain = 0;
  updateSwayMaterial(m, { time: 3, env, summerColour: SUMMER, kind: "grass" });
  assert.equal(fake.uniforms.uStateGain.value, 0);
  const canopy = compile("canopy").fake.uniforms;
  assert.ok(fake.uniforms.uSwayWeight.value > 0);
  assert.ok(fake.uniforms.uSwayWeight.value < canopy.uSwayWeight.value);
  assert.equal(fake.uniforms.uShakeWeight.value, 0);
});

test("grass keeps the colour the meadow gives it", () => {
  const { m } = compile("grass");
  m.color.set("#123456");
  const env = createEnvironment();
  env.phase.value = 2;
  updateSwayMaterial(m, { time: 0, env, summerColour: SUMMER, kind: "grass" });
  assert.equal(m.color.getHexString(), "123456");
});

test("grass weighs sway by its own height, inside the zero-gate guard", () => {
  const { m } = compile("grass");
  assert.ok("SWAY_LOCAL" in m.defines!, "grass defines SWAY_LOCAL");
  assert.ok(!("SWAY_LOCAL" in compile("canopy").m.defines!), "the canopy keeps instance-height weighting");
  const guard = SWAY_CHUNK.indexOf("if (uStateGain != 0.0) {");
  const local = SWAY_CHUNK.indexOf("#ifdef SWAY_LOCAL");
  const close = SWAY_CHUNK.lastIndexOf("}");
  assert.ok(guard >= 0 && guard < local && local < close, "#ifdef SWAY_LOCAL sits inside the guard");
});
