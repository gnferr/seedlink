"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, OrthographicCamera } from "@react-three/drei";
import gsap from "gsap";
import * as THREE from "three";
import { HALF_BLOCK } from "@/lib/blockGeometry";
import { QUIET_ZONE } from "@/lib/qr";
import type { Block } from "@/lib/solver";
import { FIT_MARGIN } from "@/lib/scanFit";
import { ELEVATION_MAX_DEG, ELEVATION_MIN_DEG } from "@/lib/solver";

export type ViewState = "EXPLORE" | "REVEAL" | "SCAN";

const FALLBACK_ELEVATION_DEG = 30;
const PROXIMITY_FULL_DEG = 30;
const PROXIMITY_EPSILON = 0.01;

type Pose = {
  position: THREE.Vector3;
  target: THREE.Vector3;
  up: THREE.Vector3;
  zoom: number;
};

function elevationRad(elevationDeg: number): number {
  const deg = Number.isFinite(elevationDeg) ? elevationDeg : FALLBACK_ELEVATION_DEG;
  return (Math.min(ELEVATION_MAX_DEG, Math.max(ELEVATION_MIN_DEG, deg)) * Math.PI) / 180;
}

function revealDirection(elevationDeg: number): THREE.Vector3 {
  const phi = elevationRad(elevationDeg);
  const c = Math.cos(phi);
  return new THREE.Vector3(c / Math.SQRT2, Math.sin(phi), c / Math.SQRT2);
}

// Matches the solver's basis: direction (cos φ/√2, sin φ, cos φ/√2), world up +Y.
function revealPose(
  plane: number,
  elevationDeg: number,
  width: number,
  height: number,
): Pose {
  const phi = elevationRad(elevationDeg);
  const s = Math.sin(phi);
  const c = Math.cos(phi);
  const dir = revealDirection(elevationDeg);
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

// Explore orbits revealTarget, so fit the sphere around it that holds every block and the
// plane's corners: every orbit angle then frames the sculpture whole.
function exploreZoom(
  plane: number,
  blocks: Block[],
  size: number,
  target: THREE.Vector3,
  width: number,
  height: number,
): number {
  const h = plane / 2;
  const off = (size - 1) / 2;
  const p = new THREE.Vector3();
  let r = 0;
  for (const x of [-h, h]) for (const z of [-h, h]) r = Math.max(r, target.distanceTo(p.set(x, 0, z)));
  // Block centre plus its half-diagonal (1 x 1.6 x 1 box) covers every corner.
  for (const b of blocks) r = Math.max(r, target.distanceTo(p.set(b.x - off, b.y, b.z - off)) + 1.07);
  return (Math.min(width, height) / (2 * r)) * FIT_MARGIN;
}

/** 1 at the reveal direction, falling linearly to 0 at 30° away. */
export function proximityFor(angleRad: number): number {
  return Math.max(0, Math.min(1, 1 - (angleRad * 180) / Math.PI / PROXIMITY_FULL_DEG));
}

export default function CameraRig({
  state,
  size,
  elevationDeg,
  blocks,
  onProximityChange,
  onSettled,
}: {
  state: ViewState;
  size: number;
  elevationDeg: number;
  /** Frames the Explore orbit. */
  blocks: Block[];
  onProximityChange: (p: number) => void;
  /** Fired when a state tween completes, and on instant placement. */
  onSettled?: (state: ViewState) => void;
}) {
  const camRef = useRef<THREE.OrthographicCamera>(null);
  const { width, height } = useThree((s) => s.size);
  const plane = size + QUIET_ZONE * 2;
  const [readyState, setReadyState] = useState<ViewState | null>(null);
  const controlsOn = readyState === state;
  const placed = useRef(false);
  const lastProximity = useRef(-1);
  const sizeRef = useRef({ width, height });
  // Read at tween time so an input change alone never restarts the camera.
  const blocksRef = useRef(blocks);
  useEffect(() => {
    blocksRef.current = blocks;
  }, [blocks]);
  // Tween end zoom, computed once per tween (Explore's fit walks every block); a resize rescales it.
  const toZoom = useRef(0);
  const viewDir = useRef(new THREE.Vector3());
  const revealDir = useMemo(() => revealDirection(elevationDeg), [elevationDeg]);
  const revealTarget = useMemo(
    () => revealPose(plane, elevationDeg, 1, 1).target,
    [plane, elevationDeg],
  );

  // The camera sits 2·plane from a look-at within plane/2 of the origin; the scene fits in a sphere of
  // plane/√2 + tallest block. Their sum bounds every depth; 4·plane adds margin.
  const depth = useMemo(
    () => 4 * plane + blocks.reduce((m, b) => Math.max(m, b.y + HALF_BLOCK), 0),
    [plane, blocks],
  );

  const fitZoom = (s: ViewState) => {
    const { width: w, height: h } = sizeRef.current;
    if (s === "SCAN") return scanPose(plane, w, h).zoom;
    if (s === "EXPLORE") return exploreZoom(plane, blocksRef.current, size, revealTarget, w, h);
    return revealPose(plane, elevationDeg, w, h).zoom;
  };

  useEffect(() => {
    const cam = camRef.current;
    if (!cam) return;
    const to = state === "SCAN" ? scanPose(plane, sizeRef.current.width, sizeRef.current.height) : revealPose(plane, elevationDeg, sizeRef.current.width, sizeRef.current.height);
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
    toZoom.current = fitZoom(state);
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
        apply(pos, tgt, up, fromZoom + (toZoom.current - fromZoom) * p.t);
      },
      onComplete: () => {
        if (state === "EXPLORE") setReadyState(state);
        onSettled?.(state);
      },
    });
    return () => {
      tween.kill();
    };
    // Size is read through sizeRef so a resize never restarts the tween.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, plane, elevationDeg]);

  // A resize only rescales zoom, preserving any orbit/zoom the user has made.
  useEffect(() => {
    const prev = sizeRef.current;
    if (prev.width === width && prev.height === height) return;
    const cam = camRef.current;
    const before = fitZoom(state);
    sizeRef.current = { width, height };
    if (!cam) return;
    const k = fitZoom(state) / before;
    cam.zoom *= k;
    toZoom.current *= k;
    cam.updateProjectionMatrix();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  useFrame(() => {
    const cam = camRef.current;
    if (!cam || state !== "EXPLORE" || !controlsOn) return;
    // View direction, not position: panning moves camera and target together without changing the view.
    const angle = cam.getWorldDirection(viewDir.current).negate().angleTo(revealDir);
    const p = proximityFor(angle);
    if (Math.abs(p - lastProximity.current) >= PROXIMITY_EPSILON) {
      lastProximity.current = p;
      onProximityChange(p);
    }
  });

  return (
    <>
      <OrthographicCamera ref={camRef} makeDefault near={-depth} far={depth} />
      {state === "EXPLORE" && controlsOn && (
        <OrbitControls makeDefault target={revealTarget.toArray()} />
      )}
    </>
  );
}
