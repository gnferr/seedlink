"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { easeInOutCubic, FOLD_SECONDS, planFold } from "@/lib/fold";
import { growIsland } from "@/lib/island";
import { isTap, nextFoldTarget } from "@/lib/pointer";
import { darkModules, type QrMatrix } from "@/lib/qr";
import { hashString } from "@/lib/rng";
import type { ScanInsets } from "@/lib/scanFit";
import type { Season } from "@/lib/seasons";
import type { FoldPhase } from "@/lib/status";
import { growTree } from "@/lib/tree";
import FoldCamera from "./FoldCamera";
import IslandMesh from "./IslandMesh";
import Particles from "./Particles";
import SkyBackground from "./SkyBackground";
import TreeMesh from "./TreeMesh";

export type IslandSceneProps = {
  text: string; matrix: QrMatrix; season: Season; leaf: string | null;
  folded: boolean;               // target state owned by the page
  reducedMotion: boolean;
  insets: ScanInsets;            // CSS px covered by the controls (top, bottom)
  onPhase(phase: FoldPhase): void; // "folded" is reported only once the camera has settled top-down
  onTap(action: "fold" | "grow" | "poke"): void;
  onCanvasReady(canvas: HTMLCanvasElement): void;
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
  onTap: IslandSceneProps["onTap"];
}) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const raycaster = useThree((s) => s.raycaster);
  useEffect(() => {
    const el = gl.domElement;
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
    const onUp = (e: PointerEvent) => {
      const up = { x: e.clientX, y: e.clientY };
      if (!down || !isTap(down, up)) return;
      down = null;
      const r = el.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2(((up.x - r.left) / r.width) * 2 - 1, -((up.y - r.top) / r.height) * 2 + 1), camera);
      const t = tree.current ? raycaster.intersectObject(tree.current, true)[0] : undefined;
      const g = ground.current ? raycaster.intersectObject(ground.current, true)[0] : undefined;
      const hit = t && (!g || t.distance <= g.distance) ? "tree" : g ? "ground" : "none";
      const action = nextFoldTarget(phase, hit);
      if (action) onTap(action);
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
    };
  }, [gl, camera, raycaster, phase, tree, ground, onTap]);
  return null;
}

export default function IslandScene(props: IslandSceneProps) {
  const { text, matrix, season, leaf, folded, reducedMotion, insets, onPhase, onTap, onCanvasReady } = props;
  const [phase, setPhase] = useState<FoldPhase>(folded ? "folded" : "tree");
  const fold = useRef<FoldState>({ t: folded ? 1 : 0, cam: folded ? 1 : 0, poke: 0 });
  // The poke shake is the scene's; sound and everything else is the page's call.
  const tap = useCallback((action: "fold" | "grow" | "poke") => {
    if (action === "poke" && !reducedMotion) fold.current.poke = 1;
    onTap(action);
  }, [onTap, reducedMotion]);

  const world = useMemo(() => {
    const seed = hashString(text);
    const dark = darkModules(matrix);
    const tree = growTree(matrix.size);
    return { dark, tree, island: growIsland(seed, matrix.size), plan: planFold(tree.voxels, tree.top, dark, seed) };
  }, [text, matrix]);

  const treeRef = useRef<THREE.InstancedMesh>(null);
  const groundRef = useRef<THREE.Group>(null);
  const bobRef = useRef<THREE.Group>(null);
  // Chunky half-resolution pixels for the tree; the folded code renders at the full device ratio.
  const ratio = Math.min(2, window.devicePixelRatio || 1);

  return (
    <Canvas
      flat
      gl={{ preserveDrawingBuffer: true, antialias: false }}
      dpr={phase === "folded" ? ratio : ratio * 0.5}
      onCreated={({ gl }) => {
        gl.domElement.style.imageRendering = "pixelated";
        onCanvasReady(gl.domElement);
      }}
    >
      <SkyBackground season={season} />
      <hemisphereLight args={["#b8b0ff", "#2a2140", 1.1]} />
      <directionalLight color="#fff4e0" intensity={1.6} position={[30, 50, -10]} />
      <directionalLight color="#9ec5ff" intensity={0.5} position={[-30, 20, 30]} />
      <Timeline foldRef={fold} folded={folded} reducedMotion={reducedMotion} world={world} bobRef={bobRef} ratio={ratio} setPhase={setPhase} onPhase={onPhase} />
      <FoldCamera radius={world.island.radius} top={world.tree.top} size={matrix.size} insets={insets} fold={fold} orbit={phase === "tree"} />
      <group ref={bobRef}>
        <IslandMesh island={world.island} dark={world.dark} size={matrix.size} season={season} fold={fold} reducedMotion={reducedMotion} groupRef={groundRef} />
        <TreeMesh tree={world.tree} plan={world.plan} dark={world.dark} season={season} leaf={leaf} fold={fold} reducedMotion={reducedMotion} meshRef={treeRef} />
        {!reducedMotion && phase !== "folded" && <Particles tree={world.tree} season={season} fold={fold} />}
      </group>
      <Taps phase={phase} tree={treeRef} ground={groundRef} onTap={tap} />
    </Canvas>
  );
}
