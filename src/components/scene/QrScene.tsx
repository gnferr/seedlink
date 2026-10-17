"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { blockBox } from "@/lib/blockGeometry";
import { createEnvironment } from "@/lib/motion";
import { PARTICLE_SETS, particleBounds, particleBudget, particleSize } from "@/lib/particles";
import { nextLayers } from "@/lib/particleLayers";
import { QUIET_ZONE } from "@/lib/qr";
import type { Block } from "@/lib/solver";
import type { Theme } from "@/lib/themes";
import type { Season } from "@/lib/seasons";
import Blocks from "./Blocks";
import CameraRig, { type ViewState } from "./CameraRig";
import EnvironmentDriver from "./EnvironmentDriver";
import ParticleLayer, { type Burst } from "./ParticleLayer";

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
    const e = createEnvironment(season);
    // The app opens at the reveal pose (proximity 1), so the first frame must already be calm.
    e.gate.calm = 0;
    return e;
  })[0];
  const plane = size + QUIET_ZONE * 2;

  const [budget] = useState(() =>
    particleBudget(window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 640),
  );
  const bounds = useMemo(() => {
    const off = (size - 1) / 2;
    const biggest = Math.max(...Object.values(PARTICLE_SETS).map((s) => particleSize(plane, s)));
    // blockBox's y is the pillar centre for grounded blocks; the block's own y reaches the top.
    return particleBounds(
      blocks.map((b) => {
        const box = blockBox(b, off);
        return { x: box.x, y: b.y, z: box.z };
      }),
      biggest,
    );
  }, [blocks, size, plane]);
  const [bursts] = useState<{ current: Burst[] }>(() => ({ current: [] }));

  // A new object per rig settle, so a repeat settle in the same state is still seen.
  const [settle, setSettle] = useState<{ state: ViewState; n: number } | null>(null);
  const settleCount = useRef(0);
  const handleSettled = useCallback((s: ViewState) => {
    settleCount.current += 1;
    setSettle({ state: s, n: settleCount.current });
  }, []);
  // Any input that re-tweens the camera voids the last settle in the same render.
  const camKey = `${state}|${size}|${elevationDeg}`;
  const [seenCamKey, setSeenCamKey] = useState(camKey);
  if (seenCamKey !== camKey) {
    setSeenCamKey(camKey);
    setSettle(null);
  }
  const exploreSettled = state === "EXPLORE" && settle?.state === "EXPLORE";

  const [layers, dispatch] = useReducer(nextLayers, []);
  const layerId = useRef(0);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (ambientMotion && !reduced && exploreSettled) {
      layerId.current += 1;
      dispatch({ type: "season", season, id: layerId.current });
    } else dispatch({ type: "stop" });
  }, [ambientMotion, exploreSettled, season]);

  // Reveal and Scan settle only reaches the page once every particle layer has unmounted (envIdle).
  const forwarded = useRef<typeof settle>(null);
  useEffect(() => {
    if (!settle || forwarded.current === settle) return;
    if (settle.state !== "EXPLORE" && layers.length > 0) return;
    forwarded.current = settle;
    onSettled?.(settle.state);
  }, [settle, layers, onSettled]);

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
        onSettled={handleSettled}
        env={env}
        ambientMotion={ambientMotion}
      />
      <Blocks blocks={blocks} size={size} theme={theme} flatten={state === "SCAN"} env={env} />
      {layers.map((l) => (
        <ParticleLayer
          key={l.id}
          env={env}
          season={l.season}
          bounds={bounds}
          plane={plane}
          budget={budget}
          active={state === "EXPLORE"}
          leaving={l.leaving}
          bursts={bursts}
          onDrained={() => dispatch({ type: "drained", id: l.id })}
        />
      ))}
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
