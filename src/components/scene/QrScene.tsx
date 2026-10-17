"use client";

import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { createEnvironment } from "@/lib/motion";
import { QUIET_ZONE } from "@/lib/qr";
import type { Block } from "@/lib/solver";
import type { Theme } from "@/lib/themes";
import type { Season } from "@/lib/seasons";
import Blocks from "./Blocks";
import CameraRig, { type ViewState } from "./CameraRig";
import EnvironmentDriver from "./EnvironmentDriver";

export default function QrScene({
  blocks,
  size,
  theme,
  state,
  elevationDeg,
  onProximityChange,
  onCanvasReady,
  onSettled,
  ambientMotion = true,
  season = "SUMMER",
  shakeTick = 0,
}: {
  blocks: Block[];
  size: number;
  theme: Theme;
  state: ViewState;
  elevationDeg: number;
  onProximityChange: (p: number) => void;
  onCanvasReady: (canvas: HTMLCanvasElement) => void;
  onSettled?: (state: ViewState) => void;
  ambientMotion?: boolean;
  season?: Season;
  shakeTick?: number;
}) {
  const env = useState(() => {
    const e = createEnvironment();
    // The app opens at the reveal pose (proximity 1), so the first frame must already be calm.
    e.gate.calm = 0;
    return e;
  })[0];
  const plane = size + QUIET_ZONE * 2;
  return (
    <Canvas
      gl={{ preserveDrawingBuffer: true }}
      onCreated={({ gl }) => onCanvasReady(gl.domElement)}
    >
      <color attach="background" args={[theme.background]} />
      {/* Three-point rig: dim fill, strong key from above-front, cool rim from behind. */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[-plane, plane * 1.5, plane]} intensity={2} />
      <directionalLight position={[plane, plane * 0.5, -plane]} intensity={0.8} color="#9ec5ff" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[plane, plane]} />
        <meshBasicMaterial color={theme.colorLight} />
      </mesh>
      {/* Rendered before Blocks so its useFrame (which sets calm) subscribes, and runs, first. */}
      <CameraRig
        state={state}
        size={size}
        elevationDeg={elevationDeg}
        blocks={blocks}
        onProximityChange={onProximityChange}
        onSettled={onSettled}
        env={env}
        ambientMotion={ambientMotion}
      />
      <Blocks blocks={blocks} size={size} theme={theme} flatten={state === "SCAN"} env={env} />
      <EnvironmentDriver
        env={env}
        season={season}
        state={state}
        background={theme.background}
        shakeTick={shakeTick}
      />
    </Canvas>
  );
}
