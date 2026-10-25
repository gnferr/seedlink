"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { OrbitControls, OrthographicCamera } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

const VIEW_DIR = new THREE.Vector3(1, 0.78, 1).normalize();
const DISTANCE = 200;
const DEG = Math.PI / 180;

/**
 * The tree pose: an iso view along (1, 0.78, 1) at a point a third up the tree, zoomed so the island
 * (radius) and the tree (top) fit above the bottom controls. Orbit and zoom within limits of that fit.
 */
export function treePose(width: number, height: number, radius: number, top: number, bottomInset: number) {
  const sceneW = radius * 2.4;
  const sceneH = top * 0.8 + radius * 1.5;
  const zoom = Math.max(1e-3, Math.min(width / sceneW, (height - bottomInset - 40) / sceneH));
  // Look a little lower so the island rises clear of the bottom controls.
  const target = new THREE.Vector3(0, top * 0.32 - (bottomInset / 2 / zoom) * 0.4, 0);
  return { zoom, target, position: target.clone().addScaledVector(VIEW_DIR, DISTANCE) };
}

export default function FoldCamera({ radius, top, bottomInset }: { radius: number; top: number; bottomInset: number }) {
  const { width, height } = useThree((s) => s.size);
  const camera = useRef<THREE.OrthographicCamera>(null);
  const controls = useRef<OrbitControlsImpl>(null);
  const pose = useMemo(() => treePose(width, height, radius, top, bottomInset), [width, height, radius, top, bottomInset]);

  // shortcut: any refit (resize, new island, new insets) resets the orbit; Task 9 owns fold-time framing.
  useLayoutEffect(() => {
    const cam = camera.current;
    if (!cam) return;
    cam.position.copy(pose.position);
    cam.up.set(0, 1, 0);
    cam.zoom = pose.zoom;
    cam.lookAt(pose.target);
    cam.updateProjectionMatrix();
    const c = controls.current;
    if (c) {
      c.target.copy(pose.target);
      c.update();
    }
  }, [pose]);

  return (
    <>
      <OrthographicCamera ref={camera} makeDefault near={-500} far={1000} />
      <OrbitControls
        ref={controls}
        makeDefault
        enableDamping
        enablePan={false}
        minPolarAngle={20 * DEG}
        maxPolarAngle={78 * DEG}
        minZoom={pose.zoom * 0.6}
        maxZoom={pose.zoom * 3}
      />
    </>
  );
}
