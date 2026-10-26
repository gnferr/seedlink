# Tree Species and Day Cycle: random semi-realistic pixel trees, a realistic sky with a moving sun and moon

Date: 2026-10-26. Status: draft for approval. Builds on `2026-10-25-sky-island-design.md` (shipped on branch `feat/sky-island`, not yet merged).

Two parts change: the tree (this section through "Tests") and the sky with a new time-of-day control (see "Part 2: Sky and day cycle" below). The island, scan check, Save rules, sound and exports stay as they are. The owner said explicitly: "for the island just use current flat, no changes."

## Intent and why

The owner finds the current voxel crown boring and too dense: it reads as one solid green lump with no gaps for the sky to show through. They want a semi-realistic tree, with a visible trunk and branches and leaves in loose clumps that let light through. They pointed at three references:

- a realistic low-poly tree pack on Fab, with airy crowns and visible branches;
- a free low-poly tree pack on Free3D, with leaves as clusters of flat cards on branches;
- a Minecraft tree on Sketchfab, whose blocks use a cut-out leaf texture full of holes.

Of three style directions shown in mockups, the owner chose **"semi-realistic shape, drawn in pixels"**. The tree keeps the world's pixel look, palette and filter, and the breathing gaps come from the tree's shape. They then picked several species from eight mockups and asked that **every time a tree grows it is a new random tree**, so no two QR trees look the same.

Mockups: `.superpowers/brainstorm/2012-1792909909/content/tree-style-v4.html` (the three directions) and `tree-pixel-variants.html` (the species).

## Goals

1. **Semi-realistic silhouette.** A visible trunk with a root flare, limbs that branch into twigs, and leaves in loose clumps at the twig ends. There must be clear gaps through the crown from every orbit angle, and the trunk and limbs must be visible through them.
2. **Pixel rendering.** The tree goes through the same half-resolution pixelated render as the rest of the world and uses palette colours only. Leaves are small flat cards with a cut-out pixel leaf texture, not smooth or photoreal foliage.
3. **Species.** Six species, each with its own silhouette rules:
   - **Broad oak:** a wide round crown on six to eight spreading limbs.
   - **Lush oak:** fuller clumps with a few lighter fruit specks, still with gaps between clumps.
   - **Weeping willow:** limbs arc outward and down, with leaf strands hanging toward the slab.
   - **Flat-top acacia:** a shorter trunk, limbs fanning upward, and a flat, layered canopy.
   - **Tall birch:** a slim, tall trunk with white bark and dark marks, and small clumps spread up its height.
   - **Cherry:** a wide umbrella crown.
4. **Random every grow.** Each time a tree grows (page load, new link, and every grow after a fold), it picks a random species and random variation within that species: limb count, angles, heights, clump sizes, leaf shade jitter. The island stays tied to the link as today.
5. **Seasons recolour any species.**
   - **Spring:** blossom pink with white petal specks. The "cherry blossom" mockup is the spring look, and it applies to every species.
   - **Summer:** green.
   - **Autumn:** orange and red, with a thinner crown. The "autumn oak" mockup is the autumn look.
   - **Winter:** mostly bare, with snow on the tops of branches and of the few remaining clumps.
   - **Leaf colour swatches:** they still override the leaf colour, as today.
6. **The fold still works.** Folding sends pieces of the tree (leaf clumps, then branch segments) flying down. Each dark QR module ends up covered by exactly one ink block, and the folded frame is identical in kind to today's: ink blocks on the light slab, with the 4-module quiet zone. Growing reverses the fold, out of the code, into the new random tree.

## Non-goals

- No change to the island, scan check, Save gate, sound or exports. The sky and the controls change only as described in Part 2.
- No photoreal or smooth-shaded foliage, and no new rendering style for the rest of the world. Options A and B from the mockups were rejected.
- The airy oak is out.
- No species picker in the UI. The owner wants surprise, not choice.
- No per-link determinism for the tree.
- No new runtime dependency.

## Anti-goals (a failure even if it technically works)

- A crown that still reads as one solid mass from the default view.
- Leaves that look smooth, blurry or photographic next to the pixel island.
- A fold that breaks the scan guarantee, or Save enabled for a frame that was not checked. The existing rules bind unchanged.
- A tree that is small relative to the island. The owner has asked for a big tree before.
- A phone that stutters on the tree state.

## Constraints (binding)

- All rules from `2026-10-25-sky-island-design.md` stay binding: the scan guarantee, the 4-module quiet zone, verification by the existing sampler, Save gating on the current link, season, leaf colour and framing, still while graded, reduced motion, the accessibility floor, and client-side only.
- **Randomness and tests.** Generation stays a pure function of `(species, seed, size)`. Randomness comes from a seed drawn at grow time (`Math.random`) and passed in, so unit tests can fix the seed. The fold plan is built from the grown tree and the dark modules, as today.
- **The scan check is unaffected by randomness.** Every species folds into the same ink-on-slab frame. A season or leaf change while folded still re-checks.
- **Performance.** The leaf-card budget is about 6 000 cards plus about 1 500 branch segments at the largest tree size. Use instanced meshes with no per-frame allocation, and keep the existing sway approach. Leaf cards use alpha-test cut-out, not blended transparency, so there is no sorting cost and they stay pixel-crisp.
- **Pixel look.** One small leaf texture (an 8×8 or 16×16 pixel cut-out) tinted per card, nearest filtering, palette colours.
- **Stack** stays Next.js 16, React 19, React Three Fiber, drei and three.

## Decisions made with the owner

- **Direction:** option C, semi-realistic shape drawn in pixels.
- **Species:**
  - Kept: broad oak, lush oak (with fruit), weeping willow, flat-top acacia, tall birch, cherry.
  - Dropped: the airy oak.
  - The cherry blossom and autumn oak looks become the spring and autumn colouring for all species.
- **Random tree every grow**, not tied to the link.
- **One design document and plan**, as with the island work.

## Calls made by the designer (not the owner; check while reading)

- **Fold mapping for non-voxel trees.** Leaf clumps carry the fold, and branch segments fill in when there are fewer clumps than dark modules. Each piece flies to its module and morphs from its own shape into the ink block over the last part of its flight. Leftover pieces shrink into the slab, as today.
- **Winter.** Mostly bare branches with snow on top, instead of white leaves. This is closer to "semi-realistic".
- **Leaf swatch override.** The swatch replaces the base leaf colour in every season except winter. Winter stays snowy, because a bare tree has little leaf to colour.
- **Species weights.** Equal probability for each species. A small "same as last time" guard avoids the same species twice in a row.
- **Tree size.** Scales with the code, with the same growth cap as today (size 37). The crown must still overhang the slab.

## Settled after the builder review (designer's calls)

- **Fold pieces.**
  - A *piece* is one leaf card or one branch segment. `planFold` works over one combined piece list, indexed the same way as the rendered instances.
  - **Carriers:** leaf cards are chosen first, spread across the crown, then segments. Each carrier flies to its dark module.
  - **Ink:** a dedicated ink-block instanced mesh has one instance per dark module. Each instance follows its carrier's pose, and over the last 30 % of the carrier's flight it scales up from zero while the carrier scales down to zero. A flat card never has to become a box.
  - **Leftovers:** non-carrier pieces shrink into the slab, as today.
  - **Shortfall:** if there are fewer pieces than dark modules, the extra modules rise from the slab late in the fold (today's `extraPose`). This is acceptable.
  - The test "every dark module exactly once" runs on the plan.
- **Budget.** Hard caps per tree, at any size: at most 6 000 leaf cards and 1 500 branch segments. Counts scale down with the tree's growth scale for smaller codes. Willow strands count as cards.
- **Winter.** Leaf cards are hidden (scale 0) in the tree state and are not carriers. Segments carry the fold first, then extras rise from the slab.
- **Taps.** Raycast both the card mesh and the segment mesh. A tap anywhere on a card's quad counts as the tree; the alpha holes are ignored. Tree versus ground behaviour is otherwise unchanged.
- **Seed lifetime.** The tree seed and species are drawn on the client inside the scene when a grow begins: first mount, new link, or a grow after a fold. They are kept in a ref.
  - A season change, a leaf-colour change, a resize or a re-render never regrows the tree.
  - The fold plan uses the tree seed.
  - The scene is already client-only, so there is no hydration mismatch.
  - The scene wrapper exposes `data-species` and `data-tree-seed` for tests.
- **Colour.** Leaf colour is per instance. The texture carries only the cut-out shape.
  - Fruit specks (lush oak) and petal specks (spring) are extra small cards with their own colour. They are never carriers.
- **Interface.** The tree result keeps `top`, `trunkHeight` and `crownRadius`, so `Particles` and `FoldCamera` keep working. `crownRadius` is the horizontal extent of the leaves.
- **Birch overhang.** The birch is exempt from the full overhang test, so it can stay slim. Its leaves must still reach at least 0.6 × `(size − 1) / 2`, and it is the tallest species.

## Left to the builder

- Exact silhouette parameters per species, starting from the mockup values in `tree-pixel-variants.html` (`VARIANTS`).
- The leaf texture design, the card size and the number of cards per clump.
- How branch segments are modelled (tapered boxes or low-sided cylinders), as long as they read as pixel wood through the filter.
- Whether the willow strands are leaf cards in a chain or a dedicated strip.

## Tests

- **Unit:**
  - Each species generator is deterministic for a fixed seed.
  - Different seeds give different trees.
  - Every species respects the card and segment budget at size 37.
  - The crown overhangs the slab, with radius ≥ `(size − 1) / 2`, for sizes 21, 25 and 37.
  - The trunk stands on the slab.
  - The fold plan covers every dark module exactly once for every species, at sizes 21, 25 and 37.
  - The random species picker never repeats the previous species.
- **E2E:**
  - Fold and Save still reach `Scans · N/N` in every season.
  - Growing twice from the same link produces different trees. Assert through a `data-species` / `data-tree-seed` attribute on the scene wrapper, not by pixel comparison.
  - Reduced motion still folds instantly.

---

# Part 2: Sky and day cycle

## Intent and why

The current sky is banded pixel art. Next to the new semi-realistic trees, the owner found it too pixelated. They then found smooth painted skies too cartoonish, and fully realistic skies did not blend with the pixel island. The direction they chose ("C is good") is a **realistic sky drawn in fine pixels, with the island and tree lit by it**. They also want to **choose the time of day with a slider**, with an **immersive moving sun and moon** rather than cross-fades between fixed pictures. On page load the time starts at **the visitor's real local time**.

Mockups:
- `.superpowers/brainstorm/2012-1792909909/content/sky-blend.html`: the A/B/C blend comparison. Option C was chosen.
- `day-cycle.html`: the working moving-sun slider. This is the behaviour reference.

## Goals

1. **Realistic sky in fine pixels.** The sky colour is computed per pixel from the sun or moon position:
   - scattering glow around the sun, warmer near the horizon;
   - a cool glow around the moon;
   - noise-based clouds lit on the side facing the light;
   - a star field and a Milky Way band with dust lanes at night;
   - a soft cloud sea along the bottom.

   It is rendered at half resolution on a 2 px grid with a gentle ordered dither and stepped colour, so it shares the island's pixel texture without looking cartoonish.
2. **Moving sun and moon.**
   - The sun rises on the left at dawn, arcs over at midday and sets on the right.
   - The moon then rises from the left, and the stars and Milky Way fade in.
   - Everything in Goal 1 follows continuously from their positions; nothing is cross-faded.
3. **The island and tree are lit by the sky.**
   - The 3D scene's key light follows the sun or moon in direction and colour.
   - The ambient and hemisphere colours follow the sky.
   - Fog or haze toward the cloud sea fades the underside.
   - A soft glow sits behind the island.

   This is done with scene lighting, not a post-process filter over the whole frame.
4. **Time-of-day slider.** It lives in the season panel, under the four season buttons, in the same pixel-stepped glass:
   - a track coloured through the day;
   - a stepped thumb;
   - a sun or moon icon;
   - the current period name (Dawn, Day, Sunset, Dusk, Night).

   Dragging updates the sky and the lighting live.
5. **Starts at local time.** On first load the slider is set from the visitor's local clock.
6. **Season and time are independent.**
   - Season sets the leaves, the grass and the particles (petals, fireflies, falling leaves, snow).
   - Time sets the sky and the light.
   - The previous per-season sky colouring (`renderSky(season)`) is replaced by the time-driven sky. The season may add a slight tint at most.

## Non-goals

- No change to the island geometry or materials, apart from receiving the new light.
- No weather system, no rain, and no real sun position by latitude or longitude.
- No automatic advance of time while the page is open (see "Calls").
- No smooth photographic sky without the pixel grid. Options A and B from the blend mockup were rejected.

## Anti-goals

- A sky that looks cartoonish or chunky-pixel.
- A realistic sky that makes the island look pasted on.
- **Any time-of-day tint reaching the folded QR code.** The folded, graded frame must keep ink on the light pad with full contrast. At night the code must still pass `Scans · N/N`.
- A slider drag that stutters on a mid-range phone.

## Constraints (binding)

- **The scan guarantee is unchanged.** While folded and settled, the pad and ink blocks use unlit colours, as they do today: an unlit material, or lighting fixed for the folded state. The sky behind does not matter to the sampler, which reads module centres only. The check still re-runs when the time changes while folded, the same way it re-runs on a season change, and the time joins `verifyKey`.
- **Performance.**
  - The sky must not recompute expensive noise every frame. Precompute the cloud density, cloud self-shadow and Milky Way fields once per viewport size, and keep the per-frame work to cheap per-pixel maths at half resolution. The mockup's approach, or a shader doing the same, is fine.
  - Recompute only when the time or the viewport changes. Drifting clouds are optional and must stay cheap.
- **Reduced motion.** The slider still works and changes are applied instantly. No automatic animation.
- **Accessibility.**
  - The slider is a real range input labelled `Time of day`.
  - Arrow keys move it.
  - Its value text reads the period name and the time, for example "Sunset, 18:40".
  - The firefly-gold focus ring and 4.5:1 text contrast apply as everywhere else.

## Decisions made with the owner

- Island: unchanged.
- Sky style: option C, a fine-pixel realistic sky with the island lit by it.
- Time of day: a slider, not fixed steps.
- Sun and moon move: there is no blending between fixed pictures.
- The first load starts at the visitor's local time.

## Calls made by the designer (check while reading)

- **Mapping time to the slider.**
  - The slider covers one day from dawn to night, as in the mockup: Dawn about 06:00 at the left, Day, Sunset about 18:30, Dusk, Night about 23:00 at the right.
  - Local times between midnight and dawn map to the Night end.
  - Each period's start and end are fixed by the builder and stay identical across the app.
- **No automatic ticking.** After load the time stays where it is until the user moves the slider, so the code never changes under someone mid-session.
- **Period names:** Dawn, Day, Sunset, Dusk, Night.
- **Season tint on the sky:** at most a light touch, such as slightly greener or paler daylight in spring, warmer in autumn, or snowier haze in winter. The owner did not ask for it, so keep it subtle or leave it out.
- **The folded QR stays untinted at any time of day,** per the anti-goal.

## Tests (Part 2)

- **Unit:**
  - The time-to-sky function is continuous: no jumps between neighbouring slider values.
  - The sun is up from dawn to sunset and the moon from dusk to night.
  - The star alpha is 0 at midday and close to 1 at night.
  - Converting a local clock time to a slider position is deterministic, and times between midnight and dawn map to the Night end.
- **E2E:**
  - The slider is present and labelled `Time of day`, and keyboard arrows change its value text.
  - Folding at the Night end and at the Day end both reach `Scans · N/N`.
  - Changing the time while folded re-checks and passes.
  - The initial slider value follows a mocked clock, set with Playwright's `page.clock`.

## Settled after the builder review of Part 2 (designer's calls)

- **The folded QR stays untinted.** A correction to the constraint above: today the pad and modules are lit by fixed lights, not unlit. In the new build the scene lights ease from the sun and moon rig back to today's neutral rig as the fold progress goes from 0 to 1. At t = 1 the pad and ink are lit exactly as they are today, whatever the time of day, and there is no visible snap. The new ink-block mesh from Part 1 can be unlit from the start.
- **Behind the folded code on screen:** the sky stays as it is, stars and all. The sampler reads module centres on the pad, and the quiet zone is light stone on the pad, so the sky has no effect on it.
- **Where the sky is rendered.** A fragment shader on a background quad. The precomputed cloud density, cloud self-shadow and Milky Way fields are passed in as data textures, built once per viewport size.
  - All time-dependent values (sun and moon position, sky colour stops, light, ambient and haze colours, star alpha) come from one pure TypeScript function. That function is unit-tested; the shader only consumes its output.
  - "2 px grid" means 2 CSS pixels, the same half resolution the scene already uses in the tree state.
- **Slider mapping.** The slider is linear in clock time from 06:00 at the left to 23:00 at the right. Local times from 23:00 to 06:00 clamp to the right end (Night).
  - Fixed period boundaries: Dawn 06:00–08:00, Day 08:00–17:30, Sunset 17:30–19:30, Dusk 19:30–21:00, Night 21:00–23:00.
  - The value text is derived from the slider position, for example "Sunset, 18:40".
- **Per-season sky palettes are removed.** `SkySpec`, `renderSky(season)`, the aurora and the crescent moon variant are deleted; the moon is always full. The tests for them are rewritten for the new pure function.
- **Time is page state** in `page.tsx`, next to `season`.
  - It survives a season change and a new link. A reload starts again from local time.
  - It joins `verifyKey` at full precision. The existing 300 ms debounce means a drag simply shows "Checking the code, one moment." until the slider settles.
- **Slider placement:** in the season panel, as designed. The panel sits above the pill and leaves the island in view.

## Saved PNG backdrop (owner's decision)

- The saved `sky-island-qr.png` uses a **plain neutral backdrop around the code** instead of the time-of-day sky, so every saved image looks the same.
  - The owner chose this over keeping the sky.
  - Backdrop colour: a light neutral close to the pad, for example `#ece8f2` (builder's call).
- **How:** on Save, render one extra frame from the same folded, settled camera with the sky hidden and the backdrop shown, read it, then restore the sky. The island, pad and code stay exactly as on screen.
- **Safety (designer's call):** before downloading, run the existing module-centre check (`sampleBuffer`) on that export frame. If the export frame does not pass, Save refuses with the usual reason. This keeps the rule that what is exported has passed the check.
- The e2e PNG check (finder patterns and a light 4-module quiet zone) runs on this backdrop export, and gains one assertion: the corners of the saved image are the backdrop colour.
