# Living Meadow: a real Minecraft oak, a voxel meadow, a season-aware sky, a simpler screen

Date: 2026-10-18. Status: draft for approval. Builds on `system_document.md` v2.1.0 (merged on `main`).

## Intent and why

The owner opened the shipped v2.1.0 app and was not happy with how it looks:

- the tree "doesn't look like a Minecraft tree", it looks like an ugly blob and "not a tree";
- the ground is a flat plain plane, they want "grassy land or dirt";
- the background does not feel connected to the season;
- the interface has too many controls; they want it simple.

What they want is a world that feels alive: a small Minecraft-style meadow with a proper chunky oak in the middle of it, a sky and ground that change with the season dial, and a screen where the world is the star and only a few controls are visible. The goal is the feeling of opening a tiny living game world that also happens to be a working QR code.

## Goals

1. **A recognisable Minecraft oak.** Side-on silhouette is a stepped, blocky canopy (flat top, cut corners, layered like the game's oak) on a wide straight trunk. Anyone should say "that is a Minecraft tree" at first sight.
2. **A voxel meadow instead of the plain plane.** Grass on top, dirt layers visible at the edge, built from blocks, with small decoration (flowers, tufts, a bush). The QR code sits on a light pad set into the grass.
3. **A sky and ground that follow the season.** Sky gradient, clouds and ground colours/decoration per season (Summer, Autumn, Winter, Spring) as the dial turns.
4. **Alive in Explore, still in Reveal and Scan.** Everything that moves (tree sway, grass sway, drifting clouds, particles, shake on poke) obeys the existing motion gate; Reveal and Scan stay perfectly still.
5. **A simpler screen.** World first. Always-visible controls: link field, Save, a tray button, the Explore/Reveal/Scan hotbar, the season dial, and the scan status note. Everything else lives in one tray.

## Non-goals

- No new shapes beyond the oak; the shape selector goes away because it would have one entry.
- No react-bits (or any new dependency). It was evaluated from its docs: mostly web-page polish (macOS-style dock, cursor trails, glass), which clashes with the chunky game look, and its useful ideas (snow, sparks, particles) already exist in the 3D scene. DOM overlays on top of the canvas would also break the "Reveal and Scan stay still" rule. Revisit only if the owner asks for a specific effect.
- No terrain editor, no day/night cycle, no weather beyond the existing season particles, no sound.
- No change to the QR encoding, the anamorphic solver rules (`system_document.md` §4), or the export formats.

## Anti-goals (this would be a failure even if it technically works)

- Anything that makes the QR fail to scan from above, or lets a season/terrain change alter the Scan frame. The Scan frame must stay byte-identical across seasons.
- A pretty meadow that makes Reveal or Scan frames move, or lets decoration appear in a graded frame.
- A "simplified" screen that hides something the user needs to get a working file (link field, Save, scan verdict).
- Adding visual noise: the meadow must frame the tree, not compete with it.

## Constraints (binding)

- `system_document.md` §0, §4, §8 stay intact; §11 still-frame rules stay binding: particles unmounted before Scan/Reveal is graded, sway/shake exactly zero in Scan and Reveal, Scan flattens every block to `colorScan` regardless of season, `verifyKey` still excludes season and motion, exports stay gated on a verified scan of the current inputs.
- Scan must read the same as today: `Scans — N/N modules` with contrast above the existing `MIN_SCAN_CONTRAST` for the default input in every season.
- The Scan view shows only the QR (light pad, dark blocks, flat background). The meadow, decoration and sky gradient are hidden or flattened in Scan.
- Stack stays: Next.js 16, React 19, React Three Fiber, GSAP, Tailwind v4. No new runtime dependencies.
- Reduced motion keeps working: nothing moves, season changes snap.
- The shipped accessibility surface is kept: hotbar names `Explore`/`Reveal`/`Scan`, radiogroup `Season` with `Summer`/`Autumn`/`Winter`/`Spring`, `Link or text` field, the status role, keyboard hotkeys 1/2/3, visible focus, contrast in both colour schemes.
- The existing test suite is the safety net; tests that assert removed UI (shape picker, permanently visible export buttons, Breeze/Shake buttons) are updated to the new screen, never loosened for behaviour that is kept.

## Decisions made with the owner

- Direction: **Meadow**. Flat grassy land with flowers and a bush, dirt layers showing at the edge, running out to the screen edge, "like standing in the game".
- Screen layout: **Option A, one bottom bar**. Link field and Save across the top with a ⚙ tray button; hotbar and season dial side by side at the bottom; status note top right.
- **Save is one button**. It saves the PNG that matches the current view (Scan PNG in Scan, Reveal PNG in Reveal). It is disabled with a reason in text in Explore or when the code has not been verified. The 3D model file (`.glb`) and the other exports live in the tray.
- No react-bits (see non-goals).
- The mix of style is the owner's "you can combine the style": the builder may borrow looks from the other mockup options as long as the layout above is respected.

## Design (what the builder should produce)

### 1. The oak (replaces the shape mask)

- A new mask for `MINECRAFT_TREE` built from a coarse pixel grid so the silhouette is made of whole steps, not curves. Reference proportions from the mockup, about 13 cells wide: canopy rows of widths 5, 7, 9, 9, 9, 7 (flat top, stepped shoulders), a trunk 2 cells wide and about 5 tall with a one-cell root flare. A small notch or two of "leaf gaps" is fine for realism but must not cut the canopy into pieces that cannot hold QR modules.
- The silhouette must remain a valid input for the existing solver (`mask(a, b)` returning `trunk | canopy | body | null` over the unit square) so the solver rules stay untouched.
- The trunk must be wide enough that QR modules inside it are still readable (current trunk is 12% of the width; the oak trunk should be at least that, ideally wider because 2 of 13 cells is about 15%).
- Acceptance: the default link still reads `Scans — 841/841` (or the current default count) in every season, and a 1000-character link still scans.
- Canopy gets a lighter top edge and darker underside (block shading), and the trunk gets bark tone variation, so it reads as blocks rather than flat colour.

### 2. The meadow

- A voxel ground slab around the QR pad: top layer grass, below it two or three dirt layers, visible from the side where the slab ends. It should be large enough that, in the Reveal view, the ground fills the lower part of the frame to the screen edges; when orbiting in Explore the edge and dirt layers are visible, which gives the "chunk of the world" look.
- The QR plane (today a flat `colorLight` plane) becomes a **stone-tile pad** set into the grass. In Scan the pad is exactly today's flat light plane and nothing else is visible.
- Decoration: flowers (a few colours), grass tufts, one or two bushes, placed deterministically (seeded), clear of the QR pad and of the tree trunk footprint, and never on the pad. Decoration counts are small; they are instanced.
- Everything in the meadow follows the season: Summer green with flowers; Autumn orange-brown grass with fallen leaves; Winter snow cover (white-blue top, snow caps on bushes, no flowers); Spring light green with pink blossoms.
- The meadow is hidden (or flattened to the background) in Scan. In Reveal it is visible and perfectly still.

### 3. Sky and clouds follow the season

- A vertical sky gradient per season (the mockup gives starting palettes: Summer bright blue, Autumn amber, Winter pale grey-blue, Spring soft blue-pink) plus blocky clouds that drift slowly in Explore and freeze in Reveal.
- The sky is visible in Explore and Reveal. In Scan the background is the flat Base colour as today.
- The sky must work in both light and dark colour schemes of the interface without breaking contrast of overlays.
- Sky cross-fades as the dial turns (reuses the season sweep); with reduced motion it snaps.

### 4. Alive in Explore

- Tree sway and the poke shake stay as built. New: grass and flower sway with the same wind gate; clouds drift; fireflies (Summer), falling leaves (Autumn), snow (Winter), petals (Spring) as today. Everything shares the existing master motion gate, so Reveal and Scan stay still by construction.
- The poke on the tree also works on the meadow decoration only if it is cheap; otherwise the tree only.

### 5. The simplified screen

- Top: link field (`Link or text`), **Save**, ⚙ tray button. Bottom: hotbar (1 Explore, 2 Reveal, 3 Scan) beside the season dial. Top right: a single compact scan-status note (`Scans — …`, `Won't scan — …`, `Checking…`, idle text, and the over-capacity banner).
- ⚙ opens one tray (a panel; on phones a sheet) containing: colours (Trunk, Canopy, Base, Background), Theme, Reveal elevation, Breeze, Shake (kept as a tray control; the tree can still be clicked), and the other exports (Reveal PNG, `.glb`) with their reasons in text. The shape selector is removed.
- On phones the closed state is: world, link field with ⚙, season dial row, hotbar-and-Save row, status note. Nothing may overlap the middle of the world, and the page never scrolls.
- The pixel-face rule (≥14 px, labels/titles/buttons only), 44 px hit targets (48 px for hotbar slots), real focus rings, and contrast in both skins from v2.1.0 stay.
- Screen simplification is judged by counts: at rest the screen shows at most 4 button-like controls besides the hotbar slots and dial radios (Save, ⚙, plus whatever the status/over-capacity note needs); everything else is in the tray.

### 6. Documents

- Update `system_document.md` to v2.2.0: §1/§5 for the new screen, §2 for the oak, meadow and sky, §11 for the terrain/sky rules in each view. Keep §0, §4 and §8 byte-for-byte intact. Update `PRODUCT.md` only if a principle or commitment changes (it should not).

## Left to the builder

Exact grid, colours and shading values; how the meadow is rendered (instanced cubes versus a tiled generated texture on a few boxes, whichever stays within the frame budget); how the sky gradient is drawn so that Scan stays flat; the tray's open/close behaviour and animation within the motion rules; the seeded decoration layout; how Save waits or reports when not verified (it may not export unverified frames); the breakdown into tasks; how the existing tests change.

## Calls made while writing this (marked as the author's, not the owner's)

These came out of the builder check. Each is a sensible default the owner can overturn.

1. **How Scan stays season-free.** The existing browser tests compare the canvas bytes of the Scan frame across seasons. The meadow, decoration, clouds and sky dome are **unmounted** in Scan (not merely hidden), exactly like the particle layers today, so no draw call, light or fog can bleed into the graded frame. The Scan frame test must still pass byte-for-byte.
2. **Scan capacity is not a fixed number.** "841/841" is just today's default link. The requirement is that every module of the default link, and of a 1000-character link, scans in every season. The QR grid size depends on the text, not on the tree, so the oak mask cannot change the version; it only changes how many blocks carry the code. The builder should prototype the mask against the solver first. If the oak as drawn cannot carry the code, widen the trunk or canopy rather than weakening the scan check.
3. **Save.** Save is always visible. In Explore it is disabled; when it is disabled for any reason the reason is shown as text in the status note slot (top right), not as a second control, and it does not count toward the control budget. In Reveal and Scan it is enabled only after the scan verdict for the current inputs is "Scans"; while the verdict is "Checking…" it stays disabled.
4. **Camera and pad stay as they are.** The QR pad's size and position and the three camera presets are unchanged. The meadow is laid out around them and must not occlude the code in either the Reveal or the Scan view.
5. **Performance budget.** Target a steady 60 fps in Explore on a mid-range laptop with a hardware GPU and 30 fps on a mid-range phone. Extra scene cost from this change: no more than about 40 additional draw calls and about 2,000 instances in total (ground, decoration, clouds). Frame time is reported, not a gate (software GL in CI is not representative). The existing particle budget is unchanged.
6. **Sky technique.** The sky is drawn inside the canvas (a scene-level gradient or dome), not as a CSS layer, so it is baked into screenshots and the Reveal PNG, and it is simply not mounted in Scan. The Reveal PNG therefore shows the meadow and the sky, because that is what the user is looking at when they press Save in Reveal. The Scan PNG stays flat: pad, blocks and the Base colour only.
7. **Tests.** Tests that assert removed UI (the shape selector, the always-visible export buttons, the Breeze and Shake controls in the main HUD) are rewritten for the new screen. Accessible names of controls that survive (`Breeze`, `Shake`, `Season` and its radios, hotbar names, `Link or text`, the export button names) stay exactly as they are, now inside the tray. The Scan and Reveal still-frame tests and the keyboard, contrast and pixel-face tests must pass unchanged in intent.

## Open questions for the owner

None. The owner has chosen the direction, the screen layout and the Save behaviour; the calls above are the author's and can be overturned.
