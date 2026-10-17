# Anamorphic QR Sculpture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace v1's random block heights with a solver that makes the QR object resolve into a recognisable shape from one viewpoint while still scanning from above, and rebuild the interface around that canvas.

**Architecture:** A pure solver in `src/lib` turns (matrix, shape, elevation) into a block list; the R3F scene renders that list through one orthographic camera with three states; the UI floats over a full-bleed canvas. Scannability is verified by sampling the rendered scan view against the source matrix and gates export.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, React Three Fiber + three.js + drei, Tailwind v4, GSAP, `qrcode`, Playwright, `node --test`.

**Spec:** `system_document.md` (v2.0.0)

## Global Constraints

- Error correction level **H**; quiet zone **4 modules**; never trimmed. (§4A, §8)
- Top-down projection depends only on `(x, z)` — the solver must never change a block's grid cell. (§4E)
- Reveal azimuth is **pinned at 45°**. Only elevation φ is adjustable. (§4B, §10.1)
- All three camera states share **one orthographic camera**. (§5, §10.2)
- Base plane uses `MeshBasicMaterial`; **no cast shadows onto the plane**; flat high-intensity ambient is banned. (§4F)
- Scan view and export **flatten all blocks to one dark colour** (`colorScan`). (§4F, §10.5)
- Colour pickers accept **any hex, unclamped**. (FEAT_05, §10.3)
- Export is **blocked, not warned**, when scannability separation is lost. (§4G, §10.4)
- Verification runs **on change, debounced — never per frame**. (§4G, §10.8)
- Fully client-side; no backend; must stay statically deployable. (§8)
- All motion respects `prefers-reduced-motion`. (§6)
- Text/placeholder contrast ≥ 4.5:1, UI borders ≥ 3:1, **in both light and dark mode**. (§6)
- Every flex ancestor of the canvas carries `min-h-0`. (§6)
- react-bits is **copy-paste only — never a dependency**. (§3)
- No new state library. Local React state only. (§3)

## Review Focus

1. **Elevation at 90°** — `heightFor` divides by `cos(φ)`, which is 0. Elevation must be clamped to a safe range and the solver must never receive a degenerate angle. *(Task 3)*
2. **Empty input** — v1 encodes a single space, silently producing a QR of `" "`. An empty field should show an empty state, not a meaningless code. *(Task 3, Task 10)*
3. **Input beyond QR capacity** — must keep the last valid object on screen; the error may never blank the canvas. *(Task 10)*
4. **Columns the mask never covers** — diagonals whose `a` falls outside the shape have no filled samples; those cells must still be placed, quietly, on the plane. *(Task 3)*
5. **Long URLs** — a 177-module code is ~15,000 cells; the solve must stay off the render path and instance counts must not be rebuilt per frame. *(Task 3, Task 6)*

---

## File Structure

**Create**
- `src/lib/shapes.ts` — shape masks and the shape registry
- `src/lib/solver.ts` — projection helpers and the anamorphic solve
- `src/lib/verify.ts` — luminance, contrast and separation maths
- `src/components/scene/Blocks.tsx` — instanced block rendering
- `src/components/scene/CameraRig.tsx` — one ortho camera, three states, GSAP
- `src/components/scene/QrScene.tsx` — scene composition and lighting
- `src/components/controls/ControlPanel.tsx` — floating control cluster
- `src/components/controls/ColorField.tsx` — one labelled colour input
- `src/components/ScanStatus.tsx` — verification indicator
- `src/lib/*.test.ts`, `e2e/*.spec.ts`

**Modify**
- `src/lib/qr.ts` — drop `moduleNoise` / `moduleHeight`
- `src/lib/themes.ts` — drop `geometryType` / `heightVariance`; add `colorScan`, `regionColors`
- `src/app/page.tsx` — full-bleed canvas, floating controls
- `src/app/layout.tsx` — remove `LenisProvider`

**Delete**
- `src/components/LenisProvider.tsx`, the `lenis` dependency
- `src/components/QrScene.tsx` (replaced by `src/components/scene/QrScene.tsx`)
- `src/app/mockups/**` (reference spikes — Task 13)

---

### Task 1: Repository baseline

**Files:**
- Create: `.gitignore`
- Modify: `src/app/layout.tsx`, `package.json`
- Delete: `src/components/LenisProvider.tsx`

**Interfaces:**
- Produces: a git repo where every later task can commit.

- [ ] **Step 1: Initialise the repository**

```bash
git init -b main
```

- [ ] **Step 2: Write `.gitignore`**

Must ignore: `node_modules`, `.next`, `out`, `.playwright-mcp`, `playwright-report`, `test-results`, `*.tsbuildinfo`, `.env*`.

- [ ] **Step 3: Remove Lenis**

Delete `src/components/LenisProvider.tsx`. In `src/app/layout.tsx`, remove the import and unwrap `{children}`. Then `npm uninstall lenis`.

- [ ] **Step 4: Verify the app still builds and passes**

Run: `npm run lint && npm run build && npm test`
Expected: all pass; `lenis` absent from `package.json`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: init repo, drop lenis"
```

---

### Task 2: Shape library

**Files:**
- Create: `src/lib/shapes.ts`, `src/lib/shapes.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ShapeRegion = "trunk" | "canopy" | "body";
  export type Shape = { id: string; label: string; mask: (a: number, b: number) => ShapeRegion | null };
  export const SHAPES: Record<string, Shape>;
  export const DEFAULT_SHAPE_ID = "MINECRAFT_TREE";
  ```
  `a` and `b` are normalised screen coordinates in `[0,1]`; `b = 0` is the floor. `null` means empty.

- [ ] **Step 1: Write the failing tests**

```ts
test("trunk reaches the floor", () => {
  assert.equal(SHAPES.MINECRAFT_TREE.mask(0.5, 0.02), "trunk");
});
test("canopy sits above the trunk", () => {
  assert.equal(SHAPES.MINECRAFT_TREE.mask(0.5, 0.66), "canopy");
});
test("a gap separates trunk from canopy at the trunk's own column", () => {
  assert.equal(SHAPES.MINECRAFT_TREE.mask(0.2, 0.2), null);
});
test("outside the shape is empty", () => {
  assert.equal(SHAPES.MINECRAFT_TREE.mask(0.02, 0.95), null);
});
test("every shape in the registry declares its own id", () => {
  for (const [key, s] of Object.entries(SHAPES)) assert.equal(key, s.id);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/shapes.ts`**

Minecraft Tree: a trunk column at `|a - 0.5| < 0.06` spanning `b ∈ (0.06, 0.42)`, and a canopy of three overlapping discs centred near `(0.5, 0.66) r 0.29`, `(0.33, 0.53) r 0.22`, `(0.67, 0.53) r 0.22`. Keep edges hard — do not smooth or anti-alias the mask (§4C).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` — Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/shapes.ts src/lib/shapes.test.ts
git commit -m "feat: add shape library with minecraft tree"
```

---

### Task 3: Anamorphic solver

**Files:**
- Create: `src/lib/solver.ts`, `src/lib/solver.test.ts`
- Modify: `src/lib/qr.ts`, `src/lib/qr.test.ts`

**Interfaces:**
- Consumes: `Shape`, `ShapeRegion` (Task 2); `QrMatrix`, `QUIET_ZONE` (`src/lib/qr.ts`).
- Produces:
  ```ts
  export const ELEVATION_MIN_DEG = 15;
  export const ELEVATION_MAX_DEG = 60;
  export type Block = { x: number; z: number; y: number; grounded: boolean; region: ShapeRegion | null };
  export function screenU(x: number, z: number): number;
  export function groundW(x: number, z: number, size: number): number;
  export function heightFor(v: number, w: number, elevationRad: number): number;
  export function screenBand(size: number): { lo: number; span: number };
  export function solve(matrix: QrMatrix, shape: Shape, elevationDeg: number): Block[];
  ```

- [ ] **Step 1: Write the failing tests**

```ts
const m = generateMatrix("https://example.com");
const tree = SHAPES.MINECRAFT_TREE;

test("one block per dark module, and the footprint is unchanged", () => {
  const dark = countDarkCells(m);                      // local helper in the test file
  const blocks = solve(m, tree, 30);
  assert.equal(blocks.length, dark);
  const cells = new Set(blocks.map((b) => `${b.x},${b.z}`));
  assert.equal(cells.size, dark);
  for (const b of blocks) assert.equal(m.cells[b.z * m.size + b.x], 1);
});

test("every block sits on or above the plane", () => {
  for (const b of solve(m, tree, 30)) assert.ok(b.y > 0);
});

test("the screen band scales with matrix size", () => {
  assert.ok(screenBand(57).span > screenBand(21).span);
});

test("elevation is clamped to a safe range, so cos never reaches zero", () => {
  for (const deg of [-10, 0, 90, 180]) {
    for (const b of solve(m, tree, deg)) assert.ok(Number.isFinite(b.y));
  }
});

test("cells sharing a diagonal share a screen column", () => {
  assert.ok(Math.abs(screenU(5, 2) - screenU(8, 5)) < 1e-9);
});

test("grounding happens only where the shape meets the floor", () => {
  const blocks = solve(m, tree, 30);
  assert.ok(blocks.some((b) => b.grounded));
  for (const b of blocks) if (b.grounded) assert.equal(b.region, "trunk");
});

test("cells in a column are ordered by ground depth", () => {
  const blocks = solve(m, tree, 30).filter((b) => b.region && !b.grounded);
  const col = groupByScreenColumn(blocks);             // local helper in the test file
  for (const members of col.values()) {
    const sorted = [...members].sort((p, q) => groundW(p.x, p.z, m.size) - groundW(q.x, q.z, m.size));
    for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i].y >= sorted[i - 1].y - 1e-9);
  }
});

// Amended (Ruling C11): the original asserted distinct `y`, which cannot fail —
// `w` is unique per cell within a column, so `y` is strictly increasing no matter
// what the slot logic does. Assert in screen-`v` space instead, where the
// sub-sample offset is the only thing that separates cells sharing a slot.
test("surplus cells sharing a slot are separated by the sub-sample offset", () => {
  const m2 = generateMatrix("x".repeat(400));
  const blocks = solve(m2, tree, 30);
  const col = groupByScreenColumn(blocks);
  const crowded = [...col.values()]
    .filter((ms) => ms.some((b) => b.region !== null))
    .sort((p, q) => q.length - p.length)[0];
  // v = y*cos - w*sin recovers the screen height the solver aimed each block at.
  const rad = (30 * Math.PI) / 180;
  const vs = crowded.map((b) =>
    (b.y * Math.cos(rad) - groundW(b.x, b.z, m2.size) * Math.sin(rad)).toFixed(4),
  );
  assert.equal(new Set(vs).size, vs.length, "two blocks were aimed at the same screen height");
});

test("cells outside the shape still get placed, low and quiet", () => {
  const blocks = solve(m, tree, 30);
  const outside = blocks.filter((b) => b.region === null);
  assert.ok(outside.length > 0);
  const inside = blocks.filter((b) => b.region !== null);
  assert.ok(Math.max(...outside.map((b) => b.y)) < Math.max(...inside.map((b) => b.y)));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` — Expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/lib/solver.ts`**

Projection and inverse exactly as §4B. `screenBand` derives `lo` and `span` from `size + QUIET_ZONE * 2` — no hardcoded constants; `lo` must clear the most negative `w·sin(φ)` so nothing sinks below the plane. `solve` clamps elevation to `[ELEVATION_MIN_DEG, ELEVATION_MAX_DEG]` first, then per §4D: bin dark cells by `Math.round(screenU * √2)`; sample the mask vertically at that column's `a`; order each column's cells by `groundW`; distribute them across the filled samples; apply the contact-ground rule (contiguous filled run from the lowest sample, only when that sample is at `b ≤ 0.1`); give surplus cells sub-sample offsets within their slot; park uncovered columns at the minimum height with `region: null`.

- [ ] **Step 4: Delete the dead height helpers**

Remove `moduleNoise` and `moduleHeight` from `src/lib/qr.ts` and their tests from `src/lib/qr.test.ts`. Make `generateMatrix("")` throw rather than encoding `" "`, and add:

```ts
test("empty input is rejected rather than encoding a blank", () => {
  assert.throws(() => generateMatrix(""));
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test && npm run lint` — Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/solver.ts src/lib/solver.test.ts src/lib/qr.ts src/lib/qr.test.ts
git commit -m "feat: add anamorphic solver"
```

---

### Task 4: Theme and colour model

**Files:**
- Modify: `src/lib/themes.ts`
- Create: `src/lib/themes.test.ts`

**Interfaces:**
- Consumes: `ShapeRegion` (Task 2).
- Produces:
  ```ts
  export type Theme = {
    label: string;
    regionColors: Record<ShapeRegion, string>;
    colorScan: string; colorLight: string; background: string;
    roughness: number; metalness: number;
  };
  export const THEMES: Record<string, Theme>;
  export type ThemeId = keyof typeof THEMES;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
test("no preset carries a deleted v1 field", () => {
  for (const t of Object.values(THEMES) as Record<string, unknown>[]) {
    for (const dead of ["geometryType", "heightVariance", "colorDark", "ambientIntensity", "keyIntensity"]) {
      assert.ok(!(dead in t), `${dead} still present`);
    }
  }
});
test("every preset colours all three regions plus scan, light and background", () => {
  const hex = /^#[0-9a-fA-F]{6}$/;
  for (const t of Object.values(THEMES)) {
    for (const r of ["trunk", "canopy", "body"] as const) assert.match(t.regionColors[r], hex);
    for (const k of ["colorScan", "colorLight", "background"] as const) assert.match(t[k], hex);
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` — Expected: FAIL on the deleted-field assertions.

- [ ] **Step 3: Rewrite `src/lib/themes.ts`**

Keep the four preset names from v1 (Cityscape, Cyberpunk Voxels, Topographic Map, Flat). Replace `colorDark` with `regionColors` plus `colorScan`; delete `geometryType`, `heightVariance`, `ambientIntensity`, `keyIntensity`. `colorScan` must be genuinely dark against `colorLight` — the Flat preset stays `#000000` on `#ffffff`.

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test && npm run build`
Expected: tests PASS; build fails only where `src/components/QrScene.tsx` and `src/app/page.tsx` still read deleted fields — leave those, Tasks 6 and 10 replace them.

- [ ] **Step 5: Commit**

```bash
git add src/lib/themes.ts src/lib/themes.test.ts
git commit -m "feat: rework theme model for regions and scan colour"
```

---

### Task 5: Contrast and separation maths

**Files:**
- Create: `src/lib/verify.ts`, `src/lib/verify.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function relativeLuminance(r: number, g: number, b: number): number;
  export function contrastRatio(l1: number, l2: number): number;
  export type Separation = { matched: number; total: number; worstCaseContrast: number; separated: boolean };
  export function classifySeparation(darkLums: number[], lightLums: number[]): Separation;
  ```
  Luminance inputs are 0–255 channel values; `classifySeparation` takes 0–255 luminances.

- [ ] **Step 1: Write the failing tests**

```ts
test("black on white is 21:1", () => {
  const r = contrastRatio(relativeLuminance(0, 0, 0), relativeLuminance(255, 255, 255));
  assert.ok(Math.abs(r - 21) < 0.05);
});
test("identical colours are 1:1", () => {
  const l = relativeLuminance(120, 120, 120);
  assert.ok(Math.abs(contrastRatio(l, l) - 1) < 1e-9);
});
test("overlapping populations are not separated", () => {
  assert.equal(classifySeparation([10, 200], [150, 220]).separated, false);
});
test("disjoint populations are separated and report the worst pair", () => {
  const s = classifySeparation([5, 9], [200, 240]);
  assert.equal(s.separated, true);
  assert.ok(s.worstCaseContrast > 10);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` — Expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/lib/verify.ts`**

WCAG relative luminance (sRGB linearisation, the 0.03928 knee). `separated` is true when the brightest dark is strictly below the dimmest light; `worstCaseContrast` is the ratio of that closest pair.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` — Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/verify.ts src/lib/verify.test.ts
git commit -m "feat: add contrast and separation maths"
```

---

### Task 6: Block renderer

**Files:**
- Create: `src/components/scene/Blocks.tsx`

**Interfaces:**
- Consumes: `Block` (Task 3), `Theme` (Task 4).
- Produces: `export default function Blocks(props: { blocks: Block[]; size: number; theme: Theme; flatten: boolean }): JSX.Element` (size added by Ruling C16)

- [ ] **Step 1: Implement `Blocks`**

One `InstancedMesh` per material group. When `flatten` is true, every block uses `theme.colorScan` and the whole set collapses to a single instanced mesh — this is what SCAN and export render (§4F). Otherwise group by `region`, with `region: null` taking `regionColors.body`. Grounded blocks are columns from the plane (`scale.y = y + halfBlock`, centred at half that); floating blocks are fixed-height boxes centred at `y`. Geometry is always `boxGeometry` — there are no other shapes (§3). Write instance matrices in `useLayoutEffect` keyed on `[blocks, flatten, theme]`, never per frame; include the instance count in each mesh's `key` so the buffer is reallocated when it changes.

- [ ] **Step 2: Verify it typechecks**

Run: `npm run build`
Expected: no errors originating in `Blocks.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/scene/Blocks.tsx
git commit -m "feat: add instanced block renderer"
```

---

### Task 7: Camera rig

**Files:**
- Create: `src/components/scene/CameraRig.tsx`

**Interfaces:**
- Consumes: `ELEVATION_MIN_DEG`, `ELEVATION_MAX_DEG` (Task 3).
- Produces:
  ```ts
  export type ViewState = "EXPLORE" | "REVEAL" | "SCAN";
  export default function CameraRig(props: {
    state: ViewState; size: number; elevationDeg: number;
    onProximityChange: (p: number) => void;
  }): JSX.Element;
  ```

- [ ] **Step 1: Implement `CameraRig`**

A single `OrthographicCamera` with `makeDefault`, shared by all three states (§5). REVEAL sits at azimuth 45° and the given elevation; SCAN sits directly overhead with `up = [0, 0, -1]` to avoid a degenerate `lookAt`; EXPLORE enables `OrbitControls`. Zoom derives from the plane span and the canvas size so the quiet zone always fits. Tween position and zoom with GSAP on state change, and skip the tween when `prefers-reduced-motion: reduce` matches (§6). While in EXPLORE, report proximity to the reveal pose as `0..1` through `onProximityChange`, throttled to at most one call per frame.

- [ ] **Step 2: Verify it typechecks**

Run: `npm run build` — Expected: no errors originating in `CameraRig.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/scene/CameraRig.tsx
git commit -m "feat: add single-camera rig with three view states"
```

---

### Task 8: Scene composition

**Files:**
- Create: `src/components/scene/QrScene.tsx`
- Delete: `src/components/QrScene.tsx`

**Interfaces:**
- Consumes: `Blocks` (Task 6), `CameraRig` + `ViewState` (Task 7), `Theme` (Task 4), `Block` (Task 3).
- Produces:
  ```ts
  export default function QrScene(props: {
    blocks: Block[]; size: number; theme: Theme; state: ViewState; elevationDeg: number;
    onProximityChange: (p: number) => void;
    onCanvasReady: (canvas: HTMLCanvasElement) => void;
  }): JSX.Element;
  ```

- [ ] **Step 1: Implement the scene**

`<Canvas gl={{ preserveDrawingBuffer: true }}>` with `theme.background`. Lighting is a real three-point rig — a strong key, a **dim** ambient fill, a cool rim. Flat high-intensity ambient is banned (§4F). The base plane spans `size + QUIET_ZONE * 2`, uses `MeshBasicMaterial` in `theme.colorLight`, and **receives no shadows** (§4F). Pass `flatten={state === "SCAN"}` to `Blocks`. Report the canvas element through `onCanvasReady` so export and verification can read pixels without a DOM query.

- [ ] **Step 2: Delete the v1 scene**

Remove `src/components/QrScene.tsx`.

- [ ] **Step 3: Verify it typechecks**

Run: `npm run build`
Expected: errors only in `src/app/page.tsx`, which Task 10 replaces.

- [ ] **Step 4: Commit**

```bash
git add -A src/components
git commit -m "feat: compose scene with three-point lighting"
```

---

### Task 9: In-app scannability verification

**Files:**
- Create: `src/lib/sampleScan.ts`, `src/components/ScanStatus.tsx`

**Interfaces:**
- Consumes: `classifySeparation`, `Separation` (Task 5); `QrMatrix` (`src/lib/qr.ts`).
- Produces:
  ```ts
  export function sampleScan(canvas: HTMLCanvasElement, matrix: QrMatrix): Separation;
  export default function ScanStatus(props: { separation: Separation | null }): JSX.Element;
  ```

- [ ] **Step 1: Implement `sampleScan`**

Copy the canvas into a 2D context, read it once, and sample one pixel at each module centre. Module pitch is `min(width, height) / (size + QUIET_ZONE * 2)`, measured from the canvas centre. Split luminances into dark and light populations by the source matrix, then delegate to `classifySeparation`. The caller is responsible for only invoking this while the scan view is rendered.

- [ ] **Step 2: Implement `ScanStatus`**

Shows matched/total and worst-case contrast. **Text plus an icon, never colour alone** (§4G). Renders a neutral "checking" state when `separation` is null.

- [ ] **Step 3: Verify it typechecks**

Run: `npm run build` — Expected: no errors originating in these two files.

- [ ] **Step 4: Commit**

```bash
git add src/lib/sampleScan.ts src/components/ScanStatus.tsx
git commit -m "feat: verify scannability by sampling the rendered code"
```

---

### Task 10: Controls and layout

**Files:**
- Create: `src/components/controls/ControlPanel.tsx`, `src/components/controls/ColorField.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: everything above.
- Produces: the assembled page.

- [ ] **Step 1: Implement `ColorField`**

A labelled colour input accepting **any hex, unclamped** (§10.3), pairing `<input type="color">` with a text field so a brand hex can be pasted.

- [ ] **Step 2: Implement `ControlPanel`**

A floating cluster over the canvas, not a toolbar band: link field with live character count, shape picker, theme preset picker, the colour fields, an elevation slider bounded by `ELEVATION_MIN_DEG`/`ELEVATION_MAX_DEG`, the three view-state buttons, and the export button. On a phone it sits in the lower half, within thumb reach (§5). Every control keyboard-reachable with a real `focus-visible` ring; a toggle's label must not contradict its `aria-pressed` (§6).

- [ ] **Step 3: Rebuild `src/app/page.tsx`**

Full-bleed canvas with the panel floating above it. **Every flex ancestor of the canvas carries `min-h-0`** (§6). Debounce input at 300ms; on a capacity error keep the last valid blocks rendered and overlay a non-destructive banner (§6). An empty field shows an empty state rather than encoding a blank. The canvas wrapper keeps `role="img"` with a label built from live state, plus a polite live region. Solve in a `useMemo` over `(matrix, shape, elevation)` — never during render of the scene. Run `sampleScan` **debounced on change only** (§10.8).

- [ ] **Step 4: Verify the whole app builds, lints and tests**

Run: `npm run lint && npm run build && npm test`
Expected: all pass, with no references to deleted theme fields remaining.

- [ ] **Step 5: Commit**

```bash
git add -A src/app src/components/controls
git commit -m "feat: rebuild interface around the canvas"
```

---

### Task 11: Export

**Files:**
- Create: `src/lib/exporters.ts`
- Modify: `src/components/controls/ControlPanel.tsx`

**Interfaces:**
- Consumes: `Block` (Task 3), `Theme` (Task 4), `Separation` (Task 5).
- Produces:
  ```ts
  export function exportPng(canvas: HTMLCanvasElement, filename: string): void;
  export function exportGlb(blocks: Block[], theme: Theme, filename: string): Promise<void>;
  ```

- [ ] **Step 1: Implement the exporters**

`exportPng` reads the preserved drawing buffer and triggers a download. `exportGlb` builds a scene from the block list and serialises it with three's `GLTFExporter` (already available via `three`; **do not add a dependency**). Scan exports use the flattened colour (§4F).

- [ ] **Step 2: Gate export on scannability**

In `ControlPanel`, the export control is **disabled whenever `separation.separated` is false**, and states the reason and the fix (§10.4). The object itself stays on screen and fully editable.

- [ ] **Step 3: Verify it builds**

Run: `npm run build && npm run lint` — Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/exporters.ts src/components/controls/ControlPanel.tsx
git commit -m "feat: add png and glb export gated on scannability"
```

---

### Task 12: Browser proof

**Files:**
- Create: `e2e/scannability.spec.ts`, `e2e/interface.spec.ts`

**Interfaces:**
- Consumes: the running app at `baseURL`.

- [ ] **Step 1: Write `e2e/scannability.spec.ts`**

Switch to the scan view, then in-page sample every module centre against the matrix for the default link. Assert zero mismatches and worst-case contrast above 10:1. Repeat for each theme preset and for the minimum and maximum elevation.

- [ ] **Step 2: Write `e2e/interface.spec.ts`**

```ts
test("the page never scrolls at phone size", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const overflow = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  expect(overflow).toBe(0);
});
test("too-long input keeps the object on screen", async ({ page }) => { /* fill 5000 chars; canvas still present, alert visible */ });
test("every control is reachable by keyboard with a visible focus ring", async ({ page }) => { /* tab through; assert :focus-visible outline-width is not 0px */ });

for (const scheme of ["light", "dark"] as const) {
  test(`text clears 4.5:1 in ${scheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/");
    // compute each label/button's colour against its painted background; v1 failed this in dark mode
    expect(await worstTextContrast(page)).toBeGreaterThanOrEqual(4.5);
  });
}
```

- [ ] **Step 3: Run the suite**

Run: `npm run test:e2e`
Expected: PASS. The config starts the dev server itself.

- [ ] **Step 4: Commit**

```bash
git add e2e
git commit -m "test: prove scannability and the interface floor in a browser"
```

---

### Task 13: Remove the spikes and close out

**Files:**
- Delete: `src/app/mockups/**`

- [ ] **Step 1: Delete the reference spikes**

```bash
git rm -r --cached src/app/mockups 2>/dev/null; rm -rf src/app/mockups
```

- [ ] **Step 2: Confirm nothing referenced them**

Run: `grep -r mockups src e2e || true`
Expected: no matches.

- [ ] **Step 3: Run every gate**

Run: `npm run lint && npm run build && npm test && npm run test:e2e`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove reference spikes"
```
