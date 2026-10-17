import gsap from "gsap";
import { SHAKE_SECONDS, type Environment } from "./motion.ts";
import { seasonIndex, shortestPhaseTarget } from "./seasons.ts";
import type { Season } from "./seasons.ts";

export function rampStateGain(env: Environment, target: 0 | 1, seconds: number, onComplete?: () => void): void {
  gsap.killTweensOf(env.gate, "stateGain");
  if (seconds <= 0) {
    env.gate.stateGain = target;
    onComplete?.();
    return;
  }
  gsap.to(env.gate, {
    stateGain: target,
    duration: seconds,
    ease: "power1.inOut",
    onComplete: () => {
      env.gate.stateGain = target;
      onComplete?.();
    },
  });
}

/** Cancels an in-flight stateGain ramp only: a shake decay (or any other gate tween) keeps running. */
export function killStateGainTween(env: Environment): void {
  gsap.killTweensOf(env.gate, "stateGain");
}

export function restGate(env: Environment): void {
  gsap.killTweensOf(env.gate);
  env.gate.stateGain = 0;
  env.gate.calm = 0;
  env.gate.shake = 0;
}

/** Retargets the gate toward rest: kills every gate tween, ramps stateGain to 0 and kills any shake. */
export function stillGate(env: Environment, seconds: number): void {
  gsap.killTweensOf(env.gate);
  env.gate.shake = 0;
  rampStateGain(env, 0, seconds);
}

export function setCalm(env: Environment, calm: number): void {
  env.gate.calm = calm;
}

export function sweepSeason(env: Environment, season: Season, reduced: boolean): void {
  gsap.killTweensOf(env.phase);
  const end = seasonIndex(season);
  if (reduced) {
    env.phase.value = end;
    return;
  }
  const to = shortestPhaseTarget(env.phase.value, season);
  gsap.to(env.phase, {
    value: to,
    duration: Math.min(1.2, 0.4 + 0.4 * Math.abs(to - env.phase.value)),
    ease: "power1.inOut",
    onComplete: () => {
      env.phase.value = end;
    },
  });
}

export function triggerShake(env: Environment, reduced: boolean): void {
  gsap.killTweensOf(env.gate, "shake");
  if (reduced) {
    env.gate.shake = 0;
    return;
  }
  env.gate.shake = 1;
  gsap.to(env.gate, {
    shake: 0,
    duration: SHAKE_SECONDS,
    ease: "power2.out",
    onComplete: () => {
      env.gate.shake = 0;
    },
  });
}
