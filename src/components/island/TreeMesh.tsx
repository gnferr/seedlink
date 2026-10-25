"use client";

import { useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { extraPose, voxelPose, type FoldPlan, type Pose } from "@/lib/fold";
import { INK, leafShade, PALETTES } from "@/lib/palette";
import type { DarkModule } from "@/lib/qr";
import { hash3 } from "@/lib/rng";
import type { Season } from "@/lib/seasons";
import type { Tree } from "@/lib/tree";
import type { FoldState } from "./IslandScene";

const pose: Pose = { x: 0, y: 0, z: 0, sx: 1, sy: 1, sz: 1, rotY: 0, ink: 0 };
const ROOT_HEIGHT = 0.6;
const dummy = new THREE.Object3D();
const colour = new THREE.Color();
const ink = new THREE.Color(INK);

function write(mesh: THREE.InstancedMesh, i: number, p: Pose, root = false) {
  dummy.position.set(p.x, p.y, p.z);
  dummy.rotation.set(0, p.rotY, p.rotY * 0.5);
  // A collapsed instance still needs an invertible matrix for raycasts.
  dummy.scale.set(p.sx || 1e-4, (p.sy || 1e-4) * (root ? ROOT_HEIGHT : 1), p.sz || 1e-4);
  dummy.updateMatrix();
  mesh.setMatrixAt(i, dummy.matrix);
}

/** The tree at the fold time in `fold` (0 = standing tree), plus the extra module blocks that rise from the slab. */
export default function TreeMesh({
  tree,
  plan,
  dark,
  season,
  leaf,
  fold,
  reducedMotion,
  meshRef,
}: {
  tree: Tree;
  plan: FoldPlan;
  dark: DarkModule[];
  season: Season;
  leaf: string | null;
  fold: RefObject<FoldState>;
  reducedMotion: boolean;
  /** The tree voxels mesh, for tap raycasts. */
  meshRef: RefObject<THREE.InstancedMesh | null>;
}) {
  const voxels = tree.voxels;
  const extras = useRef<THREE.InstancedMesh>(null);
  const last = useRef<{ t: number; colours: unknown; mesh: unknown; extras: unknown; sway: boolean }>({ t: NaN, colours: null, mesh: null, extras: null, sway: false });

  const colours = useMemo(() => {
    const p = PALETTES[season];
    const base = leaf ?? p.leaf;
    const leaves = new Set(voxels.filter((v) => v.kind === "leaf").map((v) => `${v.x},${v.y},${v.z}`));
    return voxels.map((v) => {
      const c = new THREE.Color();
      if (v.kind === "trunk" || v.kind === "root") return c.set(p.trunk).multiplyScalar(0.8 + v.shade * 0.3);
      // Sunlit: no leaf voxel directly above.
      const sunlit = v.kind === "leaf" && !leaves.has(`${v.x},${v.y + 1},${v.z}`);
      c.set(leafShade(base, v.shade, sunlit));
      if (v.kind === "vine") c.multiplyScalar(0.85);
      if (season === "WINTER" && v.shade > 0.55) c.set("#ffffff");
      else if (season !== "WINTER" && hash3(v.x, v.y, v.z, 11) > 0.975) c.set("#ecf27a");
      return c;
    });
  }, [voxels, season, leaf]);

  // Matrices and ink colour every frame while 0 < t < 1, once on reaching 0 or 1; leaves also sway in the tree state.
  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const { t, poke } = fold.current;
    const sway = t === 0 && !reducedMotion;
    const l = last.current;
    const full = t !== l.t || colours !== l.colours || mesh !== l.mesh || extras.current !== l.extras;
    if (!full && !sway && !l.sway) return;
    const time = clock.elapsedTime;
    for (let i = 0; i < voxels.length; i++) {
      const v = voxels[i];
      voxelPose(plan, voxels, dark, i, t, pose);
      if (sway && (v.kind === "leaf" || v.kind === "vine")) {
        const w = (v.y / tree.top) ** 2;
        pose.x += Math.sin(time * 1.3 + v.x * 0.3 + v.z * 0.2) * 0.12 * w + Math.sin(time * 22) * poke * 0.3 * w;
        pose.z += Math.cos(time * 1.1 + v.z * 0.3) * 0.08 * w;
      }
      write(mesh, i, pose, v.kind === "root");
      if (full) mesh.setColorAt(i, colour.copy(colours[i]).lerp(ink, pose.ink));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (full && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    const ex = extras.current;
    if (ex && full) {
      plan.extras.forEach((j, i) => {
        write(ex, i, extraPose(dark[j], t, pose));
        ex.setColorAt(i, ink);
      });
      ex.instanceMatrix.needsUpdate = true;
      if (ex.instanceColor) ex.instanceColor.needsUpdate = true;
    }
    // Taps only raycast at rest, so the bounds are refreshed on arrival, not mid-flight.
    if (full && (t === 0 || t === 1)) {
      mesh.computeBoundingSphere();
      ex?.computeBoundingSphere();
    }
    Object.assign(l, { t, colours, mesh, extras: ex, sway });
  });

  return (
    <>
      <instancedMesh key={`b${voxels.length}`} ref={meshRef} args={[undefined, undefined, voxels.length]} frustumCulled={false}>
        <boxGeometry />
        <meshLambertMaterial />
      </instancedMesh>
      {plan.extras.length > 0 && (
        <instancedMesh key={`e${plan.extras.length}`} ref={extras} args={[undefined, undefined, plan.extras.length]}>
          <boxGeometry />
          <meshLambertMaterial />
        </instancedMesh>
      )}
    </>
  );
}
