# [SYSTEM_DOCUMENT]: Anamorphic QR Sculpture Generator (PRD & TDD)
# [VERSION]: 2.0.0
# [SUPERSEDES]: 1.0.0 ("3D Dynamic QR Code Generator")
# [INTENT_FOR_AGENT]: Ingest these requirements to plan and build the application. The [ANAMORPHIC_SOLVER] section is the core; everything else serves it.

## 0. [WHAT_CHANGED_FROM_V1]

Version 1.0.0 specified a QR code with randomised block heights — "3D styling on a barcode". It was built and works, and the result reads as visual noise: the heights mean nothing, so the object looks extruded rather than designed.

Version 2.0.0 changes the product. Heights are no longer decorative. They are **solved** so that the object resolves into a recognisable shape when viewed from one specific angle, while remaining a working QR code when viewed from directly above. The illusion is the product; the QR code is the constraint it survives.

Everything in v1 §4A (matrix generation) and the material/scannability constraints carries forward unchanged. The height rule, the camera model, the UI, and the export scope are all replaced.

---

## 1. [PRODUCT_OVERVIEW]

**Description:** A web application that turns a link into an anamorphic sculpture. From directly above it is a scannable QR code. From one chosen viewpoint, the scattered blocks line up into a recognisable object — the reference shape is a **Minecraft-style tree**: a straight blocky trunk under a cubic leaf canopy. From every other angle it is deliberately abstract.

**Target output:** A full-viewport interactive WebGL canvas. The user types a link, picks a shape and colours, orbits the object freely, snaps to the reveal angle to see the illusion, snaps to the top-down view to see the code, and exports an image.

**Why it is worth using:** Other generators decorate a flat code. This one makes a real object whose top-down projection *is* the code, and whose side view is a picture. Both halves are the product; neither is a caveat.

---

## 2. [CORE_FEATURES]

- **FEAT_01 | Data Input Engine.** Text/URL field, 300ms debounce, live character count, capacity validation that never blanks the canvas. *(Built in v1, carries forward.)*
- **FEAT_02 | Anamorphic Solver.** Solves a height per dark module so the chosen shape resolves at the reveal angle. Replaces v1's random extrusion. See §4.
- **FEAT_03 | Interactive Main View.** The canvas is the interface, not a preview pane. Free orbit, snap-to-reveal, snap-to-scan, with continuous feedback on how close the current camera is to the reveal angle.
- **FEAT_04 | Shape Library.** A shipped set of bold silhouettes that survive the available resolution. Minecraft Tree is the reference implementation and the default.
- **FEAT_05 | Colour System.** Per-region colours (trunk vs canopy), plus base-plane and background colour. **Any hex is accepted — the picker is not clamped** — because PRODUCT.md's primary user arrives with a brand colour and a clamped picker would silently refuse it. A live contrast readout says when a palette has stopped being scannable, and export is withheld until it is fixed.
- **FEAT_06 | Export.** PNG from the scan view (built). Add PNG from the reveal view, and `.glb`.
- **FEAT_07 | Scannability Verification.** A continuous, in-product check that the current object actually decodes. The product's hard promise must be visible, not asserted.

---

## 3. [TECHNICAL_ARCHITECTURE]

**Existing stack — build on it, do not replace it:**

- Next.js 16 (App Router), React 19, TypeScript
- React Three Fiber + three.js + `@react-three/drei`
- `qrcode` for matrix generation
- Tailwind CSS v4
- GSAP for camera transitions
- Local React state. **No store.** Current scope does not need one; add Zustand only when the canvas and controls stop sharing a parent.

**Removed in v2:** `lenis`. The main view is a fixed, non-scrolling canvas. A smooth-scroll library on a page that does not scroll is a dependency and a wheel-handler conflict with `OrbitControls` for no feature.

**Verification tooling:** Playwright is available and has already been used to prove scannability by pixel sampling. Treat browser verification as part of done, not as optional QA.

**UI components:** [react-bits](https://github.com/DavidHDev/react-bits) is an approved source for chrome components (text animations, micro-interactions, backgrounds). **Copy-paste individual components only — do not add it as a dependency**, and port each one to the project's own tokens rather than importing its styling wholesale. Licence is MIT + Commons Clause, which permits this use. A component that pulls in a new runtime dependency is not worth it for a single effect.

**Theme presets survive, as starting points.** v1's four named presets remain and seed the colour pickers, which then override them — the behaviour already chosen for v1. Three v1 theme fields are **deleted**: `heightVariance` (heights are solved now), and the `CYLINDER` / `SMOOTH` geometry types (they contradict "blocky edges are correct"). Everything is a box.

---

## 4. [ANAMORPHIC_SOLVER] (Agent Core Focus)

### A. Matrix generation — unchanged from v1

1. Accept user input (string).
2. Generate an N×N matrix at error correction level **H**.
3. `1` = dark module (gets a block). `0` = light module (stays flat).
4. A **4-module quiet zone** is part of the base plane and is not decoration. It may never be trimmed.

### B. The screen basis

The reveal camera is **orthographic**, at **azimuth fixed at 45°** and elevation φ (default 30°, user-adjustable). For that camera, a world point `(x, y, z)` projects to screen coordinates:

```
u = (x - z) / √2                      // horizontal — fixed by the cell
w = (x + z - (N - 1)) / √2            // ground depth — fixed by the cell
v = y·cos(φ) - w·sin(φ)               // vertical — the only free variable
```

Two consequences drive the whole algorithm:

1. **`u` is locked by the cell's grid position.** A module cannot move horizontally on screen. The only thing the solver controls is `v`, through the block's height `y`.
2. **Cells sharing the same `x - z` share a screen column.** The grid's diagonals are the screen columns. There are `2N - 1` of them, and their populations are uneven.

**Azimuth is fixed at 45° and is not a user control.** Both properties above hold *only* at 45°. At any other azimuth the diagonals stop being screen columns, cells scatter into near-continuous `u` values, and the exact grouping in §4D degrades into tolerance binning with small, lumpy columns — a different algorithm with a lower quality ceiling. Elevation φ is the adjustable parameter; it changes `v` without disturbing `u`, so the solve stays exact. Free orbit in Explore is unaffected — only the *reveal* angle's azimuth is pinned.

Inverting for the height that lands a block at a target screen height:

```
y = (v + w·sin(φ)) / cos(φ)
```

### C. Target shape representation

A shape is a binary mask over normalised screen space `(a, b) ∈ [0,1]²`, where `a` runs along `u` and `b` runs along `v`, plus optional **region tags** so different parts can take different colours.

```
type Shape = {
  id: string
  label: string
  mask: (a: number, b: number) => ShapeRegion | null   // null = empty
}
type ShapeRegion = "trunk" | "canopy" | "body"
```

The Minecraft Tree reference: a narrow vertical trunk running from the floor to roughly 0.42, and a canopy of overlapping blobs centred around 0.53–0.66. Blocky edges are correct — do not smooth the mask.

**Mapping `b` to world height.** The shape occupies a screen-`v` band `[V_LO, V_LO + V_SPAN]`. **Both scale with N**, so a long URL produces a bigger sculpture at the same proportions rather than a small shape on a huge slab. Derive them from the plane span (`N + 8`), not from constants: the spikes' `V_LO = 11, V_SPAN = 26` were tuned for one 29-module code and must not be hardcoded. `V_LO` must clear the lowest `w·sin(φ)` so no block sinks below the plane, and it sets how tall the grounded trunk columns are — too low and the contact-ground rule produces stubs, too high and the trunk dominates the canopy.

### D. The solve

For each screen column (each distinct `x - z` diagonal):

1. Collect the dark cells in that column.
2. Sample the mask vertically at that column's `a`, producing the ordered list of filled `b` values. Record each sample's region tag.
3. **Distribute** the column's cells evenly across the filled samples, **ordered by ground depth `w`** (far cells low, near cells high). Ordering by `w` is required, not cosmetic: it makes occlusion predictable, so a nearer block never hides a farther one it should sit behind. Gaps in the mask produce gaps in the object — this is what makes a trunk read as separate from a canopy.

   **When a column has more cells than filled samples**, do not let the surplus collapse onto identical `b` values — they would land on the same screen pixel and all but the nearest would be invisible, wasting density in exactly the dense codes that should look best. Spread surplus cells with sub-sample offsets inside their slot, thickening the shape instead of hiding blocks.
4. **Contact-ground rule.** Take the contiguous run of filled samples starting at the lowest sample, but only if that sample sits at `b ≤ 0.1` (the shape genuinely touches the floor). Cells assigned within that run become **real columns from the plane**. Every other cell becomes a **floating block**.
5. Convert each cell's assigned `b` to a world height via §4B, and clamp to a minimum so nothing sinks below the plane.

**Why the contact-ground rule exists, and why it is not optional.** Pure floating gives the cleanest illusion but the object hovers with nothing touching down. Supporting every floating block with a stem destroys the image — the stems read as a curtain of vertical lines. Grounding by height threshold fills the very gaps that make the shape legible. Grounding **only where the shape itself meets the floor** keeps the gaps and still gives the sculpture a real trunk. All three alternatives were built and compared; this rule is the one that works.

**Columns the mask does not cover.** A diagonal whose `a` falls outside the shape has no filled samples. Park those cells at the minimum height on the plane. They become the object's scattered base and must stay visually quiet.

### E. The invariant

**The top-down orthographic projection depends only on `(x, z)`, which the solver never changes. The code therefore always scans, by construction, regardless of shape, angle, or height.** This is a property of the design, not a behaviour to be tested into existence — but it must still be verified (§4G), because materials, colour, and lighting can destroy contrast even when geometry is correct.

### F. Lighting and materials — revised from v1 §4C

v1 specified `MeshBasicMaterial` on top faces and `MeshStandardMaterial` on sides. In practice the build used standard material throughout with flat ambient light, and the result is a featureless black mass with no readable form. **The lighting, not the geometry, is the single largest visual defect in v1.**

Requirements:

- A real three-point rig: a strong key light, a dim ambient fill, and a cool rim light. Flat high-intensity ambient is banned — it erases every edge.
- The **base plane stays unshaded** (`MeshBasicMaterial`). Top-down contrast may never be dimmed by shading. This constraint from v1 is correct and survives.
- **No cast shadows onto the plane.** Shadows between blocks are acceptable; shadows on the light modules are not.
- Blocks may use `MeshStandardMaterial` with per-theme roughness and metalness.
- **Region colours apply in Explore and Reveal only. Scan view flattens every block to a single dark colour**, and the exported PNG uses that flattened render. A block's region comes from where the solver parked it in the reveal view, so from above those colours land in a pattern unrelated to the code — two different darks against one light, arranged arbitrarily. Flattening keeps the scan reliable, keeps verification measuring one population against one, and leaves the region colours where they carry meaning.

### G. Scannability verification (FEAT_07)

Render the scan view to an offscreen target and verify continuously:

1. Sample the rendered pixels at every module centre.
2. Compare the dark/light classification against the source matrix.
3. Compute the luminance separation between the dark and light populations.
4. Surface the result as a persistent indicator — **text plus icon, never colour alone.**

This method is already proven: it was run against the v1 build and matched 841/841 modules with 15.37:1 worst-case contrast, and it correctly showed that a high-variance dark-on-neon theme still separates cleanly. Prefer it over a QR decoder library; it needs no dependency and localises *which* modules fail.

**Cadence: verify on change, debounced** — on input, shape, elevation, or colour change. Not per frame. A per-frame `readRenderTargetPixels` is a GPU-to-CPU sync stall on a product whose pitch is a live-feeling canvas, and most of the time the user is not even looking at the scan view. On-change gives the same persistent indicator for almost nothing.

**Export blocks when separation is lost.** The button is disabled and states the reason and the fix. §8 says scannability outranks every aesthetic decision; this is that rule enforced rather than described. This is not a conflict with "error states never destroy the user's object" — the object stays on screen and fully editable, only the export is withheld.

---

## 5. [INTERACTIVE_MAIN_VIEW] (FEAT_03)

The canvas is full-bleed. Controls float over it rather than sitting in a toolbar band above it. On a phone the controls belong in the lower half, within thumb reach; the object takes the larger share of the screen, not the smaller one.

Three camera states:

| State | Camera | Controls | Purpose |
|---|---|---|---|
| **Explore** | Orthographic, free orbit | enabled | Inspect the object |
| **Reveal** | Orthographic at (45°, elevation φ) | locked | See the illusion |
| **Scan** | Orthographic top-down | locked | See and export the code |

**All three states share one orthographic camera.** A perspective Explore camera cannot be tweened into an orthographic Reveal by animating a pose — it would pop at exactly the moment the tween exists to protect. One camera makes the tween trivial, and an orthographic orbit is also the right look for a Minecraft reference.

- Transitions between states are **tweened with GSAP**, not cut. v1's hard snap is why the moment of truth felt unverified.
- While orbiting in Explore, show continuous feedback on proximity to the reveal angle, and let the user snap when close. Finding the angle is the product's best moment; do not hide it behind a button alone.
- The reveal **elevation** is user-adjustable; azimuth is pinned at 45° (§4B). Changing elevation re-runs the solve.
- Every camera state must be reachable by keyboard, and the current state must be announced to assistive technology.

---

## 6. [UI_AND_ACCESSIBILITY_FLOOR]

These are not polish items. They were found failing in a browser audit of v1 and must not regress:

- Canvas carries `role="img"` with a label composed from live state, plus a polite live region for updates.
- A toggle button's label must not contradict its `aria-pressed` state.
- Every flex ancestor of the canvas needs `min-h-0`, or the canvas keeps its largest past height and pushes the page into overflow. This clipped the QR off the bottom of a phone in v1 and no test caught it.
- Focus indicators are real rings with offset, via `focus-visible`. `outline-none` with a 1px border colour change is not a focus indicator.
- Text and placeholder contrast ≥ 4.5:1, UI component borders ≥ 3:1, **in both light and dark mode**. v1 failed all three in dark mode.
- All motion — GSAP tweens included — respects `prefers-reduced-motion`.
- Error states never destroy the user's object. Keep the last valid render and overlay the message.

---

## 7. [DATA_SCHEMA_MAPPING]

```jsonc
{
  "qrData": {
    "input": "string",
    "matrix": "Uint8Array (N*N, row-major)",
    "size": "integer"
  },
  "solve": {
    "shapeId": "string",
    // azimuth is pinned at 45 and is not state — see 4B
    "elevationDeg": "number",
    "blocks": [
      { "x": 0, "z": 0, "y": 0.0, "grounded": true, "region": "trunk" }
    ]
  },
  "viewport": {
    "state": "enum('EXPLORE','REVEAL','SCAN')",
    "proximityToReveal": "number 0..1"
  },
  "theme": {
    "presetId": "string",            // seeds the colours below; overridden freely after
    "regionColors": { "trunk": "hex", "canopy": "hex", "body": "hex" },
    "colorScan": "hex",              // the single flattened dark used in SCAN and export
    "colorLight": "hex",
    "background": "hex",
    "roughness": "number",
    "metalness": "number"
  },
  "verification": {
    "modulesMatched": "integer",
    "modulesTotal": "integer",
    "worstCaseContrast": "number"
  }
}
```

---

## 8. [CONSTRAINTS_AND_NON_GOALS]

**Hard constraints**

- Fully client-side. No backend, no account, no data leaving the browser. Must stay deployable as a static site.
- Scannability outranks every aesthetic decision. A beautiful object that does not decode is a defect.
- Error correction stays at **H**. The quiet zone stays at 4 modules.

**Known limits — state them in the product, do not paper over them**

- **The illusion is orthographic-only.** An exported image works. A physical 3D print photographed with a phone will not hold the illusion, because a real camera is perspective and blocks at different depths shift apart. If printing ever becomes a goal, only fully-grounded shapes are printable, and those cannot have gaps.
- **Resolution is the dark-module count.** A short link gives a coarse shape. Surface the available detail and let the user see why a longer input produces a better sculpture.
- **The object is intentionally abstract from other angles.** This is the trick, not a bug, and the UI should say so.

**Non-goals for this version**

- User-uploaded shapes. Ship the library first.
- SVG export. The object is not planar; vector export is not meaningful for the reveal view.
- Print-ready resolution control.
- Saved or shareable configurations.

---

## 9. [LEFT_TO_THE_BUILDER]

- The visual direction of the chrome: palette, typography, control layout and density. The constraint is that the interface must recede so the object leads, and must not read as a default template.
- The exact contents of the shape library beyond the Minecraft Tree reference.
- Where the solve runs (render pass, memo, or worker) — driven by measured cost, not guessed.
- Whether the proximity-to-reveal feedback is a number, a meter, a ghosted outline, or something better.

---

## 10. [RESOLVED_DECISIONS]

Settled after a builder review of v2.0.0. Recorded so they are not relitigated.

| # | Decision | Who |
|---|---|---|
| 1 | Reveal azimuth pinned at 45°; elevation is the adjustable parameter (§4B) | Builder's call |
| 2 | All three camera states share one orthographic camera (§5) | Builder's call |
| 3 | Colour picker accepts any hex; no clamping (FEAT_05) | Product owner |
| 4 | Export is blocked, not warned, when scannability is lost (§4G) | Product owner |
| 5 | Scan view and export flatten to one dark colour (§4F) | Product owner |
| 6 | Shape's screen band scales with N; no hardcoded constants (§4C) | Builder's call |
| 7 | Cells ordered by ground depth `w`; surplus cells get sub-sample offsets (§4D) | Builder's call |
| 8 | Verification runs on change, debounced — not per frame (§4G) | Builder's call |
| 9 | Theme presets survive as colour seeds; `heightVariance` and non-box geometries deleted (§3) | Builder's call |
