# [SYSTEM_DOCUMENT]: Sky Island QR Generator (PRD & TDD)
# [VERSION]: 3.0.0
# [SUPERSEDES]: 2.1.0 ("Anamorphic QR Sculpture Generator"), 2.0.0 and 1.0.0. Everything below the v3.0.0 section is kept as history.

## v3.0.0. [THE_FOLD] (current; read this first)

The design spec is `docs/superpowers/specs/2026-10-25-sky-island-design.md`. It is the authority for behaviour and look; this section records what it changes in this document.

### What replaced what

Versions 2.0 and 2.1 hid the code inside an anamorphic sculpture: a solver chose block heights so the object resolved into a shape from one camera angle while the top-down view stayed a QR code. In practice that produced a thin, awkward tree and a mostly empty pad. Version 3.0.0 drops the anamorphic mechanism entirely. The app now grows a full voxel tree on a floating island, standing on a slab that shows the QR code. Tapping the tree **folds** it: each dark module of the code receives exactly one tree block, the leftover blocks shrink into the slab, the camera eases to straight top-down and the island goes still. Tapping again grows the tree back. Typing a new link regrows the world, and the island's outline and depth are grown deterministically from the link.

The fold replaces §4 (the anamorphic solver, projection basis and contact-ground rule) and the Explore / Reveal / Scan modes of §5 and §11. The solver, the shape library, the theme presets, the elevation control, the Reveal PNG and the `.glb` export no longer exist. Season names, the QR matrix generation of §4A, the quiet zone and error correction level H carry over unchanged. PNG is the only export.

### Scan guarantee, restated for the fold

The guarantee used to hold by construction, because the solver never moved a block in x or z. It now holds by the folded layout: in the folded state the top-down render of the slab is the code. The slab is the matrix plus a light quiet zone of at least four modules (`QUIET_ZONE` in `src/lib/qr.ts`) on every side, and grass starts outside it. Folded module blocks and finder tiles are the ink colour, never grass green. Colour, season and lighting can still destroy contrast, so the guarantee is verified, not assumed.

### §4G verification, for the folded state

Verification keeps the existing method (`src/lib/verify.ts`, `src/lib/sampleScan.ts`): sample every module centre of the rendered folded frame, compare with the matrix, and require separation and contrast above `MIN_SCAN_CONTRAST`. The verdict is shown as text plus an icon. The check runs once, after the fold has finished and the camera has settled, debounced on change and never per frame. A verdict for different inputs is never shown, and a lost WebGL context drops the verdict until the code is checked again. Save, the only export, is blocked, not warned, unless a passed check exists for the current link, season and leaf colour in the settled folded state. A disabled Save states its reason in text. "Too small to scan" (`tooSmallToScan` in `src/lib/scanFit.ts`) keeps working against the folded framing.

### §11 still-frame rule, for the folded state

The world is alive only while the tree stands. Once the tree is folded and settled, nothing moves in the graded region: no island bob, no leaf sway, particles hidden, and the waterfall and other effects either outside the slab or paused. A season change while folded re-checks the code. Ambient motion never runs while the frame is graded or saved. With reduced motion, fold and grow are instant, and there is no bob, sway or particles; season changes snap.

### Unchanged

The app is client-side only, a static deploy, and no data leaves the browser. The accessibility floor of §6 still binds: the link field is labelled, fold and grow are reachable by keyboard (the hint chip is a real button), the season choice is a named radiogroup, and a polite live region announces fold, grow and the verdict.

### History

Sections §0 to §11 below describe versions 1.0 to 2.1. Where they conflict with this section (the solver, the three view modes, themes, hotkeys, `.glb`), this section wins.

---

# [HISTORY]: the v2.1.0 header, kept as it was.
# [VERSION_AT_THE_TIME]: 2.1.0
# [INTENT_FOR_AGENT]: Ingest these requirements to plan and build the application. The [ANAMORPHIC_SOLVER] section (§4) is the core and the top-down scan guarantee is the law. The gamified UI, environment, shader and particle work in §1–§3, §5, §7 and §11 exists to make the product delightful and must never weaken that guarantee. Where any v2.1 visual or motion feature conflicts with a scan-view guarantee, the scan-view guarantee wins. Read §0A and §11 before planning.

## 0. [WHAT_CHANGED_FROM_V1]

Version 1.0.0 specified a QR code with randomised block heights — "3D styling on a barcode". It was built and works, and the result reads as visual noise: the heights mean nothing, so the object looks extruded rather than designed.

Version 2.0.0 changes the product. Heights are no longer decorative. They are **solved** so that the object resolves into a recognisable shape when viewed from one specific angle, while remaining a working QR code when viewed from directly above. The illusion is the product; the QR code is the constraint it survives.

Everything in v1 §4A (matrix generation) and the material/scannability constraints carries forward unchanged. The height rule, the camera model, the UI, and the export scope are all replaced.

---

## 0A. [WHAT_CHANGED_FROM_V2_0]

Version 2.0.0 is built, reviewed and green: the anamorphic solver, the single orthographic camera with Explore / Reveal / Scan, the in-app scannability verifier that gates export, PNG and `.glb` export, and a Playwright suite that proves it. What it is not is *fun*. The interface is a competent control panel floating over a canvas, and the sculpture is a still object. It reads as a tool.

Version 2.1.0 changes the **feel**, not the **rules**. The product becomes a small voxel world you play with: it has seasons, wind, falling leaves and fireflies; you can poke the tree and it shakes; the controls are a game HUD rather than a settings card. The identity is *Minecraft*, *Crossy Road*, *Monument Valley* — chunky, tactile, playful.

The one idea that makes this safe is the **still-frame rule**: the world is alive only in Explore. The instant the user asks a hard question of it — "show me the picture" (Reveal) or "does it scan?" (Scan) — every ambient motion is gated to an *exact* zero and proven idle before a single pixel is graded or exported. Scan is never decorated.

**What did not change (and must not be touched)**

- §4 — the anamorphic solver, the projection basis, the contact-ground rule, the material rules, and scannability verification. Byte-identical to v2.0.0 (as amended by the v2.0 review).
- §6 — the UI and accessibility floor. It binds every new HUD element.
- §8 — hard constraints, known limits and non-goals.
- The export gate (§4G): export is blocked, not warned, unless a verified pass exists for the current inputs.

**What is new or rewritten**

| Section | v2.1.0 change |
|---|---|
| §1 Product overview | Design pillars; the voxel-world framing; the anti-"AI slop" visual mandate. |
| §2 Core features | FEAT_08–FEAT_13: HUD, seasons, shader materials, particles, interactive world, motion gate. Build status of FEAT_01–07 recorded. |
| §3 Technical architecture | Shader injection, particle tooling, typography, per-frame-state rule, and the impact on the existing code. |
| §5 Interactive main view | HUD anatomy, interaction model, hotkeys, and the visual language rules. |
| §7 Data schema | `environment`, `hud`, motion gate fields; the `verifyKey` rule. |
| §9, §10 | Builder latitude re-drawn; v2.1 decisions and the author's calls awaiting confirmation. |
| **§11 [ENVIRONMENT_AND_SHADER_PIPELINE]** | **New.** The engine rules, state matrix, seasons, shaders, particles, interaction, budgets and acceptance tests. |

---

## 1. [PRODUCT_OVERVIEW]

**Description:** A web application that turns a link into an anamorphic sculpture inside a small, playable voxel world. From directly above the sculpture is a scannable QR code. From one chosen viewpoint, the scattered blocks line up into a recognisable object — the reference shape is a **Minecraft-style tree**: a straight blocky trunk under a cubic leaf canopy. From every other angle it is deliberately abstract.

The world is alive. In Explore the canopy sways in the wind, the seasons turn from green summer to orange autumn to white winter to pale spring, leaves and snow and fireflies drift past, and poking the tree makes it shake. The instant the user asks a serious question of the object — "show me the picture", "does it scan?" — the world holds still and answers honestly.

**Target output:** A full-viewport interactive WebGL canvas that is the absolute focal point, with a game-style HUD floating over it. The user types a link, picks a shape and colours, turns the season dial, orbits and pokes the tree, finds the reveal angle (or snaps to it), checks the scan view, and exports the scannable code as an image, the reveal as an image, or the object as a `.glb`.

**Why it is worth using:** Other generators decorate a flat code. This one makes a real object whose top-down projection *is* the code, and whose side view is a picture. Both halves are the product; neither is a caveat. v2.1 adds the reason to *stay*: it is a toy as well as a tool, and a toy that never lies about whether the code scans.

**Design pillars** (use these to settle any argument the rest of this document does not)

1. **The world is the interface.** The canvas is the focal point. Controls are diegetic: they look like part of the game, not a settings panel pasted on top of it.
2. **Alive in Explore, honest in Reveal and Scan.** Ambient motion exists only where nothing is being graded. Reveal and Scan are still frames (§11.2).
3. **Scannability is law.** Season, wind, particles and shake can never reach the Scan frame. A pretty object that does not decode is a defect (§8).
4. **Playful but legible.** The game aesthetic is a costume over the accessibility floor in §6, never a way around it.
5. **No setup.** Open the page and the default world already looks good, moves, and scans. Every control is an option, never a prerequisite.

**Visual identity — "Indie Voxel Game"**

The reference points are *Minecraft's* GUI, *Crossy Road* and *Monument Valley*: chunky borders, pixel or blocky type, crisp hard shadows, physical-feeling controls, flat colour, a strict pixel grid.

The interface must **not** look like a SaaS tool. The following are banned outright and are the first things a reviewer should look for:

- Rounded white cards with soft blurred drop shadows.
- Glass and backdrop-blur panels, gradient text, gradient buttons.
- Stock icon-in-a-circle chrome, emoji or Unicode glyphs standing in for icons.
- Unmodified default Tailwind palettes, default form-control appearance, and default focus glow.
- Generic "settings sidebar" layout.

The visual language is specified in §5.5. This is a committed visual world, so the hard-offset shadow and chunky-border patterns that would normally be a costume are *required* here.

---

## 2. [CORE_FEATURES]

Status key: **Built** = implemented, reviewed and passing in the v2.0.0 codebase; **New** = specified here, not built.

**Carried forward (v2.0.0)**

- **FEAT_01 | Data Input Engine.** *(Built)* Text/URL field, 300ms debounce, live character count, capacity validation that never blanks the canvas.
- **FEAT_02 | Anamorphic Solver.** *(Built)* Solves a height per dark module so the chosen shape resolves at the reveal angle. See §4. **Untouched by v2.1.**
- **FEAT_03 | Interactive Main View.** *(Built; extended)* The canvas is the interface, not a preview pane. Free orbit, snap-to-reveal, snap-to-scan, with continuous feedback on how close the camera is to the reveal angle. v2.1 adds hotkeys and the world-state behaviour in §5 and §11.
- **FEAT_04 | Shape Library.** *(Built)* A shipped set of bold silhouettes. Minecraft Tree is the reference implementation and the default.
- **FEAT_05 | Colour System.** *(Built; extended)* Per-region colours (trunk vs canopy), plus base-plane and background colour. **Any hex is accepted — the picker is not clamped.** A live contrast readout says when a palette has stopped being scannable, and export is withheld until it is fixed. **v2.1:** the colours the user edits are the **Summer** palette; the other seasons are derived from them (§11.5), so the pickers stay meaningful under every season.
- **FEAT_06 | Export.** *(Built)* PNG from the scan view, PNG from the reveal view, and `.glb`. All three are blocked unless a verified pass exists for the current inputs. **v2.1:** the reveal PNG shows the active season; the scan PNG never does; the `.glb` bakes the active season's palette with no motion (§11.9).
- **FEAT_07 | Scannability Verification.** *(Built)* The in-product check that the current object actually decodes. **v2.1:** it only ever reads a frame that is settled *and* motion-idle (§11.3).

**New in v2.1**

- **FEAT_08 | Voxel HUD.** The control panel is replaced by a game-style heads-up display: a hotbar for the three views, an always-visible scan-status plaque, a season dial, physical toggle switches, palette slots, a segmented reveal-alignment bar, and an export "craft table". It collapses to a minimal dock. See §5.4.
- **FEAT_09 | Environmental States (Seasons).** The reference shape supports **Summer, Autumn, Winter and Spring**. Seasons recolour the foliage, trunk and sky smoothly via shader uniforms, and select the particle set. See §11.5.
- **FEAT_10 | Shader Materials.** The block materials gain wind sway and seasonal colour through injected Three.js shader chunks on `MeshStandardMaterial`, keeping the existing lighting rig and §4F intact. See §11.6.
- **FEAT_11 | Particle Systems.** Contextual particles per season — spring petals, summer fireflies, autumn leaves, winter snow — built on drei `<Instances>` / `<Sparkles>`. See §11.7.
- **FEAT_12 | Interactive World.** Clicking or tapping the tree shakes it and releases a burst of leaves; a chunky dial turns the seasons; an ambient-motion switch calms the world. Every interaction has a keyboard equivalent. See §11.8.
- **FEAT_13 | Motion Gate and Still-Frame Guarantee.** A single master gate drives every ambient motion to an *exact* zero in Reveal and Scan, and the camera rig reports "settled" only once it is proven idle. This is an engine invariant, not a user-facing control, and it has binding acceptance tests. See §11.3 and §11.12.

**Dependency rule:** FEAT_08–FEAT_12 may add visuals and motion. They may not alter the solver (§4), the verification logic (§4G) beyond what §11.3 requires of its *inputs*, or any value that reaches the Scan frame.

---

## 3. [TECHNICAL_ARCHITECTURE]

**Existing stack — build on it, do not replace it:**

- Next.js 16 (App Router), React 19, TypeScript. **This version has breaking changes from the Next.js most agents know. Read the relevant guide in `node_modules/next/dist/docs/` before writing any Next-specific code** (fonts, metadata, client boundaries), as the repository's `AGENTS.md` requires.
- React Three Fiber + three.js + `@react-three/drei` (v10.7.9 — `Instances`, `Sparkles` and `PerformanceMonitor` are all present; no upgrade needed).
- `qrcode` for matrix generation.
- Tailwind CSS v4 — retained as the **utility and token engine** for layout, spacing and colour variables. It is **not** a component library here: no stock Tailwind-look components (§1, §5.5).
- GSAP for camera transitions, and now also for the motion-gate ramp, the season-dial sweep and HUD state tweens. Every tween must be killable and must jump to its end value under `prefers-reduced-motion`.
- Local React state. **No store.** Add Zustand only when the canvas and HUD stop sharing a parent.

**Removed in v2:** `lenis`. The main view is a fixed, non-scrolling canvas.

**New in v2.1 — all achievable with no new runtime dependency:**

- **Shader materials:** `THREE.MeshStandardMaterial` extended through `onBeforeCompile` chunk injection (§11.6). Not a fully custom `ShaderMaterial` — that would forfeit the PBR lighting, tone mapping and instancing support the existing three-point rig and the verified scan pair rely on.
- **Particles:** drei `<Instances>` for leaves, petals and snow; drei `<Sparkles>` is permitted for fireflies (§11.7).
- **Pixel typography:** a pixel or blocky display face loaded through `next/font` (Google or local). The choice is the builder's, subject to the legibility rules in §5.5. Geist stays for data, inputs and errors. This adds a font file, not an npm package.
- **Pixel icons:** authored inline SVG on a 16px grid. No icon library.

**The per-frame-state rule (binding).** Values that change every frame — `uTime`, the motion gate, the season phase, the shake impulse, particle positions — live in **refs and shader uniforms, never in React state.** Putting a per-frame value in `useState` re-renders the page 60 times a second, and the HUD with it. React state holds only discrete decisions: the season, the view state, the HUD collapse flag, the ambient-motion switch.

**No per-frame work proportional to block count.** A QR version 40 sculpture has about 15,000 blocks. The v2.0 review caught the Explore zoom looping over every block on every tween frame; the new systems must not repeat that class of mistake. Sway is computed on the GPU in the vertex shader. CPU work per frame is bounded by the particle budget (§11.10), not the block count.

**Verification tooling:** Playwright is available and has already been used to prove scannability by pixel sampling. Treat browser verification as part of done. v2.1 adds the acceptance tests in §11.12.

**UI components:** [react-bits](https://github.com/DavidHDev/react-bits) remains an approved source for individual components, **copy-paste only, never as a dependency**. A component that pulls in a new runtime dependency is not worth it for a single effect. Anything copied must be ported to the voxel visual language (§5.5) — react-bits' default styling is exactly the polished-SaaS look this version removes.

**Theme presets survive, as starting points.** The five presets (Minecraft, Cityscape, Cyberpunk Voxels, Topographic Map, Flat) seed the colour pickers, which then override them. Presets carry no season data: seasons are derived from the active colours (§11.5).

**Impact on the existing v2.0.0 code** *(non-binding guidance for the planner; names and splits are the builder's)*

| Existing module | What v2.1 needs from it |
|---|---|
| `src/components/scene/Blocks.tsx` | Per-region materials gain injected sway and seasonal colour; the SCAN flatten path must stay exact. |
| `src/components/scene/CameraRig.tsx` | Owns the tween that ramps the motion gate; `onSettled` must additionally require motion-idle (§11.3); proximity feeds the calm factor (§11.4). |
| `src/components/scene/QrScene.tsx` | Hosts the particle layer; passes motion and season uniforms down. |
| `src/components/controls/ControlPanel.tsx` | Replaced by the HUD (§5.4). The behaviours it already has — gating, reasons in text, focus handling — carry over. |
| `src/components/ScanStatus.tsx` | Becomes the always-visible status plaque. |
| `src/app/page.tsx` | Adds environment state; `verifyKey` must **not** gain season (§7). |
| `src/app/globals.css`, `layout.tsx` | HUD skin tokens, the pixel font, the real `focus-visible` ring kept. |
| `e2e/*.spec.ts` | Extended per §11.12; the existing scannability, mid-tween and export tests must keep passing. |

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
4. **Contact-ground rule.** Take the contiguous run of filled samples starting at the lowest sample, but only if that sample sits at `b ≤ 0.1` (the shape genuinely touches the floor). The run ends at a gap **or at a region change**. Cells assigned within that run become **real columns from the plane**. Every other cell becomes a **floating block**.

   The region-change terminator matters because regions may overlap: the Minecraft Tree's trunk spans `b ∈ [0, 0.42)` while its lowest canopy disc reaches down to about `0.37`. A gap-only run would march straight out of the trunk into the canopy and ground it, collapsing the very gap that makes the tree legible. A single-region shape is unaffected — no region change can occur.
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

Verify the rendered scan view on entry to Scan, once the camera has settled, debounced on change; export requires a verified pass for the current inputs (no offscreen target, no continuous check):

1. Sample the rendered pixels at every module centre.
2. Compare the dark/light classification against the source matrix.
3. Compute the luminance separation between the dark and light populations.
4. Surface the result as a persistent indicator — **text plus icon, never colour alone.**

This method is already proven: it was run against the v1 build and matched 841/841 modules with 15.37:1 worst-case contrast, and it correctly showed that a high-variance dark-on-neon theme still separates cleanly. Prefer it over a QR decoder library; it needs no dependency and localises *which* modules fail.

**Cadence: verify on change, debounced** — on input, shape, elevation, or colour change. Not per frame. A per-frame `readRenderTargetPixels` is a GPU-to-CPU sync stall on a product whose pitch is a live-feeling canvas, and most of the time the user is not even looking at the scan view. On-change gives the same persistent indicator for almost nothing.

**Export blocks when separation is lost.** The button is disabled and states the reason and the fix. §8 says scannability outranks every aesthetic decision; this is that rule enforced rather than described. This is not a conflict with "error states never destroy the user's object" — the object stays on screen and fully editable, only the export is withheld.

---

## 5. [INTERACTIVE_MAIN_VIEW] (FEAT_03, FEAT_08, FEAT_12)

### 5.1 Layout

The canvas is full-bleed and is the absolute focal point. The HUD floats over it; nothing sits in a toolbar band above it. When expanded, the HUD occupies no more than about 30% of the viewport on desktop and no more than 44% of the height on a phone, in the lower half within thumb reach — the object takes the larger share of the screen, never the smaller one. Collapsed, the HUD is a dock of no more than 96px.

### 5.2 Camera states

| State | Camera | Orbit controls | World behaviour (full matrix in §11.2) | Purpose |
|---|---|---|---|---|
| **Explore** | Orthographic, free orbit | enabled | Alive: wind, particles, season colours, poke-to-shake | Inspect, play, find the angle |
| **Reveal** | Orthographic at (45°, elevation φ) | locked | **Still frame.** Season colours shown; zero motion; no particles | See the illusion |
| **Scan** | Orthographic top-down | locked | **Still frame.** Every block flattened to `colorScan`; no season; no motion; no particles | See and export the code |

**All three states share one orthographic camera.** A perspective Explore camera cannot be tweened into an orthographic Reveal by animating a pose — it would pop at exactly the moment the tween exists to protect. One camera makes the tween trivial, and an orthographic orbit is also the right look for a Minecraft reference.

- Transitions between states are **tweened with GSAP**, not cut. The world's motion is gated to zero *during* the tween, so it has reached exact rest before the camera arrives (§11.3).
- While orbiting in Explore, show continuous feedback on proximity to the reveal angle, and let the user snap when close. Finding the angle is the product's best moment; do not hide it behind a button alone. In v2.1 the world also **calms** as the user closes in on the angle, so the illusion resolves by itself (§11.4).
- The reveal **elevation** is user-adjustable; azimuth is pinned at 45° (§4B). Changing elevation re-runs the solve.
- Every camera state must be reachable by keyboard, and the current state must be announced to assistive technology.
- **Hotkeys:** `1` Explore, `2` Reveal, `3` Scan. They are ignored while focus is in a text field, select or colour input, and while any modifier key is held. Each press is announced through the polite live region. (This also answers the v2.0 audit's power-user finding: the mode toggle was four Tab presses away.)

### 5.3 Interaction model

| Gesture | Where it works | What happens | Keyboard / assistive equivalent |
|---|---|---|---|
| Orbit (drag) | Explore | Free orbit around the sculpture | Existing state buttons and hotkeys |
| **Poke** (click or tap a block, pointer travel < 3px) | Explore only | The tree shakes; a burst of 8–16 season-appropriate particles leaves the canopy (§11.8) | **Shake** button in the HUD |
| **Season dial** (click, drag, or arrow keys) | Any state | Turns Summer → Autumn → Winter → Spring; foliage, trunk and sky lerp smoothly | A `radiogroup`: arrow keys, `Home`/`End` |
| **Breeze switch** | Any state | Ambient motion and particles on/off; season colours still apply | A real switch (§5.5) |
| Snap to reveal | Explore, when close | Tweens to the reveal pose | Existing button; focus moves to the Reveal slot afterwards |

The canvas keeps `role="img"` with a label composed from live state (including the season). **No information is carried only by shaking or motion**, and every canvas gesture has a keyboard path.

### 5.4 HUD anatomy

The HUD is built from physical-feeling game controls, not form widgets in a card.

| Element | Spec |
|---|---|
| **Hotbar** | Three slots — Explore, Reveal, Scan — with the hotkeys shown on them. The selected slot is *raised, notched and labelled*, never distinguished by colour alone. Each slot is a button with `aria-pressed`, a fixed label that never contradicts its state, and a hit target of at least 48px. |
| **Status plaque** | The scan verdict. **Always visible — it never collapses, scrolls away or hides behind a drawer.** Shows text plus a drawn icon: "Scans — 841/841 modules, 13.5:1", "Won't scan — contrast 1.5:1, needs 3:1", or "Checking…". `role="status"`, polite. The product's hard promise is on screen at all times. |
| **Link slab** | The link/text field with its live character count. Uses the legible data face, not the pixel face. Debounce, empty state and over-capacity banner behave exactly as in v2.0. |
| **Season dial** | A chunky four-stop dial, semantically a radiogroup. Shows the current season name in text. Sweeps along the shortest arc when changed, passing through intermediate seasons; jumps under reduced motion. |
| **Breeze switch** | A physical switch: `role="switch"`, `aria-checked`, a 4px pressed travel, explicit ON/OFF text and a drawn icon. |
| **Shake button** | Enabled only in Explore. When disabled it says why in text ("Shake works in Explore"). |
| **Alignment bar** | The proximity-to-reveal meter, drawn as a segmented pip bar (for example ten pips) with a text label and an accessible numeric value. Carries the existing "On the reveal angle" behaviour. |
| **Palette slots** | Square swatch slots for trunk, canopy, base and background. Each opens an exact **hex text field** — the pasted-brand-hex path from FEAT_05 is non-negotiable. Edits change the Summer palette (§11.5). |
| **Settings drawer** | Shape picker, theme preset picker, elevation ("tilt") control, bounded 15–60°. |
| **Craft table (export)** | Three export buttons: Scan PNG, Reveal PNG, `.glb`. When blocked they show a locked drawn icon **and the reason and fix in text**, exactly as v2.0 does. |
| **Collapse** | The HUD collapses to a dock that keeps the hotbar, the status plaque and the season dial. Collapse state is plain component state, not stored: it is not a saved configuration (§8). |

**Defaults (pillar 5, no setup):** Explore view at the reveal pose, Summer, ambient motion on (off under reduced motion), HUD expanded on desktop and collapsed to the dock on a phone.

### 5.5 Visual language — "Indie Voxel Game" (binding)

§6 still applies to every element below; where a style choice and §6 conflict, §6 wins.

- **Surfaces.** Flat fills with a **2–4px hard border** in two tones (a lighter top-left and a darker bottom-right to read as a bevel) or a solid dark outline. Corners are square or pixel-notched — never `rounded-md` / `rounded-lg`. Layout snaps to a **4px pixel grid**.
- **Shadows.** Crisp **hard offset shadows** (for example `4px 4px 0` solid), never blurred. Pressed controls lose their shadow and move by its offset, so buttons feel physical.
- **Motion.** UI micro-motion uses **stepped easing** (`steps()`) and lasts no more than 120ms. Under `prefers-reduced-motion` it is instant.
- **Typography.** A pixel or blocky face for titles, labels and button text, at **no less than 14px**. **Never** for paragraphs, errors, status detail, hex codes, counts or the text input — those use the legible data face. A pixel font at small sizes fails §6's contrast floor in practice even when the colours pass on paper, so legibility beats authenticity.
- **Icons.** Drawn on a 16px grid as inline SVG, one consistent weight, `aria-hidden`. No emoji, no Unicode glyphs, no icon library.
- **Palette.** The HUD uses its own fixed "stone / wood / parchment" token set, independent of the sculpture's theme so that a Cyberpunk or Flat theme can never make the controls unreadable. It ships **two skins that follow `prefers-color-scheme`**; §6's contrast floor is verified in both.
- **Focus.** The existing real `focus-visible` ring with offset stays. It may be made chunkier; it may not be removed or replaced by a colour change.
- **Restraint.** The object leads. The HUD frames the world; it does not compete with it. Decoration that does not carry information or feel is cut.

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
    "proximityToReveal": "number 0..1",
    "motion": {                       // per-frame values: refs and uniforms, NOT React state (§3)
      "stateGain": "number 0..1 — exactly 0 in REVEAL and SCAN once the ramp ends; exactly 1 in EXPLORE once it ends",
      "calm": "number 0..1 — proximity-based damping of ambient motion, EXPLORE only (§11.4)",
      "envIdle": "boolean — true only when stateGain === 0 AND the particle layer is unmounted AND no shake is running (§11.3)"
    }
  },
  "theme": {
    "presetId": "string",            // seeds the colours below; overridden freely after
    "regionColors": { "trunk": "hex", "canopy": "hex", "body": "hex" },   // the SUMMER palette (§11.5)
    "colorScan": "hex",              // the single flattened dark used in SCAN and export
    "colorLight": "hex",
    "background": "hex",
    "roughness": "number",
    "metalness": "number"
  },
  "environment": {                    // discrete decisions = React state; the animated values below = uniforms
    "season": "enum('SUMMER','AUTUMN','WINTER','SPRING')",
    "ambientMotion": "boolean",      // wind + particles. Default true; forced false under prefers-reduced-motion
    "seasonPhase": "number 0..4 — continuous, uniform only; animates while the dial sweeps (§11.5)",
    "shakeImpulse": "number 0..1 — transient, uniform only (§11.8)"
  },
  "hud": {
    "collapsed": "boolean",
    "drawer": "enum('NONE','COLOURS','SETTINGS','EXPORT')"
  },
  "verification": {
    "modulesMatched": "integer",
    "modulesTotal": "integer",
    "worstCaseContrast": "number"
  }
}
```

**The `verifyKey` rule (binding).** A scan verdict is stored together with a key built from every input that can change the Scan frame: today the text, the shape, the elevation and the full effective theme. In v2.1:

- The key **must not** include `environment.*`, `hud.*`, `viewport.motion.*` or any other value that cannot change the Scan frame. Including the season would needlessly invalidate a still-valid verdict every time the dial turns.
- Anything that **can** change the Scan frame must be in the key. If a later feature adds such an input, adding it to the key is part of that feature, and the Scan-frame-identical-across-seasons test (§11.12, E1) is the tripwire that catches a mistake in either direction.

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

- **The visual direction is no longer open** — it is "Indie Voxel Game" (§1, §5.5). What remains the builder's is execution inside it: the pixel font, the exact HUD geometry and density, the stone/wood/parchment token values, the dial's drawing, and the iconography.
- The seasonal colour **mechanism** in §11.5 is binding; the **numbers** in its table are starting values to be tuned by eye against screenshots.
- Particle shapes, counts and motion curves, within the budgets in §11.10.
- Whether particle motion runs on the GPU or the CPU, within the per-frame budget — driven by measured cost, not guessed. (GPU is the default for anything above 300 particles.)
- How the motion gate and settle signal are factored across the camera rig, the scene and the page (§11.3), provided the invariants and tests hold.
- The exact contents of the shape library beyond the Minecraft Tree reference, and how seasons map onto a shape whose regions are not trunk and canopy (§11.5).
- Where the solve runs (render pass, memo, or worker) — driven by measured cost.
- Whether the proximity feedback keeps its pip-bar form or becomes something better, as long as it keeps a text label and an accessible value.

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


### 10.1 v2.1.0 additions

**Directed by the product owner (the v2.1 brief).** These are settled; do not relitigate them.

| # | Decision | Who |
|---|---|---|
| 10 | The UI becomes an "Indie Voxel Game" aesthetic with a diegetic, collapsible HUD; no enterprise-SaaS component styling (§1, §5) | Product owner |
| 11 | The reference shape supports four seasons with smooth uniform-based colour transitions (§11.5) | Product owner |
| 12 | Wind sway and seasonal colour come from injected Three.js shader chunks rather than plain `MeshStandardMaterial` (§11.6) | Product owner |
| 13 | Contextual particles per season, built on drei `Instances` / `Sparkles` (§11.7) | Product owner |
| 14 | The world is interactive: clicking the tree shakes it, and a chunky dial cycles the seasons (§11.8) | Product owner |
| 15 | Scan Mode Cull: particles are removed before the Scan frame is graded (§11.2) | Product owner |
| 16 | Vertex Shader Freeze: sway is exactly zero in Scan and Reveal (§11.2, §11.3) | Product owner |
| 17 | Flattened Scan Colours: Scan flattens every block to `colorScan` whatever the season (§11.2, §11.5) | Product owner |

**Proposed by the author of this document — awaiting the owner's confirmation.** Each is a recommendation with a reason; the alternative is stated so it can be chosen instead.

| # | Proposal | Why | Alternative |
|---|---|---|---|
| 18 | Particles and ambient motion run **only in Explore**; Reveal is a still frame too (the brief culled particles only in Scan) | Reveal is where the illusion must resolve unobstructed, and the Reveal PNG is an export: motion would make it non-deterministic and a drifting leaf would cut across the silhouette. "The world holds still when asked a question" also reads as one clear rule. | Allow particles in Reveal and cull them only at PNG capture; costs an extra capture-time state and settle step. |
| 19 | One master motion gate with **exact-zero** end values, tweened (never exponentially damped), and a `settled` signal that requires it (§11.3) | Exponential damping never reaches zero, so a frame could be graded with a residual offset. One scalar makes the freeze provable by a single test. | Per-system gates; more code, more places to leak. |
| 20 | Sway is a **rigid per-instance translation**, not per-vertex bending (§11.6) | Keeps the blocks crisp cubes — the voxel look — and keeps the amplitude auditable. | True vertex bending: more organic, blocks shear. |
| 21 | Seasons are **derived** from the user's Summer colours by a defined mix, not stored as per-theme palettes (§11.5) | The primary audience arrives with a brand hex; per-theme palettes would make the colour pickers meaningless in every season but Summer. | Per-theme season palettes for presets only; custom colours would then have no seasons. |
| 22 | The **base plane, quiet zone and the whole Scan frame (background included) are season-immune** (§11.5) | Makes "the Scan frame is identical across seasons" a testable byte-equality, and keeps exported scan PNGs consistent. | Allow a tinted background in Scan; the equality test weakens to the plane region only. |
| 23 | **Season is not in `verifyKey`** (§7) | It cannot change the Scan frame. | Include it; every dial turn would discard a valid verdict. |
| 24 | **Proximity calm:** ambient motion fades out as the camera nears the reveal angle (§11.4) | The app opens at the reveal angle. Without this, wind would knock the blocks out of alignment on the very first frame, at the exact moment the illusion is meant to land. | Open in a still Reveal instead; loses the "world comes alive as you orbit" moment. |
| 25 | Pixel typography only for titles, labels and buttons ≥ 14px (§5.5) | Pixel faces at small sizes fail the §6 contrast floor in practice. | None recommended. |
| 26 | The scan-status plaque is **never hidden**, including when the HUD is collapsed (§5.4) | The product's hard promise must stay visible. | None recommended. |
| 27 | Hotkeys `1` / `2` / `3` for the three views (§5.2) | Closes the v2.0 audit's power-user finding at almost no cost. | Different keys, or none. |
| 28 | No audio, no progression, achievements, accounts or persistence (§11.13) | "Gamified" is an aesthetic here, not a game loop; audio adds autoplay-policy and accessibility surface for no requirement. | Add optional SFX later as its own feature. |

---



## 11. [ENVIRONMENT_AND_SHADER_PIPELINE] (FEAT_09, FEAT_10, FEAT_11, FEAT_12, FEAT_13) (Agent Core Focus)

### 11.0 Purpose and precedence

This section governs every visual and motion system that is not the solver: seasons, wind, shader materials, particles, interaction, and the gate that keeps all of it away from the Scan frame.

**Precedence.** §4 and §8 outrank this section. If any rule here conflicts with §4F (lighting and materials) or §4G (verification and export), §4 wins. Nothing in this section may change a block's `(x, z)` cell, a block's solved height, the base plane, the quiet zone, the camera's Reveal or Scan pose, or the Scan fit (§4E).

The v2.1 brief set three hard constraints. They are the spine of this section and are restated here as engine rules **R1–R3**:

- **R1 — Scan Mode Cull.** Particle systems are removed before the Scan frame is graded. A floating particle would break the QR matrix contrast.
- **R2 — Vertex Shader Freeze.** Wind sway lerps to **exactly 0** on entering Scan or Reveal, so the anamorphic blocks align perfectly and the QR grid stays mathematically rigid.
- **R3 — Flattened Scan Colours.** Whatever the season — including a white winter canopy — Scan flattens **every** block to the single `colorScan` dark, instantly, to hold the contrast ratio against the light modules.

### 11.1 Vocabulary

| Term | Meaning |
|---|---|
| **Season** | `SUMMER`, `AUTUMN`, `WINTER` or `SPRING`; a discrete user choice. |
| **seasonPhase** | A continuous value 0–4 that animates between seasons while the dial sweeps. Uniform only. |
| **Ambient motion** | Wind sway and particles. Excludes the shake impulse. |
| **stateGain** | The master gate. 1 in Explore, 0 in Reveal and Scan, tweened between. |
| **calm** | A proximity-based factor that damps ambient motion in Explore near the reveal angle (§11.4). |
| **Shake impulse** | A short damped oscillation triggered by a poke. Gated by `stateGain`, not by `calm`. |
| **envIdle** | True only when the world is proven at rest: `stateGain === 0`, the particle layer unmounted, no shake running. |
| **Still frame** | A frame rendered in Reveal or Scan after the camera has settled and `envIdle` is true. |

### 11.2 The Still-Frame Rule and the state matrix (binding)

**The world is alive only in Explore.** Reveal and Scan are still frames. This is the single rule from which everything below follows.

| Layer | Explore | Reveal | Scan |
|---|---|---|---|
| Wind sway | on, scaled by `stateGain × calm` | **exactly 0** | **exactly 0** |
| Shake impulse | allowed (poke, Shake button) | disabled; a running shake is killed | disabled; a running shake is killed |
| Particles | mounted, scaled by `stateGain × calm` | **unmounted** | **unmounted** |
| Season colours (foliage, trunk) | applied | applied | **not applied — every block is `colorScan`** |
| Season sky tint | applied | applied | **not applied — the theme background** |
| Fog and post-processing | permitted | off | **off** |
| Block materials | shader-injected standard material | same, uniforms at rest | same, `uFlatten = 1` |
| Base plane and quiet zone | `colorLight`, unshaded | same | same |
| HUD | full | full | full; the status plaque reports |
| What may be exported | — | Reveal PNG, once settled and idle | Scan PNG and `.glb`, once verified, settled and idle |

Notes on the matrix:

- **Fog and post-processing** (bloom, vignette, tone-mapping changes, depth of field) change pixel luminance. The Scan verifier measures real rendered pixels (§4G), so anything that alters luminance in Scan can only ever make a good code read as "won't scan" — or worse, make a bad one look fine. They are therefore forbidden in Scan and Reveal.
- **The Scan frame is season-immune in its entirety, background included.** This is what makes the test in §11.12 (E1) a byte-for-byte comparison rather than a region comparison.
- **R3 is a discrete switch, not a lerp.** `uFlatten` is exactly 0 or exactly 1. It takes effect at the start of the transition to Scan (the existing behaviour: the flatten flag follows the target state immediately), while the camera is still tweening. Winter white never reaches a graded frame.
- **Flatten outranks season in the shader:** the final block colour is `mix(seasonColour, colorScan, uFlatten)` with `uFlatten ∈ {0, 1}`.

### 11.3 The master motion gate and the settle signal (binding)

**One scalar controls all ambient motion: `stateGain`.** Every motion system multiplies its amplitude by it:

```
swayOffset  = swayAmplitude  × stateGain × calm × waveform(t, position)
shakeOffset = shakeAmplitude × stateGain × impulse(t)
particles   = scale × stateGain × calm        // by scale, so no alpha is needed
```

Because the products contain `stateGain`, `stateGain === 0` forces every offset to exactly `0.0` provided `waveform` and `impulse` are finite. There must be **no additive constant, no time-only term and no noise-based base offset** anywhere in the vertex path that survives `stateGain = 0`.

**Ramp rules**

- `stateGain` is tweened with GSAP by the camera rig's state tween. **The end values are assigned exactly (0 or 1). Exponential damping or "lerp toward target each frame" is forbidden** — it approaches zero without ever reaching it, and a frame graded at 0.0004 is a frame with a residual offset.
- Ramping **to 0** takes at most 400ms and always completes before the 1.2s camera tween does. Ramping **to 1** (entering Explore) begins only once the camera tween into Explore has completed, so no motion plays against a half-rotated frame.
- Under `prefers-reduced-motion`, `stateGain` jumps to its end value and ambient motion is forced off (§11.11).
- A new state change **kills** any running ramp and retargets. A shake in flight is killed on any change to Reveal or Scan.

**Idle and settle**

- `envIdle` is defined in §11.1. When the state is Reveal or Scan, `envIdle` requires `stateGain === 0` *exactly*, the particle layer unmounted (not merely transparent), and no shake running.
- The camera rig's existing `onSettled(state)` callback must fire for Reveal and Scan **only when the camera tween has completed and `envIdle` is true.** It continues to fire for Explore when the camera tween completes.
- The page's existing rules do not change and now depend on this: the scannability sampler runs only after the camera has settled in Scan; the Scan PNG and `.glb` require a verified pass for the current inputs; the Reveal PNG requires a verified pass **and** a settled, idle Reveal. As in v2.0, no capture or verification may rely on a frame count or a fixed sleep; it waits for the settle signal.
- Any state change invalidates "settled" immediately, in the same render (the stale-settle fix from v2.0). `envIdle` is invalidated by the same change.

### 11.4 Proximity calm (recommended — the owner's confirmation is requested, §10.1 #24)

The app opens in Explore at the reveal pose. If wind sways the blocks at that moment, the illusion — the product's best moment — is broken on the first frame.

So in Explore, ambient motion is damped by `calm = 1 − smoothstep(0.90, 1.00, proximityToReveal)`. As the user orbits toward the reveal angle the world quietens and the tree snaps into focus by itself; at the angle itself ambient motion is zero. Orbiting away, the world wakes.

- `calm` scales **ambient** motion (sway and particles) only.
- The **shake impulse is not scaled by `calm`.** Poking the tree at the reveal angle must visibly do something; it is gated by `stateGain` alone, and the alignment is allowed to break for the 900ms the user asked for.
- `calm` is an aesthetic, not a guarantee: only the exact-zero `stateGain` in Reveal and Scan is graded.
- If the owner declines this proposal, the replacement must still give the first frame an aligned tree — for example opening in a still Reveal.

### 11.5 Seasons (FEAT_09)

**What a season changes (Explore and Reveal only)**

- Foliage (`canopy` region) colour — the main change.
- Trunk (`trunk` region) tint — subtle: autumn warmth, winter frost.
- Sky tint — the background colour, mixed slightly toward a season hue.
- The particle set (§11.7).

**What a season never changes:** the `body` region, the base plane, the quiet zone, `colorLight`, `colorScan`, any block position, and — in Scan — anything at all (R3).

**The colour model (the mechanism is binding; the numbers are starting values).** The colours the user edits — and the preset colours — are the **Summer** palette. Every other season is derived:

```
seasonColour(region, season) = mix(summer[region], target[region][season], weight[region][season])
```

| Season | Canopy target | Canopy weight | Trunk target | Trunk weight | Sky target | Sky weight |
|---|---|---|---|---|---|---|
| Summer | — | 0 | — | 0 | — | 0 |
| Autumn | `#d9822b` | 0.80 | `#6b4423` | 0.25 | `#f0d9b5` | 0.25 |
| Winter | `#f2f6fa` | 0.90 | `#9aa8b5` | 0.25 | `#dfe8f0` | 0.30 |
| Spring | `#b5e06a` | 0.45 | — | 0 | `#e6f2e0` | 0.20 |

For the Minecraft preset this yields roughly: Summer green, Autumn orange-gold, Winter near-white, Spring fresh yellow-green. Spring's blossom colour comes from the **petal particles**, not from the canopy, because mixing a pink into green produces mud. Mix in a perceptually sensible space (linear sRGB at minimum). The builder tunes the numbers against screenshots.

Because the derivation starts from whatever the user chose, a brand-colour canopy still has a coherent Autumn, Winter and Spring. A canopy picked as near-white will look much the same in Winter; that is acceptable.

**Transitions.** The dial sets the target season; `seasonPhase` (0–4, wrapping Summer → Autumn → Winter → Spring → Summer) animates to it along the **shortest arc**, so Summer to Winter passes visibly through Autumn. Colours are evaluated from `seasonPhase` by uniform interpolation between the two adjacent seasons; there is no React re-render per frame. The sweep lasts at most 1.2s, is killable and retargetable, and is instant under reduced motion. Season changes work in any view state; in Scan they have no visible effect.

**Shapes without a canopy.** A shape whose regions are not trunk and canopy applies the foliage palette to its `canopy` region if it has one, and otherwise shows no seasonal colour change (the dial remains and the particles still run). This is deliberately forgiving; the shape library is small.

### 11.6 Shader materials (FEAT_10)

**Approach.** Keep `MeshStandardMaterial` and inject chunks through `onBeforeCompile`. This retains PBR lighting, tone mapping and instancing, so §4F — the three-point rig, the unshaded base plane, no cast shadows — is untouched. A fully custom `ShaderMaterial` is allowed only if it reproduces all of that and is verified by the same tests; it is not recommended.

**Structure.** The renderer already creates one instanced mesh per region. Keep that: each region's mesh has its own material instance with its own uniforms. That is three block materials, plus the single flattened Scan mesh if the existing collapse approach is kept.

**Wind sway (vertex stage, canopy region)**

- A **rigid per-instance translation** of each block in world XZ — never per-vertex bending. Blocks stay crisp cubes and never shear.
- Direction and phase come from the instance's world position, so gusts travel across the canopy rather than moving it in unison. The per-instance phase is derived from the instance matrix translation; no extra attribute is required.
- Amplitude is weighted by block height (higher blocks move more) and **capped at 0.35 of a module**. No rotation.
- The only route to a non-zero offset is the product in §11.3. The mesh's bounding sphere must be padded by the cap so frustum culling cannot clip a swaying block.

**Seasonal colour (fragment stage)**

- Colour is evaluated from uniforms (§11.5); `uSeasonPhase`, the base palette and the season targets are the only inputs.
- The final colour is `mix(seasonColour, colorScan, uFlatten)` with `uFlatten ∈ {0, 1}`. The existing implementation collapses all blocks into a single flattened mesh in Scan; that is a valid way to satisfy R3 and may be kept. The invariant is the same either way: **in Scan the rendered colour of every block is exactly `colorScan` under the existing lighting rig**, and the existing verifier reports the same pair it does today.

**Scan-frame determinism**

- Block materials are **opaque**: no alpha, no `transparent`, no dithering, no emissive or bloom contribution in Scan or Reveal.
- Uniforms are updated once per frame from refs inside `useFrame`.

**Failure handling.** A shader that fails to compile does not throw; three logs an error and draws nothing, which would make the blocks vanish. The verifier fails safe in that case (the dark modules read as light, so the code reads as "won't scan"), but that is a backstop, not a plan. An end-to-end test must fail on any `WebGLProgram` compile error in the console (§11.12, E9).

### 11.7 Particle systems (FEAT_11)

| Season | Particles | Notes |
|---|---|---|
| Spring | Petals — pink and white cubes drifting down and sideways | Supplies the blossom colour the canopy deliberately lacks. |
| Summer | Fireflies — small warm-yellow cubes on slow looping paths, pulsing at no more than 1Hz | Cubes with a darker edge read against a pale sky. The pulse must also respect the flashing limit in §11.11. |
| Autumn | Leaves — orange, red and gold flat cubes, tumbling as they fall | The poke burst (§11.8) uses this set. |
| Winter | Snow — white cubes, a slow fall with a slight drift | Must be distinguishable from the white canopy; the builder checks by screenshot. |

All particles are voxel cubes or quads. That keeps them in the aesthetic (Minecraft's particles are squares) and lets them be fully opaque.

**Technique**

- One `<Instances>` mesh per active particle set (drei, already installed), or `<Sparkles>` for fireflies if it reads acceptably. One draw call each.
- Spawn from a box around the canopy extents, derived from the solved blocks' bounds. Particles loop and respawn; **nothing is allocated per frame.**
- Fade and appear **by scale**, multiplied by `stateGain × calm`. This keeps the particle pass opaque and avoids a transparency sort. (Where `<Sparkles>` is used, its `opacity` may fade it while it is mounted.)
- **At `stateGain === 0` the particle layer is unmounted** — not left at zero opacity or zero scale. Unmounting is what makes R1 true by construction and what `envIdle` tests.
- Particles are never raycast targets (`raycast` disabled), cast no shadows, and are drawn after the blocks.
- When the season changes, the outgoing set scales down and the incoming set scales up over no more than 400ms. When the Breeze switch is off, or under reduced motion, no particles are mounted at all.
- On WebGL context loss the layer is torn down; on restore it is rebuilt, and `envIdle` is recomputed.

### 11.8 Interaction (FEAT_12)

**Poke.** In Explore only, a pointer click or tap on a block — with pointer travel under 3px, so an orbit drag is never a poke — triggers a shake impulse:

- Amplitude is capped at 0.5 of a module and decays over about 900ms as a damped oscillation. It moves the canopy blocks, and the trunk slightly.
- A burst of 8–16 particles of the current season leaves the canopy near the poked block, then recycles into the layer.
- In Reveal and Scan the gesture is not handled and the cursor does not change.
- If the user switches to Reveal or Scan mid-shake, the impulse is killed and `stateGain` ramps to exactly zero as usual. The settle signal waits for it.

**Season dial.** A radiogroup of four stops: arrow keys move, `Home` and `End` jump, and the current season is announced politely ("Season: Autumn"). Pointer click and drag are enhancements.

**Breeze switch.** Turns ambient motion (wind and particles) on or off. Season colours are unaffected. Default on; forced off under reduced motion.

**Keyboard parity.** Poke has the HUD **Shake** button; the dial and switch are real controls. Nothing the canvas does is the only way to do it.

### 11.9 Exports and verification (interplay with §4G)

- **`verifyKey`:** unchanged — the text, shape, elevation and full effective theme. Season, ambient motion, particles and HUD state are excluded because they cannot change the Scan frame (§7).
- **Scan PNG and the verifier** read the canvas only when the camera has settled in Scan **and** `envIdle` is true. Both are season-free by R3.
- **Reveal PNG** requires a verified pass for the current inputs, and a settled, idle Reveal. It shows the active season's foliage, trunk and sky, and contains no particles (unmounted) and no sway (zero).
- **`.glb`** is static. It bakes the **active season's resolved palette** for each region, with no sway offset and no particles. Materials stay standard PBR. It requires the same verified pass as today.
- **Blocked states and their reasons in text** behave exactly as in v2.0; the new HUD restyles them but does not change them.

### 11.10 Performance and quality budgets

| Budget | Target |
|---|---|
| Frame rate | 60fps on a mid-range desktop GPU in Explore at QR version 40 (about 15,000 blocks) with the full particle budget; at least 30fps on a mid-range phone. |
| Particles | At most **300** on desktop and **120** on a phone (coarse pointer or width under 640px). One draw call per set. |
| Draw calls | Block meshes stay at most 4 (three regions plus the flattened Scan mesh), plus the base plane, plus one particle layer. |
| CPU per frame for all v2.1 systems | At most 1.5ms. No allocation inside `useFrame`. |
| Work proportional to block count | **None per frame.** Sway is vertex-shader work. |
| Per-frame React state | **None.** Refs and uniforms only (§3). |

A quality governor is optional: drei's `PerformanceMonitor` (already installed) may halve the particle count after sustained frames over 25ms. If used, it must not run in a state where particles are unmounted.

### 11.11 Accessibility and reduced motion

§6 binds everything in this section. In addition:

- **`prefers-reduced-motion: reduce`:** ambient motion is forced off (no sway, no particles); season changes are instant, with no dial sweep; the Shake button is disabled with the reason in text; HUD micro-motion is instant. Season **colours** still work. The Breeze switch cannot turn motion on.
- **Photosensitivity:** nothing flashes more than 3 times a second. Fireflies pulse at no more than 1Hz; snow and leaves do not strobe.
- **Announcements:** state changes and season changes go through the existing polite live region. Hotkey presses announce the resulting state.
- **Contrast and size:** HUD text meets §6 in both colour schemes; the pixel face is never below 14px and never carries paragraphs, errors or data (§5.5); hit targets are at least 44px (hotbar slots 48px).
- **Status:** the scan status is never conveyed by colour alone, and never hidden (§5.4).

### 11.12 Acceptance tests (binding)

Where the sway or season math has a pure TypeScript counterpart, unit-test it. The browser tests below are authoritative, because the shader is what ships. All run against the real running app (§3), in addition to the existing suites, which must keep passing unmodified except where a label legitimately changes with the HUD.

| # | Test | Proves |
|---|---|---|
| **E1** | **The Scan frame is byte-identical across all four seasons**, and across ambient motion on and off and particles on and off. | R1, R2, R3 and season immunity, in one assertion. |
| **E2** | In Reveal and in Scan, after settling, **two canvas captures 500ms apart are byte-identical** — including when a shake was fired immediately before switching. | The Still-Frame Rule; the exact-zero freeze. |
| **E3** | In Scan, for each season: the status reads "Scans" with matched equal to total and contrast of at least 10:1, **and** the frame contains only two luminance populations — no pixel inside the plane is outside the dark and light populations beyond an anti-aliasing tolerance. | No stray particle, shading or tint reaches the graded frame; catches what module-centre sampling alone could miss. |
| **E4** | Rapidly alternate Explore and Scan inside 1.2s with a shake and particles active: the status is never a false "Won't scan", and no capture happens before idle. | The settle gate (extends the existing mid-tween test). |
| **E5** | Reduced motion: no particles mounted; a season change is instant; two Explore captures 500ms apart are identical. | §11.11. |
| **E6** | A poke in Explore changes the frame; a poke in Reveal or Scan changes nothing. | §11.8. |
| **E7** | Keyboard: hotkeys `1`/`2`/`3`, the season dial by arrows, the Shake button, the Breeze switch semantics, and the status plaque visible with the HUD collapsed. | §5, FEAT_08. |
| **E8** | The existing contrast, overflow and focus-ring suites pass for the HUD in light and dark; no pixel-face text under 14px. | §6, §5.5. |
| **E9** | The console is clean: no `WebGLProgram` or shader compile error across a full season cycle and all three views. | §11.6 failure handling. |
| **E10** | The Reveal PNG exported with particles on is identical to the one exported with particles off. | §11.9. |
| **E11** | The `.glb` region material colours equal the active season's resolved palette. | §11.9. |
| **E12** | Exports remain blocked, with the reason in text, for a weak palette under every season. | §4G is unaffected. |

### 11.13 Non-goals and open questions

**Non-goals for v2.1**

- Audio of any kind, music or sound effects.
- Progression, achievements, XP, accounts, leaderboards, or any persistence of play — "gamified" is an aesthetic here, not a game loop. §8's "no saved configurations" stands.
- Per-theme season palettes, user-authored seasons, or a day/night cycle.
- Weather affecting the Scan or Reveal frames.
- Physics-based particles, or particles that collide with blocks.
- Snow accumulating on block tops (it would alter geometry and the Scan frame).

**Open questions for the owner**

1. **Particles in Reveal** — the stricter reading (§10.1 #18) is proposed; confirm.
2. **Summer fireflies on a pale sky** may read poorly. Cubes with a darker edge are the first remedy; a dusk-tinted Summer sky is the second, and would change the default look. Decide with a screenshot at build time.
3. **Winter snow against a white winter canopy** needs a visibility check for the same reason.
4. **Pixel face choice** — candidates are Pixelify Sans and Silkscreen through `next/font`; whichever is chosen must pass E8 at small sizes.
5. **Proximity calm** (§11.4) — confirm, or choose the still-Reveal opening.

**Alternatives considered and rejected**

- *Per-vertex bending for the sway* — more organic, but blocks shear and the voxel look is lost.
- *Fading particles by alpha only* — needs a transparent pass, leaves the layer mounted at zero opacity, and makes the "particles are gone" claim untestable.
- *Exponential damping of sway toward zero* — never reaches zero.
- *A fully custom `ShaderMaterial`* — forfeits the verified lighting rig and instancing support.
- *Putting the season in `verifyKey`* — would discard valid verdicts on every dial turn.

