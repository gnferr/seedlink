"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, OrthographicCamera } from "@react-three/drei";
import gsap from "gsap";
import * as THREE from "three";
import { QUIET_ZONE } from "@/lib/qr";
import { ELEVATION_MAX_DEG, ELEVATION_MIN_DEG } from "@/lib/solver";

export type ViewState = "EXPLORE" | "REVEAL" | "SCAN";

const FALLBACK_ELEVATION_DEG = 30;
const FIT_MARGIN = 0.9;
const PROXIMITY_FULL_DEG = 30;
const PROXIMITY_EPSILON = 0.01;

type Pose = {
  position: THREE.Vector3;
  target: THREE.Vector3;
  up: THREE.Vector3;
  zoom: number;
};

// Matches the solver's basis: direction (cos φ/√2, sin φ, cos φ/√2), world up +Y.
function revealPose(
  plane: number,
  elevationDeg: number,
  width: number,
  height: number,
): Pose {
  const deg = Number.isFinite(elevationDeg) ? elevationDeg : FALLBACK_ELEVATION_DEG;
  const phi = (Math.min(ELEVATION_MAX_DEG, Math.max(ELEVATION_MIN_DEG, deg)) * Math.PI) / 180;
  const s = Math.sin(phi);
  const c = Math.cos(phi);
  const dir = new THREE.Vector3(c / Math.SQRT2, s, c / Math.SQRT2);
  // Screen-up axis; shifting the look-at along it only re-frames, it never breaks alignment.
  const screenUp = new THREE.Vector3(-s / Math.SQRT2, c, -s / Math.SQRT2);
  // Screen v runs from the plane's near corner (-plane·sinφ/√2) up to the tree's crown (~plane).
  const vLo = -(plane * s) / Math.SQRT2;
  const vHi = plane;
  const target = screenUp.clone().multiplyScalar((vLo + vHi) / 2);
  const zoom = Math.min(width / (plane * Math.SQRT2), height / (vHi - vLo)) * FIT_MARGIN;
  return {
    position: target.clone().addScaledVector(dir, plane * 2),
    target,
    up: new THREE.Vector3(0, 1, 0),
    zoom,
  };
}

function scanPose(plane: number, width: number, height: number): Pose {
  return {
    position: new THREE.Vector3(0, plane * 2, 0),
    target: new THREE.Vector3(),
    up: new THREE.Vector3(0, 0, -1),
    zoom: (Math.min(width, height) / plane) * FIT_MARGIN,
  };
}

/** 1 at the reveal direction, falling linearly to 0 at 30° away. */
export function proximityFor(angleRad: number): number {
  return Math.max(0, Math.min(1, 1 - (angleRad * 180) / Math.PI / PROXIMITY_FULL_DEG));
}

export default function CameraRig({
  state,
  size,
  elevationDeg,
  onProximityChange,
}: {
  state: ViewState;
  size: number;
  elevationDeg: number;
  onProximityChange: (p: number) => void;
}) {
  const camera = useThree((s) => s.camera);
  const { width, height } = useThree((s) => s.size);
  const plane = size + QUIET_ZONE * 2;
  const [readyState, setReadyState] = useState<ViewState | null>(null);
  const controlsOn = readyState === state;
  const placed = useRef(false);
  const lastProximity = useRef(-1);
  const reveal = revealPose(plane, elevationDeg, width, height);
  const revealKey = `${reveal.zoom}|${reveal.position.toArray()}`;

  useEffect(() => {
    const cam = camera as THREE.OrthographicCamera;
    const to = state === "SCAN" ? scanPose(plane, width, height) : reveal;
    const apply = (pos: THREE.Vector3, tgt: THREE.Vector3, up: THREE.Vector3, zoom: number) => {
      cam.position.copy(pos);
      cam.up.copy(up);
      cam.zoom = zoom;
      cam.lookAt(tgt);
      cam.updateProjectionMatrix();
    };
    lastProximity.current = -1;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const instant = !placed.current || reduced;
    placed.current = true;

    // Look-at point is not stored on the camera, so project it along the current view axis.
    const fromPos = cam.position.clone();
    const fromUp = cam.up.clone();
    const fromZoom = cam.zoom;
    const fromTarget = fromPos.clone().add(cam.getWorldDirection(new THREE.Vector3()).multiplyScalar(plane * 2));
    const p = { t: 0 };
    const pos = new THREE.Vector3();
    const tgt = new THREE.Vector3();
    const up = new THREE.Vector3();
    const tween = gsap.to(p, {
      t: 1,
      duration: instant ? 0 : 1.2,
      ease: "power2.inOut",
      onStart: () => setReadyState(null),
      onUpdate: () => {
        pos.lerpVectors(fromPos, to.position, p.t);
        tgt.lerpVectors(fromTarget, to.target, p.t);
        up.lerpVectors(fromUp, to.up, p.t).normalize();
        apply(pos, tgt, up, fromZoom + (to.zoom - fromZoom) * p.t);
      },
      onComplete: () => {
        if (state === "EXPLORE") setReadyState(state);
      },
    });
    return () => {
      tween.kill();
    };
    // `reveal` is derived from the deps below; revealKey stands in for it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, plane, width, height, camera, revealKey]);

  useFrame(() => {
    if (state !== "EXPLORE" || !controlsOn) return;
    const dir = camera.position.clone().sub(reveal.target).normalize();
    const base = reveal.position.clone().sub(reveal.target).normalize();
    const p = proximityFor(dir.angleTo(base));
    if (Math.abs(p - lastProximity.current) >= PROXIMITY_EPSILON) {
      lastProximity.current = p;
      onProximityChange(p);
    }
  });

  return (
    <>
      <OrthographicCamera makeDefault near={-500} far={500} />
      {state === "EXPLORE" && controlsOn && (
        <OrbitControls makeDefault target={reveal.target.toArray()} />
      )}
    </>
  );
}
