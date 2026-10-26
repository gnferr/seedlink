"use client";

import { useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { inkPose, piecePose, type FoldPiece, type FoldPlan, type Pose } from "@/lib/fold";
import { INK, treeColours } from "@/lib/palette";
import type { DarkModule } from "@/lib/qr";
import { hash3 } from "@/lib/rng";
import type { Season } from "@/lib/seasons";
import type { Tree } from "@/lib/tree";
import type { FoldState } from "./IslandScene";
import { leafTexture } from "./leafTexture";

const pose: Pose = { x: 0, y: 0, z: 0, sx: 1, sy: 1, sz: 1, rotY: 0, ink: 0 };
const dummy = new THREE.Object3D();
const card = new THREE.Object3D();
card.rotation.order = "YXZ"; // turn about the trunk axis, then tilt
const spin = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const dir = new THREE.Vector3();
const colour = new THREE.Color();
// A collapsed instance still needs an invertible matrix for raycasts.
const nz = (s: number) => s || 1e-4;

/** The tree (leaf cards and branch segments) at the fold time in `fold`, and one ink block per dark module. */
export default function TreeMesh({
  tree,
  pieces,
  plan,
  dark,
  season,
  leaf,
  fold,
  reducedMotion,
  groupRef,
}: {
  tree: Tree;
  pieces: FoldPiece[];
  plan: FoldPlan;
  dark: DarkModule[];
  season: Season;
  leaf: string | null;
  fold: RefObject<FoldState>;
  reducedMotion: boolean;
  /** Cards and segments, for tap raycasts. */
  groupRef: RefObject<THREE.Group | null>;
}) {
  const { cards, segments } = tree;
  const cardMesh = useRef<THREE.InstancedMesh>(null);
  const segMesh = useRef<THREE.InstancedMesh>(null);
  const inkMesh = useRef<THREE.InstancedMesh>(null);
  const last = useRef({ t: NaN, look: null as unknown, plan: null as unknown, meshes: [] as unknown[], sway: false });
  const map = useMemo(() => leafTexture(), []);

  // Per-instance colour and the cards shown this season (beyond leafKeep, or specks with no colour, are hidden).
  const look = useMemo(() => {
    const c = treeColours(season, tree.species, leaf);
    const cardColour = cards.map((k) => k.speck ? c.speck ?? "#000" : c.leaves[Math.min(c.leaves.length - 1, Math.floor(k.shade * c.leaves.length))]);
    const shown = cards.map((k, i) => (k.speck ? c.speck !== null : hash3(i, 17, 3, 29) < c.leafKeep));
    const segColour = segments.map((g, j) => {
      const len = Math.hypot(g.x1 - g.x0, g.y1 - g.y0, g.z1 - g.z0), r = (g.r0 + g.r1) / 2;
      // Snow lies on the flatter limbs; birch bark gets dark marks; thin limbs are twig-coloured.
      if (c.snowCap && Math.abs(g.y1 - g.y0) < len * 0.6) return c.snowCap;
      if (c.barkMarks && r > 0.15 && hash3(j, 5, 9, 31) < 0.3) return c.barkMarks;
      return r < 0.18 ? c.twig : c.bark;
    });
    return { cardColour, shown, segColour };
  }, [season, leaf, tree.species, cards, segments]);

  // Segment rest shape: unit box -> length along the limb, width from its radii.
  const segBase = useMemo(() => segments.map((g) => {
    dir.set(g.x1 - g.x0, g.y1 - g.y0, g.z1 - g.z0);
    const len = dir.length() || 1e-3;
    return { len, width: g.r0 + g.r1, q: new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()) };
  }), [segments]);

  // Matrices every frame while 0 < t < 1, once on reaching 0 or 1 or on a change; cards also sway in the tree state.
  useFrame(({ clock }) => {
    const cm = cardMesh.current, sm = segMesh.current, im = inkMesh.current;
    if (!cm || !sm || !im) return;
    const { t, poke } = fold.current;
    const sway = t === 0 && !reducedMotion;
    const l = last.current;
    const recolour = look !== l.look || cm !== l.meshes[0] || sm !== l.meshes[1];
    const full = t !== l.t || recolour || plan !== l.plan || im !== l.meshes[2];
    if (!full && !sway && !l.sway) return;
    const time = clock.elapsedTime, n = cards.length;

    for (let i = 0; i < n; i++) {
      const k = cards[i];
      piecePose(plan, pieces, dark, i, t, pose);
      if (sway && !k.speck) {
        const w = (k.y / tree.top) ** 2;
        pose.x += Math.sin(time * 1.3 + k.x * 0.3 + k.z * 0.2) * 0.12 * w + Math.sin(time * 22) * poke * 0.3 * w;
        pose.z += Math.cos(time * 1.1 + k.z * 0.3) * 0.08 * w;
      }
      card.position.set(pose.x, pose.y, pose.z);
      card.rotation.set(k.tilt, k.rotY + pose.rotY, pose.rotY * 0.5);
      card.scale.setScalar(nz(look.shown[i] ? k.size * pose.sx : 0));
      card.updateMatrix();
      cm.setMatrixAt(i, card.matrix);
      if (recolour) cm.setColorAt(i, colour.set(look.cardColour[i]));
    }
    cm.instanceMatrix.needsUpdate = true;
    if (recolour && cm.instanceColor) cm.instanceColor.needsUpdate = true;

    if (full) {
      for (let j = 0; j < segments.length; j++) {
        const b = segBase[j];
        piecePose(plan, pieces, dark, n + j, t, pose);
        dummy.position.set(pose.x, pose.y, pose.z);
        dummy.quaternion.copy(b.q).premultiply(spin.setFromAxisAngle(UP, pose.rotY));
        dummy.scale.set(nz(b.width * pose.sx), nz(b.len * pose.sx), nz(b.width * pose.sx));
        dummy.updateMatrix();
        sm.setMatrixAt(j, dummy.matrix);
        if (recolour) sm.setColorAt(j, colour.set(look.segColour[j]));
      }
      sm.instanceMatrix.needsUpdate = true;
      if (recolour && sm.instanceColor) sm.instanceColor.needsUpdate = true;

      for (let j = 0; j < dark.length; j++) {
        inkPose(plan, pieces, dark, j, t, pose);
        dummy.position.set(pose.x, pose.y, pose.z);
        dummy.rotation.set(0, pose.rotY, pose.rotY * 0.5);
        dummy.scale.set(nz(pose.sx), nz(pose.sy), nz(pose.sz));
        dummy.updateMatrix();
        im.setMatrixAt(j, dummy.matrix);
      }
      im.instanceMatrix.needsUpdate = true;
      // Taps only raycast at rest, so the bounds are refreshed on arrival, not mid-flight.
      if (t === 0 || t === 1) {
        cm.computeBoundingSphere();
        sm.computeBoundingSphere();
      }
    }
    l.t = t;
    l.look = look;
    l.plan = plan;
    l.meshes = [cm, sm, im];
    l.sway = sway;
  });

  return (
    <>
      <group ref={groupRef}>
        <instancedMesh key={`c${cards.length}`} ref={cardMesh} args={[undefined, undefined, cards.length]} frustumCulled={false}>
          <planeGeometry />
          <meshLambertMaterial map={map} alphaTest={0.5} side={THREE.DoubleSide} />
        </instancedMesh>
        <instancedMesh key={`s${segments.length}`} ref={segMesh} args={[undefined, undefined, segments.length]} frustumCulled={false}>
          <boxGeometry />
          <meshLambertMaterial />
        </instancedMesh>
      </group>
      <instancedMesh key={`i${dark.length}`} ref={inkMesh} args={[undefined, undefined, dark.length]} frustumCulled={false}>
        <boxGeometry />
        <meshBasicMaterial color={INK} />
      </instancedMesh>
    </>
  );
}
