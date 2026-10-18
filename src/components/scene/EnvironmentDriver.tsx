"use client";

import { useEffect, useRef } from "react";
import type { Environment } from "@/lib/motion";
import { sweepSeason, triggerShake } from "@/lib/motionTweens";
import type { Season } from "@/lib/seasons";
import type { ViewState } from "./CameraRig";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function EnvironmentDriver({
  env,
  season,
  state,
  shakeTick,
}: {
  env: Environment;
  season: Season;
  state: ViewState;
  shakeTick: number;
}) {
  const lastSeason = useRef(season);
  const lastTick = useRef(shakeTick);
  const stateRef = useRef(state);

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

  return null;
}
