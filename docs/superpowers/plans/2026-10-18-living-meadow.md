# Living Meadow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the blob tree with a chunky Minecraft oak that comes from a data-driven model format, put it in a voxel meadow under a season-aware sky, and cut the screen down to a link field, Save, a settings tray, the hotbar and the season dial.

**Architecture:** Objects become data: a `SpriteSpec` (character rows plus a legend that maps characters to the existing `trunk | canopy | body` regions) is validated and turned into the solver's existing `Shape.mask`, so the anamorphic solver (§4) is untouched and new models are added by appending one sprite to the registry. The world is three scene-only layers (meadow, sky, clouds) that are **unmounted in Scan**, exactly like the particle layers, and that read the existing master motion gate so they are exactly still in Reveal. The screen is rebuilt around a top bar, a bottom bar and one tray; every control that survives keeps its accessible name.

**Tech Stack:** Next.js 16 (read `node_modules/next/dist/docs/` before Next-specific code; AGENTS.md), React 19, TypeScript, Tailwind v4, React Three Fiber 9 + three + drei 10, GSAP, Playwright, `node --test` with `--experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-10-18-living-meadow-design.md` (approved). Binding parents: `system_document.md` v2.1.0 §0, §4, §8 (unchanged), §11 (still-frame rules). Owner addition made when approving: the object must be changeable in future, not just one model, so Task 1 builds the sprite format and registry and the tray shows a `Model` picker only when the registry has more than one entry.

## Global Constraints

- `system_document.md` §0, §4, §8 stay byte-for-byte intact; §11 still-frame rules bind: particles unmounted before Scan/Reveal is graded, sway/shake exactly 0 in Scan and Reveal, Scan flattens every block to `colorScan` regardless of season, `verifyKey` excludes season and motion, exports gated on a verified scan of the current inputs.
- The Scan frame stays byte-identical across seasons. Meadow, decoration, clouds and sky are **unmounted** in Scan (not hidden); Scan shows only pad, blocks and the flat Base colour. The default link and a 1000-character link scan fully (`matched === total`) in every season.
- Camera presets, the QR pad's size and position, the solver, the QR encoding and the export formats are unchanged. The `.glb` still exports blocks only.
- No new runtime dependencies. No react-bits. No DOM overlays over the canvas.
- Performance (reported, not a gate): 60 fps desktop / 30 fps mid phone target; this change adds at most about 40 draw calls and about 2,000 instances in total.
- Reduced motion: nothing moves, season changes snap. No infinite CSS animations or long transitions in the HUD (stepped token ≤ 120 ms, `0s` under reduced motion).
- Surviving accessible names stay exact: hotbar `Explore` / `Reveal` / `Scan`; radiogroup `Season` with `Summer` / `Autumn` / `Winter` / `Spring`; field `Link or text`; switch `Breeze`; button `Shake`; export buttons `PNG (scan)`, `PNG (reveal)`, `.glb model`; palette labels `Trunk`, `Canopy`, `Base`, `Background`; `Theme`; `Reveal elevation`; hotkeys 1/2/3. Existing strings asserted by e2e (`Scans`, `Won't scan`, `Checking…`, `Shake works in Explore.`, `Shake is off while motion is reduced.`) stay.
- Pixel-face rule (≥ 14 px, labels/titles/buttons only), hit targets ≥ 44 px (48 px hotbar slots), real focus rings, contrast in both colour schemes.
- Tests: `src/**/*.test.ts` use relative `.ts` imports, never `@/`. Lint rules active: `react-hooks/refs`, `react-hooks/immutability`, `react-hooks/set-state-in-effect`.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. The repo has no git identity; commit with `-c user.name=ferdi -c user.email=ferdian.arya28@gmail.com`.
- Gates: `npm run lint` (0 problems), `npm run build` (exit 0), `npm test`, `npx playwright test --workers=2` (rerun one failing test once in isolation; two full runs at the end). Only one `next dev` at a time; delete `.next/dev` if `routes.d.ts` errors; after a build wait for the server before e2e.
- Execution: work on a new branch `feat/living-meadow` created from `main` (HEAD `61ebe83`); one implementer holds the working tree at a time (a read-only reviewer may run alongside).

## Review Focus

Failure modes the spec implies that no single task would obviously test, each pinned by the task named:

1. **A 1000-character link (161×161) in every season with the meadow mounted.** Scan reads `Scans` with `matched === total`, Reveal is still. Tasks 5, 10.
2. **A one-character link (smallest QR, tiny plane).** Meadow slab, decoration and clouds scale from `plane` and stay clear of the pad; nothing overlaps the tree or the pad. Tasks 4, 10.
3. **Orbiting to the extremes in Explore** (lowest and highest elevation, any azimuth). The slab edge and dirt skirt never show void between ground and sky, and the ground never hides the sculpture. Task 10.
4. **Emptying the link field and retyping (scene remount) in Winter, and WebGL context loss/restore.** The remounted scene shows Winter ground and sky; after restore the meadow and sky texture are back and Scan re-verifies. Tasks 6, 10.
5. **A sprite that cannot ground or has ragged rows** (future model). Rejected at definition time with a clear error, never a silent broken sculpture. Task 1.

---

### Task 1: Sprite model format and registry

**Files:**
- Create: `src/lib/sprite.ts`, `src/lib/sprite.test.ts`
- Modify: `src/lib/shapes.ts`, `src/lib/shapes.test.ts`

**Interfaces:**
- Consumes: `ShapeRegion`, `Shape` from `src/lib/shapes.ts` (unchanged shapes of those types).
- Produces (`sprite.ts`):
  ```ts
  export type SpriteSpec = { id: string; label: string; rows: readonly string[]; legend: Readonly<Record<string, ShapeRegion>> };
  export function validateSprite(spec: SpriteSpec): void;               // throws Error with a specific message
  export function defineSprite(spec: SpriteSpec): Shape & { width: number; height: number };
  ```
  `rows` run top to bottom, `.` is empty, every other character must be a key of `legend`. `defineSprite` validates, then returns a `Shape` whose `mask(a, b)` maps `a, b ∈ [0,1]` to `col = min(W-1, floor(a·W))`, `row = min(H-1, floor((1-b)·H))`, returns the legend region (or `null` for `.`), and returns `null` for any `a` or `b` outside `[0,1]` or non-finite.
- Produces (`shapes.ts`): `SHAPES` stays `Record<string, Shape>` keyed by id, `DEFAULT_SHAPE_ID = "MINECRAFT_TREE"`, `MINECRAFT_TREE` is now `defineSprite(OAK)`.
- Oak data (14 × 14; `L` = canopy, `T` = trunk), top to bottom:
  `....LLLLLL....`, `...LLLLLLLL...`, `..LLLLLLLLLL..` ×3, `...LLLLLLLL...`, `....LLLLLL....`, then `......TT......` ×5, `.....TTTT.....` ×2.

- [ ] **Step 1: Write the failing tests** (`sprite.test.ts`), using a small fixture sprite defined in the test (not the oak):
  - `mask maps corners and edges`: top-left filled cell → its region; `mask(0, 0)` bottom-left, `mask(1, 1)` top-right, `mask(1, 0)` all resolve to the correct cell (clamped, never `undefined`).
  - `outside the unit square is empty`: `mask(-0.01, 0.5)`, `mask(0.5, 1.01)`, `mask(NaN, 0.5)` → `null`.
  - `validateSprite throws`: ragged rows; a character missing from the legend; a legend value that is not `trunk | canopy | body`; no filled cell in the bottom row ("cannot ground"); fewer than 8 rows or 8 columns; empty `id`. Each asserts a distinct message substring.
  - `registry`: every `SHAPES` entry's key equals its `id` (keep the existing test), and every entry validates.
- [ ] **Step 2: Run `node --experimental-strip-types --test src/lib/sprite.test.ts`.** Expected: FAIL (module not found).
- [ ] **Step 3: Implement `sprite.ts`** per the signatures above. Replace the three-disc mask in `shapes.ts` with the oak sprite; keep `ShapeRegion`, `Shape`, `SHAPES`, `DEFAULT_SHAPE_ID` exports.
- [ ] **Step 4: Update `shapes.test.ts`** for the new silhouette: trunk reaches the floor (`mask(0.5, 0.02) === "trunk"`), canopy sits above (`mask(0.5, 0.9) === "canopy"`), outside is empty (`mask(0.02, 0.95) === null`), the corner beside the trunk at floor level is empty (`mask(0.1, 0.1) === null`). Delete the "gap separates trunk from canopy" test (the oak trunk meets the canopy by design) and say so in the commit body.
- [ ] **Step 5: Run `npm test`, `npm run lint`.** Expected: all pass. The scan e2e is unaffected by the mask (top-down scan never depends on it); run `npx playwright test e2e/scannability.spec.ts e2e/smoke.spec.ts --workers=2` and expect pass.
- [ ] **Step 6: Commit** — `git add src/lib/sprite.ts src/lib/sprite.test.ts src/lib/shapes.ts src/lib/shapes.test.ts && git commit -m "feat: model sprites as data and the Minecraft oak"`.

---

### Task 2: Silhouette coverage gate and a look at the oak in Reveal

**Files:**
- Create: `src/lib/coverage.ts`, `src/lib/coverage.test.ts`
- Modify (only if the numbers demand it): the oak rows in `src/lib/shapes.ts`

**Interfaces:**
- Consumes: `solve`, `screenU`, `groundW`, `screenBand` (`src/lib/solver.ts`), `generateMatrix` (`src/lib/qr.ts`), `SHAPES`.
- Produces:
  ```ts
  export const COVERAGE_GRID = 14;
  /** Fraction of the shape's filled grid cells (sampled at cell centres on a COVERAGE_GRID square) that at least one block projects into in the Reveal view. */
  export function silhouetteCoverage(blocks: Block[], size: number, shape: Shape, elevationDeg: number): number;
  ```
  A block projects to `u = screenU`, `v = y·cosφ − groundW·sinφ`, then `a = (u + uMax)/(2·uMax)` with `uMax = (size-1)/√2`, `b = (v − lo)/span` from `screenBand(size)`. A grounded block also marks every cell from `b = 0` up to its own `b` (it is a pillar).

- [ ] **Step 1: Write the failing tests.** `registry coverage`: for every shape in `SHAPES`, for the matrices of `"https://example.com"` (size 29) and a 1000-character string (size 161), at elevation 30°, `silhouetteCoverage` ≥ **0.85** (29) and ≥ **0.95** (161). `a shape with nothing in it scores 0` and `a block cloud filling the unit square scores 1` use a hand-built `Shape` and `Block[]`.
- [ ] **Step 2: Run it.** Expected: FAIL (module not found).
- [ ] **Step 3: Implement `coverage.ts`.** Then run the registry test. If the oak misses a threshold, first print the per-region misses, then thicken the sprite (wider trunk row, fuller canopy) within the described look; do not lower a threshold without a ledger ruling.
- [ ] **Step 4: Look at it.** In the scratchpad, write a throwaway Playwright script that opens the app on `http://localhost:3000`, presses `2` (Reveal), and screenshots at 1440×900 for elevations 15°, 30° and 60° (set the slider through its keyboard keys). **Read every screenshot** and report in the task report whether it reads as a Minecraft oak (stepped canopy, wide trunk, no stray blobs) and what its measured coverage is at both sizes.
- [ ] **Step 5: Run `npm test`, `npm run lint`.** Expected: pass.
- [ ] **Step 6: Commit** — `git add src/lib/coverage.ts src/lib/coverage.test.ts src/lib/shapes.ts && git commit -m "test: gate every model's Reveal silhouette coverage"`.

---

### Task 3: World palettes (pure)

**Files:**
- Create: `src/lib/world.ts`, `src/lib/world.test.ts`
- Modify: `src/lib/seasons.ts` (export the existing private `tween` helper as `tweenSeasons`)

**Interfaces:**
- Consumes: `mixHex`, `wrapPhase`, `SEASONS`, `Season` from `src/lib/seasons.ts`.
- Produces:
  ```ts
  export type GroundPalette = { grass: string; dirt: string; blossom: string };
  export type Gradient = { top: string; bottom: string };
  export const SKY_THEME_WEIGHT = 0.65;  // how much of the season sky replaces the theme background
  export function seasonGround(season: Season): GroundPalette;
  export function groundPalette(phase: number): GroundPalette;           // tweens between seasons
  export function seasonSky(season: Season): Gradient;
  export function skyGradient(background: string, phase: number): Gradient;
  export function cloudColour(phase: number): string;
  ```
- Season values (starting palette, from the mockup): ground `SUMMER {grass:#5fae3a, dirt:#8a5a34, blossom:#ffd23f}`, `AUTUMN {#b08a3a, #7a4e2c, #c8453a}`, `WINTER {#eef4f8, #7b6a5a, #bcd4e6}`, `SPRING {#7fd05a, #8a5a34, #e8739a}`; sky `SUMMER #8fd0f5→#d6efff`, `AUTUMN #e9b872→#f6e1bd`, `WINTER #b7c7d8→#eef3f7`, `SPRING #b8dcf0→#f4dce8`; `cloudColour` is white in Summer/Spring, `#f6e8d4` Autumn, `#dfe8f0` Winter. `skyGradient(background, phase)` = each end `mixHex(background, tweened season end, SKY_THEME_WEIGHT)`.

- [ ] **Step 1: Write the failing tests.** At integer phases 0–3 `groundPalette` equals `seasonGround` of that season exactly; at phase 0.5 each channel lies between its two season values; phase 4 equals phase 0, phase −1 equals phase 3; `NaN` and `Infinity` behave as phase 0 (never throw); `skyGradient("#d5e6ef", 0)` top/bottom equal `mixHex("#d5e6ef", "#8fd0f5", 0.65)` / `mixHex("#d5e6ef", "#d6efff", 0.65)`; every returned value matches `/^#[0-9a-f]{6}$/`; a `#rgb` or invalid background leaves the season colour unmixed, not a throw.
- [ ] **Step 2: Run `node --experimental-strip-types --test src/lib/world.test.ts`.** Expected: FAIL.
- [ ] **Step 3: Implement `world.ts`** using `tweenSeasons` for phase interpolation.
- [ ] **Step 4: Run `npm test`, `npm run lint`.** Expected: pass.
- [ ] **Step 5: Commit** — `git add src/lib/world.ts src/lib/world.test.ts src/lib/seasons.ts && git commit -m "feat: season palettes for ground, sky and clouds"`.

---

### Task 4: Meadow layout (pure)

**Files:**
- Create: `src/lib/meadow.ts`, `src/lib/meadow.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Deco = { x: number; z: number; scale: number; tint: number };   // tint 0..1 picks among colours
  export type Cloud = { x: number; y: number; z: number; w: number; d: number; speed: number };
  export type MeadowLayout = {
    slabSize: number;          // 5 * plane
    slabDepth: number;         // total thickness; top 1 unit grass, the rest dirt
    pad: { half: number };     // plane / 2
    tufts: Deco[]; flowers: Deco[]; bushes: Deco[]; clouds: Cloud[];
  };
  export const MAX_DECOR = 600;           // tufts + flowers + bushes
  export const PAD_CLEAR = 1.5;           // decoration keeps this far from the pad edge
  export function meadowLayout(plane: number, seed?: number): MeadowLayout;
  ```
  Counts: 220 tufts, 90 flowers, 4 bushes, 6 clouds. Deterministic PRNG (mulberry32) seeded from `seed` (default 1337). Decoration lies in `|x|,|z| ≤ 1.8·plane`, outside the square `half + PAD_CLEAR`. Clouds sit high and far behind the sculpture (negative `z`, `y ≈ 1.1·plane`), `speed` in world units per second, wrapped by the renderer at `±2·plane`.

- [ ] **Step 1: Write the failing tests.** Same `plane` and seed → deep-equal layouts, different seed → different; for planes 25 (smallest), 37, 169 every decoration point lies outside `half + PAD_CLEAR` and inside `1.8·plane`; `tufts + flowers + bushes ≤ MAX_DECOR`; bushes are at least 3 units apart; `slabSize === 5 * plane`; clouds `z < 0`; non-finite or non-positive `plane` returns an empty, safe layout rather than throwing.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement `meadowLayout`.**
- [ ] **Step 4: Run `npm test`, `npm run lint`.** Expected: pass.
- [ ] **Step 5: Commit** — `git add src/lib/meadow.ts src/lib/meadow.test.ts && git commit -m "feat: deterministic meadow layout"`.

---

### Task 5: The meadow in the scene

**Files:**
- Create: `src/components/scene/Meadow.tsx`
- Modify: `src/components/scene/QrScene.tsx`, `src/components/scene/blockMaterial.ts` (add a `grass` sway kind)

**Interfaces:**
- Consumes: `meadowLayout`, `MeadowLayout` (Task 4); `groundPalette` (Task 3); `Environment` (`src/lib/motion.ts`); `createSwayMaterial` / `updateSwayMaterial` and `SwayKind` (extend `SwayKind` to `"canopy" | "trunk" | "grass"`; grass uses a smaller `SWAY_CAP` weight and no shake weight).
- Produces: `Meadow({ plane, env, padColour }: { plane: number; env: Environment; padColour: string })`, a client component. `QrScene` renders `{state !== "SCAN" && <Meadow … />}`.
- Behaviour: one slab built from boxes (grass top layer, dirt layers below, visible at the edge) sized by `slabSize` and `slabDepth`, tinted each frame from `groundPalette(env.phase.value)` with an `applied`-phase guard like `EnvironmentDriver`; instanced tufts, flowers and bushes (≤ `MAX_DECOR` instances) using the sway material so the exact-zero rule holds in Reveal; a stone rim (four thin boxes) around the pad. The slab top sits at `y = -0.02` so the pad at `-0.01` stays the visible surface inside the rim. Every mesh in `Meadow` sets `raycast={() => null}` so clicks reach the tree and the scene stays cheap. Textures, if any, use nearest filtering and are generated procedurally; materials and geometries dispose on unmount.

- [ ] **Step 1: Write the failing test** (`blockMaterial.test.ts`, existing file): a `grass` material built by `createSwayMaterial("grass", …)` leaves `transformed` bit-identical at `uStateGain = 0` (follow the existing gate test) and its sway weight is smaller than the canopy's.
- [ ] **Step 2: Run `node --experimental-strip-types --test src/components/scene/blockMaterial.test.ts`.** Expected: FAIL.
- [ ] **Step 3: Extend `blockMaterial.ts`**, build `Meadow.tsx`, mount it in `QrScene.tsx`. Keep the pad mesh as it is (flat `meshBasicMaterial` in `colorLight`).
- [ ] **Step 4: Verify in a browser** (scratchpad script, VIEW every screenshot): Reveal at 15°, 30°, 60° and Explore orbited to low and high angles show grass with dirt edge, decoration, no void between slab and sky, nothing covering the sculpture; Scan shows only pad, blocks, flat background. Report frame time of Explore with the meadow on (report only).
- [ ] **Step 5: Run lint, build, `npm test`, `npx playwright test --workers=2`.** Expected: pass (Scan byte-identity tests must stay green; a failure there means the meadow leaked into Scan: stop and fix, never weaken).
- [ ] **Step 6: Commit** — `git add src/components/scene/Meadow.tsx src/components/scene/QrScene.tsx src/components/scene/blockMaterial.ts src/components/scene/blockMaterial.test.ts && git commit -m "feat: voxel meadow under the tree"`.

---

### Task 6: Season sky and drifting clouds

**Files:**
- Create: `src/components/scene/Sky.tsx`, `src/components/scene/Clouds.tsx`
- Modify: `src/components/scene/QrScene.tsx`, `src/components/scene/EnvironmentDriver.tsx`

**Interfaces:**
- Consumes: `skyGradient`, `cloudColour` (Task 3); `meadowLayout` clouds (Task 4); `Environment`.
- Produces: `Sky({ env, background, scan }: { env: Environment; background: string; scan: boolean })` owns `scene.background`: in Scan a flat `THREE.Color(background)`, otherwise a small vertical-gradient `CanvasTexture` redrawn only when the tweened phase or `background` changes (guard as in `EnvironmentDriver`); it replaces the `<color attach="background">` and the background write in `EnvironmentDriver` (remove that write; the driver keeps season sweep and shake). `Clouds({ plane, env })` instanced blocky clouds, mounted only outside Scan; drift distance accumulates only while `gate.stateGain * gate.calm > 0`, so clouds are exactly frozen in Reveal, Scan and at the aligned pose. Textures dispose on unmount, and the gradient texture is recreated after `webglcontextrestored`.

- [ ] **Step 1: Write the failing test** for the pure part you extract (for example `cloudOffset(prev, dt, speed, gate, wrapAt)` in `src/lib/meadow.ts`): returns `prev` exactly when the gate product is 0 or any input is non-finite, advances proportionally otherwise, and wraps at `±wrapAt`. Add it to `meadow.test.ts`.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement** `Sky.tsx`, `Clouds.tsx`, the helper, and the wiring in `QrScene.tsx` / `EnvironmentDriver.tsx`.
- [ ] **Step 4: Verify in a browser** (VIEW every screenshot): Reveal in each season shows the gradient and clouds in that season's colours (clouds above the crown, not crossing it); Scan's background is flat Base; pressing the season dial cross-fades; remount after emptying and retyping the link in Winter keeps the Winter sky.
- [ ] **Step 5: Run lint, build, `npm test`, `npx playwright test --workers=2`.** Expected: pass.
- [ ] **Step 6: Commit** — `git add src/components/scene src/lib/meadow.ts src/lib/meadow.test.ts && git commit -m "feat: season sky and drifting clouds"`.

---

### Task 7: Save and model-picker logic (pure)

**Files:**
- Create: `src/lib/save.ts`, `src/lib/save.test.ts`

**Interfaces:**
- Consumes: `ViewState` (`import type` from `../components/scene/CameraRig.tsx`).
- Produces:
  ```ts
  export type SaveTarget = "scan" | "reveal";
  export const SAVE_EXPLORE_REASON = "Open Reveal or Scan to save.";
  /** `reason === null` means Save is enabled for `target`. */
  export function saveState(view: ViewState, blocked: { scan: string | null; reveal: string | null }): { target: SaveTarget | null; reason: string | null };
  ```
  Rules: Explore → `{ target: null, reason: SAVE_EXPLORE_REASON }` unless `blocked.scan` and `blocked.reveal` are the same non-null string (a shared failure such as "Enter a link or text first."), which wins; Scan → `{ target: "scan", reason: blocked.scan }`; Reveal → `{ target: "reveal", reason: blocked.reveal }`.

- [ ] **Step 1: Write the failing tests** for each rule above, including the shared-failure case in Explore and an enabled Scan and Reveal (`reason === null`).
- [ ] **Step 2: Run `node --experimental-strip-types --test src/lib/save.test.ts`.** Expected: FAIL.
- [ ] **Step 3: Implement `saveState`.**
- [ ] **Step 4: Run `npm test`, `npm run lint`.** Expected: pass.
- [ ] **Step 5: Commit** — `git add src/lib/save.ts src/lib/save.test.ts && git commit -m "feat: one Save that follows the current view"`.

---

### Task 8: The simplified screen

**Files:**
- Modify: `src/components/hud/Hud.tsx` (rewrite), `src/app/page.tsx`
- Create: `src/components/hud/Tray.tsx`
- Modify (only as needed): `src/components/hud/Hotbar.tsx`, `src/components/hud/SeasonDial.tsx`, `src/components/hud/StatusPlaque.tsx`, `src/app/globals.css`

**Interfaces:**
- Consumes: `saveState` (Task 7); the existing `Hotbar`, `SeasonDial`, `StatusPlaque`, `AlignmentBar`, `ColorField`, primitives; `SHAPES`.
- Produces: `Hud` props change as follows. **Removed:** `collapsed`, `onCollapsed`, `shapeId`, `onShape`. **Kept:** `sculpture` (its size note moves into the tray). **Added:** `modelId: string`, `onModel: (id: string) => void`, `models: readonly { id: string; label: string }[]`, `save: { target: "scan" | "reveal" | null; reason: string | null }`, `onSave: () => void`. Everything else keeps its name and type. `ColorKey` stays exported from `Hud.tsx`. `Tray` holds the settings content and is an internal component of the HUD.
- Layout (§5 of the spec, option A): a top bar with `Link or text` field (character count kept), `Save` button, and a `Settings` button (`aria-expanded`, `aria-controls`); the `StatusPlaque` plus one small save-reason line in the top-right slot (phones: directly under the top bar); a bottom bar with the hotbar and the season dial side by side (phones: dial row above hotbar row). `Save` is a `HudButton` named `Save`, enabled only when `save.reason === null`, using `aria-disabled`, with the reason in text in the slot above and `aria-describedby`; clicking it runs `onSave`. The tray (right drawer ≥ `md`, bottom sheet below, at most 60 % of height, scrollable) contains: the four colour fields, the `Model` select **only when `models.length > 1`**, `Theme`, `Reveal elevation`, the alignment bar with `Snap to reveal` (only when `proximity !== null`), `Breeze`, `Shake`, the three export buttons with `#export-note` and the lock icon, and the sculpture size note. Open/close is instant (no transition), `Escape` closes and returns focus to `Settings`, and `Settings` is the only control that changes tray state. The canvas container is full-bleed (`inset-0`); overlays remain siblings of the `role="img"` element. At rest on desktop the screen shows at most four button-like controls besides hotbar slots and dial radios (`Save`, `Settings`, and none other); on a 390×844 phone the closed state leaves at least 55 % of the height free of chrome and never scrolls the page.
- `page.tsx`: remove `collapsed`; keep `shapeId` state (rename UI-facing label to model); pass `models={Object.values(SHAPES).map(({ id, label }) => ({ id, label }))}`; `onSave` calls `exportPng(canvas, "voxel-qr.png")` for target `scan` and `exportPng(canvas, "voxel-qr-reveal.png")` for `reveal`; `save = saveState(mode, blocked)`. `verifyKey` and the camera key logic are untouched.

- [ ] **Step 1: Read** `src/components/hud/Hud.tsx`, `page.tsx`, `globals.css` and `e2e/hud.spec.ts` first; list every string and role the e2e suite asserts (Task 9 updates the specs, but names that survive must not change).
- [ ] **Step 2: Rebuild `Hud.tsx`, add `Tray.tsx`, update `page.tsx`**, keeping `Link or text` debounce, gating strings, the one authored GSAP moment (reduced-motion guarded), hotkeys and live region exactly as they are.
- [ ] **Step 3: Verify in a browser** (scratchpad script, VIEW every screenshot): 1440×900 and 390×844, light and dark, tray closed and open, in Explore, Reveal and Scan, with a failing palette (Base `#1d2618`) to see the Won't-scan state. Report chrome heights, that nothing overlaps the world centre when closed, and that no pixel-face text is under 14 px.
- [ ] **Step 4: Run lint and build only.** (E2E specs still assert the old screen; Task 9 fixes them. The unit tests must pass: `npm test`.)
- [ ] **Step 5: Commit** — `git add src/components/hud src/app && git commit -m "feat: world-first screen with a settings tray and one Save"`.

---

### Task 9: Move the existing e2e suite to the new screen

**Files:**
- Modify: `e2e/interface.spec.ts`, `e2e/smoke.spec.ts`, `e2e/hud.spec.ts`, `e2e/environment.spec.ts`, `e2e/scannability.spec.ts` (only the lines that touch changed UI)

**Interfaces:**
- Consumes: the new screen from Task 8. A shared helper `openSettings(page)` (local to each spec or a small `e2e/helpers.ts`) clicks `Settings` if its `aria-expanded` is `false`.

- [ ] **Step 1: Run the whole suite** (`npx playwright test --workers=2`) and list every failure.
- [ ] **Step 2: Update tests that assert removed or moved UI**, never loosening behaviour that is kept: controls now in the tray (`Breeze`, `Shake`, colours, `Theme`, elevation, the three exports) need `openSettings` first; the `Collapse controls` / `Expand controls` test becomes a `Settings` open/close test (including `Escape` closing and returning focus); the shape-selector assertions are removed (and a test asserts the `Model` select is **absent** while the registry has one model); the "HUD fits" test now asserts the new chrome budget from Task 8; the keyboard-reachability test counts visible controls with `tabIndex >= 0` as before and must still reach `Save`, `Settings`, the hotbar and the dial; the pixel-face test keeps its rules and finds the new pixel-face elements.
- [ ] **Step 3: Add `Save` tests** (in `hud.spec.ts`): disabled in Explore with `Open Reveal or Scan to save.` visible; in Scan after the verdict is `Scans` it is enabled and downloads a PNG (assert the download event and non-empty bytes); in Reveal it downloads the reveal PNG; with a no-contrast Base it stays disabled with the reason text.
- [ ] **Step 4: Run the whole suite twice** (`npx playwright test --workers=2`). Expected: both green; paste both output tails in the report. If a still-frame test (Scan byte-identity, Reveal still) fails, that is a real defect in Tasks 5–6: report `NEEDS_CONTEXT` with the evidence.
- [ ] **Step 5: Commit** — `git add e2e && git commit -m "test: move the browser suite to the world-first screen"`.

---

### Task 10: Browser proof of the new world

**Files:**
- Create: `e2e/world.spec.ts`

**Interfaces:**
- Consumes: the local helpers pattern from `e2e/environment.spec.ts` (`ready`, `captureCanvas`, `settled`, `liveExplore`); copy what you need, do not import across spec files.

- [ ] **Step 1: Write the tests** (web-first assertions; fixed waits only where timing is the subject):
  - `Scan shows no world`: in Scan the four canvas corners and edge midpoints equal the Base colour exactly and the frame is byte-identical across the four seasons (meadow was mounted in Explore beforehand via `liveExplore`).
  - `Reveal is a still frame with the world mounted`: Explore (meadow, clouds, particles live) → Reveal → settled → two captures 500 ms apart equal; repeat after a `Shake`.
  - `the sky follows the season`: in Reveal, the sky pixel near the top differs between all four seasons and Winter's ground pixel is lighter than Summer's.
  - `the ground is grass`: in Reveal the pixel at the bottom-centre is within a hue band of green in Summer and neither green nor identical in Winter (snow).
  - `reduced motion freezes the world`: with `reducedMotion: "reduce"`, orbit away, two Explore captures 500 ms apart equal, and selecting `Winter` snaps (two captures 100 ms apart equal).
  - `clouds and grass move only when the tree can move`: aligned pose at load: two captures equal; after orbiting away with Breeze on, captures differ; with Breeze off, they converge (reuse the `rest` and `moves` helpers).
  - `extreme angles never show a void`: in Explore at the lowest and highest elevation set from the tray, orbit through four azimuths; at each, assert the four corners of the canvas are never the raw Base colour while the sculpture's pixel is visible (ground or sky fills the frame).
  - `a one-character link keeps the world clear of the pad`: link `a`; Reveal screenshot has the pad rim present and decoration absent over the pad (assert by pixel sampling a ring outside the pad and the pad interior colour).
  - `a 1000-character link scans in every season with the meadow mounted`: for each season, `liveExplore` then Scan; status reads `Scans` and `matched === total` (the existing test shape; keep it as the owner of this review-focus line).
  - `a remount keeps the season`: Winter, clear the link, retype; Reveal sky and ground match a fresh Winter Reveal.
  - `context loss restores the world`: lose the context in Reveal, restore, and the frame is the same as before within the standard comparison (same bytes after `settled`); Scan re-verifies. Skip with an explicit annotation if `WEBGL_lose_context` is unavailable.
  - `a second model appears in the tray` is **not** possible without shipping a second model; instead assert the `Model` select is absent now (done in Task 9) and note in the report that the picker is unit-covered by Task 7's helper tests and the registry test of Task 1.
- [ ] **Step 2: Run each test alone, then the file** (`npx playwright test e2e/world.spec.ts --workers=2`). Expected: pass.
- [ ] **Step 3: Mutation-check two guarantees.** (a) Leave `Meadow` mounted in Scan: the byte-identity test must go red. (b) Let `Clouds` ignore the gate (constant speed): the Reveal-still test must go red. Restore with `git checkout -- <file>`; verify `git status` is clean of `src/` changes; paste both red outputs.
- [ ] **Step 4: Run the whole suite twice.** Expected: green both times; paste both tails.
- [ ] **Step 5: Commit** — `git add e2e/world.spec.ts && git commit -m "test: prove the meadow, sky and clouds obey the still-frame rule"`.

---

### Task 11: Spec, product notes and final gates

**Files:**
- Modify: `system_document.md` (to v2.2.0), `PRODUCT.md` (only if a principle needs it; expected: no change)

- [ ] **Step 1: Record the byte-exact text of §0, §4 and §8** (copy each section to a scratch file, hash it).
- [ ] **Step 2: Update `system_document.md` to v2.2.0:** version header and changelog line; §1/§5 for the world-first screen (top bar, bottom bar, tray, Save rules, `Model` picker appears when the registry has more than one entry); §2 for the oak sprite format, the registry and the validation rules; a new subsection under §11 for the meadow, sky and clouds (mounted in Explore and Reveal, unmounted in Scan, gated by the master motion gate, season palettes, budgets). Do not touch §0, §4, §8.
- [ ] **Step 3: Prove §0, §4, §8 are unchanged** by hashing them again and comparing with Step 1; paste both hashes.
- [ ] **Step 4: Run every gate on the final tree:** `npm run lint`, `npm run build`, `npm test`, `npx playwright test --workers=2` twice; paste real output tails.
- [ ] **Step 5: Frame-time note** (report only): 1000-character link, Winter, Explore, orbited, particles and meadow on; 300 `requestAnimationFrame` deltas; report average, p95, max and the renderer string.
- [ ] **Step 6: Commit** — `git add system_document.md PRODUCT.md && git commit -m "docs: spec v2.2.0 for the living meadow"` (omit `PRODUCT.md` if unchanged).

---

## Self-review

**Spec coverage.** Goal 1 (oak) → Tasks 1, 2. Goal 2 (voxel meadow, pad, season decoration) → Tasks 3, 4, 5. Goal 3 (season sky, clouds) → Tasks 3, 4, 6. Goal 4 (alive in Explore, still in Reveal/Scan) → Tasks 5, 6, 10. Goal 5 and design §5 (simplified screen, Save, tray, Model picker) → Tasks 7, 8, 9. Design §6 (documents) → Task 11. Owner addition (changeable objects) → Tasks 1 (format, validation, registry), 2 (registry-wide coverage gate), 7/8 (picker only when more than one). Calls 1–7 of the spec: 1 → Tasks 5, 6, 10; 2 → Task 2; 3 → Tasks 7, 8, 9; 4 → Global Constraints and Task 5; 5 → Global Constraints, Tasks 5, 11; 6 → Task 6; 7 → Task 9.

**Interface consistency.** `Shape`, `ShapeRegion` stay as defined; `defineSprite` returns a `Shape`; `silhouetteCoverage` takes a `Shape`; `meadowLayout` / `cloudOffset` / `groundPalette` / `skyGradient` / `cloudColour` names are used identically in Tasks 3–6; `saveState` and `SAVE_EXPLORE_REASON` match between Tasks 7–9; the `Hud` prop changes in Task 8 are the only ones Task 9 and `page.tsx` rely on.

**Known gaps and risks.** The model picker is not exercised in a browser because only one model ships (by design: no speculative second model); it is covered by the registry and helper tests. The oak sprite may need tuning in Task 2 (the coverage thresholds 0.85 and 0.95 are provisional starting points that the implementer measures, not final truths). The tray overlays part of the world while open (phone sheet up to 60 %), which is temporary and closed by default.
