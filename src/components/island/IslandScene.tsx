"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { planFold } from "@/lib/fold";
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
  const { text, matrix, season, leaf, insets, onPhase, onTap, onCanvasReady } = props;
  // shortcut: static tree state (t = 0); Task 9 drives the fold from `folded` and reports the other phases.
  const [phase] = useState<FoldPhase>("tree");
  useEffect(() => onPhase(phase), [phase, onPhase]);

  const world = useMemo(() => {
    const seed = hashString(text);
    const dark = darkModules(matrix);
    const tree = growTree(matrix.size);
    return { dark, tree, island: growIsland(seed, matrix.size), plan: planFold(tree.voxels, tree.top, dark, seed) };
  }, [text, matrix]);

  const treeRef = useRef<THREE.InstancedMesh>(null);
  const groundRef = useRef<THREE.Group>(null);
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
      <FoldCamera radius={world.island.radius} top={world.tree.top} bottomInset={insets.bottom} />
      <IslandMesh island={world.island} dark={world.dark} size={matrix.size} season={season} groupRef={groundRef} />
      <TreeMesh tree={world.tree} plan={world.plan} dark={world.dark} season={season} leaf={leaf} meshRef={treeRef} />
      <Taps phase={phase} tree={treeRef} ground={groundRef} onTap={onTap} />
    </Canvas>
  );
}
