import * as THREE from "three";
import { SHAKE_CAP, SWAY_CAP } from "../../lib/motion.ts";
import type { Environment } from "../../lib/motion.ts";
import { phaseColour, wrapPhase } from "../../lib/seasons.ts";

export type SwayKind = "canopy" | "trunk";
type Uniforms = Record<string, { value: number }>;
export type SwayMaterial = THREE.MeshStandardMaterial & {
  userData: { uniforms: Uniforms; lastPhase: number; lastColour: string };
};

const glslFloat = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n));

// GLSL twin of swayOffset + shakeOffset in lib/motion.ts. The gate test leaves `transformed`
// bit-identical at a zero gate, where the bare formula could yield 0 * NaN.
export const SWAY_CHUNK = `
#ifdef USE_INSTANCING
if (uStateGain != 0.0) {
  vec3 swayP = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float swayPh = swayP.x * 0.35 + swayP.z * 0.5;
  float swayW = 0.0;
  if (uSwayHeight > 0.0) swayW = smoothstep(0.0, 1.0, clamp(swayP.y / uSwayHeight, 0.0, 1.0));
  float swayG = ${glslFloat(SWAY_CAP)} * uStateGain * uCalm * swayW * uSwayWeight;
  float shakeG = ${glslFloat(SHAKE_CAP)} * uStateGain * uShake * uShakeWeight;
  transformed.x += swayG * sin(1.7 * uTime + swayPh) + shakeG * sin(23.0 * uTime + swayPh);
  transformed.z += swayG * 0.6 * cos(1.3 * uTime + 0.8 * swayPh) + shakeG * 0.6 * cos(19.0 * uTime + swayPh);
}
#endif
`;

const DECLARATIONS =
  "uniform float uTime, uStateGain, uCalm, uShake, uSwayHeight, uSwayWeight, uShakeWeight;\n";

export function createSwayMaterial(
  kind: SwayKind,
  o: { roughness: number; metalness: number; height: number },
): SwayMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: o.roughness, metalness: o.metalness }) as SwayMaterial;
  const uniforms: Uniforms = {
    uTime: { value: 0 },
    uStateGain: { value: 0 },
    uCalm: { value: 0 },
    uShake: { value: 0 },
    uSwayHeight: { value: Number.isFinite(o.height) && o.height > 0 ? o.height : 0 },
    uSwayWeight: { value: kind === "canopy" ? 1 : 0 },
    uShakeWeight: { value: kind === "canopy" ? 1 : 0.3 },
  };
  m.userData = { uniforms, lastPhase: NaN, lastColour: "" };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = (DECLARATIONS + shader.vertexShader).replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\n" + SWAY_CHUNK,
    );
  };
  return m;
}

export function updateSwayMaterial(
  m: SwayMaterial,
  f: { time: number; env: Environment; summerColour: string; kind: SwayKind },
): void {
  const u = m.userData.uniforms;
  const { stateGain, calm, shake } = f.env.gate;
  // Mirrors the TS twins: non-finite input means exactly no motion.
  const live = Number.isFinite(stateGain) && Number.isFinite(f.time);
  u.uStateGain.value = live ? stateGain : 0;
  u.uTime.value = live ? f.time : 0;
  u.uCalm.value = Number.isFinite(calm) ? calm : 0;
  u.uShake.value = Number.isFinite(shake) ? shake : 0;

  const phase = wrapPhase(f.env.phase.value);
  if (phase !== m.userData.lastPhase || f.summerColour !== m.userData.lastColour) {
    m.color.set(phaseColour(f.summerColour, f.kind, phase));
    m.userData.lastPhase = phase;
    m.userData.lastColour = f.summerColour;
  }
}
