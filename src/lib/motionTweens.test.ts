import assert from "node:assert/strict";
import test from "node:test";
import gsap from "gsap";
import { createEnvironment } from "./motion.ts";
import { killStateGainTween, rampStateGain, triggerShake } from "./motionTweens.ts";

test("killStateGainTween cancels the ramp but leaves a shake decay running", () => {
  const env = createEnvironment();
  try {
    triggerShake(env, false);
    rampStateGain(env, 0, 5);
    killStateGainTween(env);
    gsap.updateRoot(gsap.ticker.time + 0.5);
    assert.equal(env.gate.stateGain, 1, "the cancelled ramp must not keep moving stateGain");
    assert.ok(env.gate.shake > 0 && env.gate.shake < 1, "the shake keeps decaying");
  } finally {
    gsap.killTweensOf(env.gate);
  }
});
