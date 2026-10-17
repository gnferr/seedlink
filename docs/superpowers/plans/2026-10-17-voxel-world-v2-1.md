# Voxel World v2.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the merged v2.0.0 sculpture into a playable voxel world — seasons, wind, particles, poke-to-shake and a game-style HUD — without letting any of it reach the Scan frame.

**Architecture:** Pure logic (season palettes, the motion model, particle poses, hotkeys) lives in `src/lib` and is Node-tested. One mutable `Environment` — a master motion gate plus a season phase — is created by `QrScene`, ramped by `CameraRig`, and read every frame by the block materials and the particle layer, so no per-frame value ever touches React state. The HUD replaces the control panel while keeping every accessible name and message the existing e2e suite asserts. New Playwright tests prove the still-frame rule byte-for-byte.

**Tech Stack:** Next.js 16, React 19, React Three Fiber + three.js + drei 10.7.9, GSAP, Tailwind v4, `next/font`, Playwright, `node --test`.

**Spec:** `system_document.md` (v2.1.0). Read §0A, §5 and §11 first; §0, §4, §6 and §8 are unchanged and binding.

**Assumption to confirm before executing:** the author's proposals in §10.1 (#18–#28) are accepted. The one that changes the plan if it flips is **#18** (particles only in Explore): the alternative needs a capture-time state in Task 7.

## Global Constraints

- The solver (§4), `verify.ts`, `sampleScan.ts`, `scanFit.ts`, REVEAL pose/zoom and SCAN pose/zoom/`FIT_MARGIN` are **not modified**. Error correction stays **H**; quiet zone stays **4 modules**.
- Nothing may change a block's `(x, z)` cell, its solved height, the base plane, or the quiet zone.
- **No new runtime dependency.** `package.json` `dependencies` is unchanged. Fonts come through `next/font`; icons are inline SVG.
- Per-frame values (`uTime`, the motion gate, season phase, shake, particle positions) live in **refs and shader uniforms, never React state**. React state holds only discrete decisions.
- **No per-frame work proportional to block count.** Per-frame CPU for all v2.1 systems ≤ 1.5 ms, no allocation inside `useFrame` at rest.
- `stateGain` ramp end values are **assigned exactly** (0 or 1). Exponential damping or "lerp toward target each frame" is forbidden.
- In REVEAL and SCAN: sway **exactly 0**, shake killed, particle layer **unmounted** (not zero-opacity, not zero-scale), no fog or post-processing, base plane `colorLight` unshaded.
- In SCAN every block is `colorScan`, the background is the theme's `background`, nothing seasonal applies. Flatten is a discrete switch at the start of the transition.
- `verifyKey` stays `JSON.stringify([text, shapeId, elevation, theme])`. It **must not** include season, ambient motion, particles, HUD state or any motion value; the theme passed to it is the Summer theme.
- Particles budget: ≤ **300** desktop, ≤ **120** phone (coarse pointer or width < 640). One draw call per set.
- Sway is a **rigid per-instance translation**, capped at **0.35 module**; shake capped at **0.5 module**, decays over about 900 ms. No rotation, no per-vertex bending.
- Pixel face only for titles, labels and buttons, **≥ 14 px**. Inputs, errors, status detail, hex codes and counts use the data face (Geist / Geist Mono).
- §6 floor binds every new element: text/placeholder contrast ≥ **4.5:1**, UI borders ≥ **3:1**, in **light and dark**; real `focus-visible` ring with offset; every motion honours `prefers-reduced-motion`; reasons for blocked actions are in **text**, never colour alone; `role="img"` canvas with a live label; overlays are siblings of it, not children.
- Existing accessible names and user-visible strings asserted by `e2e/*.spec.ts` are preserved: buttons **Explore / Reveal / Scan / Snap to reveal / PNG (scan) / .glb model / PNG (reveal)**; textbox **Link or text**; slider **Reveal elevation**; selects **Shape / Theme**; hex textboxes labelled **Trunk / Canopy / Base / Background**; `section[aria-label="Controls"]` wrapping every control; `#export-note` text (`Export blocked. …`); status text (`Scans — N/M modules, X:1`, `Won't scan — …`).
- Any module with a Node test uses **relative imports with the `.ts` extension**, never `@/` (Node cannot resolve the alias); type-only imports use `import type`.
- Next.js 16 has breaking changes: read `node_modules/next/dist/docs/01-app/01-getting-started/13-fonts.md` before touching fonts (repo `AGENTS.md`).
- Execution hygiene: run **one** `next dev` at a time. If the build reports errors in `.next/dev/types/routes.d.ts`, delete `.next/dev` and rebuild.

## Review Focus

1. **Thrash.** Rapid Explore ↔ Reveal ↔ Scan with a shake in flight and a season change must never grade a moving frame or show a false "Won't scan". *(Task 13: thrash test.)*
2. **Dial turned inside Scan or Reveal.** Season colours change in Reveal, nothing changes in Scan, the verdict is not invalidated. *(Task 13: E1 + dial-in-Scan test.)*
3. **Reduced motion and Breeze off.** No particles, no sway, instant season change, shake disabled — including when the preference flips at runtime. *(Task 13: E5.)*
4. **Largest QR.** A ~1000-character link (version 35–40, ~15 k blocks) with seasons and particles must still scan with every module matched and not stall. *(Task 13: large-QR test; Task 4/7 manual frame-time note.)*
5. **WebGL context loss in Explore.** Losing and restoring the context while particles are mounted must not leave a blank frame exportable. *(Task 13: context-loss test.)*

Also pinned by tests: the app opens aligned (calm) and wakes when you orbit away (Task 13).

---

## File Structure

**Create**
- `src/lib/seasons.ts` — season palettes, mixing, sky tint, shortest-arc sweep
- `src/lib/motion.ts` — gate/environment types, calm, sway/shake twins, idle predicate
- `src/lib/motionTweens.ts` — GSAP ramps: gate ramp, season sweep, shake trigger
- `src/lib/particles.ts` — per-season sets, budget, closed-form poses, bounds
- `src/lib/particleLayers.ts` — pure reducer for the mounted particle layers
- `src/lib/hotkeys.ts` — `1/2/3` view hotkeys
- `src/lib/useReducedMotion.ts` — `prefers-reduced-motion` hook
- `src/components/scene/blockMaterial.ts` — injected sway material
- `src/components/scene/EnvironmentDriver.tsx` — season sweep, sky tint, shake trigger
- `src/components/scene/ParticleLayer.tsx` — season particles and poke bursts
- `src/components/hud/primitives.tsx`, `Hud.tsx`, `Hotbar.tsx`, `StatusPlaque.tsx`, `AlignmentBar.tsx`, `SeasonDial.tsx`
- `*.test.ts` beside each `src/lib` module and `blockMaterial.ts`; `e2e/environment.spec.ts`, `e2e/hud.spec.ts`

**Modify** — `Blocks.tsx`, `CameraRig.tsx`, `QrScene.tsx`, `page.tsx`, `ColorField.tsx`, `layout.tsx`, `globals.css`, `e2e/interface.spec.ts`, `e2e/smoke.spec.ts` (only where a label legitimately changes), `PRODUCT.md`

**Delete** — `src/components/controls/ControlPanel.tsx`, `src/components/ScanStatus.tsx` (replaced in Tasks 9–10)

---

### Task 1: Season palettes

**Files:**
- Create: `src/lib/seasons.ts`, `src/lib/seasons.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Season = "SUMMER" | "AUTUMN" | "WINTER" | "SPRING";
  export const SEASONS: readonly Season[];            // cycle order above
  export function seasonIndex(s: Season): number;     // 0..3
  export function wrapPhase(phase: number): number;   // [0, 4)
  export function shortestPhaseTarget(phase: number, season: Season): number; // unwrapped; ties go forward
  export function mixHex(a: string, b: string, w: number): string;  // linear-sRGB, "#rrggbb"; invalid input returns `a`
  export function seasonColour(summer: string, region: ShapeRegion, season: Season): string;
  export function phaseColour(summer: string, region: ShapeRegion, phase: number): string;
  export function skyColour(background: string, phase: number): string;
  export function seasonTheme(theme: Theme, season: Season): Theme; // regionColors + background resolved
  ```
  `ShapeRegion` from `./shapes.ts`, `Theme` from `./themes.ts` (type imports).

- [ ] **Step 1: Write the failing tests** in `src/lib/seasons.test.ts`:
  - `SUMMER leaves every region and the sky unchanged` — for `#4f9d3a` and all regions, `seasonColour(c, r, "SUMMER") === c`; `skyColour("#d5e6ef", 0) === "#d5e6ef"`.
  - `the body region is season-immune` — `seasonColour(c, "body", s) === c` for all four seasons.
  - `autumn canopy is orange`: r > g > b and r between `0xb0` and `0xd9`.
  - `winter canopy is near-white`: `relativeLuminance` (from `./verify.ts`) of each channel set > 0.8.
  - `spring canopy is a fresher green than summer`: green channel greater than summer's `0x9d`.
  - `phaseColour at integer phases equals seasonColour`, and `phaseColour(…, 4) === phaseColour(…, 0)`.
  - `phaseColour at 0.5 is the mix of its neighbours`: equals `mixHex(seasonColour(…SUMMER), seasonColour(…AUTUMN), 0.5)`.
  - `shortestPhaseTarget`: `(0, WINTER) === 2` (tie goes forward, through Autumn); `(0, SPRING) === -1`; `(3, SUMMER) === 4`; `(1, SPRING) === 3`.
  - `seasonTheme never touches the scan-relevant fields`: for all seasons `colorScan`, `colorLight`, `roughness`, `metalness` equal the input; `background` differs only for non-summer.
  - `mixHex with an invalid colour returns the first argument`.

- [ ] **Step 2: Run to verify failure** — `node --experimental-strip-types --test src/lib/seasons.test.ts` → FAIL, module not found.

- [ ] **Step 3: Implement `src/lib/seasons.ts`.** The mechanism is binding, the numbers are starting values (spec §11.5):

  | Season | canopy target, weight | trunk target, weight | sky target, weight |
  |---|---|---|---|
  | SUMMER | — | — | — |
  | AUTUMN | `#d9822b`, 0.80 | `#6b4423`, 0.25 | `#f0d9b5`, 0.25 |
  | WINTER | `#f2f6fa`, 0.90 | `#9aa8b5`, 0.25 | `#dfe8f0`, 0.30 |
  | SPRING | `#b5e06a`, 0.45 | — | `#e6f2e0`, 0.20 |

  `seasonColour = mixHex(summer, target, weight)` for `canopy` and `trunk`; `body` returns `summer`. `phaseColour` and `skyColour` first `wrapPhase` their input (a sweep tweens through unwrapped values such as `-1`), then mix `seasonColour` of `floor(phase)` and the next season by `fract(phase)`. Mix in linear sRGB (decode, lerp, encode); output lowercase `#rrggbb`.

- [ ] **Step 4: Run to verify pass** — same command → PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add src/lib/seasons.ts src/lib/seasons.test.ts
  git commit -m "feat: add season palettes derived from the summer colours"
  ```

---

### Task 2: Motion model

**Files:**
- Create: `src/lib/motion.ts`, `src/lib/motionTweens.ts`, `src/lib/motion.test.ts`

**Interfaces:**
- Consumes: `Season`, `seasonIndex` (Task 1).
- Produces (`motion.ts`, no React, no three):
  ```ts
  export const SWAY_CAP = 0.35;  export const SHAKE_CAP = 0.5;  export const SHAKE_SECONDS = 0.9;
  export const RAMP_DOWN_SECONDS = 0.4;  export const RAMP_UP_SECONDS = 0.4;
  export type MotionGate = { stateGain: number; calm: number; shake: number };
  export type Environment = { gate: MotionGate; phase: { value: number } };
  export function createEnvironment(season?: Season): Environment;     // gate {1,1,0}, phase = seasonIndex
  export function calmFor(proximity: number): number;                  // 1 − smoothstep(0.90, 1.00, p); non-finite → 1
  export function swayOffset(a: { x: number; y: number; z: number; time: number; height: number; stateGain: number; calm: number }): { dx: number; dz: number };
  export function shakeOffset(a: { x: number; y: number; z: number; time: number; height: number; stateGain: number; shake: number }): { dx: number; dz: number };
  export function isEnvIdle(state: ViewState, gate: MotionGate, particlesMounted: boolean): boolean;
  ```
  `ViewState` comes from `import type { ViewState } from "../components/scene/CameraRig.tsx"` (erased, so Node never loads the TSX). `motionTweens.ts`: `rampStateGain(env, target: 0 | 1, seconds: number, onComplete?: () => void): void`, `restGate(env): void`, `sweepSeason(env, season, reduced: boolean): void`, `triggerShake(env, reduced: boolean): void`.
- **The twin formula** (mirrored in Task 4's GLSL). With `w = smoothstep(0, 1, clamp(y / height, 0, 1))`, `ph = x·0.35 + z·0.5`, `g = stateGain·calm`:
  `sway.dx = SWAY_CAP·g·w·sin(1.7·t + ph)`, `sway.dz = SWAY_CAP·g·w·0.6·cos(1.3·t + 0.8·ph)`;
  `shake.dx = SHAKE_CAP·stateGain·shake·sin(23·t + ph)`, `shake.dz = SHAKE_CAP·stateGain·shake·0.6·cos(19·t + ph)`.

- [ ] **Step 1: Write the failing tests**:
  - `calmFor`: `0 → 1`, `0.9 → 1`, `0.95 → 0.5`, `1 → 0`, `NaN → 1`, `2 → 0`, `-1 → 1`.
  - `sway is exactly zero when stateGain is zero` — over a grid of positions and times, `dx === 0 && dz === 0` (use `===`, not `Object.is`: `-0` is fine, a GPU renders it identically).
  - `sway is exactly zero on the ground` (`y = 0`) and when `calm = 0`.
  - `sway never exceeds the cap`: `|dx| ≤ SWAY_CAP`, `|dz| ≤ 0.6·SWAY_CAP` over the grid at `stateGain = calm = 1`.
  - `shake is exactly zero when stateGain or shake is zero`, and `|dx| ≤ SHAKE_CAP`.
  - `isEnvIdle`: `("SCAN", {0,0,0}, false) → true`; `particlesMounted = true → false`; `stateGain = 1e-9 → false`; `shake = 0.01 → false`; `("EXPLORE", …) → false`.
  - `createEnvironment("WINTER").phase.value === 2`.
  - Instant paths (no GSAP): `rampStateGain(env, 0, 0)` leaves `stateGain === 0` exactly; `restGate` zeroes all three; `sweepSeason(env, "WINTER", true)` sets `phase.value === 2` exactly; `triggerShake(env, true)` leaves `shake === 0`.

- [ ] **Step 2: Run to verify failure** — `node --experimental-strip-types --test src/lib/motion.test.ts` → FAIL.

- [ ] **Step 3: Implement both modules.** Rules for `motionTweens.ts`: a zero-second or reduced-motion call assigns the end value directly (no GSAP); otherwise `gsap.to` with `onComplete` that **re-assigns the exact end value**; every function first `gsap.killTweensOf` the property it owns. `sweepSeason` tweens `phase.value` from its current value to `shortestPhaseTarget(...)` over `min(1.2, 0.4 + 0.4·|delta|)` s, then assigns `seasonIndex(season)`. `triggerShake` sets `shake = 1` then tweens it to 0 over `SHAKE_SECONDS`.

- [ ] **Step 4: Run to verify pass**, then `npm run lint`.

- [ ] **Step 5: Commit**
  ```bash
  git add src/lib/motion.ts src/lib/motionTweens.ts src/lib/motion.test.ts
  git commit -m "feat: add the motion gate, calm and sway model"
  ```

---

### Task 3: Particle model

**Files:**
- Create: `src/lib/particles.ts`, `src/lib/particles.test.ts`

**Interfaces:**
- Consumes: `Season` (Task 1).
- Produces:
  ```ts
  export type ParticleKind = "PETAL" | "FIREFLY" | "LEAF" | "SNOW";
  export type ParticleSet = { kind: ParticleKind; colors: string[]; size: number; fallSpeed: number; drift: number; loopSeconds: number; pulseHz: number };
  export const PARTICLE_SETS: Record<Season, ParticleSet>;   // SPRING petals, SUMMER fireflies, AUTUMN leaves, WINTER snow
  export type Bounds = { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
  export function particleBudget(coarsePointer: boolean): number;           // 120 | 300
  export function particleBounds(blocks: { x: number; y: number; z: number }[], size: number): Bounds;
  export function particlePose(i: number, t: number, set: ParticleSet, b: Bounds): { x: number; y: number; z: number; rot: number; scale: number };
  export const BURST_MIN = 8, BURST_MAX = 16, BURST_LIFE_SECONDS = 1.2;
  export function burstPose(k: number, age: number, origin: { x: number; y: number; z: number }, set: ParticleSet): { x: number; y: number; z: number; scale: number };
  ```
  `particlePose` is a **closed-form, stateless** function of `(i, t)` — falling kinds wrap vertically by modulo, fireflies follow a Lissajous around a hashed spawn point and pulse at `pulseHz` — so nothing is allocated or integrated per frame.

- [ ] **Step 1: Write the failing tests**:
  - `the four seasons map to the four kinds` (SPRING `PETAL`, SUMMER `FIREFLY`, AUTUMN `LEAF`, WINTER `SNOW`).
  - `budgets are 300 on desktop and 120 on a phone`.
  - `poses are deterministic and finite` — same `(i, t)` twice gives identical output; no `NaN`/`Infinity` over `i ∈ 0..299`, `t ∈ 0..120 s`.
  - `poses stay inside the bounds plus a half-unit margin` for every kind.
  - `scale stays in [0, 1]`; `fireflies pulse at no more than 1 Hz` — sampling `scale` at 100 Hz for 5 s gives at most 6 local maxima.
  - `particleBounds on an empty list is finite`, and on the solver's real output for `https://example.com` contains every block.
  - `a burst particle's scale reaches exactly 0 at BURST_LIFE_SECONDS` and is finite for all `k < BURST_MAX`.

- [ ] **Step 2: Run to verify failure** — `node --experimental-strip-types --test src/lib/particles.test.ts`.

- [ ] **Step 3: Implement `src/lib/particles.ts`.** Starting values: petals pink/white, summer fireflies warm yellow, autumn leaves orange/red/gold, snow white; all cubes (`size` ≈ 0.18 module). Hash `i` with a cheap integer hash — no `Math.random`.

- [ ] **Step 4: Run to verify pass.**

- [ ] **Step 5: Commit**
  ```bash
  git add src/lib/particles.ts src/lib/particles.test.ts
  git commit -m "feat: add the stateless particle model"
  ```

---

### Task 4: Block materials with injected sway

**Files:**
- Create: `src/components/scene/blockMaterial.ts`, `src/components/scene/blockMaterial.test.ts`
- Modify: `src/components/scene/Blocks.tsx`

**Interfaces:**
- Consumes: `Environment`, `SWAY_CAP`, `SHAKE_CAP` (Task 2); `phaseColour` (Task 1).
- Produces:
  ```ts
  export type SwayKind = "canopy" | "trunk";
  export type SwayMaterial = THREE.MeshStandardMaterial & { userData: { uniforms: Record<string, { value: number }>; lastPhase: number } };
  export function createSwayMaterial(kind: SwayKind, o: { roughness: number; metalness: number; height: number }): SwayMaterial;
  export function updateSwayMaterial(m: SwayMaterial, f: { time: number; env: Environment; summerColour: string; kind: SwayKind }): void;
  export const SWAY_CHUNK: string;   // appended after #include <begin_vertex>
  ```
  `Blocks` gains a required prop `env: Environment`.
- Behaviour: `canopy` — sway weight 1, shake weight 1; `trunk` — sway weight 0, shake weight 0.3. The `body` group and the flattened SCAN group use a **stock** `MeshStandardMaterial` with no injection, so Scan cannot leak sway by construction.

- [ ] **Step 1: Write the failing tests** (`blockMaterial.test.ts`, relative imports, runs under Node — `three` loads without WebGL):
  - `the injected program carries the sway chunk and its uniforms` — call `material.onBeforeCompile(fake, undefined)` with `fake = { uniforms: {}, vertexShader: "#include <begin_vertex>\n" }`; assert `vertexShader` contains `SWAY_CHUNK`, contains `0.35`, and `fake.uniforms` has `uTime`, `uStateGain`, `uCalm`, `uShake`, `uSwayHeight`, `uSwayWeight`, `uShakeWeight`.
  - `a zero gate writes zero motion uniforms` — `updateSwayMaterial` with `stateGain = 0, shake = 0` leaves `uStateGain.value === 0` and `uShake.value === 0`.
  - `the colour follows the phase and is only recomputed when the phase changes` — at phase 2 the canopy colour equals `phaseColour(summer, "canopy", 2)`; a second call with the same phase does not call the colour parser again (spy via a counter on `lastPhase`).
  - `the trunk has no sway weight` — `uSwayWeight.value === 0`, `uShakeWeight.value === 0.3`.

- [ ] **Step 2: Run to verify failure** — `node --experimental-strip-types --test src/components/scene/blockMaterial.test.ts`.

- [ ] **Step 3: Implement `blockMaterial.ts`** (it imports `../../lib/motion.ts` and `../../lib/seasons.ts` relatively so the Node test can load it). Inject with `onBeforeCompile`: add the uniforms, then replace `#include <begin_vertex>` with itself plus `SWAY_CHUNK`, which reads the instance's world position as `(instanceMatrix * vec4(0.,0.,0.,1.)).xyz` and applies the **exact formula in Task 2** to `transformed.x` / `transformed.z`. Build the chunk from the exported constants so the TS twin and the GLSL cannot drift.

- [ ] **Step 4: Implement the `Blocks.tsx` change.** Groups: when `flatten`, one stock `colorScan` mesh (today's behaviour). Otherwise `canopy` and `trunk` use `createSwayMaterial` (created once per group in `useMemo`, disposed on unmount, `height` = tallest block top computed **once** with `blocks.reduce`), and `body` uses a stock material in its region colour. Set `frustumCulled={false}` on the swaying meshes (a swaying block must never be clipped). One `useFrame` calls `updateSwayMaterial` for the two swaying groups with `state.clock.elapsedTime`. No `useState` for any per-frame value.

- [ ] **Step 5: Run `npm test`, `npm run lint`, `npm run build`.** Expected: PASS. The page still renders; with the gate at its default the swaying groups are live but Task 5 owns `env`, so temporarily have `QrScene` create `createEnvironment()` and pass it to `Blocks` (Task 5 finishes this wiring). Check the dev page in a browser: no console errors, the tree renders, Scan still reads `Scans`.

- [ ] **Step 6: Commit**
  ```bash
  git add src/components/scene/blockMaterial.ts src/components/scene/blockMaterial.test.ts src/components/scene/Blocks.tsx src/components/scene/QrScene.tsx
  git commit -m "feat: inject wind sway into the canopy and trunk materials"
  ```

---

### Task 5: Camera rig drives the motion gate

**Files:**
- Modify: `src/components/scene/CameraRig.tsx`, `src/components/scene/QrScene.tsx`

**Interfaces:**
- Consumes: `Environment`, `rampStateGain`, `restGate`, `calmFor`, `RAMP_*_SECONDS` (Task 2).
- Produces: `CameraRig` gains props `env: Environment` and `ambientMotion: boolean`; `QrScene` gains optional `ambientMotion?: boolean` (default `true`) and owns the single `Environment` (`useState(() => createEnvironment())[0]`) it passes to `Blocks` and `CameraRig`.
- **`onSettled(state)` contract (changed):** for REVEAL and SCAN it fires only when the camera tween has completed **and** the gate has been snapped to exact rest.

- [ ] **Step 1: Implement the ramp in `CameraRig`'s state effect.**
  On every run: `gsap.killTweensOf(env.gate)`. If the target state is REVEAL or SCAN: `rampStateGain(env, 0, instant ? 0 : RAMP_DOWN_SECONDS)` immediately (so it finishes well inside the 1.2 s camera tween) and set `env.gate.shake = 0`. In the camera tween's `onComplete`: if the state is REVEAL or SCAN call `restGate(env)` (exact zero for `stateGain`, `calm`, `shake`) **before** `onSettled`; if EXPLORE call `rampStateGain(env, 1, reduced ? 0 : RAMP_UP_SECONDS)` then `onSettled`. Kill the gate tweens in the effect cleanup. The existing reduced-motion / first-placement `instant` flag applies to the ramps.
  If lint's immutability rule objects to mutating the `env` prop, keep all mutation inside the exported helpers in `motionTweens.ts` rather than assigning fields in the component.

- [ ] **Step 2: Implement calm.** In `useFrame`, when `state === "EXPLORE"` compute proximity from the view direction **every frame** (not only once the controls are mounted) and set `env.gate.calm = ambientMotion ? calmFor(proximity) : 0`; otherwise leave `calm = 0`. Keep `onProximityChange` reporting gated on `controlsOn` exactly as today. This makes the app open aligned (proximity 1 → calm 0).

- [ ] **Step 3: Verify the freeze in a browser.** Run the dev server. With a throwaway Playwright script in the scratchpad (not the repo): load the page, orbit away by dragging, confirm two canvas captures 500 ms apart **differ** (wind is alive); click Reveal, wait 2 s, confirm two captures 500 ms apart are **identical**; same for Scan. Read what you see and report it.

- [ ] **Step 4: Run `npm run lint`, `npm run build`, `npm test`, `npm run test:e2e`.** All pass unchanged (the existing suite must not regress).

- [ ] **Step 5: Commit**
  ```bash
  git add src/components/scene/CameraRig.tsx src/components/scene/QrScene.tsx
  git commit -m "feat: ramp the motion gate with the camera and snap it to rest"
  ```

---

### Task 6: Environment driver (seasons, sky, shake)

**Files:**
- Create: `src/components/scene/EnvironmentDriver.tsx`
- Modify: `src/components/scene/QrScene.tsx`

**Interfaces:**
- Consumes: `sweepSeason`, `triggerShake`, `skyColour` (Tasks 1–2).
- Produces: `QrScene` gains optional props `season?: Season` (default `"SUMMER"`) and `shakeTick?: number` (default `0`); `EnvironmentDriver(props: { env: Environment; season: Season; state: ViewState; background: string; shakeTick: number })`. Reduced motion is read at call time (`matchMedia`), not passed in.
- Behaviour: on a `season` change call `sweepSeason`; on a `shakeTick` change (ignore the initial value) call `triggerShake` **only when `state === "EXPLORE"`**; every frame set `scene.background` to `background` when `state === "SCAN"`, else `skyColour(background, env.phase.value)` — recomputing only when the inputs change.

- [ ] **Step 1: Implement the driver and mount it in `QrScene` inside the `Canvas`.** Read reduced motion with `window.matchMedia("(prefers-reduced-motion: reduce)")` at call time, as `CameraRig` already does. The base plane and `colorLight` are not touched.

- [ ] **Step 2: Verify in a browser** (scratchpad script). The HUD has no season control yet, so temporarily change `QrScene`'s `season` default to `"AUTUMN"`, confirm Reveal shows an orange canopy and a warm sky and that **Scan is unchanged** (capture Scan with the default and with `AUTUMN`; they must be identical), then restore the default `"SUMMER"` before committing. Report what you see.

- [ ] **Step 3: Run `npm run lint`, `npm run build`, `npm test`, `npm run test:e2e`.** All pass.

- [ ] **Step 4: Commit**
  ```bash
  git add src/components/scene/EnvironmentDriver.tsx src/components/scene/QrScene.tsx
  git commit -m "feat: sweep seasons, tint the sky and trigger shakes in the scene"
  ```

---

### Task 7: Particle layer and its lifecycle

**Files:**
- Create: `src/components/scene/ParticleLayer.tsx`, `src/lib/particleLayers.ts`, `src/lib/particleLayers.test.ts`
- Modify: `src/components/scene/QrScene.tsx`

**Interfaces:**
- Consumes: `PARTICLE_SETS`, `particleBudget`, `particleBounds`, `particlePose`, `burstPose`, `BURST_*` (Task 3); `Environment` (Task 2).
- Produces (`particleLayers.ts`, pure, relative imports):
  ```ts
  export type Layer = { id: number; season: Season; leaving: boolean };
  export type LayerEvent = { type: "season"; season: Season; id: number } | { type: "drained"; id: number } | { type: "stop" };
  export function nextLayers(layers: Layer[], e: LayerEvent): Layer[];
  ```
  `season` marks every existing layer `leaving` and appends `{ id, season, leaving: false }`, unless the current non-leaving layer already has that season (then it returns the same array); `drained` removes the layer with that `id`; `stop` marks every layer `leaving`.
- Produces (`ParticleLayer`):
  ```ts
  ParticleLayer(props: { env: Environment; season: Season; bounds: Bounds; budget: number;
                         active: boolean;            // state === "EXPLORE"
                         leaving: boolean;           // outgoing season set: scale down over ≤ 400 ms
                         bursts: { current: { t0: number; origin: Vec3 }[] };
                         onDrained: () => void })    // called when !active and stateGain === 0, or when leaving finishes
  ```
- Behaviour: a drei `<Instances limit={budget}>` of cubes (`raycast` disabled, `frustumCulled={false}`, opaque basic material, per-instance colour). Every frame each `<Instance>` is positioned from `particlePose` and its scale is `pose.scale × env.gate.stateGain × env.gate.calm`; burst slots use `burstPose`. Fade is **by scale**, never by alpha. If profiling shows the per-`<Instance>` update costs more than 0.5 ms for 300 particles, switch to a raw `<instancedMesh>` with `setMatrixAt` and record it as a `shortcut:` comment.
- **`QrScene` lifecycle (binding):** it holds `layers: { id: number; season: Season; leaving: boolean }[]`. A layer is mounted only when `ambientMotion && !reduced && state === "EXPLORE"` and the camera has settled in Explore. On a season change the current layer is marked `leaving` and a new one is added; on `onDrained` the layer is removed from the array. When `state` is REVEAL or SCAN all layers drain and are **unmounted**. `QrScene` tracks the rig's settle as an object `{ state, n }` (a new object each `onSettled`) and forwards its own `onSettled(state)` to the page **once per settle**: immediately for EXPLORE, and for REVEAL/SCAN only when `layers` is empty. This is what makes `envIdle` true before any frame is graded.

- [ ] **Step 1: Write the failing tests** (`particleLayers.test.ts`): `a season change keeps the outgoing layer until it drains` (after `season WINTER` the old layer is `leaving: true` and still present, the new one `leaving: false`; after `drained` for the old id only the new one remains); `choosing the current season is a no-op` (same array reference); `stop leaves every layer leaving and drains to empty`; `drained for an unknown id changes nothing`.
- [ ] **Step 2: Run to verify failure** — `node --experimental-strip-types --test src/lib/particleLayers.test.ts`; then implement `nextLayers` and re-run to PASS.
- [ ] **Step 3: Implement `ParticleLayer` and the `QrScene` lifecycle** with `useReducer(nextLayers, [])`; `CameraRig`'s `onSettled` now points at `QrScene`'s internal handler. The particle bounds come from `particleBounds(blocks, size)` computed once per `blocks`. Budget from `particleBudget(window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 640)`.

- [ ] **Step 4: Verify in a browser** (scratchpad script): in Explore after orbiting away, particles are visible (screenshot); click Reveal, wait 2 s, screenshot twice 500 ms apart and confirm **identical** and no particles; same for Scan; run Scan and confirm it still reads `Scans — N/N`. Also note, for the report only, the average frame time with a 1000-character link in Explore (not gated). Read the screenshots.

- [ ] **Step 5: Run `npm run lint`, `npm run build`, `npm test`, `npm run test:e2e`.** All pass.

- [ ] **Step 6: Commit**
  ```bash
  git add src/components/scene/ParticleLayer.tsx src/components/scene/QrScene.tsx src/lib/particleLayers.ts src/lib/particleLayers.test.ts
  git commit -m "feat: add season particles that unmount before a frame is graded"
  ```

---

### Task 8: Poke the tree

**Files:**
- Modify: `src/components/scene/Blocks.tsx`, `src/components/scene/QrScene.tsx`

**Interfaces:**
- Produces: `Blocks` gains optional `pokeEnabled?: boolean` and `onPoke?: (p: { x: number; y: number; z: number }) => void`; `QrScene` gains optional `pokeEnabled?: boolean` (default `true`).
- Behaviour: only the `canopy` and `trunk` meshes get an `onClick`, and only while `pokeEnabled` is true. The handler ignores the click when `event.delta > 3` (an orbit drag). It calls `onPoke(event.point)`. `QrScene.onPoke` calls `triggerShake(env, reduced)` and pushes 8–16 entries onto the burst list (capped at `BURST_MAX` simultaneous). **No `onPointerOver`/`onPointerMove`** — they would raycast every instance on every pointer move.

- [ ] **Step 1: Implement and wire.** `QrScene` passes `pokeEnabled = pokeEnabled && state === "EXPLORE"` to `Blocks`. In REVEAL and SCAN no handler is attached.

- [ ] **Step 2: Verify in a browser** (scratchpad script): in Explore, find a trunk-coloured pixel in the canvas (scan the pixels for the trunk brown), click it, and confirm two captures straddling the click differ; click the same place in Reveal and confirm they do not. Report.

- [ ] **Step 3: Run `npm run lint`, `npm run build`, `npm test`, `npm run test:e2e`.** All pass.

- [ ] **Step 4: Commit**
  ```bash
  git add src/components/scene/Blocks.tsx src/components/scene/QrScene.tsx
  git commit -m "feat: poke the tree to shake it and burst leaves"
  ```

---

### Task 9: HUD foundations

**Files:**
- Create: `src/components/hud/primitives.tsx`, `src/components/hud/StatusPlaque.tsx`
- Modify: `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`, `src/components/controls/ControlPanel.tsx` (swap its status for `StatusPlaque`)
- Delete: `src/components/ScanStatus.tsx` (its only caller, `ControlPanel`, now uses `StatusPlaque`)

**Interfaces:**
- Produces (`primitives.tsx`, all `"use client"`): `HudPanel`, `HudButton` (props `pressed?`, `disabled` via `aria-disabled`, forwards `ref`), `HudSwitch` (`role="switch"`, `aria-checked`, label, ON/OFF text + icon), `HudIcon` (`name: "ok" | "bad" | "wait" | "lock" | "shake" | "wind" | "collapse" | "expand" | "warn"`, 16 px grid, `aria-hidden`), `HudNote` (replaces `CenterNote`).
- `StatusPlaque(props: { separation: Separation | null; checked: boolean })` — states: **Scans / Won't scan / Checking…** (strings unchanged) and a new **idle** state, `Not checked yet — open Scan to check the code.`, which must match neither `/modules/` nor `/Checking/` so the existing status filters stay unambiguous. `role="status"`, polite, text plus icon.

- [ ] **Step 1: Fonts.** Read the Next fonts doc named in Global Constraints. In `layout.tsx` add `Pixelify_Sans({ variable: "--font-pixel", subsets: ["latin"] })` and its variable class on `<html>`. Candidates are Pixelify Sans and Silkscreen (both available); Pixelify Sans is the default because it stays legible at 14 px.

- [ ] **Step 2: Tokens and skins.** In `globals.css` define the HUD token set — stone / wood / parchment fills, a two-tone bevel edge, a hard-shadow colour, an accent — as CSS variables with **two skins following `prefers-color-scheme`**, independent of the sculpture's theme. Keep the existing real `:focus-visible` ring (it may become chunkier). Add a 4 px pixel-grid spacing convention and a stepped `steps()` transition token ≤ 120 ms that collapses to `0s` under `prefers-reduced-motion`.

- [ ] **Step 3: Primitives** per spec §5.5: 2–4 px hard two-tone borders, square or notched corners (no `rounded-md`/`rounded-lg`), `4px 4px 0` hard offset shadow that disappears and offsets the button when pressed, 48 px hit targets for hotbar-sized buttons and ≥ 44 px otherwise, pixel face only on labels/titles/buttons at ≥ 14 px, data face everywhere else. Read `C:\Users\ferdi\.claude\skills\impeccable\reference\craft-floor.md`; the spec's voxel world is a committed visual world, so its hard-shadow pattern is required here.

- [ ] **Step 4: Use them immediately.** Replace the page's `CenterNote`, the over-capacity banner and the `SceneBoundary` message with `HudNote` (same copy, same `role="alert"` and sibling-of-`role="img"` structure). In `ControlPanel`, replace `ScanStatus` **and** the `Open Scan to check the code reads.` hint with an always-rendered `StatusPlaque` (`checked = view === "SCAN"`); the `showScanStatus` prop is no longer needed there and its page call-site is dropped. Delete `ScanStatus.tsx`.

- [ ] **Step 5: Verify.** `npm run lint`, `npm run build`, `npm test`, `npm run test:e2e` all pass (every asserted string is unchanged). Then a Playwright script in the scratchpad: screenshots at 1440×900 and 390×844, light and dark, of the default view and the over-capacity banner. **Read every screenshot** and report what you see, including whether any text is under 14 px in the pixel face.

- [ ] **Step 6: Commit**
  ```bash
  git add src/components src/app
  git commit -m "feat: add voxel HUD tokens, primitives and the status plaque"
  ```

---

### Task 10: The HUD replaces the control panel

**Files:**
- Create: `src/components/hud/Hud.tsx`, `Hotbar.tsx`, `AlignmentBar.tsx`
- Modify: `src/components/controls/ColorField.tsx`, `src/app/page.tsx`
- Delete: `src/components/controls/ControlPanel.tsx`

**Interfaces:**
- Consumes: the primitives and `StatusPlaque` (Task 9).
- Produces: `Hud` takes **the props `ControlPanel` takes today** (read it) **except `showScanStatus`** (the plaque is always visible), plus `collapsed: boolean | null` and `onCollapsed: (c: boolean) => void`; it also exports `type ColorKey` (moved from `ControlPanel`). It renders one `<section aria-label="Controls">` containing everything. `collapsed === null` means "auto": expanded from `md` up, collapsed to the dock below it, decided by CSS (no `matchMedia` in render, no set-state-in-effect); the first explicit toggle makes it a boolean.
- Anatomy (spec §5.4): **Hotbar** (three slots; accessible names stay exactly `Explore`, `Reveal`, `Scan`; the hotkey hint is an `aria-hidden` span plus `aria-keyshortcuts`; selected slot is raised, notched and `aria-pressed`, never colour alone); **link slab** (data face, character count); **alignment bar** (segmented pips, text label via the existing `proximityText`, `role="meter"`); **status plaque** always visible; **palette slots** (the hex text field stays, labelled exactly `Trunk` / `Canopy` / `Base` / `Background`, `normalizeHex` unchanged); **settings** (Shape, Theme, Reveal elevation, same labels); **craft table** (the three export buttons, `#export-note`, same strings and gating); the sculpture note; a **collapse** button (`Collapse controls` / `Expand controls`).
- The collapsed dock keeps the hotbar, the status plaque and (from Task 11) the season dial. Size limits: HUD ≤ ~30 % of the viewport on desktop, ≤ 44 % of the height on a phone expanded, dock ≤ 96 px.

- [ ] **Step 1: Build the components and swap `page.tsx` to `Hud`.** Preserve every behaviour: debounce, gating strings, `Snap to reveal` handing focus to the Reveal slot and unmounting, the one authored GSAP moment (reduced-motion guarded), `aria-describedby="export-note"`.

- [ ] **Step 2: Restyle `ColorField`** to the voxel language without changing its contract (`normalizeHex`, draft/seen handling, `aria-invalid`). The colour swatch is a square slot; the hex field uses the data face.

- [ ] **Step 3: Verify.** `npm run lint`, `npm run build`, `npm test`, `npm run test:e2e` — all pass unchanged, including the keyboard-reachability test (no radiogroup exists yet). Then scratchpad screenshots at 1440×900 and 390×844, light and dark, expanded and collapsed. **Read every screenshot**: the object leads, nothing overlaps the canvas centre, the plaque is visible when collapsed, no pixel-face text under 14 px.

- [ ] **Step 4: Commit**
  ```bash
  git add -A src
  git commit -m "feat: replace the control panel with the voxel HUD"
  ```

---

### Task 11: Engine controls and page state

**Files:**
- Create: `src/components/hud/SeasonDial.tsx`, `src/lib/useReducedMotion.ts`
- Modify: `src/components/hud/Hud.tsx`, `src/app/page.tsx`, `e2e/interface.spec.ts`

**Interfaces:**
- Produces: `useReducedMotion(): boolean` (subscribes to the media query; SSR-safe default `false`).
- `Hud` gains props: `season: Season`, `onSeason: (s: Season) => void`, `ambientMotion: boolean`, `onAmbientMotion: (on: boolean) => void`, `motionAllowed: boolean` (false under reduced motion), `onShake: () => void`, `shakeEnabled: boolean`.
- `SeasonDial` — a `role="radiogroup"` labelled `Season` of four `role="radio"` buttons named `Summer`, `Autumn`, `Winter`, `Spring`; roving tabindex; arrow keys move and select, `Home`/`End` jump; the current season name is shown in text.
- Controls: **Breeze** — `HudSwitch` named `Breeze` (`role="switch"`), disabled with the reason in text when `!motionAllowed`; **Shake** — button named `Shake`, `aria-disabled` with `Shake works in Explore.` or `Shake is off while motion is reduced.` when `!shakeEnabled`.
- `page.tsx` state: `season` (default `SUMMER`), `breeze` (default `true`), `shakeTick`, `collapsed`; derived `motionAllowed = !useReducedMotion()`, `ambientMotion = breeze && motionAllowed`, `shakeEnabled = mode === "EXPLORE" && motionAllowed`. It passes `season`, `ambientMotion`, `shakeTick`, `pokeEnabled={shakeEnabled}` to `QrScene`, increments `shakeTick` on Shake, and exports the `.glb` with `seasonTheme(theme, season)`. **`verifyKey` keeps using the Summer `theme`** — add a one-line comment saying why.
- The role-`img` wrapper gains `data-view={mode}` and `data-settled={settled}` for the browser tests.
- The collapsed dock now includes the season dial.

- [ ] **Step 1: Implement.** Under reduced motion the Breeze switch cannot turn motion on, the season changes instantly, and the live region still announces.

- [ ] **Step 2: Update the keyboard-reachability test** in `interface.spec.ts`. A radiogroup visits one radio per Tab, so replace `expected = count of input, select, button` with the count of **visible controls whose `tabIndex >= 0`**, keep the assertion that every one shows a real outline, and make sure the season dial is among the controls reached.

- [ ] **Step 3: Verify.** `npm run lint`, `npm run build`, `npm test`, `npm run test:e2e` all pass. Scratchpad screenshots: each season in Reveal at 1440×900 (read them: foliage, trunk and sky change; the base plane does not), Scan after each (identical), reduced motion on. Report what you see.

- [ ] **Step 4: Commit**
  ```bash
  git add -A src e2e
  git commit -m "feat: add the season dial, breeze switch and shake button"
  ```

---

### Task 12: Hotkeys and announcements

**Files:**
- Create: `src/lib/hotkeys.ts`, `src/lib/hotkeys.test.ts`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Produces:
  ```ts
  export function viewForKey(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean;
                                  target: { tagName?: string; isContentEditable?: boolean } | null }): ViewState | null;
  ```
  (`ViewState` via `import type` from `../components/scene/CameraRig.tsx`.)

- [ ] **Step 1: Write the failing tests**: `"1" → EXPLORE`, `"2" → REVEAL`, `"3" → SCAN`; any other key → `null`; ignored (→ `null`) when the target is `INPUT`, `SELECT`, `TEXTAREA` or content-editable, and when `ctrlKey`, `metaKey` or `altKey` is set.
- [ ] **Step 2: Run to verify failure** — `node --experimental-strip-types --test src/lib/hotkeys.test.ts`.
- [ ] **Step 3: Implement `viewForKey`**, then add one `window` `keydown` listener in `page.tsx` that calls `setMode` with it.
- [ ] **Step 4: Announcements.** Extend the existing polite live region so a view change reads `Encoding <text>. <view> view.` (unchanged) and a season change adds `Season: <Season>.`.
- [ ] **Step 5: Run `npm test`, `npm run lint`, `npm run build`**, then `npm run test:e2e`. Expected: PASS.
- [ ] **Step 6: Commit**
  ```bash
  git add src/lib/hotkeys.ts src/lib/hotkeys.test.ts src/app/page.tsx
  git commit -m "feat: add 1/2/3 view hotkeys and season announcements"
  ```

---

### Task 13: Browser proof — the still-frame rule

**Files:**
- Create: `e2e/environment.spec.ts`

**Interfaces:**
- Consumes the HUD names from Task 11: radiogroup `Season` with radios `Summer`/`Autumn`/`Winter`/`Spring`, switch `Breeze`, button `Shake`, and the `data-view` / `data-settled` attributes on the `role="img"` wrapper.
- Helpers (local to the file): `ready(page)`, `captureCanvas(page): Promise<string>` (`toDataURL`), `settled(page, view)` (waits for `[role="img"][data-view="…"][data-settled="true"]`), `findPixel(page, predicate)` (returns canvas-relative coordinates of the first pixel matching, used to click the trunk), `midToneFraction(page)` (fraction of pixels inside the plane whose luma is between dark and light populations).

- [ ] **Step 1: Write the tests.** Use web-first assertions with timeouts; a fixed wait is allowed only where timing is the subject.
  - `E1 — the Scan frame is byte-identical across all four seasons, breeze on and off` — for each season × breeze: select it in Explore, enter Scan, `settled(page, "SCAN")`, capture; assert all captures equal.
  - `E2 — Reveal and Scan are still frames, even right after a shake` — Explore → click `Shake` → immediately Reveal → `settled` → capture, wait 500 ms, capture, equal; same for Scan.
  - `E3 — the Scan frame has only dark and light populations in every season` — status reads `Scans`, `matched === total`, contrast > 10, and `midToneFraction < 0.02`.
  - `thrash — rapid view, season and shake changes never grade a moving frame` — Explore, Scan, Explore, `Shake`, Scan, `Winter`, Scan with 150 ms gaps; for 3 s the status is never `Won't scan`; final status `Scans`.
  - `the season dial inside Scan changes nothing` — in settled Scan, capture, turn the dial through all four seasons, capture again: equal and the status still `Scans`.
  - `E5 — reduced motion: no particles or sway, instant season` — `emulateMedia({ reducedMotion: "reduce" })`; Explore frames 500 ms apart equal (after orbiting away); selecting `Winter` then capturing Explore twice 100 ms apart gives identical frames (a sweep in flight would differ); `Breeze` and `Shake` are aria-disabled with the reason in text.
  - `E6 — a poke shakes in Explore and does nothing in Reveal or Scan` — find a trunk pixel, click, frames differ; in settled Reveal the same click leaves frames equal.
  - `the app opens aligned and wakes when you orbit away` — fresh load: two Explore captures 500 ms apart equal; drag to orbit away; two captures 500 ms apart now **differ** (proves the motion exists, so the stillness tests are not vacuous).
  - `E9 — no shader errors across a season cycle and all three views` — collect `console` messages; fail on any matching `WebGLProgram`, `Program Info Log` or `THREE.` error.
  - `E10 — the Reveal PNG is identical with breeze on and off` — verify Scan, Reveal, download, compare bytes across the two states.
  - `E11 — the .glb carries the active season's palette` — pick Autumn, verify Scan, download the `.glb`, parse the JSON chunk, assert the canopy material's `baseColorFactor` equals `seasonColour(summerCanopy, "canopy", "AUTUMN")` converted sRGB→linear within 0.01 (import `seasonColour` from `../src/lib/seasons`).
  - `E12 — a weak palette blocks every export under every season` — Base `#3b4536`; for each season all three export buttons are `aria-disabled="true"` with the reason in text.
  - `a 1000-character link still scans in every season with particles on` — fill 1000 characters; for each season Scan reads `Scans` with `matched === total`.
  - `losing the WebGL context blocks export until the scan re-verifies` — in verified Scan call `getExtension("WEBGL_lose_context").loseContext()`; exports become disabled; `restoreContext()`; status returns to `Scans` and exports re-enable. If the extension is unavailable in this browser, **skip with an explicit annotation**, never pass silently.

- [ ] **Step 2: Run each test in isolation, then the whole file** — `npx playwright test e2e/environment.spec.ts`. Expected: PASS. A failing test that exposes a real defect: **stop and report NEEDS_CONTEXT with the evidence**; do not weaken the test or edit `src/` to make it pass.

- [ ] **Step 3: Run the whole suite twice** — `npm run test:e2e` twice in a row, both green; paste the real output of both runs into the report.

- [ ] **Step 4: Mutation-check E1 and E2.** Temporarily reintroduce a leak (for example, make `restGate` skip zeroing `shake`, or let the SCAN group use the sway material) and confirm the relevant test goes **red**; restore it and confirm green. Put both outputs in the report.

- [ ] **Step 5: Commit**
  ```bash
  git add e2e/environment.spec.ts
  git commit -m "test: prove the still-frame rule and the season guarantees in a browser"
  ```

---

### Task 14: Browser proof — HUD and accessibility

**Files:**
- Create: `e2e/hud.spec.ts`

- [ ] **Step 1: Write `e2e/hud.spec.ts`**:
  - `E7 hotkeys` — `1`/`2`/`3` change the view and `aria-pressed`; typing `2` in the `Link or text` field does not switch views; with `Ctrl` held nothing happens.
  - `the season dial works by keyboard` — focus `Summer`, `ArrowRight` selects `Autumn`, `End` selects `Spring`; the live region contains `Season: Spring`.
  - `Shake is gated with its reason in text` — disabled outside Explore with `Shake works in Explore.`, enabled in Explore.
  - `the Breeze switch is a real switch` — `role="switch"`, `aria-checked` toggles, shows ON/OFF text.
  - `the status plaque stays visible with the HUD collapsed` — click `Collapse controls`; the `role="status"` plaque is in the viewport and the hotbar and dial remain.
  - `E8 — pixel face discipline` — every element whose computed `font-family` includes the pixel face has `font-size ≥ 14px`, and none is an `input`, `select`, `textarea`, `[role=alert]` or inside `[role=status]`.
  - `the HUD fits` — at 1440×900 the controls section covers ≤ ~30 % of the viewport width; at 390×844 expanded it is ≤ 44 % of the height; the collapsed dock is ≤ 96 px; the page never scrolls.

- [ ] **Step 2: Run `npx playwright test e2e/hud.spec.ts e2e/interface.spec.ts`**, then the full suite **twice**; paste both real outputs. Existing contrast tests (light and dark) must pass for the HUD without relaxing them; if a real contrast failure appears, report it with the element and ratio and stop (NEEDS_CONTEXT).

- [ ] **Step 3: Commit**
  ```bash
  git add e2e/hud.spec.ts
  git commit -m "test: prove the HUD's keyboard, contrast and type discipline"
  ```

---

### Task 15: Close out

**Files:**
- Modify: `PRODUCT.md`

- [ ] **Step 1: Update `PRODUCT.md`.** Under `## Brand Commitments` record the visual identity as an owner-directed commitment ("Indie Voxel Game — chunky, tactile, playful; the object leads", pointing to `system_document.md` §1 and §5.5). Under `## Product Principles` add *Alive in Explore, honest in Reveal and Scan.* Do not touch any other section.
- [ ] **Step 2: Run every gate on the final tree** — `npm run lint` (0 problems), `npm run build` (exit 0), `npm test`, `npm run test:e2e` twice. Paste the real output.
- [ ] **Step 3: Manual frame-time note.** In the browser with a 1000-character link in Explore, Winter, particles on, record the average frame time from a short `requestAnimationFrame` sample. It is a **report-only** note, not a gate (software GL in CI is not representative).
- [ ] **Step 4: Commit**
  ```bash
  git add PRODUCT.md
  git commit -m "docs: record the voxel identity and the still-frame principle"
  ```

---

## Self-review

**Spec coverage.** §0A/§1 identity and pillars → Tasks 9–11, 15. §2: FEAT_08 → 9–12; FEAT_09 → 1, 6, 11; FEAT_10 → 4; FEAT_11 → 3, 7; FEAT_12 → 8, 11; FEAT_13 → 2, 5, 13. §3 (font, tooling, per-frame rule, no new dependency) → 9, Global Constraints. §5.2 hotkeys → 12; §5.3 interaction → 8, 11; §5.4 HUD → 9–11; §5.5 visual language → 9, 10. §7 data (`environment`, `hud`, motion) → 2, 11 and the `verifyKey` constraint. §11.2 matrix → 4, 5, 7, 13. §11.3 gate and settle → 2, 5, 7. §11.4 calm → 2, 5. §11.5 seasons → 1, 6. §11.6 materials → 4. §11.7 particles → 3, 7. §11.8 interaction → 8, 11. §11.9 exports → 11 (`seasonTheme` for the `.glb`), 13 (E10, E11). §11.10 budgets → 3 (budget), 7 and 15 (report-only frame note). §11.11 reduced motion → 5, 6, 7, 11, 13. §11.12 E1–E12 → 13, 14. **Gap noted:** the optional quality governor (§11.10) is intentionally not built.

**Interface consistency.** `Environment` / `MotionGate` are defined once in Task 2 and consumed unchanged by Tasks 4–8; `Season` and `seasonTheme` by 1, 6, 11; `onSettled` keeps its name and gains the stricter contract in Task 5 and the forwarding rule in Task 7; `Hud` takes the old `ControlPanel` props in Task 10 and adds exactly the props listed in Task 11.

**Deliberate interpretation for the owner.** The spec's §11.6 says seasonal colour is evaluated "in the fragment stage". This plan applies it by updating each swaying material's diffuse colour uniform (`material.color`) from `phaseColour` once per frame, and injects **vertex** code only. The spec's invariants (uniform-driven, no React re-render per frame, flatten wins, SCAN season-free) all hold, and it avoids a second shader injection for no benefit. If the owner wants the literal fragment-stage evaluation, it is an additive change to Task 4.
