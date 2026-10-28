"use client";

import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// Three flat light bands: the painted, cozy look instead of smooth Lambert shading.
const ramp = new THREE.DataTexture(new Uint8Array([60, 60, 60, 255, 150, 150, 150, 255, 255, 255, 255, 255]), 3, 1);
ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
ramp.needsUpdate = true;

/** One wind for every plant: its clock, shared by all wind-bent materials. */
const wind = { uWindTime: { value: 0 } };

// Bends a plant toward the wind by its height above the ground (and hanging plants by their depth below the rim),
// in the island's own space so every plant leans the same way. Mostly still, with a faint ripple; every ~14 s a
// gust front rolls across the island.
const WIND_GLSL = /* glsl */ `
uniform float uWindTime;
vec2 windAt(vec2 p) {
  vec2 dir = normalize(vec2(1.0, 0.35));
  float along = dot(p, dir), t = uWindTime;
  float ripple = sin(t * 1.6 - along * 0.35) * 0.5 + sin(t * 2.7 + p.y * 0.5 + p.x * 0.2) * 0.25;
  float front = mod(t * 9.0, 130.0) - 45.0;
  float gust = exp(-pow((along - front) / 7.0, 2.0));
  return dir * (0.12 + ripple * 0.18 + gust * 1.7);
}
`;

/** The same wind as WIND_GLSL, for things moved on the CPU (butterflies, birds): [x, z] push now at (x, z). */
export function windAt(x: number, z: number): [number, number] {
  const dx = 1 / Math.hypot(1, 0.35), dz = 0.35 * dx, t = wind.uWindTime.value, along = x * dx + z * dz;
  const ripple = Math.sin(t * 1.6 - along * 0.35) * 0.5 + Math.sin(t * 2.7 + z * 0.5 + x * 0.2) * 0.25;
  const front = (((t * 9) % 130) + 130) % 130 - 45;
  const s = 0.12 + ripple * 0.18 + Math.exp(-(((along - front) / 7) ** 2)) * 1.7;
  return [dx * s, dz * s];
}

function bend(shader: THREE.WebGLProgramParametersWithUniforms) {
  Object.assign(shader.uniforms, wind);
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>\n${WIND_GLSL}`)
    .replace("#include <project_vertex>", /* glsl */ `
      vec4 local = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        local = instanceMatrix * local;
      #endif
      float reach = min(2.5, max(0.0, local.y) + max(0.0, -0.9 - local.y) * 0.6); // capped for the longest vines
      local.xz += windAt(local.xz) * reach * 0.45;
      vec4 mvPosition = modelViewMatrix * local;
      gl_Position = projectionMatrix * mvPosition;
    `);
}

/** The scene's lit material: toon-shaded with the shared three-band ramp; `windy` plants bend in the shared wind. */
export function Toon({ windy, ...props }: { map?: THREE.Texture; alphaTest?: number; side?: THREE.Side; color?: string; windy?: boolean }) {
  const extra = useMemo(() => (windy ? { onBeforeCompile: bend, customProgramCacheKey: () => "wind" } : {}), [windy]);
  return <meshToonMaterial gradientMap={ramp} {...props} {...extra} />;
}

/** Runs the wind's clock; still when the viewer asks for reduced motion. */
export function Wind({ reducedMotion }: { reducedMotion: boolean }) {
  useFrame((_, delta) => {
    if (!reducedMotion) wind.uWindTime.value += Math.min(delta, 0.1);
  });
  return null;
}
