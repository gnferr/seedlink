# Sky Island: a voxel tree on a floating island that folds into its own QR code

Date: 2026-10-25. Status: draft for approval. Replaces the Living Meadow direction (`2026-10-18-living-meadow-design.md`) and the anamorphic mechanism of `system_document.md` v2.1.0 §4. Branch at time of writing: `feat/living-meadow`.

## Intent and why

The owner saw an Instagram reel (louis_rlee, "ICQR": "turns any link into a voxel tree. The ground it grows on is the actual QR code: tap the tree and it folds back into a scannable QR") and wants the app to feel like that, pushed further. Today's app hides the QR inside an anamorphic tree that only lines up from one camera angle; the pad is mostly empty and the tree is a thin, tall shape forced by the solver. The owner wants instead:

- a real, full voxel tree that looks good from every angle;
- the QR code always visible as the ground the tree stands on;
- tapping the tree folds it into a flat, scannable code, and tapping again grows it back;
- the whole thing floating as a small island in a pixel-art night sky, alive with small effects;
- a simpler control bar that looks like it belongs to that world.

The first visit is about play: people look around, poke the tree and switch seasons before they care about the code. Success is someone enjoying the toy for a minute, then leaving with a PNG that scans.

A throwaway spike of the whole interaction exists and the owner approved its feel after playing with it: `.superpowers/brainstorm/2012-1792909909/content/spike-island.html` (plain three.js, single file, gitignored). Mockups of the island, sky and controls are next to it (`island-v7.html`, `sky-v10.html`, `ui-bar-v2.html`). Treat the spike as the reference for behaviour and look, not as code to copy; it fakes the scan check and skips the app's safety rules.

## Goals

1. **Tree state (landing).** A large voxel tree (thick trunk, branches, broad crown of overlapping leaf clumps, hanging vines, the odd lighter "fruit" block) stands on the QR slab in the middle of a small floating island. The QR modules show as thin flat tiles on the slab; the three finder squares are grass-coloured in this state.
2. **Fold.** Tapping the tree folds it: tree blocks fall in waves from the top of the crown down, each dark QR module receives exactly one block, the remaining blocks shrink into the slab. The camera eases to straight top-down, the island stops bobbing, the code is checked, and Save becomes available. About 1.5–2 s.
3. **Grow.** Tapping anywhere while folded reverses the fold. Typing a new link regrows the world: the new code appears folded, then the tree grows up out of it.
4. **Each link grows its own island.** The island outline, underside depth, taper, lean and an optional lobe are generated deterministically from the link. Same link, same island. The island is compact: a rounded square hugging the slab with a couple of blocks of grass to spare.
5. **A living, blocky world.** Pixel-stepped effects (fireflies, petals, falling leaves or snow by season, a voxel waterfall off the rim, glowing mushrooms in the rock); smooth, eased island bob; leaf sway; a poke reaction when the grass is tapped.
6. **A pixel-art sky that blends.** A smooth dithered night sky per season (details below) that frames the island without competing with it.
7. **Pixel-stepped glass controls.** One compact pill (link, season button, Save) plus a season panel that lifts above it, styled to match the world.

## Non-goals

- No ambient sound. Sound is off by default; when on it plays only a short chime on fold/grow and a chirp on poke.
- No anamorphic solver, no elevation control, no Explore/Reveal/Scan modes, no 1/2/3 hotkeys.
- No theme presets (Minecraft, Cityscape, Cyberpunk, Topographic, Flat). Seasons plus a leaf colour replace them.
- No old flat meadow, old clouds or old sky components.
- No birds, bats, crystals or sky whale in the first build (they were in mockups; nice later, not now).
- No new runtime dependency for QR generation or rendering beyond what is installed.
- No 3D model export. The `.glb` export is dropped (owner's decision); Save downloads the PNG only. `PRODUCT.md` is updated to match.

## Anti-goals (a failure even if it technically works)

- A folded code that does not scan with a phone camera, on screen or from the saved PNG.
- Save enabled for a code that has not passed the check for the current link, season and colours.
- A sky or effect that makes the island hard to read (the owner rejected an early sky for clashing colours).
- Controls that look like a generic web app pasted over a game (the owner rejected plain glassmorphism for this).
- A tree that is small relative to the island (the owner asked twice for a bigger tree and a smaller island).

## Constraints (binding)

- **Scan guarantee, restated for the fold.** In the folded state the top-down render of the slab is the code. It must keep a light quiet zone of at least 4 modules around the matrix (`QUIET_ZONE` in `src/lib/qr.ts`); the slab is therefore the matrix plus 4 modules of light stone on every side, and grass starts outside that. Folded module blocks and any finder tiles are the ink colour, never grass green.
- **Verification stays the existing method** (`src/lib/verify.ts`, `src/lib/sampleScan.ts`): sample every module centre of the rendered folded frame, compare to the matrix, require separation and contrast above `MIN_SCAN_CONTRAST`; show the verdict as text plus icon. Check once the fold has finished and the camera has settled, debounced on change; never per frame. A result for different inputs is never shown. A lost WebGL context drops the result until it re-checks (keep the current handling in `page.tsx`).
- **Save is gated** on a passed check for the current link, season and leaf colour, in the settled folded state. Disabled Save states its reason in text.
- **Still while graded.** While folded and settled, nothing moves in the graded region: no bob, no sway, particles hidden, waterfall and other effects outside the slab or paused. Season changes while folded re-check.
- **Too small to scan** keeps working (`tooSmallToScan` in `src/lib/scanFit.ts`), using the folded framing.
- **Reduced motion:** fold and grow are instant, no bob, no sway, no particles, season changes snap.
- **Client-side only**, static deploy, no data leaves the browser.
- **Stack stays:** Next.js 16 (read `node_modules/next/dist/docs/` first, per `AGENTS.md`), React 19, React Three Fiber, drei, GSAP, Tailwind v4, three. Fonts may come from `next/font/google`.
- **Accessibility floor:** the link field is labelled `Link or text`; fold/grow is reachable by keyboard (the hint chip doubles as a real button: "Fold into code" / "Grow the tree"); season choice is a radiogroup named `Season` with `Spring`/`Summer`/`Autumn`/`Winter`; leaf colours are named buttons; visible focus (firefly gold); a polite live region announces fold/grow and the scan verdict; text contrast 4.5:1 on the glass.
- **Performance:** instanced meshes for island, tree, tiles and particles; no per-frame allocation in the render loop; the scene must stay smooth on a mid-range phone. The previous meadow work found covered faces cost real fill rate; cull hidden voxel faces or interior voxels.

## Decisions made with the owner

- Mechanism: **real tree that folds into the code** (reel style), not anamorphic.
- World: **floating diorama** in a night sky, experimented further: organic island with textured grass top, dirt then stone strata tapering to a ragged point, hanging roots, a waterfall, glowing mushrooms; island shape **grown from the link**; island **compact**, tree **big** (crown overhangs the island).
- Effects: **Minecraft-like blocky** (pixel-stepped particles and motion), but the **island float is smooth** (eased bob with a very slight tilt).
- Sky: **smooth dithered blend**. Fine pixels, a long muted hue-shifted ramp per season, 8×8 ordered (Bayer) dithering across every step, a soft lighter glow behind the island, a gentle dark vignette, clouds/aurora/far islands only one or two ramp steps from the sky. Reference: `sky-v10.html`. Seasons: Spring lilac dusk with crescent moon and petals, Summer violet night with full moon and faint aurora, Autumn peach sunset with a banded pixel sun sinking into the cloud sea, Winter grey-blue night with aurora and snow. A cloud sea along the bottom.
- Controls: **pixel-stepped dithered glass** (reference: the second take in `ui-bar-v2.html`, as used in the spike). Staircase corners via clip-path, a light pixel rim, night-ink fill with a faint ordered-dither texture and backdrop blur, Pixelify Sans, 9×9 pixel icons. Moon-cream marks the selected item, leaf green is only Save, firefly gold is focus.
- Layout: a **compact pill** (link field, season button showing the current season icon, Save). The season button opens a **panel above** with the four seasons, eight leaf colour swatches and the sound toggle. A small glass **hint chip** above the pill tells the next action. On phones the pill spans the width and the season labels collapse to icons.
- **Tap mapping:** tap the tree = fold; tap while folded = grow; tap the grass/island = poke (crown shakes, a few particles). Drag orbits, scroll/pinch zooms within limits relative to the fitted view.
- **Sound:** no ambience; chime and chirp only, off by default.
- **Exports:** PNG only; the `.glb` model export is dropped.
- Overall look approved by the owner after playing the spike.

## Design

### World generation (pure, testable, in `src/lib/`)

- **Slab:** matrix size `n`; slab half-width `(n−1)/2 + QUIET_ZONE`, light stone, top at y = 0. QR tiles: one thin box per dark module (≈0.2 high, just inside the unit footprint).
- **Island:** seeded by a hash of the link. Rim = a rounded-square (superellipse) just larger than the slab, plus small seeded harmonics and an optional lobe; never inside the slab. Underside layers shrink with depth toward a leaning point; materials by depth: grass top (three shades), dirt, mixed, stone with a little darkening noise and rare moss. Keep only voxels with a visible face. Grass tufts and flowers scattered on the grass ring. A waterfall column drops from a visible point of the rim.
- **Tree:** scale grows with `n` so the crown overhangs the island; trunk 3×3 when large enough, short root flare, a few thick branches, crown from overlapping flattened clumps with ragged edges, vines from the crown's underside. Keep only crown voxels with an exposed face. Per-voxel shade variation, a lighter sunlit top, rare lighter "fruit" blocks, winter thins and whitens the crown.
- **Fold mapping:** a deterministic assignment of dark modules to tree voxels (spread across the tree, not clustered); unassigned tree voxels shrink to nothing near the slab; if the tree has fewer voxels than dark modules, the extra modules rise from the slab late in the fold. Every dark module ends up covered by exactly one ink block in the folded state.
- **Seasons:** grass/dirt/leaf palettes and the sky ramp per season (values as in the spike and `sky-v10.html` are the starting point); leaf colour override from the swatches.

### Rendering and motion

- R3F scene with an orthographic camera and orbit controls in the tree state; polar angle limited so the underside and sky stay framed; zoom limits relative to the fitted view; the fit accounts for the controls at the bottom (like today's insets).
- The sky is a pixel canvas texture (nearest filtering) behind the scene, covering the viewport.
- Pixel look: render the 3D scene at a reduced resolution and upscale with pixelated filtering (the spike uses half resolution). The scan check and the saved PNG must not suffer from this; see "left to the builder".
- Fold timeline: per-voxel delay from crown top down, an arc and a little spin in flight, colour lerps to ink for carriers, eased; the camera eases from wherever the user left it to top-down, framed to the free area above the controls; on grow it returns to the pose the user had.
- Island bob, leaf sway and particles run only in the tree state and stop exactly when folded; the hint chip text follows the state ("Tap the tree to fold it into your code", "Folding…", "Scans · tap anywhere to grow the tree", "Growing…", and the failure reason if the check fails).

### Screen

- Full-bleed world; the pill and hint chip at the bottom; the season panel opens above the pill and closes on outside tap or Escape.
- Save downloads `sky-island-qr.png`, a top-down image of the folded slab with its quiet zone (the island and sky may frame it).
- Errors: empty input keeps the last world and shows "Type or paste a link to grow your island"; text too long for one QR keeps the last world and says to shorten it; no WebGL keeps the controls usable and says the 3D view is unavailable (keep `SceneBoundary`).

### What goes, what stays

- **Goes:** `solver.ts`, `shapes.ts`, `sprite.ts`, `blockGeometry.ts` (unless reused), `CameraRig` modes, `Meadow`, `Clouds`, old `Sky`, `Hotbar`, `SeasonDial`, `Tray`, `AlignmentBar`, `StatusPlaque`, `hotkeys`, `themes` presets, the elevation control, the reveal PNG, the `.glb` export (`exportGlb` in `exporters.ts`, its wiring in `page.tsx`, and the GLB tests), and their tests.
- **Stays and is reused:** `qr.ts`, `verify.ts`, `sampleScan.ts` and `scanFit.ts` (adapted to the folded framing), `exporters.ts` PNG path, `useReducedMotion`, the season names, the sway shader idea in `blockMaterial.ts` if it fits, `SceneBoundary`, the WebGL context-loss handling.
- `system_document.md` is updated (or superseded by a v3 section) so §4 describes the fold instead of the anamorphic solver; the scan guarantee and verification sections carry over.

## Tests

- Unit (node:test, like the existing suite): same link → same island and fold mapping; island rim never cuts into the slab plus quiet zone at any seed tried; every dark module gets exactly one carrier or an extra; finder detection; the sky ramp is monotonic in brightness.
- E2E (Playwright): tap/keyboard fold reaches "Scans" with N/N modules; Save disabled before fold and enabled after a pass; Save disabled with a reason when the check fails; season change while folded re-checks and stays N/N; new link regrows and the old verdict is not shown; reduced motion folds instantly; layout fits at 1440 px and 390 px; text contrast check on the glass.
- Existing e2e specs that assert the removed UI are rewritten for the new screen, not deleted silently. (At the time of writing 22 of them already fail on the branch because they target a removed UI.)

## Calls made by the designer (not the owner; check while reading)

- **Long links.** Encoding stays at level H, so a long input can reach a very large matrix. The tree grows with `n` only up to `n = 37`; past that its scale stays fixed and the island and slab keep growing with the code, so the tree looks smaller on very long links. Budget: about 8 000 tree voxels and 6 000 island voxels at most, visible-face voxels only. The fold mapping already handles a tree with fewer voxels than dark modules (extra modules rise from the slab). The existing "too long for one QR" message stays; no new length limit.
- **Where the work starts.** Build on a new branch cut from the tip of `feat/living-meadow`, which carries the current scan pipeline. The uncommitted `isFinder` helper and its test in `src/lib/qr.ts` / `qr.test.ts` are kept and committed as the first step (the finder detection this design needs). The uncommitted pad-tile edit to `src/components/scene/Blocks.tsx` is dropped, since `Blocks.tsx` goes. The owner's own uncommitted `e2e/environment.spec.ts` edits and `e2e/helpers.ts` are left untouched for the owner to decide.

## Left to the builder

- Exact sizes, colours and timings, starting from the spike and mockups.
- How to keep the scan check and the PNG crisp despite the reduced-resolution pixel look (for example render the folded, settled frame at full resolution, or sample an offscreen full-resolution render), as long as the check grades exactly what Save exports.
- Component and module boundaries, and whether the waterfall and mushrooms ship in the first slice or a second.
- Sky animation (slow drift of clouds and far islands) if it stays cheap.
