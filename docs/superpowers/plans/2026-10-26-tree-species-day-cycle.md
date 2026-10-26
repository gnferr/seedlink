# Tree Species and Day Cycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the voxel crown with random semi-realistic pixel trees in six species, and replace the per-season pixel sky with a fine-pixel realistic sky driven by a time-of-day slider with a moving sun and moon. The scan check and Save rules stay intact.

**Architecture:**
- **Pure modules in `src/lib/` (node-tested):**
  - grow a tree for a species and seed as leaf cards plus branch segments;
  - turn those pieces into a fold plan, including an ink-block pose;
  - compute every time-dependent sky and light value from one time in [0, 1];
  - precompute the sky noise fields.
- **The R3F scene** renders cards (alpha-tested pixel leaf texture), segments, ink blocks, a shader sky quad, and lights that follow the sun or moon. The lights ease back to today's neutral rig as the tree folds.
- **The page** owns `time`, starting from the local clock. It joins `time` to the scan key and saves the PNG from a neutral-backdrop render that is re-checked before download.

**Tech Stack:** Next.js 16 (read `node_modules/next/dist/docs/` before Next-specific code, per `AGENTS.md`), React 19, React Three Fiber 9, drei 10, three 0.186, node:test, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-26-tree-species-design.md` (Part 1: trees; Part 2: sky and day cycle; plus the settled-answer sections and "Saved PNG backdrop"). Mockups:
- `.superpowers/brainstorm/2012-1792909909/content/tree-pixel-variants.html`, whose `VARIANTS` table holds the species parameters;
- `day-cycle.html`, whose `KF`, `sunPos`, `moonPos` and `makeCycle` define the sky behaviour.

Work on branch `feat/sky-island`.

## Global Constraints

- Species: `oak`, `lushOak`, `willow`, `acacia`, `birch`, `cherry`. The airy oak is out. Picks have equal weight, with no repeat of the previous species.
- A new random tree only on a grow start (first mount, new link, grow after a fold). A season, leaf, time, resize or re-render never regrows the tree.
- Budget per tree: at most 6 000 leaf cards and 1 500 branch segments. The tree growth cap is matrix size 37.
- Crown radius ≥ `(size − 1) / 2` for sizes 21, 25 and 37. For the birch the threshold is ≥ 0.6 × `(size − 1) / 2`, and the birch is the tallest species.
- Fold: every dark module ends covered by exactly one ink block. Carriers are cards first, then segments; winter cards are hidden and never carry; any shortfall rises from the slab (`extraPose`).
- Folded frame: pad and ink are lit exactly like today at fold t = 1, at any time of day. Ink blocks are unlit. The 4-module quiet zone is unchanged.
- Slider: linear in clock time from 06:00 (left, t = 0) to 23:00 (right, t = 1). Local times from 23:00 to 06:00 clamp to t = 1.
  - Periods: Dawn 06:00–08:00, Day 08:00–17:30, Sunset 17:30–19:30, Dusk 19:30–21:00, Night 21:00–23:00.
  - Value text: `"<Period>, HH:MM"`. Range input labelled `Time of day`.
- Sky: rendered on the 2 CSS-px grid (the scene's half-resolution tree-state render), gentle ordered dither, stepped colour, noise fields precomputed once per viewport size. No automatic time advance.
- `verifyKey` = `[qr.text, season, leaf, time]`. The existing 300 ms debounce applies.
- Saved PNG: plain backdrop `#ece8f2` around the code, rendered from the same folded camera and re-checked with the module-centre sampler before download. Filename `sky-island-qr.png`.
- Reduced motion: the slider still works and applies instantly. No new automatic animation.
- No new runtime dependencies. Pure modules import siblings with `.ts`; components use `@/lib/...`.

## Review Focus

1. **A season, leaf or time change while folded or in the tree state** must not regrow the tree. `data-tree-seed` stays the same (Task 9 e2e).
2. **Dragging the time slider while folded:** Save is disabled during the drag and re-enables only after a fresh `Scans · N/N` (Task 9 e2e).
3. **A visitor whose local clock is between 23:00 and 06:00** gets the slider at the Night end (Task 5 unit, Task 9 e2e with `page.clock`).
4. **Winter, a large code and a sparse species** together: the fold still covers every module exactly once, with extras making up the shortfall (Task 2 unit).
5. **Saving at night** writes the neutral backdrop, not the starry sky. The image corners are `#ece8f2` (Task 9 e2e).

---

### Task 1: Species tree generator

**Files:**
- Modify: `src/lib/tree.ts` (rewrite)
- Modify: `src/lib/tree.test.ts` (rewrite)

**Interfaces:**
- Consumes: `mulberry32`, `hash3` (`src/lib/rng.ts`).
- Produces:

```ts
export type Species = "oak" | "lushOak" | "willow" | "acacia" | "birch" | "cherry";
export const SPECIES: readonly Species[];
export type LeafCard = { x: number; y: number; z: number; rotY: number; tilt: number; size: number; shade: number; speck: boolean }; // speck = fruit/petal card, never a carrier
export type Segment = { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; r0: number; r1: number }; // tapered limb piece
export type Tree = { species: Species; cards: LeafCard[]; segments: Segment[]; top: number; trunkHeight: number; crownRadius: number };
export const CARD_BUDGET = 6000, SEGMENT_BUDGET = 1500, TREE_GROWTH_CAP = 37;
export function growTree(species: Species, seed: number, size: number): Tree;
export function pickSpecies(previous: Species | null, r: number): Species; // r in [0,1); never returns `previous`
```

Approach: a 3D port of the mockup's `tree()`.
- **Trunk and roots:** a tapered trunk as stacked segments, plus a root flare.
- **Limbs:** they radiate around the trunk (azimuth evenly spread plus jitter) and split recursively with the species' `split`, `fork`, `lift`, `bend` and `depth`.
- **Clumps:** at twig tips (and some inner nodes), each a cloud of cards inside a flattened ellipsoid of radius `clump`.
- **Per-species parameters:** from the mockup's `VARIANTS`, with `cherry` and `lushOak` adding `speck` cards. The willow adds hanging strands as chains of cards. The acacia's clumps are flattened (`flat` 0.32). The birch is tall and slim.
- **Scale:** `TS = max(1.1, min(size, 37) / 17)`. Card and segment counts are clamped to the budgets.
- `crownRadius` = max horizontal distance over non-speck cards. `top` = max card or segment y.

- [ ] **Step 1: Write the failing tests:**
  - for every species, `growTree(s, 42, 25)` deep-equals `growTree(s, 42, 25)`, and differs from `growTree(s, 43, 25)`;
  - for every species at size 37, `cards.length ≤ 6000` and `segments.length ≤ 1500`, and `growTree(s, 1, 101)` has the same counts as size 37;
  - for sizes 21, 25 and 37, every species except birch has `crownRadius ≥ (size − 1) / 2`; birch has `crownRadius ≥ 0.6 * (size − 1) / 2`, and its `top` is greater than every other species' `top` for the same seed and size;
  - the lowest trunk segment starts at y = 0 within `|x|, |z| ≤ 1.5`;
  - over 1 000 calls with `r = i / 1000`, `pickSpecies("oak", r)` never returns `"oak"` and returns each of the other five at least 150 times; `pickSpecies(null, r)` covers all six.
- [ ] **Step 2:** `node --experimental-strip-types --test src/lib/tree.test.ts` → FAIL.
- [ ] **Step 3:** Implement `src/lib/tree.ts`.
- [ ] **Step 4:** Same command → PASS. Also run `npm test`; `fold.test.ts` will fail until Task 2, so note it and don't fix it here.
- [ ] **Step 5:** Commit `feat: six semi-realistic tree species as cards and segments`.

### Task 2: Fold plan over cards and segments

**Files:**
- Modify: `src/lib/fold.ts`, `src/lib/fold.test.ts`

**Interfaces:**
- Consumes: `Tree`, `LeafCard`, `Segment` (Task 1); `DarkModule` (`qr.ts`); `hash3`.
- Produces:

```ts
export type FoldPiece = { x: number; y: number; z: number; canCarry: boolean }; // cards first (index i), then segments (index cards.length + j), midpoint for segments
export function foldPieces(tree: Tree, winter: boolean): FoldPiece[]; // winter: cards and specks canCarry = false; specks never carry
export function planFold(pieces: FoldPiece[], top: number, dark: DarkModule[], seed: number): FoldPlan; // same FoldPlan shape, indexed by piece
export function piecePose(plan: FoldPlan, pieces: FoldPiece[], dark: DarkModule[], i: number, t: number, out: Pose): Pose; // replaces voxelPose
export function inkPose(plan: FoldPlan, pieces: FoldPiece[], dark: DarkModule[], j: number, t: number, out: Pose): Pose; // ink block for dark module j
// keep: FOLD_SECONDS, FLIGHT, MODULE_BLOCK, easeInOutCubic, extraPose, FoldPlan, Pose
```

- **Carriers:** choose from `canCarry` pieces, cards before segments, each group shuffled by `hash3(i, 7, 7, seed)`.
- **Carrier pose:** follows today's `voxelPose` path to the module. Its scale goes from 1 to 0 over local progress 0.7–1. `ink = 0`, since the card or segment colour itself is not inked.
- **Ink pose:** module j's carrier position at the same local progress. Its scale goes from 0 to `MODULE_BLOCK` over 0.7–1 and is exactly `MODULE_BLOCK` at t = 1. A module listed in `extras` gets `extraPose`.

- [ ] **Step 1: Write the failing tests:**
  - for every species, sizes 21, 25 and 37, and both `winter` values: every dark module index appears exactly once across the carriers and `extras`;
  - with `winter = true` no card index is a carrier;
  - specks are never carriers;
  - for every j at t = 1, `inkPose` is at `(dark[j].x, MODULE_BLOCK.y, dark[j].z)` with scale `(0.98, 0.6, 0.98)`;
  - at t = 0 every `inkPose` has scale 0 and every `piecePose` sits at the piece's start with scale 1;
  - at t = 1 every `piecePose` has scale 0;
  - plans are deterministic for the same seed;
  - Review Focus 4: `growTree("birch", 9, 37)` with `winter = true` against the dark modules of a 37-module code still covers every module exactly once.
- [ ] **Step 2:** `node --experimental-strip-types --test src/lib/fold.test.ts` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Same command and `npm test` → PASS (except tests of files the next tasks replace, if any; list them).
- [ ] **Step 5:** Commit `feat: fold leaf cards and branch segments into ink blocks`.

### Task 3: Tree colours per season and species

**Files:**
- Modify: `src/lib/palette.ts`, `src/lib/palette.test.ts`

**Interfaces:**
- Consumes: `Season`; `Species` (Task 1); `leafShade` (existing).
- Produces:

```ts
export type TreeColours = { leaves: string[]; speck: string | null; bark: string; twig: string; barkMarks: string | null; leafKeep: number; snowCap: string | null };
export function treeColours(season: Season, species: Species, leafOverride: string | null): TreeColours;
```

- **Values** come from the mockup `VARIANTS`:
  - summer: the species' green ramp;
  - spring: the cherry pink ramp with white specks;
  - autumn: the autumn ramp, `leafKeep` 0.6;
  - winter: `leafKeep` 0.08, `snowCap` `#f4f8ff`.
- **Birch:** bark `#e8e4dc`, marks `#2a2420`.
- **Lush oak:** speck `#ecf27a` in summer.
- **Leaf override:** replaces the leaf ramp (via `leafShade`) in every season except winter.

- [ ] **Step 1: Write the failing tests:**
  - every season and species returns at least 4 leaf colours as hex;
  - winter has `leafKeep < 0.15` and a non-null `snowCap`;
  - spring has a non-null `speck`;
  - birch has bark `#e8e4dc`;
  - an override changes the leaves in summer but not in winter.
- [ ] **Step 2:** Run `node --experimental-strip-types --test src/lib/palette.test.ts` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run again → PASS.
- [ ] **Step 5:** Commit `feat: tree colours per season and species`.

### Task 4: Render the new trees and the ink blocks

**Files:**
- Modify: `src/components/island/TreeMesh.tsx` (rewrite), `src/components/island/IslandScene.tsx`, `src/components/island/Particles.tsx`, `src/components/island/FoldCamera.tsx` (only if they read removed fields)
- Create: `src/components/island/leafTexture.ts`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  - `IslandSceneProps` gains `onTree(species: Species, seed: number): void`.
  - The scene draws the species with `pickSpecies(previous, Math.random())` and the seed with `Math.floor(Math.random() * 2 ** 31)` when a grow starts, and keeps them in a ref. A grow start is first mount, a new matrix, or the target `folded` turning false.
  - The plan uses `planFold(foldPieces(tree, season === "WINTER"), tree.top, dark, treeSeed)`.

Rendering:
- **`leafTexture.ts`:** builds one 16×16 cut-out leaf `CanvasTexture`. Nearest filtering, alpha used only by `alphaTest: 0.5`, sRGB.
- **`TreeMesh`** holds four instanced meshes, all with `frustumCulled={false}`:
  1. **Cards:** plane geometry, Lambert material, the texture, double-sided, per-instance colour from `treeColours`. Hidden cards beyond `leafKeep` (deterministic by `hash3`) get scale 0.
  2. **Segments:** an unit box scaled and oriented from `(x0, y0, z0)` to `(x1, y1, z1)`, with width tapering from `r0` to `r1` through scale. Bark colour.
  3. **Ink:** box `MODULE_BLOCK`, `meshBasicMaterial` colour `INK`, count = dark modules.
  4. **Extras:** as today.
- **Sway, poke and writing:** sway and poke apply to cards in the tree state, as today. Matrices are written each frame only while `0 < t < 1` or while swaying, with no per-frame allocation.
- **Taps:** raycast the card and segment meshes as the tree (tap anywhere on a card quad), the island as ground.

- [ ] **Step 1:** Implement. Keep `Particles` and `FoldCamera` working through `top`, `trunkHeight` and `crownRadius`.
- [ ] **Step 2:** Run `npx tsc --noEmit`, `npx eslint src`, `npm test` → clean and green.
- [ ] **Step 3:** In the dev server (built-in browser or HTTP 200 + clean log), check:
  - each reload shows a different species;
  - a fold reaches `Scans · N/N`;
  - a grow after it shows a new species;
  - changing season keeps the same tree.

  Save screenshots of two species and of the mid-fold.
- [ ] **Step 4:** Commit `feat: render random species trees and fold them through ink blocks`.

### Task 5: Day-cycle model

**Files:**
- Create: `src/lib/daycycle.ts`, `src/lib/daycycle.test.ts`

**Interfaces:**
- Produces:

```ts
export type Period = "Dawn" | "Day" | "Sunset" | "Dusk" | "Night";
export type RGB = [number, number, number];
export type SkyState = {
  sun: { x: number; y: number; up: boolean }; moon: { x: number; y: number; up: boolean }; // x,y in [0,1] screen space, y down
  sky: [RGB, RGB, RGB, RGB]; light: RGB; ambient: RGB; haze: RGB; cloudLit: RGB; cloudDark: RGB;
  starAlpha: number; night: number; keyFromLeft: boolean;
};
export function timeFromClock(hours: number, minutes: number): number; // 06:00 → 0, 23:00 → 1, 23:00–06:00 → 1
export function clockFromTime(t: number): { hours: number; minutes: number };
export function periodAt(t: number): Period;
export function timeLabel(t: number): string; // "Sunset, 18:40"
export function skyState(t: number): SkyState;
```

Behaviour:
- **Keyframes:** the mockup `KF` colours, placed at clock times Dawn 06:00, Day 08:00, Afternoon 15:00, Sunset 18:30, Dusk 20:00, Night 23:00, then converted to t. Colours interpolate linearly between neighbouring keyframes.
- **Sun:** up from 06:00 to 19:30, along the mockup's `sunPos` arc over that span.
- **Moon:** up from 18:30, along `moonPos`.
- **Night and stars:** `starAlpha` = `night` = smoothstep from 19:00 to 21:30.

- [ ] **Step 1: Write the failing tests:**
  - `timeFromClock(6, 0) === 0`, `(23, 0) === 1`, `(23, 30) === 1`, `(3, 0) === 1` (Review Focus 3), and `(14, 30)` equals `(14.5 - 6) / 17`;
  - `clockFromTime(timeFromClock(18, 40))` gives `{ hours: 18, minutes: 40 }`;
  - `periodAt` returns Dawn at 07:00, Day at 12:00, Sunset at 18:00, Dusk at 20:00 and Night at 22:00;
  - `timeLabel(timeFromClock(18, 40)) === "Sunset, 18:40"`;
  - for 1 000 steps across [0, 1], neighbouring `skyState` colours differ by at most 12 per channel (continuity);
  - `sun.up` is true at 12:00 and false at 21:00, and `moon.up` is true at 22:00;
  - `starAlpha` is 0 at 12:00 and ≥ 0.95 at 22:30.
- [ ] **Step 2:** Run `node --experimental-strip-types --test src/lib/daycycle.test.ts` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run again → PASS.
- [ ] **Step 5:** Commit `feat: day-cycle model for sky, sun, moon and light`.

### Task 6: Shader sky with precomputed fields

**Files:**
- Create: `src/lib/skyFields.ts`, `src/lib/skyFields.test.ts`, `src/components/island/SkyDome.tsx`
- Delete: `src/components/island/SkyBackground.tsx`, `src/lib/sky.ts`, `src/lib/sky.test.ts`
- Modify: `src/lib/palette.ts` and `palette.test.ts` (remove `SkySpec` and `PALETTES[*].sky` plus their tests), `IslandScene.tsx`

**Interfaces:**
- Consumes: `SkyState`, `skyState` (Task 5).
- Produces:
  - `buildSkyFields(width: number, height: number, seed: number): { density: Float32Array; shade: Float32Array; milky: Float32Array; width: number; height: number }`, all values in [0, 1], following the mockup's `makeCycle` precompute;
  - `<SkyDome time={number} />`, which renders behind everything.

Approach:
- **Geometry:** a full-screen quad in its own `ShaderMaterial` (depthWrite off, renderOrder −1), in clip space so the camera doesn't affect it.
- **Data:** the three fields as `DataTexture`s, rebuilt only when the drawing-buffer size changes. Uniforms come from `skyState(time)`.
- **Fragment shader:** reproduces the mockup's per-pixel maths, quantised to steps of 10/255 with a 4×4 Bayer dither:
  - the sky stops;
  - the sun scattering;
  - the moon glow;
  - the Milky Way × night;
  - clouds lit toward the key light.
- **Discs and stars:** the sun and moon discs and the stars are drawn in the shader. Stars come from a hash of the pixel cell, with alpha × `starAlpha`.
- **Cloud sea:** a soft band at the bottom.

- [ ] **Step 1: Write the failing tests** in `skyFields.test.ts`:
  - output lengths are `width * height`;
  - every value is in [0, 1];
  - two builds with the same arguments are identical;
  - density is 0 outside the cloud band (v < 0.14 or v > 0.66).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `skyFields.ts`, then `SkyDome`. Swap `SkyBackground` for `SkyDome` in the scene, delete the old sky files, and trim `palette.ts`.
- [ ] **Step 4:** Run `npx tsc --noEmit`, `npx eslint src` and `npm test` → green. In the dev server, set the slider value through a temporary prop and check that dawn, noon, sunset and night look like `day-cycle.html`.
- [ ] **Step 5:** Commit `feat: fine-pixel realistic sky rendered in a shader`.

### Task 7: Light that follows the sun and moon, neutral when folded

**Files:**
- Modify: `src/components/island/IslandScene.tsx` (plus a small `SkyLights.tsx` if it keeps the file focused)

**Interfaces:**
- Consumes: `skyState` (Task 5); `FoldState` (the existing `foldRef`).
- Produces: `IslandSceneProps` gains `time: number`, which is passed to `SkyDome` and the lights.

Each frame:
- **Moonlight / sunlight:** the moon light (directional) takes its direction from the sun position when the sun is up, otherwise from the moon (from the left when `keyFromLeft`), with colour `light`.
- **Hemisphere:** sky colour `ambient`, ground `haze`.
- **Fog:** colour `haze`, so the underside fades.
- **Glow:** a soft glow sprite behind the island in `light`.
- **Toward neutral:** every one of these values lerps toward today's neutral rig by `easeInOutCubic(fold.t)`. At t = 1 they equal today's values exactly. Today's values are hemisphere `#b8b0ff` / `#2a2140` 1.1, moon `#fff4e0` 1.6 from (30, 50, −10), fill `#9ec5ff` 0.5, with no fog.
- **Allocation:** reuse Color objects.

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Run `npx tsc --noEmit`, `npx eslint src`, `npm test` → green.
- [ ] **Step 3:** In the dev server, fold at the Night end and at the Day end: both reach `Scans · N/N`, and the folded pad looks the same in both. Take screenshots.
- [ ] **Step 4:** Commit `feat: island lit by the sun and moon, neutral when folded`.

### Task 8: Time slider, page state, backdrop export

**Files:**
- Create: `src/components/controls/TimeSlider.tsx`
- Modify: `src/components/controls/SeasonPanel.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `src/components/island/IslandScene.tsx`, `src/lib/exporters.ts`

**Interfaces:**
- Consumes: `timeFromClock`, `timeLabel`, `periodAt` (Task 5); `sampleScan` (existing); `IslandSceneProps.time` (Task 7); `onTree` (Task 4).
- Produces:
  - `<TimeSlider value={number} onChange={(t) => void} />`:
    - a native `<input type="range" min=0 max=1000>` labelled `Time of day`, with `aria-valuetext={timeLabel(t)}`;
    - a pixel-stepped track coloured through the day, a stepped thumb, a sun or moon icon (`PixelIcon` sun / a new moon icon) and the period name;
    - the firefly-gold focus ring.
  - `IslandSceneProps` gains `onExportReady(render: () => HTMLCanvasElement): void`. The scene registers a function that:
    1. sets `scene.background` to `#ece8f2` and hides `SkyDome`;
    2. renders one frame with the current folded camera;
    3. copies the drawing buffer to a new 2D canvas of the same size;
    4. restores the sky;
    5. returns the copy.
  - `exportPng` keeps its signature and is passed the copy.

Page:
- **Time state:** `time` starts at `timeFromClock` of the local clock, set in a client effect on mount (the default before mount is 0.35). It survives season and link changes.
- **Check key:** `verifyKey` includes `time`.
- **Wiring:** pass `time` to the scene and the slider, which sits in `SeasonPanel` under the season radiogroup.
- **Tree attributes:** `onTree` sets `data-species` / `data-tree-seed` on the scene wrapper.
- **Save:**
  1. call the registered exporter;
  2. run `sampleScan(copy, qr.matrix, frame.insets)`;
  3. if it is not separated, block with `This code won't scan: <reason>.` and don't download;
  4. otherwise call `exportPng(copy, "sky-island-qr.png")`.

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Run `npx tsc --noEmit`, `npx eslint src`, `npm test` → green.
- [ ] **Step 3:** In the dev server:
  - the slider starts at the local time;
  - dragging moves the sun;
  - dragging while folded disables Save until the check passes again;
  - Save at night downloads an image whose corners are `#ece8f2`.
- [ ] **Step 4:** Commit `feat: time-of-day slider, local-time start, neutral PNG backdrop`.

### Task 9: E2E for species and day cycle

**Files:**
- Modify: `e2e/island.spec.ts` (do not touch `e2e/environment.spec.ts` or `e2e/helpers.ts`)

**Interfaces:**
- Consumes: the accessible names and attributes from Tasks 4 and 8; the hint copy from `src/lib/status.ts`.

- [ ] **Step 1: Write the tests:**
  - **Different trees:** fold, then grow; the `data-tree-seed` after the grow differs from before, and over three grows at least two different `data-species` appear.
  - **No regrow (Review Focus 1):** changing season, leaf colour and time (tree state and folded) leaves `data-tree-seed` unchanged.
  - **Slider:** a slider named `Time of day` exists, and ArrowRight changes its `aria-valuetext`.
  - **Clock start (Review Focus 3):** with `page.clock.setFixedTime` at 14:30 local the slider value text starts with `Day, 14:30`; at 03:00 it starts with `Night, 23:00`.
  - **Day and night:** folding at slider value 0 and at 1000 both reach `Scans · N/N`.
  - **Drag while folded (Review Focus 2):** Save turns `aria-disabled="true"` immediately and later re-enables with N/N.
  - **Night PNG (Review Focus 5):** the saved PNG at the Night end has corner pixels within 6 of `#ece8f2`, and the existing independent finder/quiet-zone test still passes on it.
  - **Winter:** fold reaches N/N.
- [ ] **Step 2:** Run `npx playwright test e2e/island.spec.ts --workers=1` → all pass.
- [ ] **Step 3:** Commit `test: e2e for random species and the day cycle`.
