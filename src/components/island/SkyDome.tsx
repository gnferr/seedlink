"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { skyState } from "@/lib/daycycle";
import { buildSkyFields } from "@/lib/skyFields";

const vertexShader = /* glsl */ `
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// Port of the day-cycle mockup's per-pixel sky, in 0-255 sRGB, on a grid of 2 CSS px cells.
const fragmentShader = /* glsl */ `
precision highp float;
uniform sampler2D uFields; // r density, g shade (n + 1) / 2, b milky
uniform vec2 uField;       // cells across, down
uniform float uCell, uBufH; // drawing-buffer px per cell, drawing-buffer height
uniform vec3 uSky[4];
uniform vec3 uLight, uLit, uDark;
uniform vec3 uSun, uMoon;  // x, y (0-1, y down), up
uniform vec2 uKey;         // the light source the clouds face
uniform float uSunUp, uNight;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float noise1(float x) { float i = floor(x), f = x - i; return mix(hash(vec2(i, 7.0)), hash(vec2(i + 1.0, 7.0)), f * f * (3.0 - 2.0 * f)); }
float fbm1(float x) { float v = 0.0, a = 0.5, s = 0.0; for (int o = 0; o < 4; o++) { v += noise1(x) * a; s += a; a *= 0.5; x *= 2.03; } return v / s; }
float m2(float a, float b) { return mod(2.0 * a + 3.0 * b, 4.0); }
float bayer(vec2 c) { // the mockup's 4x4 matrix
  vec2 lo = mod(c, 2.0), hi = floor(mod(c, 4.0) / 2.0);
  return 4.0 * m2(lo.x, lo.y) + m2(hi.x, hi.y);
}

void main() {
  vec2 cell = floor(vec2(gl_FragCoord.x, uBufH - gl_FragCoord.y) / uCell); // rows from the top
  vec2 uv = cell / uField;
  float u = uv.x, v = uv.y, aspect = uField.x / uField.y;
  vec3 f = texture2D(uFields, (cell + 0.5) / uField).rgb;

  vec3 col = v < 0.45 ? mix(uSky[0], uSky[1], v / 0.45) : v < 0.75 ? mix(uSky[1], uSky[2], (v - 0.45) / 0.3) : mix(uSky[2], uSky[3], (v - 0.75) / 0.25);
  if (uSun.z > 0.5) {
    float dd = length(vec2((u - uSun.x) * aspect, v - uSun.y));
    col += uLight * (exp(-dd * 4.2) * (0.25 + (1.0 - uSunUp) * 0.45) + exp(-dd * 24.0) * 0.6);
  }
  if (uMoon.z > 0.5) {
    float dd = length(vec2((u - uMoon.x) * aspect, v - uMoon.y));
    col += vec3(200.0, 215.0, 255.0) * (exp(-dd * 7.0) * 0.12 + exp(-dd * 30.0) * 0.3) * uNight;
  }
  col += vec3(70.0, 64.0, 90.0) * f.b * uNight;
  if (f.r > 0.0) {
    float side = max(0.0, 1.0 - length(vec2((u - uKey.x) * 1.2, v - uKey.y)) * 1.6);
    float sh = clamp(f.g * 2.0 - 1.0 + 0.55 + side * 0.6, 0.0, 1.0);
    col = mix(col, mix(uDark, uLit, sh), min(1.0, f.r * 0.95));
  }
  float dt = ((bayer(cell) + 0.5) / 16.0 - 0.5) * 10.0;
  col = floor((col + dt) / 10.0 + 0.5) * 10.0;

  // Stars (thinning toward the horizon, hidden by cloud), then the sun and moon discs.
  float h = hash(cell);
  if (h < 0.006 * max(0.0, 1.0 - v / 0.8)) col = mix(col, vec3(245.0, 245.0, 255.0), uNight * (0.25 + pow(hash(cell + 31.7), 3.0) * 0.75) * (1.0 - f.r));
  if (uSun.z > 0.5 && length(cell - uSun.xy * uField) < 0.025 * uField.y) col = mix(uLight, vec3(255.0, 255.0, 240.0), 0.6);
  if (uMoon.z > 0.5 && length(cell - uMoon.xy * uField) < 0.0173 * uField.y) col = mix(col, vec3(238.0, 243.0, 255.0), max(0.25, uNight));

  // Soft cloud sea along the bottom.
  float edge = 0.88 - fbm1(cell.x / 20.0) * 0.035;
  float sea = smoothstep(edge - 0.01, edge + 0.01, v);
  col = mix(col, mix(mix(uLit, uSky[3], 0.4), uDark, clamp((v - 0.86) / 0.14, 0.0, 1.0)), sea);

  gl_FragColor = vec4(col / 255.0, 1.0); // raw sRGB: no colorspace conversion on purpose
}
`;

const v3 = () => new THREE.Vector3();
const set = (v: THREE.Vector3, c: readonly number[]) => v.set(c[0], c[1], c[2]);

/** The time-of-day sky: a full-screen quad drawn first, behind everything, never depth-tested. */
export default function SkyDome({ time }: { time: number }) {
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const fw = Math.max(1, Math.ceil(size.width / 2)), fh = Math.max(1, Math.ceil(size.height / 2));

  // The noise costs ~100-200 ms on a big screen, so it is rebuilt once a resize settles, never per resize step,
  // frame or dpr switch. Meanwhile the old texture stretches: the shader samples it in 0-1 coordinates.
  const [built, setBuilt] = useState({ w: fw, h: fh });
  useEffect(() => {
    if (built.w === fw && built.h === fh) return;
    const id = setTimeout(() => setBuilt({ w: fw, h: fh }), 250);
    return () => clearTimeout(id);
  }, [fw, fh, built]);
  const texture = useMemo(() => {
    const { w, h } = built;
    const f = buildSkyFields(w, h, 51);
    const data = new Float32Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      data[i * 4] = f.density[i]; data[i * 4 + 1] = f.shade[i]; data[i * 4 + 2] = f.milky[i]; data[i * 4 + 3] = 1;
    }
    const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.FloatType);
    t.needsUpdate = true;
    return t;
  }, [built]);
  useEffect(() => () => texture.dispose(), [texture]);

  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader, fragmentShader, depthTest: false, depthWrite: false,
    uniforms: {
      uFields: { value: null }, uField: { value: new THREE.Vector2() }, uCell: { value: 1 }, uBufH: { value: 1 },
      uSky: { value: [v3(), v3(), v3(), v3()] }, uLight: { value: v3() }, uLit: { value: v3() }, uDark: { value: v3() },
      uSun: { value: v3() }, uMoon: { value: v3() }, uKey: { value: new THREE.Vector2() }, uSunUp: { value: 0 }, uNight: { value: 0 },
    },
  }), []);
  useEffect(() => () => material.dispose(), [material]);

  const sky = useMemo(() => skyState(time), [time]);
  // Uniform writes are plain copies, so doing them every frame costs nothing and allocates nothing.
  const mesh = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!mesh.current) return;
    const u = (mesh.current.material as THREE.ShaderMaterial).uniforms;
    u.uFields.value = texture;
    u.uField.value.set(fw, fh);
    u.uCell.value = 2 * dpr;
    u.uBufH.value = Math.floor(size.height * dpr);
    for (let k = 0; k < sky.sky.length; k++) set(u.uSky.value[k], sky.sky[k]);
    set(u.uLight.value, sky.light); set(u.uLit.value, sky.cloudLit); set(u.uDark.value, sky.cloudDark);
    u.uSun.value.set(sky.sun.x, sky.sun.y, sky.sun.up ? 1 : 0);
    u.uMoon.value.set(sky.moon.x, sky.moon.y, sky.moon.up ? 1 : 0);
    const key = sky.sun.up ? sky.sun : sky.moon;
    u.uKey.value.set(key.x, key.y);
    u.uSunUp.value = sky.sun.up ? Math.min(1, Math.max(0, (0.94 - sky.sun.y) / 0.82)) : 0;
    u.uNight.value = sky.night;
  });

  return (
    <mesh ref={mesh} frustumCulled={false} renderOrder={-1} material={material}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}
