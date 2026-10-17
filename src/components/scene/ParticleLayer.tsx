"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Instance, Instances } from "@react-three/drei";
import type { Object3D } from "three";
import type { Environment } from "@/lib/motion";
import type { Season } from "@/lib/seasons";
import {
  BURST_LIFE_SECONDS,
  BURST_MAX,
  PARTICLE_SETS,
  burstPose,
  particlePose,
  type Bounds,
} from "@/lib/particles";

type Vec3 = { x: number; y: number; z: number };
export type Burst = { t0: number; origin: Vec3 };

const FADE_SECONDS = 0.4;
// Two overlapping bursts fit; older ones beyond that are simply not drawn.
const BURST_SLOTS = BURST_MAX * 2;
const noRaycast = () => null;
const NO_BURSTS: Burst[] = [];

export default function ParticleLayer({
  env,
  season,
  bounds,
  budget,
  active,
  leaving,
  bursts,
  onDrained,
}: {
  env: Environment;
  season: Season;
  bounds: Bounds;
  budget: number;
  active: boolean;
  leaving: boolean;
  bursts: { current: Burst[] };
  onDrained: () => void;
}) {
  const set = PARTICLE_SETS[season];
  const ambient = budget - BURST_SLOTS;
  const items = useRef<Object3D[]>([]);
  const life = useRef(0);
  const drained = useRef(false);
  const zeroed = useRef(false);

  useFrame(({ clock }, delta) => {
    if (drained.current) return;
    const gate = env.gate;
    const step = delta / FADE_SECONDS;
    life.current = leaving ? Math.max(0, life.current - step) : Math.min(1, life.current + step);
    if ((leaving && life.current === 0) || (!active && gate.stateGain === 0)) {
      drained.current = true;
      onDrained();
      return;
    }
    const objs = items.current;
    const k = gate.stateGain * gate.calm * life.current;
    if (k === 0) {
      // At the reveal angle calm is 0: zero the scales once and skip the pose math entirely.
      if (!zeroed.current) for (let i = 0; i < objs.length; i++) objs[i].scale.setScalar(0);
      zeroed.current = true;
      return;
    }
    zeroed.current = false;
    const t = clock.elapsedTime;
    for (let i = 0; i < ambient; i++) {
      const p = particlePose(i, t, set, bounds);
      const o = objs[i];
      o.position.set(p.x, p.y, p.z);
      o.rotation.set(p.rot, p.rot * 0.7, 0);
      o.scale.setScalar(p.scale * k);
    }
    let slot = ambient;
    // The outgoing set never carries a burst; the incoming one does.
    const list = leaving ? NO_BURSTS : bursts.current;
    for (let b = 0; b < list.length && slot < budget; b++) {
      const age = t - list[b].t0;
      if (age < 0 || age >= BURST_LIFE_SECONDS) continue;
      for (let j = 0; j < BURST_MAX && slot < budget; j++, slot++) {
        const p = burstPose(j, age, list[b].origin, set);
        const o = objs[slot];
        o.position.set(p.x, p.y, p.z);
        o.scale.setScalar(p.scale * k);
      }
    }
    for (; slot < budget; slot++) objs[slot].scale.setScalar(0);
  });

  const s = set.size;
  return (
    <Instances limit={budget} range={budget} frustumCulled={false} raycast={noRaycast}>
      <boxGeometry args={[s, set.kind === "LEAF" ? s * 0.35 : s, s]} />
      <meshBasicMaterial />
      {Array.from({ length: budget }, (_, i) => (
        <Instance
          key={i}
          scale={0}
          color={set.colors[(Math.imul(i + 1, 0x9e3779b1) >>> 0) % set.colors.length]}
          ref={(o: Object3D | null) => {
            if (o) items.current[i] = o;
          }}
        />
      ))}
    </Instances>
  );
}
