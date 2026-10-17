"use client";

import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { createEnvironment } from "@/lib/motion";
import { QUIET_ZONE } from "@/lib/qr";
import type { Block } from "@/lib/solver";
import type { Theme } from "@/lib/themes";
import Blocks from "./Blocks";
import CameraRig, { type ViewState } from "./CameraRig";

export default function QrScene({
  blocks,
  size,
  theme,
  state,
  elevationDeg,
  onProximityChange,
  onCanvasReady,
  onSettled,
}: {
  blocks: Block[];
  size: number;
  theme: Theme;
  state: ViewState;
  elevationDeg: number;
  onProximityChange: (p: number) => void;
  onCanvasReady: (canvas: HTMLCanvasElement) => void;
  onSettled?: (state: ViewState) => void;
}) {
  const env = useState(() => createEnvironment())[0];
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
      <Blocks blocks={blocks} size={size} theme={theme} flatten={state === "SCAN"} env={env} />
      <CameraRig
        state={state}
        size={size}
        elevationDeg={elevationDeg}
        blocks={blocks}
        onProximityChange={onProximityChange}
        onSettled={onSettled}
      />
    </Canvas>
  );
}
