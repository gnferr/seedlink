# Sky Island Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the anamorphic tree with a big voxel tree on a floating, link-seeded island that folds into its own scannable QR code, under a dithered pixel sky, driven by a pixel-stepped glass control pill.

**Architecture:** World generation (island, tree, fold mapping, palettes, sky pixels) lives in pure, node-tested modules in `src/lib/`. A new React Three Fiber scene in `src/components/island/` renders those voxels with instanced meshes and runs one fold timeline (tree → folded → tree). `src/app/page.tsx` owns the state (link, season, leaf colour, folded), runs the existing scan check on the settled folded frame, and gates Save; new controls in `src/components/controls/` replace the HUD.

**Tech Stack:** Next.js 16 (read `node_modules/next/dist/docs/` before writing Next-specific code, per `AGENTS.md`), React 19, React Three Fiber 9, drei 10, three 0.186, Tailwind v4, `qrcode`, node:test, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-25-sky-island-design.md`. Behaviour and look reference: `.superpowers/brainstorm/2012-1792909909/content/spike-island.html` (throwaway, plain three.js; port its numbers, not its structure). Sky reference: `sky-v10.html`; controls reference: second take in `ui-bar-v2.html` (same folder).

## Global Constraints

- Quiet zone: the slab is the matrix plus `QUIET_ZONE` (4) light modules on every side; grass starts outside it.
- Folded module blocks and finder tiles are the ink colour `#2a2140` in the folded state; finders are grass-coloured only in the tree state.
- Scan check = existing `sampleScan` / `classifySeparation`, `MIN_SCAN_CONTRAST` = 3, run once the fold has finished and the camera settled, debounced 300 ms, never per frame; a result for other inputs is never shown.
- Save is enabled only for a passed check of the current link, season and leaf colour, graded under the framing on screen now; a disabled Save says why in text.
- While folded and settled nothing moves inside the slab: no bob, no sway, particles hidden.
- Reduced motion: fold/grow instant, no bob, no sway, no particles, season snaps.
- Client-side only; no new runtime dependencies.
- Accessible names: field `Link or text`; radiogroup `Season` with `Spring`, `Summer`, `Autumn`, `Winter`; hint chip is a button named `Fold into code` / `Grow the tree`; leaf swatches are buttons named `Leaf colour <name>`; Save button named `Save`; focus ring firefly gold `#ffd27a`; text contrast 4.5:1.
- No ambient sound; sound off by default; chime on fold/grow, chirp on poke.
- No `.glb` export; Save writes `sky-island-qr.png`.
- Budgets: island ≤ 6000 voxels, tree ≤ 8000 voxels, visible-face voxels only; tree scale stops growing past `n = 37`.
- Pure modules in `src/lib/` import siblings with the `.ts` extension (the node test runner strips types); components import with `@/lib/...`.

## Review Focus

1. **Link edited while folded or mid-fold** — the world regrows, the old verdict is never shown, Save goes disabled until the new code is folded and passes. (Task 11, e2e)
2. **Window resized while folded** — the top-down framing refits and the code is re-checked; Save stays disabled until the check under the new framing passes. (Task 11, e2e; Task 7 unit for `gradedNow`)
3. **Season or leaf colour changed while folded** — the code is re-checked and still reads N/N; Save is disabled during the re-check. (Task 11, e2e)
4. **Taps during an animation** — a tap while folding or growing is ignored; it never reverses or restarts the animation. (Task 8 unit on `nextFoldTarget`, Task 11 e2e)
5. **Orbit drag mistaken for a tap** — a pointer that moved more than 6 px between down and up is a drag: it never folds or pokes. (Task 8 unit on `isTap`)

---

### Task 1: Branch and keep the finder helper

**Files:**
- Modify: `src/lib/qr.ts` (already holds the uncommitted `isFinder`), `src/lib/qr.test.ts`
- Revert: `src/components/scene/Blocks.tsx` (uncommitted pad-tile edit; the file is deleted in Task 12)

**Interfaces:**
- Produces: `isFinder(x: number, z: number, size: number): boolean` (x = column, z = row); `type DarkModule = { col: number; row: number; x: number; z: number }`; `darkModules(m: QrMatrix): DarkModule[]` with `x = col - (size - 1) / 2`, `z = row - (size - 1) / 2`, row-major order.

- [ ] **Step 1:** `git switch -c feat/sky-island` from `feat/living-meadow`. Leave `e2e/environment.spec.ts` and `e2e/helpers.ts` unstaged (the owner's own work). Run `git restore src/components/scene/Blocks.tsx`.
- [ ] **Step 2: Write the failing test** in `src/lib/qr.test.ts`:

```ts
test("darkModules lists every dark cell once, centred on the slab", () => {
  const m = generateMatrix("https://example.com");
  const d = darkModules(m);
  assert.equal(d.length, [...m.cells].filter((c) => c === 1).length);
  const half = (m.size - 1) / 2;
  for (const { col, row, x, z } of d) {
    assert.equal(m.cells[row * m.size + col], 1);
    assert.equal(x, col - half);
    assert.equal(z, row - half);
  }
  assert.deepEqual(d[0], { col: 0, row: 0, x: -half, z: -half }); // finder corner is dark
});
```

- [ ] **Step 3:** Run `node --experimental-strip-types --test src/lib/qr.test.ts` — expect FAIL (`darkModules` not exported).
- [ ] **Step 4:** Implement `darkModules` in `src/lib/qr.ts`.
- [ ] **Step 5:** Run the same command — expect PASS (the finder test from the earlier session passes too).
- [ ] **Step 6: Commit** `git add src/lib/qr.ts src/lib/qr.test.ts && git commit -m "feat: finder and dark-module helpers for the fold"`

### Task 2: Seeded randomness

**Files:**
- Create: `src/lib/rng.ts`, `src/lib/rng.test.ts`

**Interfaces:**
- Produces: `hashString(s: string): number` (uint32, FNV-1a); `mulberry32(seed: number): () => number` (values in [0, 1)); `hash3(x: number, y: number, z: number, k?: number): number` (stateless, [0, 1)).

- [ ] **Step 1: Write the failing tests:** `hashString("https://example.com")` equals itself across calls and differs from `hashString("https://example.org")`; two `mulberry32(42)` streams give the same first 100 values, all in [0, 1); `hash3(1,2,3) === hash3(1,2,3)`, `hash3(1,2,3) !== hash3(1,2,4)`, and over a 20×20×5 grid the mean of `hash3` is within 0.45–0.55.
- [ ] **Step 2:** `node --experimental-strip-types --test src/lib/rng.test.ts` — FAIL.
- [ ] **Step 3:** Implement the three functions (same algorithms as the spike's `hashStr`, `rng`, `hash3`).
- [ ] **Step 4:** Same command — PASS.
- [ ] **Step 5: Commit** `feat: seeded hash and rng helpers`

### Task 3: Island generator

**Files:**
- Create: `src/lib/island.ts`, `src/lib/island.test.ts`

**Interfaces:**
- Consumes: `hashString`, `mulberry32`, `hash3` (Task 2); `QUIET_ZONE` (`qr.ts`).
- Produces:

```ts
export type IslandKind = "pad" | "grass" | "dirt" | "mix" | "stone";
export type IslandVoxel = { x: number; y: number; z: number; depth: number; kind: IslandKind }; // y = -0.5 - depth (cube centre; top surface at y = 0)
export type Deco = { x: number; z: number; kind: "tuft" | "flower"; tint: number };
export type Island = {
  slabHalf: number;      // (size - 1) / 2 + QUIET_ZONE
  radius: number;        // max rim distance, for camera framing
  depth: number;         // underside layers
  voxels: IslandVoxel[];
  deco: Deco[];          // on grass only, never on the slab
  waterfall: { x: number; z: number; length: number }; // column top at the rim, length in voxels
};
export const ISLAND_VOXEL_BUDGET = 6000;
export function growIsland(seed: number, size: number): Island;
```

Shape (from the spike's `buildWorld`): rim = superellipse (exponent 5) of half-size `slabHalf + 2.6`, plus harmonics k = 3, 4, 5, 7 with amplitude `rng() / sqrt(k)` times 1.1, plus an optional lobe (probability 0.6, width 0.35–0.65 rad, height 2–5); clamped to at least `superellipse − 0.4`. Depth 12–19, taper exponent 1.0–1.5, lean up to ±3 per axis at the tip, ragged edge `hash3 · 1.4`. Kind by depth: 0 → `pad` inside the slab else `grass`; 1–2 → `dirt`; 3–4 → `mix`; deeper → `stone`. Keep a voxel only if a horizontal neighbour in its layer is missing, or it is in the top or bottom layer. Waterfall at the rim angle maximising `(cos a + sin a) · rim(a)` while at least 0.55 rad from 45°; length `depth + 18`.

- [ ] **Step 1: Write the failing tests:**
  - same seed and size give deeply equal islands; seeds 1 and 2 give different voxel counts or positions;
  - for sizes 21, 25, 37, 57 and seeds 0–19: every slab cell `(x, z)` with `|x|, |z| ≤ slabHalf` exists at depth 0 with kind `pad`, and every depth-0 voxel outside the slab has kind `grass` (the rim never cuts the slab or quiet zone);
  - `slabHalf === (size - 1) / 2 + QUIET_ZONE`;
  - `voxels.length ≤ ISLAND_VOXEL_BUDGET` for size 57;
  - no `deco` entry lies inside the slab;
  - the waterfall top `(x, z)` lies outside the slab.
- [ ] **Step 2:** `node --experimental-strip-types --test src/lib/island.test.ts` — FAIL.
- [ ] **Step 3:** Implement `growIsland`.
- [ ] **Step 4:** Same command — PASS.
- [ ] **Step 5: Commit** `feat: link-seeded floating island generator`

### Task 4: Tree generator

**Files:**
- Create: `src/lib/tree.ts`, `src/lib/tree.test.ts`

**Interfaces:**
- Consumes: `hash3` (Task 2).
- Produces:

```ts
export type TreeKind = "trunk" | "root" | "leaf" | "vine";
export type TreeVoxel = { x: number; y: number; z: number; kind: TreeKind; shade: number }; // y = cube centre, shade in [0, 1)
export type Tree = { voxels: TreeVoxel[]; top: number; trunkHeight: number; crownRadius: number };
export const TREE_VOXEL_BUDGET = 8000;
export const TREE_GROWTH_CAP = 37;
export function growTree(size: number): Tree;
```

Scale `TS = max(1.1, min(size, TREE_GROWTH_CAP) / 17)`; trunk height `round(9 · TS)`, 3×3 when `TS > 1.25` else 1×1; roots two voxels out on each side at y 0.3; branches and the eight crown clumps exactly as the spike (clump centres and radii scaled by `0.9 · TS`, vertical radius × 0.7, edge voxels kept with probability 0.5 via `hash3`); keep only crown voxels with an exposed face; 22 vines of 3–8 voxels hanging from the crown underside.

- [ ] **Step 1: Write the failing tests:**
  - `growTree(25)` deep-equals `growTree(25)`;
  - `growTree(37)` and `growTree(101)` have the same voxel count (growth cap);
  - `voxels.length ≤ TREE_VOXEL_BUDGET` for size 37;
  - for sizes 21, 25, 37: `crownRadius ≥ (size - 1) / 2` (the crown overhangs the code) and every trunk voxel has `|x|, |z| ≤ 1`;
  - no leaf voxel has all six neighbours present (interior culled);
  - `top` equals the largest voxel `y`.
- [ ] **Step 2:** `node --experimental-strip-types --test src/lib/tree.test.ts` — FAIL.
- [ ] **Step 3:** Implement `growTree`.
- [ ] **Step 4:** Same command — PASS.
- [ ] **Step 5: Commit** `feat: big voxel tree generator`

### Task 5: Fold plan and poses

**Files:**
- Create: `src/lib/fold.ts`, `src/lib/fold.test.ts`

**Interfaces:**
- Consumes: `TreeVoxel` (Task 4), `DarkModule` (Task 1), `hash3` (Task 2).
- Produces:

```ts
export const FOLD_SECONDS = 1.8;
export const FLIGHT = 0.45;                                  // fraction of the timeline one voxel spends flying
export const MODULE_BLOCK = { y: 0.3, width: 0.98, height: 0.6 }; // a folded module block
export type FoldPlan = {
  carrier: Int32Array;   // per tree voxel: index into dark modules, or -1
  extras: number[];      // dark-module indices with no tree voxel left; they rise from the slab
  delay: Float32Array;   // per tree voxel, crown top first: (top - y) / top * 0.5 + jitter (≤ 0.08)
  arc: Float32Array;     // 1.5–4.5
  spin: Float32Array;    // −3…3
  scatter: Float32Array; // x,z pairs where non-carriers shrink to, inside the slab
};
export type Pose = { x: number; y: number; z: number; sx: number; sy: number; sz: number; rotY: number; ink: number };
export function planFold(tree: TreeVoxel[], top: number, dark: DarkModule[], seed: number): FoldPlan;
export function voxelPose(plan: FoldPlan, tree: TreeVoxel[], dark: DarkModule[], i: number, t: number, out: Pose): Pose;
export function extraPose(module: DarkModule, t: number, out: Pose): Pose; // grows in over t ∈ [0.5, 1]
export function easeInOutCubic(t: number): number;
```

Carriers: shuffle tree indices deterministically by `hash3(i, 7, 7, seed)`, give the first `dark.length` of them one dark module each in order. Pose: local `e = easeInOutCubic(clamp((t − delay) / FLIGHT))`; position lerps start → end with `+ sin(π e) · arc` on y; carriers end at `(x, MODULE_BLOCK.y, z)` scaled `(0.98, 0.6, 0.98)` with `ink = e`; non-carriers scale `1 − e` uniformly, `ink = 0`; `rotY = e (1 − e) · spin`. `out` is written and returned (no allocation).

- [ ] **Step 1: Write the failing tests:**
  - for `growTree(25)` and the dark modules of `"https://example.com"`: every dark index appears exactly once across `carrier` (≥ 0 entries) and `extras`;
  - with a 50-voxel synthetic tree and 120 dark modules: 50 carriers and 70 extras;
  - `voxelPose(..., t = 0)` equals the voxel's start position with scale 1 and `ink 0` for every voxel;
  - `voxelPose(..., t = 1)` puts every carrier at its module's `(x, 0.3, z)` with `sx 0.98, sy 0.6, ink 1`, and every non-carrier at scale 0;
  - `extraPose(m, 1)` is `(m.x, 0.3, m.z)` with scale `(0.98, 0.6, 0.98)`; `extraPose(m, 0.4)` has scale 0;
  - a voxel with larger `y` never has a larger `delay` than one 3 or more units lower (crown top falls first);
  - `planFold` is deterministic for the same inputs.
- [ ] **Step 2:** `node --experimental-strip-types --test src/lib/fold.test.ts` — FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Same command — PASS.
- [ ] **Step 5: Commit** `feat: fold mapping from tree voxels to QR modules`

### Task 6: Season palettes and the pixel sky

**Files:**
- Create: `src/lib/palette.ts`, `src/lib/palette.test.ts`, `src/lib/sky.ts`, `src/lib/sky.test.ts`

**Interfaces:**
- Consumes: `Season` from `seasons.ts`; `contrastRatio`, `relativeLuminance`, `MIN_SCAN_CONTRAST` from `verify.ts`; `mulberry32`, `hashString` (Task 2).
- Produces:

```ts
// palette.ts
export const INK = "#2a2140";
export const PAD = "#e6e0ef";
export type SkySpec = { hue: number; hueStep: number; bright: [number, number]; sat: [number, number]; moon: "full" | "crescent" | null; sun: boolean; aurora: string | null; stars: number };
export type SeasonPalette = { grass: [string, string, string]; dirt: string; stone: string; leaf: string; trunk: string; particle: string; particleKind: "petal" | "firefly" | "leaf" | "snow"; sky: SkySpec };
export const PALETTES: Record<Season, SeasonPalette>;
export const LEAF_SWATCHES: readonly { name: string; hex: string }[]; // 8 entries
export function leafShade(base: string, shade: number, sunlit: boolean): string;
// sky.ts
export const SKY_WIDTH = 240, SKY_HEIGHT = 160, SKY_STEPS = 14;
export function skyRamp(spec: SkySpec): [number, number, number][];
export function renderSky(season: Season): Uint8ClampedArray; // RGBA, SKY_WIDTH × SKY_HEIGHT
```

Values: copy `SEASONS` from the spike (grass, dirt, leaf, sky tuple `[hue, hueStep, b0, b1, s0, s1]`, moon/sun, particle colour and kind); stone `#8d84a0`, trunk `#5a3b2e`; aurora `hsb(168,40,70)` summer and `hsb(160,34,74)` winter, `null` otherwise; stars 26/55/8/70 for spring/summer/autumn/winter. Swatches: Leaf green `#4fae5e`, Mint `#8fd18a`, Blossom `#f58cb4`, Ember `#e8662a`, Gold `#f2c14e`, Sky `#7aa7ff`, Lilac `#b38cff`, Frost `#eef4fc`. `renderSky` ports the spike's `drawSky` (8×8 Bayer dither, island glow, vignette, stars, moon halo, banded sun, cloud sea) into the returned buffer.

- [ ] **Step 1: Write the failing tests:**
  - `contrastRatio(lum(INK), lum(PAD)) ≥ 3 * MIN_SCAN_CONTRAST`;
  - `INK` differs from every season's grass colours;
  - `LEAF_SWATCHES` has 8 unique names and hexes;
  - for every season, `skyRamp(PALETTES[s].sky)` has `SKY_STEPS` entries with strictly increasing relative luminance;
  - `renderSky("SUMMER")` has length `SKY_WIDTH * SKY_HEIGHT * 4`, every alpha is 255, and two calls are byte-identical;
  - the bottom row of `renderSky("SUMMER")` is lighter on average than the top row.
- [ ] **Step 2:** `node --experimental-strip-types --test src/lib/palette.test.ts src/lib/sky.test.ts` — FAIL.
- [ ] **Step 3:** Implement both modules.
- [ ] **Step 4:** Same command — PASS.
- [ ] **Step 5: Commit** `feat: season palettes and dithered pixel sky`

### Task 7: Save gate and hint copy

**Files:**
- Create: `src/lib/status.ts`, `src/lib/status.test.ts`

**Interfaces:**
- Consumes: `Separation`, `failureReason` (`verify.ts`); `TOO_SMALL_TO_SCAN` (`scanFit.ts`).
- Produces:

```ts
export type FoldPhase = "tree" | "folding" | "folded" | "growing";
export type StatusInput = {
  hasCode: boolean; tooLong: boolean; tooSmall: boolean;
  phase: FoldPhase;
  separation: Separation | null; // only for the current inputs
  gradedNow: boolean;            // graded under the framing on screen now
};
export function saveBlockedReason(s: StatusInput): string | null;
export function hintText(s: StatusInput): string;
export function hintAction(phase: FoldPhase): "Fold into code" | "Grow the tree" | null; // null while animating
```

Copy (exact): no code → `Type or paste a link to grow your island.`; too long → `The text is too long for one QR code. Shorten it to save.`; too small → `TOO_SMALL_TO_SCAN`; not folded → `Fold the tree into your code first, then save.`; folded without a current graded result → `Checking the code, one moment.`; failed → `This code won't scan: <failureReason>.`. Hints: tree → `Tap the tree to fold it into your code`; folding → `Folding…`; growing → `Growing…`; folded checking → `Checking the code…`; folded pass → `Scans · <matched>/<total> modules · tap to grow the tree`; folded fail → `Won't scan: <failureReason>`; too long and too small use their save copy.

- [ ] **Step 1: Write the failing tests:** one case per copy line above; `saveBlockedReason` is `null` only for `phase "folded"`, a separated result and `gradedNow true`; a separated result with `gradedNow false` (resize while folded) returns `Checking the code, one moment.`; `hintAction("folding")` and `hintAction("growing")` are `null`.
- [ ] **Step 2:** `node --experimental-strip-types --test src/lib/status.test.ts` — FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Same command — PASS.
- [ ] **Step 5: Commit** `feat: save gate and hint copy for the fold`

### Task 8: Island scene: static world, orbit, taps

**Files:**
- Create: `src/lib/pointer.ts`, `src/lib/pointer.test.ts`, `src/components/island/IslandScene.tsx`, `src/components/island/SkyBackground.tsx`, `src/components/island/IslandMesh.tsx`, `src/components/island/TreeMesh.tsx`, `src/components/island/FoldCamera.tsx`

**Interfaces:**
- Consumes: Tasks 1–7.
- Produces:

```ts
// pointer.ts
export const TAP_SLOP_PX = 6;
export function isTap(down: { x: number; y: number }, up: { x: number; y: number }): boolean;
export function nextFoldTarget(phase: FoldPhase, hit: "tree" | "ground" | "none"): "fold" | "grow" | "poke" | null;
// IslandScene.tsx (default export, client-only)
export type IslandSceneProps = {
  text: string; matrix: QrMatrix; season: Season; leaf: string | null;
  folded: boolean;               // target state owned by the page
  reducedMotion: boolean;
  insets: ScanInsets;            // CSS px covered by the controls (top, bottom)
  onPhase(phase: FoldPhase): void; // "folded" is reported only once the camera has settled top-down
  onTap(action: "fold" | "grow" | "poke"): void;
  onCanvasReady(canvas: HTMLCanvasElement): void;
};
```

`nextFoldTarget`: tree + tree hit → `fold`; tree + ground hit → `poke`; folded + any hit (or `none`) → `grow`; folding/growing → `null`.

Scene: `<Canvas gl={{ preserveDrawingBuffer: true }} dpr={...}>` with an orthographic camera; `dpr` is `0.5 × devicePixelRatio` (cap 2) in the tree state and the full device ratio once folded, and the canvas CSS has `image-rendering: pixelated`, so the graded frame and the PNG are full resolution. Lights: hemisphere `#b8b0ff`/`#2a2140` 1.1, moon directional `#fff4e0` 1.6 from (30, 50, −10), fill `#9ec5ff` 0.5. `SkyBackground` draws `renderSky(season)` into a `CanvasTexture` (nearest filtering, sRGB) set as `scene.background`, cover-fitted to the viewport aspect. `IslandMesh`: instanced island voxels coloured by kind and season (Lambert), instanced QR tiles (0.98 × 0.2 × 0.98 at y 0.1; finders grass in the tree state), instanced deco, waterfall column (basic material, opacity 0.85). `TreeMesh`: one instanced mesh for tree voxels plus one for extras; colours from `PALETTES[season]`/`leaf` via `leafShade`. `FoldCamera`: tree pose looks along `(1, 0.78, 1)` at `(0, top · 0.32, 0)`, zoom fitted to island radius, tree top and the bottom inset; drei `OrbitControls` (no pan, polar 20°–78°, zoom limits 0.6×–3× the fit). Pointer down/up on the canvas: when `isTap`, raycast the tree mesh and the island meshes and call `onTap(nextFoldTarget(...))` when not null.

- [ ] **Step 1: Write the failing tests** in `src/lib/pointer.test.ts`: `isTap` true at 0 px and 6 px, false at 6.1 px; `nextFoldTarget` table for all four phases × three hits matches the rule above.
- [ ] **Step 2:** `node --experimental-strip-types --test src/lib/pointer.test.ts` — FAIL.
- [ ] **Step 3:** Implement `pointer.ts`, then the five components with the fold timeline fixed at `t = 0` (static tree state).
- [ ] **Step 4:** Same command — PASS; `npx tsc --noEmit` and `npx eslint src/components/island src/lib` clean.
- [ ] **Step 5:** Temporarily render `<IslandScene>` from `page.tsx` behind the existing `SceneBoundary` (full wiring is Task 10), run `npm run dev`, open http://localhost:3000: island, tree, QR tiles with green finders and the sky render; drag orbits; a tap on the tree logs `fold`, on the grass `poke`. Screenshot for the reviewer.
- [ ] **Step 6: Commit** `feat: island scene with sky, island, tree and orbit`

### Task 9: Fold timeline, motion and effects

**Files:**
- Modify: `src/components/island/IslandScene.tsx`, `TreeMesh.tsx`, `FoldCamera.tsx`, `IslandMesh.tsx`
- Create: `src/components/island/Particles.tsx`, `src/lib/sound.ts`

**Interfaces:**
- Consumes: `planFold`, `voxelPose`, `extraPose`, `FOLD_SECONDS`, `easeInOutCubic` (Task 5); `IslandSceneProps` (Task 8).
- Produces: `IslandScene` honours `folded` and reports phases; `playChime(direction: "fold" | "grow"): void`, `playChirp(): void`, `setSoundOn(on: boolean): void` in `sound.ts` (WebAudio, lazily created on the first `setSoundOn(true)`, silent when off).

One progress value `t` in a ref, advanced in a single `useFrame` toward the target over `FOLD_SECONDS` (instant when `reducedMotion`). Phases: tree → folding (on target true) → folded once `t = 1` and the camera tween is done → growing (on target false) → tree. A new `matrix` resets to `t = 1` then grows to 0 (the tree grows out of the new code) and reports `growing`. `TreeMesh` writes `voxelPose`/`extraPose` matrices and lerped ink colour every frame while `0 < t < 1`, and once on reaching 0 or 1. `FoldCamera` captures the user's pose at fold start and eases to the top-down pose from `scanFit(width, height, size + 2 * QUIET_ZONE, insets)` (look down, up `(0, 0, −1)`, shifted by `dy`), back to the captured pose on grow; orbit disabled from fold start until grow ends; a resize while folded snaps to the new top pose. Motion only in the tree state and only without reduced motion: island bob `sin(time · 0.7) · 0.45 · (1 − ease(t))`, leaf sway (as the spike, amplitude ∝ (y/top)²), poke shake decaying ×0.93 per frame, waterfall colour scroll, `Particles` (40 instanced cubes, kind and colour by season) scaled by `1 − t` and unmounted when folded. Glowing mushrooms are deferred to a later slice (the spec leaves this to the builder).

- [ ] **Step 1:** Implement the timeline, phases and camera; wire `onTap` actions to sound in the scene only through props (the page decides).
- [ ] **Step 2:** `npx tsc --noEmit`, `npx eslint src/components/island src/lib`, `npm test` — clean and green.
- [ ] **Step 3:** In the dev server: tap the tree — blocks fall crown-first, camera ends top-down, the island stops, the code reads as a QR; tap — it grows back to the pose you left; emulate reduced motion in DevTools — fold is instant, nothing moves. Screenshots of mid-fold and folded for the reviewer.
- [ ] **Step 4: Commit** `feat: fold and grow timeline with camera, motion and effects`

### Task 10: Pixel-glass controls and page wiring

**Files:**
- Create: `src/components/controls/PixelIcon.tsx`, `src/components/controls/ControlPill.tsx`, `src/components/controls/SeasonPanel.tsx`, `src/components/controls/HintChip.tsx`
- Modify: `src/app/page.tsx` (rewrite), `src/app/globals.css` (glass, stepped corners, tokens), `src/app/layout.tsx` (title and description copy)

**Interfaces:**
- Consumes: `IslandScene` (Tasks 8–9), `saveBlockedReason`, `hintText`, `hintAction`, `FoldPhase` (Task 7), `sampleScan`, `scanFit`, `tooSmallToScan`, `frameKey`/`nextScanFrame` (`scanFit.ts`), `exportPng` (`exporters.ts`), `sound.ts`, `LEAF_SWATCHES`, `useReducedMotion`, `nextRadioIndex` (`radioNav.ts`, for arrow keys in the season radiogroup).
- Produces: the finished screen. `PixelIcon({ name }: { name: "link" | "spring" | "summer" | "autumn" | "winter" | "sound" | "mute" | "down" | "spark" | "check" })` renders the spike's 9×9 grids as crisp SVG.

CSS: tokens `--ink: 28 26 58`, `--ink-deep: 16 14 38`, `--dusk: 139 127 184`, `--moon: #f3ecd2`, `--leaf: #5fb35a`, `--leaf-dark: #3f8a45`, `--firefly: #ffd27a`; `.step` / `.step-lg` clip-path staircase corners (3 px / 4 px steps), `.pixel-glass` rim `rgb(243 236 210 / .32)` around an inner fill of the 4×4 dither tile over `linear-gradient(rgb(var(--ink) / .5), rgb(var(--ink) / .8))` with `backdrop-filter: blur(8px)`; font `var(--font-pixel)`. Layout from the spike: hint chip above the pill; season panel above the chip when open (closes on outside pointer-down and Escape, returns focus to the season button); pill = link field (`Link or text`, 250 px desktop, flexible on ≤ 640 px), season button (`aria-expanded`, current season icon), Save (`aria-disabled` + reason as `title` and visually hidden text, green only when enabled). Season panel = radiogroup `Season` (arrow keys move), swatch buttons `Leaf colour <name>` with `aria-pressed`, sound toggle `aria-pressed` named `Sound`.

Page state: `input`, debounced `qr` (keep the current 300 ms debounce, empty and too-long handling), `season` (default `SUMMER`), `leaf: string | null` (reset to null on season change), `folded`, `phase`, `scan: { key, frame, separation } | null`, `glEpoch`, `soundOn`. A new `qr.text` sets `folded = false`. `verifyKey = JSON.stringify([qr.text, season, leaf])`; `tooSmall` = `phase === "folded"` and `tooSmallToScan(width, height, size + 2 * QUIET_ZONE, insets)` for the current frame; check runs when `phase === "folded"`, not too small, debounced 300 ms; `gradedNow = scan.frame === frameKey(current frame)`; keep the WebGL context lost/restored handling. Save calls `exportPng(canvas, "sky-island-qr.png")` only when `saveBlockedReason` is null. Taps: `fold` → `folded = true` + chime; `grow` → `folded = false` + chime; `poke` → chirp. Hint chip button: click/Enter does `hintAction`. Live region announces phase changes and the verdict. Title copy: `Sky Island — a tree that folds into your QR code`.

- [ ] **Step 1:** Build the four controls and the CSS; rewrite `page.tsx` and remove the `Hud` import.
- [ ] **Step 2:** `npx tsc --noEmit`, `npx eslint src`, `npm test` — clean and green.
- [ ] **Step 3:** In the dev server at 1440 × 900 and 390 × 844: fold by tapping and by keyboard (Tab to the chip, Enter); the chip reaches `Scans · N/N modules · tap to grow the tree`; Save turns green and downloads `sky-island-qr.png`; scan that PNG with a phone; change season while folded — it re-checks and passes; type a new link while folded — the tree regrows and Save disables. Screenshots for the reviewer.
- [ ] **Step 4: Commit** `feat: pixel-glass controls and fold-aware page`

### Task 11: E2E suite for the new screen

**Files:**
- Create: `e2e/island.spec.ts`
- Modify or delete: `e2e/smoke.spec.ts`, `e2e/hud.spec.ts`, `e2e/interface.spec.ts`, `e2e/scannability.spec.ts` (rewrite tests whose behaviour is kept; delete tests of removed UI with a one-line note in the commit body listing them). Leave `e2e/environment.spec.ts` and `e2e/helpers.ts` to the owner unless the owner says otherwise; if they block the suite, report it instead of editing them.

**Interfaces:**
- Consumes: accessible names from Global Constraints; hint copy from Task 7.

Helpers (in `island.spec.ts`): `fold(page)` = click the button `Fold into code` and wait for status text matching `/^Scans · (\d+)\/\1 modules/`; `hint(page)` = the chip's text.

- [ ] **Step 1: Write the tests:**
  - landing shows `Tap the tree to fold it into your code` and Save has `aria-disabled="true"` with `Fold the tree into your code first, then save.`;
  - keyboard fold (Tab to the chip, Enter) reaches `Scans · N/N modules`, Save enabled, clicking Save downloads `sky-island-qr.png`;
  - every season: fold, then the verdict is N/N; switching season while folded shows `Checking the code…` then N/N again, with Save disabled in between (Review Focus 3);
  - leaf colour change while folded re-checks the same way (Review Focus 3);
  - typing a new link while folded: the chip shows `Growing…` or the tree hint, the old verdict never appears, Save disabled (Review Focus 1);
  - resize from 1440 × 900 to 900 × 700 while folded: Save disabled until a new N/N verdict (Review Focus 2);
  - clicking the chip button while `Folding…` changes nothing (button has no action while animating) and the fold still completes (Review Focus 4);
  - reduced motion (`page.emulateMedia({ reducedMotion: "reduce" })`): fold reaches N/N within 1 s of the click;
  - empty link keeps the last world and Save says `Type or paste a link to grow your island.`; a 3000-character link says `The text is too long for one QR code. Shorten it to save.`;
  - layout: at 1440 × 900 and 390 × 844 the pill, chip and open season panel are inside the viewport and do not overlap; text contrast on the glass ≥ 4.5:1 (reuse the contrast walker from `interface.spec.ts`).
- [ ] **Step 2:** Run `npx playwright test e2e/island.spec.ts` — all pass.
- [ ] **Step 3:** Rewrite/delete the old specs as listed, then `npx playwright test` — the whole suite passes except, if still present, failures inside the owner's untouched `environment.spec.ts`, which are reported verbatim.
- [ ] **Step 4: Commit** `test: e2e for the sky island fold, save gate and controls`

### Task 12: Remove the old world and update the docs

**Files:**
- Delete: `src/lib/solver.ts`, `shapes.ts`, `sprite.ts`, `blockGeometry.ts`, `themes.ts`, `hotkeys.ts`, `save.ts`, `meadow.ts`, `world.ts`, `coverage.ts`, `motion.ts`, `motionTweens.ts`, `particles.ts`, `particleLayers.ts` and each one's `.test.ts` (`radioNav.ts` stays: the season panel uses it); `src/components/scene/` (whole folder); `src/components/hud/` (whole folder); `src/components/controls/ColorField.tsx`; `exportGlb` from `src/lib/exporters.ts`.
- Modify: `src/lib/seasons.ts` (keep `Season`, `SEASONS`, `mixHex` and anything the new code imports; drop theme/shape-dependent functions and their tests in `seasons.test.ts`), `PRODUCT.md` (remove `.glb` from scope, describe the fold), `system_document.md` (new top section v3.0.0: the fold replaces §4's solver; §4G verification and §11 still-frame rules restated for the folded state; link to the spec).

- [ ] **Step 1:** `grep -rn` each file to delete for importers outside the delete list; any hit means the new code still needs it — keep it and note why.
- [ ] **Step 2:** Delete and edit as listed.
- [ ] **Step 3:** `npx tsc --noEmit`, `npx eslint src`, `npm test`, `npx playwright test e2e/island.spec.ts` — all clean and green; `npm run build` succeeds.
- [ ] **Step 4: Commit** `chore: remove the anamorphic world and update product docs`
