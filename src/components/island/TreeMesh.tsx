"use client";

import { useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { extraPose, voxelPose, type FoldPlan, type Pose } from "@/lib/fold";
import { INK, leafShade, PALETTES } from "@/lib/palette";
import type { DarkModule } from "@/lib/qr";
import { hash3 } from "@/lib/rng";
import type { Season } from "@/lib/seasons";
import type { Tree } from "@/lib/tree";
import { useInstances } from "./IslandMesh";

const pose: Pose = { x: 0, y: 0, z: 0, sx: 1, sy: 1, sz: 1, rotY: 0, ink: 0 };
const ROOT_HEIGHT = 0.6;

function applyPose(p: Pose, o: THREE.Object3D, root = false) {
  o.position.set(p.x, p.y, p.z);
  o.rotation.set(0, p.rotY, p.rotY * 0.5);
  // A collapsed instance still needs an invertible matrix for raycasts.
  o.scale.set(p.sx || 1e-4, (p.sy || 1e-4) * (root ? ROOT_HEIGHT : 1), p.sz || 1e-4);
}

/** The tree at fold time `t` (0 = standing tree), plus the extra module blocks that rise from the slab. */
export default function TreeMesh({
  tree,
  plan,
  dark,
  season,
  leaf,
  t = 0,
  meshRef,
}: {
  tree: Tree;
  plan: FoldPlan;
  dark: DarkModule[];
  season: Season;
  leaf: string | null;
  t?: number;
  /** The tree voxels mesh, for tap raycasts. */
  meshRef: RefObject<THREE.InstancedMesh | null>;
}) {
  const voxels = tree.voxels;
  const blocks = meshRef;
  const extras = useRef<THREE.InstancedMesh>(null);

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

  // shortcut: matrices are written once per t; Task 9 drives t per frame.
  useInstances(blocks, voxels.length, (i, o) => applyPose(voxelPose(plan, voxels, dark, i, t, pose), o, voxels[i].kind === "root"),
    (i, c) => c.copy(colours[i]), [voxels, plan, dark, t, colours]);
  useInstances(extras, plan.extras.length, (i, o) => applyPose(extraPose(dark[plan.extras[i]], t, pose), o),
    (_, c) => c.set(INK), [plan, dark, t]);

  return (
    <>
      <instancedMesh key={`b${voxels.length}`} ref={blocks} args={[undefined, undefined, voxels.length]}>
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
