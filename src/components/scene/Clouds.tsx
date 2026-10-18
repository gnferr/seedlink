"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CLOUD_WRAP, cloudAcross, cloudFade, cloudOffset, meadowLayout, type Cloud } from "@/lib/meadow";
import type { Environment } from "@/lib/motion";
import { wrapPhase } from "@/lib/seasons";
import { cloudColour } from "@/lib/world";

const THICKNESS = 0.3; // of a cloud's depth
const noRaycast = () => null;
const o = new THREE.Object3D();

// Face shades baked into vertex colours, since the material is unlit: tops brightest, so the blocks read.
function shadeFaces(g: THREE.BufferGeometry) {
  const n = g.getAttribute("normal");
  const shade = new Float32Array(n.count * 3);
  for (let i = 0; i < n.count; i++) {
    const v = n.getY(i) > 0.5 ? 1 : n.getY(i) < -0.5 ? 0.72 : Math.abs(n.getZ(i)) > 0.5 ? 0.88 : 0.8;
    shade.fill(v, i * 3, i * 3 + 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(shade, 3));
  return g;
}

function cloudGeometry() {
  // A flat slab with a smaller block on top, in unit size; each instance scales it to its cloud.
  const parts = [new THREE.BoxGeometry(1, 1, 1), new THREE.BoxGeometry(0.5, 0.7, 0.6).translate(-0.12, 0.6, 0.05)];
  const g = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  return shadeFaces(g);
}

// `across` holds each cloud's absolute lane position, so it wraps at the lane ends, off frame.
function place(mesh: THREE.InstancedMesh, clouds: Cloud[], across: Float64Array, wrapAt: number) {
  for (let i = 0; i < clouds.length; i++) {
    const c = clouds[i];
    // Drift runs along the Reveal screen's right, world (1, 0, -1)/√2, the slab's `across` axis.
    const s = (across[i] - cloudAcross(c)) / Math.SQRT2;
    const k = cloudFade(across[i], wrapAt);
    o.position.set(c.x + s, c.y, c.z - s);
    o.rotation.set(0, Math.PI / 4, 0);
    o.scale.set(c.w * k, c.d * THICKNESS * k, c.d * k);
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

function buildClouds(plane: number) {
  const clouds = meadowLayout(plane).clouds;
  const wrapAt = CLOUD_WRAP * plane;
  const geometry = cloudGeometry();
  // Unlit and not tone-mapped: cloud tops show the season's cloud hex whatever the lights do. Drawn first and
  // without depth, clouds are part of the sky: anything else in the scene covers them, from every orbit angle.
  const material = new THREE.MeshBasicMaterial({ toneMapped: false, vertexColors: true, depthTest: false, depthWrite: false });
  const mesh = new THREE.InstancedMesh(geometry, material, clouds.length);
  const across = new Float64Array(clouds.length);
  const reset = () => {
    for (let i = 0; i < clouds.length; i++) across[i] = cloudAcross(clouds[i]);
    place(mesh, clouds, across, wrapAt);
  };
  reset();
  mesh.frustumCulled = false; // instances drift past the static bounds
  mesh.raycast = noRaycast;
  mesh.renderOrder = -1;
  return {
    mesh,
    material,
    /** Back to the laid-out positions, so every Reveal shows the tuned frame. */
    reset,
    step(dt: number, drive: number) {
      for (let i = 0; i < clouds.length; i++) across[i] = cloudOffset(across[i], dt, clouds[i].speed, drive, wrapAt);
      place(mesh, clouds, across, wrapAt);
    },
    dispose() {
      mesh.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}

/** Blocky clouds behind the tree. They drift only while stateGain · calm > 0, so still frames stay bit-still. */
export default function Clouds({ plane, env, reveal }: { plane: number; env: Environment; reveal: boolean }) {
  const sky = useMemo(() => buildClouds(plane), [plane]);
  useEffect(() => () => sky.dispose(), [sky]);
  // Snaps back while the camera tweens to Reveal; once there, drive is 0 and nothing moves.
  useEffect(() => {
    if (reveal) sky.reset();
  }, [reveal, sky]);
  const applied = useRef({ sky: null as typeof sky | null, phase: NaN });

  useFrame((_, dt) => {
    const a = applied.current;
    const phase = wrapPhase(env.phase.value);
    if (a.sky !== sky || a.phase !== phase) {
      sky.material.color.set(cloudColour(phase));
      a.sky = sky;
      a.phase = phase;
    }
    const drive = env.gate.stateGain * env.gate.calm;
    if (drive > 0) sky.step(dt, drive);
  });

  return <primitive object={sky.mesh} />;
}
