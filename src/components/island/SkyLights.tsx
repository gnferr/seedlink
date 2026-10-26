"use client";

import { useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { skyState, type RGB } from "@/lib/daycycle";
import { easeInOutCubic } from "@/lib/fold";
import type { FoldState } from "./IslandScene";

// Today's neutral rig: the folded pad is lit exactly like this at fold t = 1, at any time of day.
const SKY = new THREE.Color("#b8b0ff"), GROUND = new THREE.Color("#2a2140"), HEMI = 1.1;
const KEY = new THREE.Color("#fff4e0"), KEY_I = 1.6, KEY_POS = new THREE.Vector3(30, 50, -10);
const FILL = new THREE.Color("#9ec5ff"), FILL_I = 0.5, FILL_POS = new THREE.Vector3(-30, 20, 30);

// Screen axes of the default iso view along (1, 0.78, 1): right and "into the screen" on the ground.
const RIGHT = new THREE.Vector3(1, 0, -1).normalize();
const BACK = new THREE.Vector3(-1, 0, -1).normalize();
const KEY_DIST = KEY_POS.length();
const ahead = new THREE.Vector3();

const srgb = (c: THREE.Color, [r, g, b]: RGB) => c.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
// At e = 1 the neutral value itself, so the folded frame matches today's to the bit.
const mixTo = (a: number, b: number, e: number) => (e >= 1 ? b : a + (b - a) * e);

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/**
 * Hemisphere, key light, fog and a glow behind the island, all following the time of day and easing to
 * today's neutral rig as the fold closes. The key comes from the sun (or the moon once it has set), mapped from
 * its screen position to an azimuth and elevation, and dims through 19:30 so the sun-to-moon swap never jumps.
 */
export default function SkyLights({ time, fold, radius, reducedMotion }: {
  time: number; fold: RefObject<FoldState>; radius: number; reducedMotion: boolean;
}) {
  const hemi = useRef<THREE.HemisphereLight>(null);
  const key = useRef<THREE.DirectionalLight>(null);
  const glow = useRef<THREE.Sprite>(null);
  const fogRef = useRef(new THREE.Fog(0xffffff, 1, 2));
  const texture = useMemo(() => glowTexture(), []);
  const dir = useRef<THREE.Vector3 | null>(null);

  const day = useMemo(() => {
    const s = skyState(time);
    const src = s.sun.up ? s.sun : s.moon;
    const az = (src.x - 0.5) * Math.PI * 0.9;
    const el = THREE.MathUtils.degToRad(10 + (1 - src.y) * 70);
    const target = new THREE.Vector3()
      .addScaledVector(RIGHT, Math.sin(az))
      .addScaledVector(BACK, Math.cos(az) * 0.4)
      .normalize()
      .multiplyScalar(Math.cos(el))
      .setY(Math.sin(el))
      .normalize();
    const h = 6 + time * 17;
    const swap = THREE.MathUtils.smoothstep(Math.abs(h - 19.5), 0, 0.5); // 0 at sunset, 1 half an hour either side
    return {
      target, key: srgb(new THREE.Color(), s.light), sky: srgb(new THREE.Color(), s.ambient), haze: srgb(new THREE.Color(), s.haze),
      keyI: KEY_I * (0.25 + 0.75 * swap),
    };
  }, [time]);

  useFrame(({ camera, scene }, delta) => {
    const h = hemi.current, k = key.current, g = glow.current;
    if (!h || !k || !g) return;
    const e = easeInOutCubic(fold.current.t);

    // The key direction eases toward the source, so a slider drag past sunset swings it rather than snapping.
    if (!dir.current || reducedMotion) dir.current = (dir.current ?? new THREE.Vector3()).copy(day.target);
    else dir.current.lerp(day.target, 1 - Math.exp(-Math.min(delta, 0.1) * 4)).normalize();

    if (e >= 1) {
      h.color.copy(SKY);
      h.groundColor.copy(GROUND);
      k.color.copy(KEY);
      k.position.copy(KEY_POS);
    } else {
      h.color.lerpColors(day.sky, SKY, e);
      h.groundColor.lerpColors(day.haze, GROUND, e);
      k.color.lerpColors(day.key, KEY, e);
      k.position.copy(dir.current).multiplyScalar(KEY_DIST).lerp(KEY_POS, e);
    }
    k.intensity = mixTo(day.keyI, KEY_I, e);

    // Fog only on the island's far underside, pushed out of reach as the fold closes; none at t = 1.
    if (e >= 1) scene.fog = null;
    else {
      const push = (e / (1 - e)) * 400;
      const fog = fogRef.current;
      fog.color.copy(day.haze);
      fog.near = 200 + radius + push;
      fog.far = 200 + radius + 45 + push;
      scene.fog = fog;
    }

    // Centred on the view, far behind the island: the island's depth hides it where they overlap.
    g.position.copy(camera.position).addScaledVector(camera.getWorldDirection(ahead), 600);
    g.visible = e < 1;
    g.material.color.copy(day.key);
    g.material.opacity = 0.55 * (1 - e);
    g.scale.setScalar(radius * 5);
  });

  return (
    <>
      <hemisphereLight ref={hemi} args={[SKY, GROUND, HEMI]} />
      <directionalLight ref={key} color={KEY} intensity={KEY_I} position={KEY_POS} />
      <directionalLight color={FILL} intensity={FILL_I} position={FILL_POS} />
      <sprite ref={glow}>
        <spriteMaterial map={texture} transparent depthWrite={false} fog={false} blending={THREE.AdditiveBlending} />
      </sprite>
    </>
  );
}
