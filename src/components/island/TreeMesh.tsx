"use client";

import { useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Toon, windAt } from "./toon";

const SUN_WARM = ["#1f4f45", "#2f6b4a", "#4a8a48", "#7fb04a", "#b8d062", "#e2e88a"];
const SUN_COOL = ["#1c4a52", "#28644f", "#3d7f57", "#5f9e5c", "#8fbf6a", "#bfdc8a"];
const BLOSSOM = "#fff6dc", BERRY = "#f08a6a";
const PALE = new THREE.Color("#f4f6d8"); // a leaf flipped by the gust shows its paler underside
const LEAN = 0.1; // crown tip lean per unit of wind, as a share of the tree's height ("soft")
import { cardShown, inkPose, piecePose, type FoldPiece, type FoldPlan, type Pose } from "@/lib/fold";
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

/** Springs piece `i`'s wind lean (x, z, and their speeds in `s`) toward the wind's push, overshooting a little as a gust passes. */
function spring(s: Float32Array, i: number, tx: number, tz: number, dt: number) {
  const o = i * 4;
  s[o + 2] += ((tx - s[o]) * 18 - s[o + 2] * 4.5) * dt;
  s[o + 3] += ((tz - s[o + 1]) * 18 - s[o + 3] * 4.5) * dt;
  s[o] += s[o + 2] * dt;
  s[o + 1] += s[o + 3] * dt;
}

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
  const last = useRef({ t: NaN, look: null as unknown, plan: null as unknown, cm: null as unknown, sm: null as unknown, im: null as unknown, sway: false });
  const map = useMemo(() => leafTexture(), []);

  // Per-instance colour and the cards shown this season (beyond leafKeep, or specks with no colour, are hidden).
  const look = useMemo(() => {
    const c = treeColours(season, tree.species, leaf);
    const pick = (ramp: string[], v: number) => ramp[Math.min(ramp.length - 1, Math.max(0, Math.floor(v * ramp.length)))];
    // Summer crowns (unless a leaf colour is picked) light from sunlit tops to shaded insides, in warm and cool
    // clusters, with the odd blossom or berry.
    const sunny = season === "SUMMER" && !leaf;
    const top = Math.max(1, ...cards.map((k) => k.y));
    const cardColour = cards.map((k, i) => {
      if (k.speck) return c.speck ?? "#000";
      if (!sunny) return pick(c.leaves, k.shade);
      if (hash3(i, 11, 3) > 0.94) return hash3(i, 12, 3) > 0.5 ? BLOSSOM : BERRY;
      const warm = hash3(Math.floor(k.x / 3), 7, Math.floor(k.z / 3)) > 0.5;
      return pick(warm ? SUN_WARM : SUN_COOL, 0.45 * k.shade + 0.55 * (k.y / top));
    });
    const shown = cards.map((k, i) => (k.speck ? c.speck !== null : cardShown(i, c.leafKeep)));
    const segColour = segments.map((g, j) => {
      const len = Math.hypot(g.x1 - g.x0, g.y1 - g.y0, g.z1 - g.z0), r = (g.r0 + g.r1) / 2;
      // Snow lies on the flatter limbs; birch bark gets dark marks; thin limbs are twig-coloured.
      if (c.snowCap && Math.abs(g.y1 - g.y0) < len * 0.6) return c.snowCap;
      if (c.barkMarks && r > 0.15 && hash3(j, 5, 9, 31) < 0.3) return c.barkMarks;
      if (sunny && !c.barkMarks) return r < 0.18 ? "#5a3a26" : hash3(j, 6, 9, 31) < 0.3 ? "#8a5a3a" : "#6b4630"; // warm bark, light streaks
      return r < 0.18 ? c.twig : c.bark;
    });
    const pale = cardColour.map((h) => new THREE.Color(h).lerp(PALE, 0.45));
    return { cardColour, pale, shown, segColour };
  }, [season, leaf, tree.species, cards, segments]);

  // Segment rest shape: unit box -> length along the limb, width from its radii.
  const segBase = useMemo(() => segments.map((g) => {
    dir.set(g.x1 - g.x0, g.y1 - g.y0, g.z1 - g.z0);
    const len = dir.length() || 1e-3;
    return { len, width: g.r0 + g.r1, q: new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()) };
  }), [segments]);

  // Each piece's springy wind lean, and which leaves the gust has flipped.
  const gusts = useRef({ lean: new Float32Array(0), flipped: new Uint8Array(0) });

  // Matrices every frame while 0 < t < 1, once on reaching 0 or 1 or on a change; in the tree state the crown and
  // limbs ride the garden's wind every frame (the gust rolls through the crown, flipping some leaves pale).
  useFrame(({ clock }, delta) => {
    const cm = cardMesh.current, sm = segMesh.current, im = inkMesh.current;
    if (!cm || !sm || !im) return;
    const { t, poke } = fold.current;
    const sway = t === 0 && !reducedMotion;
    const l = last.current;
    const recolour = look !== l.look || cm !== l.cm || sm !== l.sm;
    const full = t !== l.t || recolour || plan !== l.plan || im !== l.im;
    if (!full && !sway && !l.sway) return;
    const time = clock.elapsedTime, n = cards.length, dt = Math.min(delta, 0.05), reach = tree.top * LEAN;
    if (gusts.current.lean.length !== (n + segments.length) * 4) gusts.current = { lean: new Float32Array((n + segments.length) * 4), flipped: new Uint8Array(n) };
    const { lean, flipped } = gusts.current;
    let flips = false;

    for (let i = 0; i < n; i++) {
      const k = cards[i];
      piecePose(plan, pieces, dark, i, t, pose);
      let flip = 0;
      if (sway && !k.speck) {
        const w = (k.y / tree.top) ** 2, ph = (i * 2.39) % 6.28;
        const [wx, wz] = windAt(k.x, k.z), gust = Math.min(1, Math.max(0, (Math.hypot(wx, wz) - 0.3) / 1.5));
        spring(lean, i, wx * w * reach, wz * w * reach, dt);
        pose.x += lean[i * 4] + (Math.sin(time * 9 + ph) * 0.05 * (1 + gust * 4) + Math.sin(time * 22) * poke * 0.3) * w;
        pose.y += Math.cos(time * 7 + ph) * 0.04 * (1 + gust * 3) * w;
        pose.z += lean[i * 4 + 1];
        flip = gust * Math.sin(time * 11 + ph * 3) > 0.35 ? 1 : 0;
      }
      card.position.set(pose.x, pose.y, pose.z);
      card.rotation.set(k.tilt, k.rotY + pose.rotY, pose.rotY * 0.5);
      card.scale.setScalar(nz(look.shown[i] ? k.size * pose.sx : 0));
      card.updateMatrix();
      cm.setMatrixAt(i, card.matrix);
      if (recolour || flip !== flipped[i]) {
        cm.setColorAt(i, flip ? look.pale[i] : colour.set(look.cardColour[i]));
        flipped[i] = flip;
        flips = true;
      }
    }
    cm.instanceMatrix.needsUpdate = true;
    if (flips && cm.instanceColor) cm.instanceColor.needsUpdate = true;

    if (full || sway || l.sway) {
      for (let j = 0; j < segments.length; j++) {
        const b = segBase[j], g = segments[j];
        piecePose(plan, pieces, dark, n + j, t, pose);
        if (sway) {
          const mx = (g.x0 + g.x1) / 2, mz = (g.z0 + g.z1) / 2, w = ((g.y0 + g.y1) / 2 / tree.top) ** 2;
          const [wx, wz] = windAt(mx, mz);
          spring(lean, n + j, wx * w * reach, wz * w * reach, dt);
          pose.x += lean[(n + j) * 4];
          pose.z += lean[(n + j) * 4 + 1];
        }
        dummy.position.set(pose.x, pose.y, pose.z);
        dummy.quaternion.copy(b.q).premultiply(spin.setFromAxisAngle(UP, pose.rotY));
        dummy.scale.set(nz(b.width * pose.sx), nz(b.len * pose.sx), nz(b.width * pose.sx));
        dummy.updateMatrix();
        sm.setMatrixAt(j, dummy.matrix);
        if (recolour) sm.setColorAt(j, colour.set(look.segColour[j]));
      }
      sm.instanceMatrix.needsUpdate = true;
      if (recolour && sm.instanceColor) sm.instanceColor.needsUpdate = true;
    }

    if (full) {
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
    l.cm = cm; l.sm = sm; l.im = im;
    l.sway = sway;
  });

  return (
    <>
      <group ref={groupRef}>
        <instancedMesh key={`c${cards.length}`} ref={cardMesh} args={[undefined, undefined, cards.length]} frustumCulled={false}>
          <planeGeometry />
          <Toon map={map} alphaTest={0.5} side={THREE.DoubleSide} />
        </instancedMesh>
        <instancedMesh key={`s${segments.length}`} ref={segMesh} args={[undefined, undefined, segments.length]} frustumCulled={false}>
          <boxGeometry />
          <Toon />
        </instancedMesh>
      </group>
      <instancedMesh key={`i${dark.length}`} ref={inkMesh} args={[undefined, undefined, dark.length]} frustumCulled={false}>
        <boxGeometry />
        <meshBasicMaterial color={INK} />
      </instancedMesh>
    </>
  );
}
