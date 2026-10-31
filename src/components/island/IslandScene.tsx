"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import * as THREE from "three";
import { easeInOutCubic, FOLD_SECONDS, foldPieces, planFold } from "@/lib/fold";
import { growIsland } from "@/lib/island";
import { treeColours } from "@/lib/palette";
import { isTap, nextFoldTarget } from "@/lib/pointer";
import { darkModules, modulePitch, type QrMatrix } from "@/lib/qr";
import { hashString } from "@/lib/rng";
import type { ScanInsets } from "@/lib/scanFit";
import type { Season } from "@/lib/seasons";
import type { FoldPhase } from "@/lib/status";
import { fitTree, growTree, treeFor, type Species } from "@/lib/tree";
import FoldCamera from "./FoldCamera";
import IslandMesh from "./IslandMesh";
import Life from "./Life";
import Particles from "./Particles";
import SkyDome from "./SkyDome";
import { tapMeadow, Wind } from "./toon";
import SkyLights from "./SkyLights";
import TreeMesh from "./TreeMesh";

export type IslandSceneProps = {
  text: string; matrix: QrMatrix; season: Season; leaf: string | null;
  time: number;                  // 0 = 06:00 .. 1 = 23:00 (see daycycle)
  folded: boolean;               // target state owned by the page
  reducedMotion: boolean;
  insets: ScanInsets;            // CSS px covered by the controls (top, bottom)
  onPhase(phase: FoldPhase): void; // "folded" is reported only once the camera has settled top-down
  onTap(action: "fold" | "grow" | "poke"): void;
  onCanvasReady(canvas: HTMLCanvasElement): void;
  onTree(species: Species, seed: number): void; // the link's tree began growing
};

/** Shared per-frame fold state: `t` drives the blocks, `cam` the camera tween (both 0 = tree, 1 = folded). */
export type FoldState = { t: number; cam: number; poke: number };

const toward = (v: number, target: number, step: number) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));

/**
 * The one fold clock: eases `t` and the camera toward `folded` over FOLD_SECONDS (instantly with reduced
 * motion), bobs the island, decays the poke, and reports phases. A new world restarts at t = 1 and grows.
 */
function Timeline({ foldRef, folded, reducedMotion, world, bobRef, ratio, setPhase, onPhase }: {
  foldRef: RefObject<FoldState>; folded: boolean; reducedMotion: boolean; world: unknown;
  bobRef: RefObject<THREE.Group | null>; ratio: number;
  setPhase(phase: FoldPhase): void; onPhase(phase: FoldPhase): void;
}) {
  const seen = useRef(world);
  const s = useRef<{ phase: FoldPhase | null; reported: FoldPhase | null; armed: boolean }>({ phase: null, reported: null, armed: false });
  useFrame(({ gl, clock }, delta) => {
    const f = foldRef.current;
    if (seen.current !== world) {
      seen.current = world;
      f.t = 1; // the tree grows out of the new code
    }
    const target = folded ? 1 : 0;
    const step = reducedMotion ? 1 : Math.min(delta, 0.1) / FOLD_SECONDS;
    f.t = toward(f.t, target, step);
    f.cam = toward(f.cam, target, step);
    f.poke = reducedMotion ? 0 : f.poke * 0.93;
    if (bobRef.current) bobRef.current.position.y = reducedMotion ? 0 : Math.sin(clock.elapsedTime * 0.7) * 0.45 * (1 - easeInOutCubic(f.t));

    const settled = f.t === target && f.cam === target;
    const phase: FoldPhase = target ? (settled ? "folded" : "folding") : settled ? "tree" : "growing";
    const st = s.current;
    if (phase !== st.phase) {
      st.phase = phase;
      st.armed = false;
      setPhase(phase);
    }
    if (phase === st.reported) return;
    if (phase === "folded") {
      // Only once a frame has rendered at the full device ratio, so a check right after reads the crisp code.
      if (gl.getPixelRatio() !== ratio) return;
      if (!st.armed) {
        st.armed = true;
        return;
      }
    }
    st.reported = phase;
    onPhase(phase);
  }, -1);
  return null;
}

/** Pointer down/up on the canvas: a tap (not an orbit drag) raycasts the tree and the ground. */
function Taps({ phase, tree, ground, onTap }: {
  phase: FoldPhase;
  tree: RefObject<THREE.Object3D | null>;
  ground: RefObject<THREE.Object3D | null>;
  onTap(action: "fold" | "grow" | "poke", at?: THREE.Vector3): void;
}) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const raycaster = useThree((s) => s.raycaster);
  useEffect(() => {
    const el = gl.domElement;
    // A gesture that ever had two pointers down (a pinch) is never a tap.
    const active = new Set<number>();
    let down: { id: number; x: number; y: number; multi: boolean } | null = null;
    const onDown = (e: PointerEvent) => {
      active.add(e.pointerId);
      if (active.size === 1) down = { id: e.pointerId, x: e.clientX, y: e.clientY, multi: false };
      else if (down) down.multi = true;
    };
    // On window, so a pointer released off the canvas is forgotten too (bubbles after the canvas's onUp).
    const onRelease = (e: PointerEvent) => { active.delete(e.pointerId); };
    const onUp = (e: PointerEvent) => {
      const d = down;
      if (!d || d.id !== e.pointerId) return;
      down = null;
      const up = { x: e.clientX, y: e.clientY };
      if (d.multi || !isTap(d, up)) return;
      const r = el.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2(((up.x - r.left) / r.width) * 2 - 1, -((up.y - r.top) / r.height) * 2 + 1), camera);
      const t = tree.current ? raycaster.intersectObject(tree.current, true)[0] : undefined;
      const g = ground.current ? raycaster.intersectObject(ground.current, true)[0] : undefined;
      const hit = t && (!g || t.distance <= g.distance) ? "tree" : g ? "ground" : "none";
      const action = nextFoldTarget(phase, hit);
      // A meadow tap carries where it landed, in the island's own space.
      if (action) onTap(action, hit === "ground" && g && ground.current ? ground.current.worldToLocal(g.point.clone()) : undefined);
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    window.addEventListener("pointerup", onRelease);
    window.addEventListener("pointercancel", onRelease);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointerup", onRelease);
      window.removeEventListener("pointercancel", onRelease);
    };
  }, [gl, camera, raycaster, phase, tree, ground, onTap]);
  return null;
}

export default function IslandScene(props: IslandSceneProps) {
  const { text, matrix, season, leaf, time, folded, reducedMotion, insets, onPhase, onTap, onCanvasReady, onTree } = props;
  const [phase, setPhase] = useState<FoldPhase>(folded ? "folded" : "tree");
  const fold = useRef<FoldState>({ t: folded ? 1 : 0, cam: folded ? 1 : 0, poke: 0 });
  // The poke shake is the scene's; sound and everything else is the page's call.
  const tap = useCallback((action: "fold" | "grow" | "poke", at?: THREE.Vector3) => {
    if (action === "poke" && !reducedMotion) {
      fold.current.poke = 1;
      if (at) tapMeadow(at.x, at.z);
    }
    onTap(action);
  }, [onTap, reducedMotion]);

  // The link alone picks the tree, so a shared link always grows the same one; unfolding grows it back.
  const { species, seed: treeSeed } = useMemo(() => treeFor(text), [text]);
  useEffect(() => onTree(species, treeSeed), [species, treeSeed, onTree]);

  // The world is fixed at REF_SIZE; a longer link gets more, smaller modules on the same slab.
  const pitch = modulePitch(matrix.size);
  const dark = useMemo(() => darkModules(matrix, pitch), [matrix, pitch]);
  const island = useMemo(() => growIsland(hashString(text)), [text]);
  const tree = useMemo(() => fitTree(growTree(species, treeSeed), island.radius), [species, treeSeed, island.radius]);
  // The season's leafKeep changes the carriers (only shown leaves carry; winter cards never) but never the tree.
  const leafKeep = treeColours(season, species, null).leafKeep;
  const foldPlan = useMemo(() => {
    const pieces = foldPieces(tree, leafKeep);
    return { pieces, plan: planFold(pieces, tree.top, dark, treeSeed, pitch) };
  }, [tree, leafKeep, dark, treeSeed, pitch]);

  const treeRef = useRef<THREE.Group>(null);
  const groundRef = useRef<THREE.Group>(null);
  const bobRef = useRef<THREE.Group>(null);
  // Three-quarter pixels for the garden (sharp enough for ferns and grass, a little pixelated); the folded code renders
  // at the full device ratio so even the densest code samples cleanly.
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  // A device that drops frames gets half pixels in the garden and a still tree (its sway is most of the CPU work);
  // grass, clouds and animals keep moving, and both come back if it keeps up again. The folded code never drops.
  const [low, setLow] = useState(false);

  return (
    <Canvas
      flat
      gl={{ preserveDrawingBuffer: true, antialias: false }}
      dpr={phase === "folded" ? ratio : ratio * (low ? 0.5 : 0.75)}
      onCreated={({ gl }) => {
        gl.domElement.style.imageRendering = "pixelated";
        onCanvasReady(gl.domElement);
      }}
    >
      {/* Only the resting garden is timed, so start-up shader compiles and the grow and fold never count against it. */}
      {phase === "tree" && <PerformanceMonitor bounds={(hz) => (hz > 100 ? [60, 90] : [45, 55])} flipflops={3} onDecline={() => setLow(true)} onIncline={() => setLow(false)} onFallback={() => setLow(true)} />}
      <SkyDome time={time} season={season} reducedMotion={reducedMotion} />
      <Wind reducedMotion={reducedMotion} />
      <SkyLights time={time} fold={fold} radius={island.radius} reducedMotion={reducedMotion} />
      <Timeline foldRef={fold} folded={folded} reducedMotion={reducedMotion} world={tree} bobRef={bobRef} ratio={ratio} setPhase={setPhase} onPhase={onPhase} />
      <FoldCamera radius={island.radius} crownRadius={tree.crownRadius} size={matrix.size} insets={insets} fold={fold} orbit={phase === "tree"} />
      <group ref={bobRef}>
        <IslandMesh island={island} dark={dark} size={matrix.size} pitch={pitch} season={season} fold={fold} groupRef={groundRef} />
        <TreeMesh tree={tree} pieces={foldPlan.pieces} plan={foldPlan.plan} dark={dark} season={season} leaf={leaf} fold={fold} reducedMotion={reducedMotion} still={low} groupRef={treeRef} />
        {!reducedMotion && phase !== "folded" && <Particles tree={tree} season={season} time={time} fold={fold} />}
        {!reducedMotion && <Life time={time} season={season} half={island.slabHalf + 1} fold={fold} />}
      </group>
      <Taps phase={phase} tree={treeRef} ground={groundRef} onTap={tap} />
    </Canvas>
  );
}
