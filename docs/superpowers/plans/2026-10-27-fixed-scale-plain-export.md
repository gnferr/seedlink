# Fixed Scale, Bigger Tree, Plain QR Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the island and tree the same size for every link length (more, smaller modules for long links), make the crown about 1.5× the island, remove the white grid between dark modules, and save a plain QR image drawn from the matrix.

**Architecture:**
- **World units** stay "reference modules": the world is built as if every code were 25 modules (slab 33 units wide), and a real code's modules use pitch `33 / (size + 8)`.
- **Pure helpers** in `src/lib/` carry the pitch into dark-module positions and fold block sizes, scale the tree to the island, and render the plain QR pixels.
- **The scene** uses them, and the folded camera divides its zoom by the pitch, so the scan framing is unchanged on screen.

**Tech Stack:** Next.js 16, React 19, React Three Fiber 9, three 0.186, node:test, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-26-tree-species-design.md`, Part 3. Work on branch `feat/fixed-scale` cut from `main` (= `origin/main`, the Seedlink repo).

## Global Constraints

- `REF_SIZE = 25`, `SLAB_UNITS = REF_SIZE + 2 * QUIET_ZONE` (33), `modulePitch(size) = SLAB_UNITS / (size + 2 * QUIET_ZONE)`.
- Island: generated with `growIsland(seed, REF_SIZE)` for every link. The seed still comes from the link text.
- Tree: crown radius = `1.5 × island.radius` for every species except birch, which is `1.1 × island.radius`. The same for every link length. Card and segment budgets are unchanged.
- Dark tiles and folded ink blocks: width = full pitch (no gap). Heights are unchanged in world units.
- Folded camera: on-screen pixels per module equal `scanFit(width, height, size + 8, insets).zoom` exactly as today, so `sampleScan` is unchanged.
- Export: drawn from the matrix only. Ink `#2a2140`, background `#ffffff`, 16 px per module, 4-module quiet zone, square image of `(size + 8) * 16` px, filename `sky-island-qr.png`. Self-checked with `sampleBuffer` before download. Save gating is unchanged.
- The Part 2 neutral-backdrop export render (`onExportReady`, `Exporter`, the backdrop logic) is removed.
- No new dependencies. Don't touch `e2e/environment.spec.ts` or `e2e/helpers.ts`.

## Review Focus

1. **Very long link (size 101+)** while folded: the code still reaches `Scans · N/N` where the window is large enough, and `Too small to scan` appears otherwise (Task 4 e2e).
2. **Short vs long link:** the island and tree look the same size on screen. `data-island-px` (the island's on-screen width in the tree pose) differs by at most 2 % between a 21- and a 57-module code (Task 4 e2e).
3. **Adjacent dark modules:** no light seam between them in the folded view. The pixel halfway between two neighbouring dark module centres is dark (Task 4 e2e).
4. **Saved PNG:** exactly `(size + 8) * 16` px square, white corners, finders where expected, and every module centre matching the matrix (Task 3 unit, Task 4 e2e).
5. **Fold mapping at any size:** each dark module is still covered exactly once, with ink blocks sized to the pitch (Task 1 unit).

---

### Task 1: Module pitch through QR, island, fold and camera

**Files:**
- Modify: `src/lib/qr.ts`, `src/lib/qr.test.ts`, `src/lib/fold.ts`, `src/lib/fold.test.ts`, `src/components/island/IslandScene.tsx`, `src/components/island/IslandMesh.tsx`, `src/components/island/TreeMesh.tsx`, `src/components/island/FoldCamera.tsx`

**Interfaces:**
- Produces:

```ts
// qr.ts
export const REF_SIZE = 25;
export const SLAB_UNITS = REF_SIZE + 2 * QUIET_ZONE;            // 33
export function modulePitch(size: number): number;              // SLAB_UNITS / (size + 2 * QUIET_ZONE)
export function darkModules(m: QrMatrix, pitch = 1): DarkModule[]; // x = (col - (size-1)/2) * pitch, same for z
// fold.ts
export const MODULE_BLOCK = { y: 0.3, height: 0.6 };            // width removed: it is the pitch now
export function planFold(pieces: FoldPiece[], top: number, dark: DarkModule[], seed: number, pitch: number): FoldPlan; // FoldPlan gains `pitch`
export function extraPose(module: DarkModule, t: number, out: Pose, pitch: number): Pose;
// inkPose / piecePose keep their signatures and read plan.pitch; the folded ink block is (pitch, 0.6, pitch)
// FoldCamera.tsx
export function topPose(width: number, height: number, size: number, insets: ScanInsets): Shot; // zoom = scanFit(...).zoom / modulePitch(size); dy shift uses that zoom
```

- **Scene:** uses `pitch = modulePitch(matrix.size)`, `darkModules(matrix, pitch)` and `growIsland(seed, REF_SIZE)`.
- **`IslandMesh`:** tiles at width `pitch` (full cell), positioned at the scaled module centres.
- **`TreeMesh`:** ink blocks sized by `inkPose`.
- **Default `pitch = 1`:** existing callers and tests keep today's behaviour.

- [ ] **Step 1: Write the failing tests:**
  - `modulePitch(25) === 1`, `modulePitch(21) === 33 / 29`, `modulePitch(57) === 33 / 65`;
  - `darkModules(m, 0.5)` positions are exactly half of `darkModules(m)`;
  - with `pitch = 0.5`, `inkPose` at t = 1 has `sx = sz = 0.5`, `sy = 0.6`, at the scaled module position;
  - `extraPose` scales the same way;
  - for sizes 21, 37 and 57 with their pitch, every dark module is still covered exactly once (reuse the existing coverage loop);
  - Review Focus 5: the extreme modules lie within `±SLAB_UNITS / 2 − QUIET_ZONE * pitch` for every size.
- [ ] **Step 2:** Run `node --experimental-strip-types --test src/lib/qr.test.ts src/lib/fold.test.ts` → FAIL.
- [ ] **Step 3:** Implement the libraries, then wire the scene, `IslandMesh`, `TreeMesh` and `FoldCamera`.
- [ ] **Step 4:** Run `npx tsc --noEmit`, `npx eslint src`, `npm test` and `npx playwright test e2e/island.spec.ts --workers=1` → all green. The existing PNG tests may fail until Task 3; list exactly which ones.
- [ ] **Step 5:** Commit `feat: fixed island scale with full-size modules`.

### Task 2: Tree scaled to the island

**Files:**
- Modify: `src/lib/tree.ts`, `src/lib/tree.test.ts`, `src/components/island/IslandScene.tsx`

**Interfaces:**
- Consumes: `REF_SIZE` (Task 1); `Island.radius`.
- Produces:

```ts
export const CROWN_TO_ISLAND = 1.5, BIRCH_CROWN_TO_ISLAND = 1.1;
export function fitTree(tree: Tree, islandRadius: number): Tree; // uniform scale of every card (position and size) and segment (ends and radii); top, trunkHeight, crownRadius scaled too
```

- **Scene:** `fitTree(growTree(species, seed, REF_SIZE), island.radius)`.
- **Scale factor:** `(birch ? 1.1 : 1.5) * islandRadius / tree.crownRadius`.

- [ ] **Step 1: Write the failing tests:**
  - for every species and seeds 1, 7 and 42, `fitTree(growTree(s, seed, 25), 30).crownRadius` is within 1e-6 of `1.5 * 30`, or `1.1 * 30` for birch;
  - the card and segment counts are unchanged;
  - `fitTree` is pure: the input is not mutated;
  - the lowest trunk segment still starts at y = 0.
- [ ] **Step 2:** Run `node --experimental-strip-types --test src/lib/tree.test.ts` → FAIL.
- [ ] **Step 3:** Implement and wire.
- [ ] **Step 4:** Run `npx tsc --noEmit`, `npx eslint src` and `npm test` → green. In the dev server, check that the tree-state framing still shows the whole crown and island for a short and a long link. Take screenshots.
- [ ] **Step 5:** Commit `feat: crown 1.5x the island for every link length`.

### Task 3: Plain QR export

**Files:**
- Create: `src/lib/qrImage.ts`, `src/lib/qrImage.test.ts`
- Modify: `src/app/page.tsx`, `src/components/island/IslandScene.tsx` (remove `Exporter`, `onExportReady`, the backdrop logic and any now-unused `userData.sky` tagging), `src/components/island/SkyLights.tsx` / `SkyDome.tsx` (only the export-related bits)

**Interfaces:**
- Consumes: `QrMatrix`, `QUIET_ZONE`; `sampleBuffer` (`src/lib/sampleScan.ts`).
- Produces:

```ts
export const QR_IMAGE = { ink: "#2a2140", background: "#ffffff", moduleSize: 16 };
export function qrPixels(m: QrMatrix, moduleSize = QR_IMAGE.moduleSize): { data: Uint8ClampedArray; width: number; height: number }; // RGBA, (size + 8) * moduleSize square, quiet zone background
```

- **Page Save:**
  1. `const img = qrPixels(qr.matrix)`;
  2. `sampleBuffer(img.data, img.width, img.height, qr.matrix, QR_IMAGE.moduleSize)` must be separated, or Save refuses with the usual reason;
  3. draw into a canvas with `putImageData`;
  4. `exportPng(canvas, "sky-island-qr.png")`.
- **Gating:** Save is gated exactly as before.

- [ ] **Step 1: Write the failing tests:**
  - for the matrix of `"https://example.com"`, `width === height === (size + 8) * 16`;
  - pixel (0, 0) and all four corners are `#ffffff`;
  - the centre pixel of every module matches the matrix (dark modules are `#2a2140`, light ones white);
  - the 4-module ring around the matrix is all white;
  - `sampleBuffer` on the output is separated with `matched === total`.
- [ ] **Step 2:** Run `node --experimental-strip-types --test src/lib/qrImage.test.ts` → FAIL.
- [ ] **Step 3:** Implement, wire Save, and delete the backdrop export path.
- [ ] **Step 4:** Run `npx tsc --noEmit`, `npx eslint src` and `npm test` → green.
- [ ] **Step 5:** Commit `feat: save a plain QR image drawn from the code`.

### Task 4: E2E for fixed scale, seams and the plain PNG

**Files:**
- Modify: `e2e/island.spec.ts`, plus `src/components/island/IslandScene.tsx` if it needs `data-island-px`

**Interfaces:**
- Consumes: Tasks 1–3. The scene wrapper exposes `data-island-px`: the island's projected on-screen width in CSS px in the settled tree pose. The scene sets it after each refit.

- [ ] **Step 1: Write the tests (Review Focus 1–4):**
  - **Same size:** with a 21-module link and then a 57-module link, the settled tree-state `data-island-px` values differ by at most 2 %.
  - **Long link:** fold a size ≥ 101 link at 1440 × 900 to `Scans · N/N`; at 390 × 844 it shows `Too small to scan…` or N/N, whichever the existing rule gives — assert the copy matches `saveBlockedReason`.
  - **No seam:** in the folded settled frame, for one pair of horizontally adjacent dark modules from the matrix, read the canvas pixel halfway between their centres (using the scanFit geometry and buffer scale). Its luma is within 10 of the module centres' luma.
  - **Plain PNG:** update the PNG tests: the saved image is `(size + 8) * 16` px square, the corners are `#ffffff`, the finder rings sit at the module grid, and every module centre matches the matrix. Replace the Night `#ece8f2` corner check with `#ffffff`.
- [ ] **Step 2:** Run `npx playwright test e2e/island.spec.ts --workers=1` → all pass.
- [ ] **Step 3:** Commit `test: e2e for fixed scale, seamless modules and the plain PNG`.
