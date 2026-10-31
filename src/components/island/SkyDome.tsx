"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { seasonSky, skyState } from "@/lib/daycycle";
import type { Season } from "@/lib/seasons";
import { buildCloudTile, buildSkyFields, CLOUD_TILE } from "@/lib/skyFields";

const vertexShader = /* glsl */ `
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// The time-of-day sky, per pixel in 0-255 sRGB on a grid of CELL CSS px cells: a gradient, sun and moon, stars and
// the Milky Way behind two drifting layers of soft Ghibli-style cumulus, all dithered into fine colour steps.
const fragmentShader = /* glsl */ `
precision highp float;
uniform sampler2D uFields; // r milky
uniform sampler2D uClouds; // far layer in the top half, near in the bottom: r cover, g light
uniform vec2 uField;       // cells across, down
uniform float uCell, uBufH; // drawing-buffer px per cell, drawing-buffer height
uniform vec2 uShift;       // how far each layer (near, far) has slid, in tile widths
uniform float uTileAspect; // tile width over one layer's height
uniform vec3 uSky[4];
uniform vec3 uLight, uLit, uDark;
uniform vec3 uSun, uMoon;  // x, y (0-1, y down), up
uniform float uSunUp, uNight;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float m2(float a, float b) { return mod(2.0 * a + 3.0 * b, 4.0); }
float bayer(vec2 c) { // the mockup's 4x4 matrix
  vec2 lo = mod(c, 2.0), hi = floor(mod(c, 4.0) / 2.0);
  return 4.0 * m2(lo.x, lo.y) + m2(hi.x, hi.y);
}

// One cloud layer spanning rows top..top+span of the view: cover in w, the shaded colour in rgb. The tile is
// sampled smoothly, so cloud edges are soft and the drift glides instead of stepping a pixel at a time.
vec4 layer(float sx, float v, float top, float span, float slot, float shift) {
  float ty = (v - top) / span;
  if (ty < 0.0 || ty >= 1.0) return vec4(0.0);
  vec2 c = texture2D(uClouds, vec2(sx / (span * uTileAspect) + shift, (slot + ty) * 0.5)).rg;
  float lit = smoothstep(0.08, 0.95, c.g / max(c.r, 0.001));
  return vec4(mix(uDark, uLit, lit), smoothstep(0.1, 0.75, c.r));
}

void main() {
  vec2 cell = floor(vec2(gl_FragCoord.x, uBufH - gl_FragCoord.y) / uCell); // rows from the top
  vec2 uv = cell / uField;
  float u = uv.x, v = uv.y, aspect = uField.x / uField.y;
  float milky = texture2D(uFields, (cell + 0.5) / uField).r;

  vec3 col = v < 0.45 ? mix(uSky[0], uSky[1], v / 0.45) : v < 0.75 ? mix(uSky[1], uSky[2], (v - 0.45) / 0.3) : mix(uSky[2], uSky[3], (v - 0.75) / 0.25);
  if (uSun.z > 0.5) {
    float dd = length(vec2((u - uSun.x) * aspect, v - uSun.y));
    col += uLight * (exp(-dd * 4.2) * (0.25 + (1.0 - uSunUp) * 0.45) + exp(-dd * 24.0) * 0.6);
  }
  if (uMoon.z > 0.5) {
    float dd = length(vec2((u - uMoon.x) * aspect, v - uMoon.y));
    col += vec3(200.0, 215.0, 255.0) * (exp(-dd * 7.0) * 0.12 + exp(-dd * 30.0) * 0.3) * uNight;
  }
  col += vec3(70.0, 64.0, 90.0) * milky * uNight;

  // Stars (thinning toward the horizon) and the moon disc, dimmed where cloud covers them.
  float sx = u * aspect;
  vec4 far = layer(sx, v, 0.04, 0.36, 0.0, uShift.y);
  vec4 near = layer(sx, v, 0.42, 0.64, 1.0, uShift.x);
  float clear = (1.0 - near.a) * (1.0 - far.a);
  float h = hash(cell);
  if (h < 0.006 * max(0.0, 1.0 - v / 0.8)) col = mix(col, vec3(245.0, 245.0, 255.0), uNight * (0.25 + pow(hash(cell + 31.7), 3.0) * 0.75) * clear);
  if (uSun.z > 0.5 && length(cell - uSun.xy * uField) < 0.025 * uField.y) col = mix(uLight, vec3(255.0, 255.0, 240.0), 0.6);
  if (uMoon.z > 0.5 && length(cell - uMoon.xy * uField) < 0.0173 * uField.y) col = mix(col, vec3(238.0, 243.0, 255.0), max(0.25, uNight) * clear);

  // Clouds are hazed toward the sky behind them so they sit back and never outshine the island: the far layer
  // high up, faint; the near heaps and the cloud sea low behind the island, softened toward the horizon colour.
  vec3 horizon = mix(uSky[2], uSky[3], 0.5);
  col = mix(col, mix(far.rgb, uSky[1], 0.45), far.a * 0.75);
  col = mix(col, mix(near.rgb, horizon, 0.3), near.a * 0.92);

  float dt = ((bayer(cell) + 0.5) / 16.0 - 0.5) * 6.0;
  col = floor((col + dt) / 6.0 + 0.5) * 6.0;
  gl_FragColor = vec4(col / 255.0, 1.0); // raw sRGB: no colorspace conversion on purpose
}
`;

const CELL = 3; // CSS px per sky pixel
const DRIFT = { near: 0.004, far: 0.0015 }; // tile widths per second
const PARALLAX = { near: 0.12, far: 0.05 }; // tile widths per radian the view turns
const HOME_YAW = Math.PI / 4; // the default iso view looks along (1, 0.78, 1)

const v3 = () => new THREE.Vector3();
const set = (v: THREE.Vector3, c: readonly number[]) => v.set(c[0], c[1], c[2]);

/** The time-of-day sky: a full-screen quad drawn first, behind everything, never depth-tested. */
export default function SkyDome({ time, season, reducedMotion }: { time: number; season: Season; reducedMotion: boolean }) {
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const fw = Math.max(1, Math.ceil(size.width / CELL)), fh = Math.max(1, Math.ceil(size.height / CELL));

  // The Milky Way costs tens of ms on a big screen, so it is rebuilt once a resize settles, never per resize step,
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
    for (let i = 0; i < w * h; i++) data[i * 4] = f.milky[i];
    const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.FloatType);
    t.needsUpdate = true;
    return t;
  }, [built]);
  useEffect(() => () => texture.dispose(), [texture]);

  const clouds = useMemo(() => {
    const t = new THREE.DataTexture(buildCloudTile(7), CLOUD_TILE.width, CLOUD_TILE.layer * 2, THREE.RGBAFormat);
    t.wrapS = THREE.RepeatWrapping;
    t.magFilter = t.minFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  }, []);
  useEffect(() => () => clouds.dispose(), [clouds]);

  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader, fragmentShader, depthTest: false, depthWrite: false,
    uniforms: {
      uFields: { value: null }, uClouds: { value: null }, uField: { value: new THREE.Vector2() }, uCell: { value: 1 }, uBufH: { value: 1 },
      uShift: { value: new THREE.Vector2() }, uTileAspect: { value: CLOUD_TILE.width / CLOUD_TILE.layer },
      uSky: { value: [v3(), v3(), v3(), v3()] }, uLight: { value: v3() }, uLit: { value: v3() }, uDark: { value: v3() },
      uSun: { value: v3() }, uMoon: { value: v3() }, uSunUp: { value: 0 }, uNight: { value: 0 },
    },
  }), []);
  useEffect(() => () => material.dispose(), [material]);

  const sky = useMemo(() => skyState(time), [time]);
  const bands = useMemo(() => seasonSky(sky, season), [sky, season]);
  // Uniform writes are plain copies, so doing them every frame costs nothing and allocates nothing.
  const mesh = useRef<THREE.Mesh>(null);
  const drift = useRef(0);
  const view = useRef({ yaw: HOME_YAW, turn: 0 });
  useFrame(({ camera }, delta) => {
    if (!mesh.current) return;
    const u = (mesh.current.material as THREE.ShaderMaterial).uniforms;
    if (!reducedMotion) drift.current += Math.min(delta, 0.1);
    // Turning the view slides the near clouds more than the far ones, so the sky has depth. The turn is summed
    // frame to frame, so orbiting past the back (where the angle wraps from +π to -π) never makes the clouds jump.
    const yaw = Math.atan2(camera.position.x, camera.position.z), v = view.current;
    const step = yaw - v.yaw;
    v.turn += step - 2 * Math.PI * Math.round(step / (2 * Math.PI));
    v.yaw = yaw;
    u.uShift.value.set(drift.current * DRIFT.near - v.turn * PARALLAX.near, drift.current * DRIFT.far - v.turn * PARALLAX.far);
    u.uFields.value = texture;
    u.uClouds.value = clouds;
    u.uField.value.set(fw, fh);
    u.uCell.value = CELL * dpr;
    u.uBufH.value = Math.floor(size.height * dpr);
    for (let k = 0; k < bands.length; k++) set(u.uSky.value[k], bands[k]);
    set(u.uLight.value, sky.light); set(u.uLit.value, sky.cloudLit); set(u.uDark.value, sky.cloudDark);
    u.uSun.value.set(sky.sun.x, sky.sun.y, sky.sun.up ? 1 : 0);
    u.uMoon.value.set(sky.moon.x, sky.moon.y, sky.moon.up ? 1 : 0);
    u.uSunUp.value = sky.sun.up ? Math.min(1, Math.max(0, (0.94 - sky.sun.y) / 0.82)) : 0;
    u.uNight.value = sky.night;
  });

  return (
    <mesh ref={mesh} frustumCulled={false} renderOrder={-1} material={material}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}
