"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, OrthographicCamera } from "@react-three/drei";
import gsap from "gsap";
import * as THREE from "three";
import { HALF_BLOCK } from "@/lib/blockGeometry";
import { QUIET_ZONE } from "@/lib/qr";
import type { Block } from "@/lib/solver";
import { FIT_MARGIN, scanFit, type ScanInsets } from "@/lib/scanFit";
import { ELEVATION_MAX_DEG, ELEVATION_MIN_DEG } from "@/lib/solver";
import { RAMP_DOWN_SECONDS, RAMP_UP_SECONDS, calmFor, type Environment } from "@/lib/motion";
import { killStateGainTween, rampStateGain, restGate, setCalm, stillGate } from "@/lib/motionTweens";

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

// Straight down, framed to the free band between the controls (the same fit the sampler uses). Screen-down is
// +z, so looking dy/zoom units toward -z puts the pad centre dy px below the view centre.
function scanPose(plane: number, width: number, height: number, insets: ScanInsets): Pose {
  const { zoom, dy } = scanFit(width, height, plane, insets);
  const shift = -dy / zoom;
  return {
    position: new THREE.Vector3(0, plane * 2, shift),
    target: new THREE.Vector3(0, 0, shift),
    up: new THREE.Vector3(0, 0, -1),
    zoom,
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
  env,
  ambientMotion,
  scanInsets,
}: {
  state: ViewState;
  size: number;
  elevationDeg: number;
  /** CSS px covered by controls at the top and bottom; only the Scan framing uses them. */
  scanInsets: ScanInsets;
  /** Frames the Explore orbit. */
  blocks: Block[];
  onProximityChange: (p: number) => void;
  /** Fired when a state tween completes, and on instant placement; for Reveal/Scan only once the gate is at exact rest. */
  onSettled?: (state: ViewState) => void;
  env: Environment;
  ambientMotion: boolean;
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
  const toPose = useRef<Pose | null>(null);
  const scanInsetKey = state === "SCAN" ? `${scanInsets.top}|${scanInsets.bottom}` : "";
  const viewDir = useRef(new THREE.Vector3());
  const revealDir = useMemo(() => revealDirection(elevationDeg), [elevationDeg]);
  const revealTarget = useMemo(
    () => revealPose(plane, elevationDeg, 1, 1).target,
    [plane, elevationDeg],
  );

  // The camera sits 2·plane from a look-at within plane/2 of the origin. The meadow slab's farthest corner is
  // hypot(5, 2.25)·plane ≈ 5.48·plane from the origin; its 6-unit depth is covered by the tallest block term.
  // 2 + 0.5 + 5.48 < 8.5, so 8.5·plane bounds every depth at any orbit angle.
  const depth = useMemo(
    () => 8.5 * plane + blocks.reduce((m, b) => Math.max(m, b.y + HALF_BLOCK), 0),
    [plane, blocks],
  );

  const fitZoom = (s: ViewState) => {
    const { width: w, height: h } = sizeRef.current;
    if (s === "SCAN") return scanPose(plane, w, h, scanInsets).zoom;
    if (s === "EXPLORE") return exploreZoom(plane, blocksRef.current, size, revealTarget, w, h);
    return revealPose(plane, elevationDeg, w, h).zoom;
  };

  useEffect(() => {
    const cam = camRef.current;
    if (!cam) return;
    const to = state === "SCAN" ? scanPose(plane, sizeRef.current.width, sizeRef.current.height, scanInsets) : revealPose(plane, elevationDeg, sizeRef.current.width, sizeRef.current.height);
    toPose.current = to;
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
    const still = state !== "EXPLORE";
    if (still) {
      stillGate(env, instant ? 0 : RAMP_DOWN_SECONDS);
      setCalm(env, 0);
    } else killStateGainTween(env);

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
        // Read through the ref: a resize in Scan re-aims the end pose mid-tween.
        const end = toPose.current ?? to;
        pos.lerpVectors(fromPos, end.position, p.t);
        tgt.lerpVectors(fromTarget, end.target, p.t);
        up.lerpVectors(fromUp, end.up, p.t).normalize();
        apply(pos, tgt, up, fromZoom + (toZoom.current - fromZoom) * p.t);
      },
      onComplete: () => {
        if (still) restGate(env);
        else {
          rampStateGain(env, 1, reduced ? 0 : RAMP_UP_SECONDS);
          setReadyState(state);
        }
        onSettled?.(state);
      },
    });
    return () => {
      tween.kill();
      killStateGainTween(env);
    };
    // Size is read through sizeRef so a resize never restarts the tween. Insets only re-tween in Scan, the one
    // pose that uses them (the page's camKey carries the same Scan-only key, so the settle stays honest).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, plane, elevationDeg, scanInsetKey]);

  // A resize only rescales zoom, preserving any orbit/zoom the user has made. Scan has no orbit, and its
  // centring depends on the size, so it is re-aimed whole.
  useEffect(() => {
    const prev = sizeRef.current;
    if (prev.width === width && prev.height === height) return;
    const cam = camRef.current;
    const before = fitZoom(state);
    sizeRef.current = { width, height };
    if (!cam) return;
    if (state === "SCAN") {
      const to = scanPose(plane, width, height, scanInsets);
      toPose.current = to;
      toZoom.current = to.zoom;
      cam.position.copy(to.position);
      cam.up.copy(to.up);
      cam.zoom = to.zoom;
      cam.lookAt(to.target);
      cam.updateProjectionMatrix();
      return;
    }
    const k = fitZoom(state) / before;
    cam.zoom *= k;
    toZoom.current *= k;
    cam.updateProjectionMatrix();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  useFrame(() => {
    const cam = camRef.current;
    if (!cam || state !== "EXPLORE") return;
    // View direction, not position: panning moves camera and target together without changing the view.
    const angle = cam.getWorldDirection(viewDir.current).negate().angleTo(revealDir);
    const p = proximityFor(angle);
    setCalm(env, ambientMotion ? calmFor(p) : 0);
    if (controlsOn && Math.abs(p - lastProximity.current) >= PROXIMITY_EPSILON) {
      lastProximity.current = p;
      onProximityChange(p);
    }
  });

  return (
    <>
      <OrthographicCamera ref={camRef} makeDefault near={-depth} far={depth} />
      {state === "EXPLORE" && controlsOn && (
        // No lower than Reveal's lowest elevation: below it the meadow slab hides the sculpture or ends in the frame.
        <OrbitControls makeDefault target={revealTarget.toArray()} maxPolarAngle={Math.PI / 2 - (ELEVATION_MIN_DEG * Math.PI) / 180} />
      )}
    </>
  );
}
