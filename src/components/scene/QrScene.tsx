"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { blockBox } from "@/lib/blockGeometry";
import { createEnvironment } from "@/lib/motion";
import { triggerShake } from "@/lib/motionTweens";
import { PARTICLE_SETS, particleBounds, particleBudget, particleSize, pushBurst } from "@/lib/particles";
import { nextLayers } from "@/lib/particleLayers";
import { QUIET_ZONE } from "@/lib/qr";
import type { Block } from "@/lib/solver";
import type { Theme } from "@/lib/themes";
import type { Season } from "@/lib/seasons";
import Blocks from "./Blocks";
import CameraRig, { type ViewState } from "./CameraRig";
import Clouds from "./Clouds";
import EnvironmentDriver from "./EnvironmentDriver";
import Meadow from "./Meadow";
import ParticleLayer, { type Burst } from "./ParticleLayer";
import Sky from "./Sky";

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
  pokeEnabled = true,
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
  pokeEnabled?: boolean;
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

  const handlePoke = useCallback(
    (origin: { x: number; y: number; z: number }, t0: number) => {
      // Breeze off only stops the ambient layers; a poke is a deliberate act, so it matches the Shake button.
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      triggerShake(env, reduced);
      if (!reduced && ambientMotion) pushBurst(bursts.current, { t0, origin: { x: origin.x, y: origin.y, z: origin.z } }, t0);
    },
    [env, ambientMotion, bursts],
  );

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
      <Sky env={env} background={theme.background} scan={state === "SCAN"} />
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
      {/* Unmounted, not hidden, in Scan: the graded frame is pad, blocks and background only. */}
      {state !== "SCAN" && <Meadow plane={plane} env={env} padColour={theme.colorLight} />}
      {state !== "SCAN" && <Clouds plane={plane} env={env} />}
      <Blocks blocks={blocks} size={size} theme={theme} flatten={state === "SCAN"}
        env={env}
        pokeEnabled={pokeEnabled && state === "EXPLORE"}
        onPoke={handlePoke}
      />
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
        shakeTick={shakeTick}
      />
    </Canvas>
  );
}
