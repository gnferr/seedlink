"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Environment } from "@/lib/motion";
import { sweepSeason, triggerShake } from "@/lib/motionTweens";
import { skyColour, type Season } from "@/lib/seasons";
import type { ViewState } from "./CameraRig";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function EnvironmentDriver({
  env,
  season,
  state,
  background,
  shakeTick,
}: {
  env: Environment;
  season: Season;
  state: ViewState;
  background: string;
  shakeTick: number;
}) {
  const scene = useThree((s) => s.scene);
  const lastSeason = useRef(season);
  const lastTick = useRef(shakeTick);
  const stateRef = useRef(state);
  const applied = useRef({ phase: NaN, scan: false, background: "" });

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (season === lastSeason.current) return;
    lastSeason.current = season;
    sweepSeason(env, season, reducedMotion());
  }, [env, season]);

  useEffect(() => {
    if (shakeTick === lastTick.current) return;
    lastTick.current = shakeTick;
    if (stateRef.current === "EXPLORE") triggerShake(env, reducedMotion());
  }, [env, shakeTick]);

  useFrame(() => {
    const phase = env.phase.value;
    const scan = state === "SCAN";
    const a = applied.current;
    if (a.phase === phase && a.scan === scan && a.background === background) return;
    a.phase = phase;
    a.scan = scan;
    a.background = background;
    // The Scan frame is season-immune, background included.
    if (scene.background) (scene.background as THREE.Color).set(scan ? background : skyColour(background, phase));
  });

  return null;
}
