"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Environment } from "@/lib/motion";
import { wrapPhase } from "@/lib/seasons";
import { skyGradient } from "@/lib/world";

const ROWS = 64;

function createSky() {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = ROWS;
  const texture = new THREE.CanvasTexture(canvas);
  // sRGB, so three draws it untone-mapped and the screen shows the gradient's hex values.
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  return { canvas, texture, flat: new THREE.Color() };
}
type SkyState = ReturnType<typeof createSky>;

function paint(scene: THREE.Scene, sky: SkyState, background: string, scan: boolean, phase: number) {
  if (scan) {
    // The Scan frame is season-immune: the exact flat Base colour, as before the sky existed.
    scene.background = sky.flat.set(background);
    return;
  }
  const { top, bottom } = skyGradient(background, phase);
  const g = sky.canvas.getContext("2d")!;
  // Stops on the first and last texel centres, so the frame's top and bottom show the end colours exactly.
  const grad = g.createLinearGradient(0, 0.5, 0, ROWS - 0.5);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, 1, ROWS);
  sky.texture.needsUpdate = true;
  scene.background = sky.texture;
}

function release(scene: THREE.Scene, sky: SkyState) {
  if (scene.background === sky.texture || scene.background === sky.flat) scene.background = null;
  sky.texture.dispose();
}

const reupload = (sky: SkyState) => () => {
  sky.texture.needsUpdate = true;
};

/** Owns scene.background: a flat Base colour in Scan, otherwise the season's vertical gradient. */
export default function Sky({ env, background, scan }: { env: Environment; background: string; scan: boolean }) {
  const scene = useThree((s) => s.scene);
  const canvas = useThree((s) => s.gl.domElement);
  const sky = useMemo(() => createSky(), []);
  const applied = useRef({ phase: NaN, scan: false, background: "" });

  // Before the first frame, so scene.background is never unset.
  useLayoutEffect(() => {
    const phase = wrapPhase(env.phase.value);
    paint(scene, sky, background, scan, phase);
    applied.current = { phase, scan, background };
  }, [scene, sky, env, background, scan]);
  useEffect(() => () => release(scene, sky), [scene, sky]);
  useEffect(() => {
    const on = reupload(sky);
    canvas.addEventListener("webglcontextrestored", on);
    return () => canvas.removeEventListener("webglcontextrestored", on);
  }, [canvas, sky]);

  useFrame(() => {
    const phase = wrapPhase(env.phase.value);
    const a = applied.current;
    if (a.phase === phase && a.scan === scan && a.background === background) return;
    paint(scene, sky, background, scan, phase);
    a.phase = phase;
    a.scan = scan;
    a.background = background;
  });

  return null;
}
