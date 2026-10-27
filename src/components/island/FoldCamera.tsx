"use client";

import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, OrthographicCamera } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { easeInOutCubic } from "@/lib/fold";
import { modulePitch, QUIET_ZONE } from "@/lib/qr";
import { scanFit, type ScanInsets } from "@/lib/scanFit";
import { CROWN_TO_ISLAND, MAX_TOP_TO_ISLAND } from "@/lib/tree";
import type { FoldState } from "./IslandScene";

const VIEW_DIR = new THREE.Vector3(1, 0.78, 1).normalize();
const DISTANCE = 200;
const DEG = Math.PI / 180;
const UP_TREE = new THREE.Vector3(0, 1, 0);
const UP_TOP = new THREE.Vector3(0, 0, -1);
const look = new THREE.Vector3();

type Shot = { position: THREE.Vector3; target: THREE.Vector3; zoom: number; up: THREE.Vector3 };

/**
 * The tree pose: an iso view along (1, 0.78, 1) at a point a third up the tallest tree, zoomed so the island and the
 * largest tree fitTree makes (crown CROWN_TO_ISLAND, top MAX_TOP_TO_ISLAND × radius) fit above the bottom controls.
 * It depends on the island alone, so the island keeps its size on screen whichever tree grows.
 * Orbit and zoom within limits of that fit.
 */
export function treePose(width: number, height: number, radius: number, bottomInset: number) {
  const top = radius * MAX_TOP_TO_ISLAND;
  const sceneW = Math.max(radius * 2.4, radius * CROWN_TO_ISLAND * 2.15); // the widest crown's diameter plus a margin
  const sceneH = top * 0.8 + radius * 1.5;
  const zoom = Math.max(1e-3, Math.min(width / sceneW, (height - bottomInset - 40) / sceneH));
  // Look a little lower so the island rises clear of the bottom controls.
  const target = new THREE.Vector3(0, top * 0.32 - (bottomInset / 2 / zoom) * 0.4, 0);
  return { zoom, target, position: target.clone().addScaledVector(VIEW_DIR, DISTANCE) };
}

/**
 * The top-down scan pose: straight down at the slab, screen up = −z, right = +x, `zoom` px per module,
 * and the pad centre (world origin) `dy` px below the view centre, the framing `sampleScan` assumes.
 * A module is `modulePitch(size)` units wide, so the zoom is divided by it to keep `fit.zoom` px per module.
 */
export function topPose(width: number, height: number, size: number, insets: ScanInsets): Shot {
  const fit = scanFit(width, height, size + 2 * QUIET_ZONE, insets);
  const zoom = fit.zoom / modulePitch(size), dy = fit.dy;
  const target = new THREE.Vector3(0, 0, -dy / zoom);
  return { zoom, target, position: target.clone().setY(DISTANCE), up: UP_TOP };
}

export default function FoldCamera({ radius, crownRadius, size, insets, fold, orbit }: {
  radius: number; crownRadius: number; size: number; insets: ScanInsets;
  fold: RefObject<FoldState>;
  /** Orbit is off from fold start until the grow ends. */
  orbit: boolean;
}) {
  const { width, height } = useThree((s) => s.size);
  const gl = useThree((s) => s.gl);
  const camera = useRef<THREE.OrthographicCamera>(null);
  const controls = useRef<OrbitControlsImpl>(null);
  // The user's pose captured at fold start; the grow eases back to it.
  const from = useRef<Shot | null>(null);
  const fitted = useRef<number | null>(null);

  // The tree fit follows the view size and the world only; an inset change alone keeps the user's orbit.
  const key = `${width}x${height}|${radius}`;
  const [fit, setFit] = useState(() => ({ key, pose: treePose(width, height, radius, insets.bottom) }));
  if (fit.key !== key) setFit({ key, pose: treePose(width, height, radius, insets.bottom) });
  const pose = fit.pose;
  const scan = useMemo(() => topPose(width, height, size, { top: insets.top, bottom: insets.bottom }), [width, height, size, insets.top, insets.bottom]);

  /** Re-aim at the fit, keeping the user's orbit direction and zoom relative to the fit. */
  function refit() {
    const cam = camera.current, c = controls.current, s = from.current;
    if (s && fold.current.cam === 1 && fitted.current !== null) {
      // Fully folded (a new tree grows from here): move the capture onto the new fit, so the grow ends without a snap.
      const rel = s.zoom / fitted.current;
      s.position.sub(s.target).normalize().multiplyScalar(DISTANCE).add(pose.target);
      s.target.copy(pose.target);
      s.zoom = pose.zoom * rel;
      fitted.current = pose.zoom;
      return;
    }
    if (!cam || s) return; // mid-tween: the capture comes back on grow, then catches up
    const first = fitted.current === null || !c;
    const dir = first ? VIEW_DIR : new THREE.Vector3().subVectors(cam.position, c.target).normalize();
    const rel = first ? 1 : THREE.MathUtils.clamp(cam.zoom / fitted.current!, 0.6, 3);
    cam.position.copy(pose.target).addScaledVector(dir, DISTANCE);
    cam.up.copy(UP_TREE);
    cam.zoom = pose.zoom * rel;
    cam.lookAt(pose.target);
    cam.updateProjectionMatrix();
    if (c) {
      c.target.copy(pose.target);
      c.update();
    }
    fitted.current = pose.zoom;
  }
  useLayoutEffect(refit, [pose, fold]);
  // The island's on-screen width (CSS px) in the fitted tree pose: an ortho disc projects to its diameter.
  useLayoutEffect(() => {
    gl.domElement.closest('[role="img"]')?.setAttribute("data-island-px", (2 * radius * pose.zoom).toFixed(1));
    gl.domElement.closest('[role="img"]')?.setAttribute("data-crown-px", (2 * crownRadius * pose.zoom).toFixed(1));
  }, [gl, radius, crownRadius, pose]);

  useFrame(() => {
    const cam = camera.current, c = controls.current;
    if (!cam || !c) return;
    const k = fold.current.cam;
    if (k === 0) {
      const s = from.current;
      if (!s) return;
      // Grow finished: hand the captured pose back to the orbit, then catch up with any refit missed meanwhile.
      cam.position.copy(s.position);
      cam.up.copy(s.up);
      cam.zoom = s.zoom;
      cam.lookAt(s.target);
      cam.updateProjectionMatrix();
      c.target.copy(s.target);
      c.update();
      from.current = null;
      if (fitted.current !== pose.zoom) refit();
      return;
    }
    from.current ??= { position: cam.position.clone(), target: c.target.clone(), zoom: cam.zoom, up: cam.up.clone() };
    const s = from.current, e = easeInOutCubic(k);
    // At k = 1 this re-applies the scan pose every frame, so a resize or inset change while folded snaps to it.
    cam.position.lerpVectors(s.position, scan.position, e);
    cam.up.lerpVectors(s.up, scan.up, e).normalize();
    cam.zoom = s.zoom + (scan.zoom - s.zoom) * e;
    cam.lookAt(look.lerpVectors(s.target, scan.target, e));
    cam.updateProjectionMatrix();
  });

  return (
    <>
      <OrthographicCamera ref={camera} makeDefault near={-500} far={1000} />
      <OrbitControls
        ref={controls}
        makeDefault
        // Aim from the first frame: refit's first run can come before this ref exists, and the controls would
        // otherwise re-aim the camera at their default target, the island centre.
        target={pose.target}
        enabled={orbit}
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
