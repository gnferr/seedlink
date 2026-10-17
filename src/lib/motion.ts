import type { ViewState } from "../components/scene/CameraRig.tsx";
import { seasonIndex } from "./seasons.ts";
import type { Season } from "./seasons.ts";

export const SWAY_CAP = 0.35;
export const SHAKE_CAP = 0.5;
export const SHAKE_SECONDS = 0.9;
export const RAMP_DOWN_SECONDS = 0.4;
export const RAMP_UP_SECONDS = 0.4;

export type MotionGate = { stateGain: number; calm: number; shake: number };
export type Environment = { gate: MotionGate; phase: { value: number } };

export function createEnvironment(season: Season = "SUMMER"): Environment {
  return { gate: { stateGain: 1, calm: 1, shake: 0 }, phase: { value: seasonIndex(season) } };
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function calmFor(proximity: number): number {
  if (!Number.isFinite(proximity)) return 1;
  return 1 - smoothstep(0.9, 1, proximity);
}

const ZERO = () => ({ dx: 0, dz: 0 });
// 0 * NaN is NaN, so degenerate input must short-circuit to exact zero rather than rely on the gate product.
const live = (a: Pos) =>
  a.stateGain !== 0 && [a.stateGain, a.x, a.y, a.z, a.time].every(Number.isFinite);

type Pos = { x: number; y: number; z: number; time: number; height: number; stateGain: number };

// Mirrored in the vertex shader; every term is multiplied by the gate so a zero gate is exactly zero.
export function swayOffset(a: Pos & { calm: number }): { dx: number; dz: number } {
  if (!live(a) || !Number.isFinite(a.calm) || !(a.height > 0) || !Number.isFinite(a.height)) return ZERO();
  const w = smoothstep(0, 1, Math.min(1, Math.max(0, a.y / a.height)));
  const ph = a.x * 0.35 + a.z * 0.5;
  const g = SWAY_CAP * a.stateGain * a.calm * w;
  return { dx: g * Math.sin(1.7 * a.time + ph), dz: g * 0.6 * Math.cos(1.3 * a.time + 0.8 * ph) };
}

export function shakeOffset(a: Pos & { shake: number }): { dx: number; dz: number } {
  if (!live(a) || !Number.isFinite(a.shake)) return ZERO();
  const ph = a.x * 0.35 + a.z * 0.5;
  const g = SHAKE_CAP * a.stateGain * a.shake;
  return { dx: g * Math.sin(23 * a.time + ph), dz: g * 0.6 * Math.cos(19 * a.time + ph) };
}

export function isEnvIdle(state: ViewState, gate: MotionGate, particlesMounted: boolean): boolean {
  return state !== "EXPLORE" && gate.stateGain === 0 && gate.shake === 0 && !particlesMounted;
}
