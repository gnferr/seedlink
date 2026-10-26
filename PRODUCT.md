# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Three confirmed audiences, in priority order:

1. **Designers and brand teams** making a QR code that has to fit a campaign or a brand look — poster, packaging, event signage. They care most about the look (seasons, colour) and the quality of the PNG they save.
2. **Casual and novelty users** making a one-off QR for a link to share as an image. They care about speed and about it looking good with zero setup.
3. **Portfolio visitors.** The app is also a showcase piece: part of its job is to impress someone who arrived to see what the builder can do, not to complete a recurring task.

The first two are doing a job; the third is evaluating the work. The interface has to serve both without the showcase ambition getting in the way of the task.

## Product Purpose

Turn a string of text or a URL into a small voxel tree on a floating island. Tap the tree and it folds into a flat, scannable QR code; tap again and it grows back. The user types, watches the island grow, orbits it, switches the season, folds it, and takes the folded code away as a PNG image.

Success is a user leaving with an artifact they are happy to put in front of other people — and that still scans.

## Positioning

Two claims, both confirmed:

- **A tree that becomes a code.** Other generators make a flat code you decorate around. This one grows a real voxel tree on a QR slab, and the tree's blocks fold down to become the code's dark modules (spec in `docs/superpowers/specs/2026-10-25-sky-island-design.md`). The "and it still scans" half is the product, not a caveat.
- **A live 3D playground.** The canvas is the interface. Typing, switching seasons, poking the tree, and folding all happen against the island in real time rather than through a render-and-wait step.

## Operating Context

Single-page, single-session use. A user arrives with a URL in their clipboard, pastes it, picks a look, and leaves with a file. There is no project to save, no account, and no return visit assumed.

The output travels: the saved PNG goes into a layout tool, a poster, or a social post. Whatever leaves the app has to survive there without repair. There is no 3D model export (the `.glb` export was dropped).

The physical end of the loop matters. A code that only scans inside the browser preview has failed — the real test is a phone camera pointed at a printed or on-screen result.

## Capabilities and Constraints

Built and working:

- Text/URL input with a 300ms debounce that regenerates the QR matrix.
- A voxel tree on a floating island whose shape is grown deterministically from the link. The QR modules show as thin tiles on the slab the tree stands on.
- The fold: tapping the tree (or its keyboard button) moves each tree block onto a dark module, eases the camera to straight top-down, stills the island, and leaves a flat code. Tapping again grows the tree back.
- Four seasons and a leaf colour, a pixel-art night sky per season, and small effects (fireflies, petals, leaves or snow, a waterfall) that run only while the tree stands.
- An in-app scannability check on the folded, settled frame. Save is disabled, with a stated reason, unless the check passed for the current link, season and colour.
- PNG export: a plain QR image drawn from the code, dark ink on white with the quiet zone (`sky-island-qr.png`), self-checked before download.

Not built yet:

- SVG export. PNG is the only export; a 3D model export is out of scope.
- Birds, bats, crystals and other extra creatures from the early mockups.

Technical constraints:

- **Runs fully client-side.** No backend, no account, no data leaving the browser. It must stay deployable as a static site.
- QR generation uses error correction level H, so the folded blocks can lose some contrast and still decode.
- A four-module quiet zone of light stone is required around the matrix and is part of the slab, not decoration that can be trimmed. Grass starts outside it.
- In the folded state the slab is unshaded and nothing moves in it. Anything that reintroduces shading onto the light modules, or motion into the graded frame, is a scannability regression.
- State is local React state. There is no store; that is a deliberate choice for the current single-component scope, not an oversight.

Deliberate deviation from the original technical document, still open to revisit: no Zustand.

Open and not yet decided: deploy target, and whether a user ever needs to return to earlier work.

## Brand Commitments

None established beyond one owner-directed commitment: the visual identity is **Indie Voxel Game — chunky, tactile, playful; the object leads.** The product is named **Seedlink**. There is still no logo and no committed voice. Future work may propose these; it must not describe them as pre-existing.

## Evidence on Hand

- `docs/superpowers/specs/` — the design specs for the island, the fold, the tree species and the day cycle. They are the only authored source of product truth besides this file.
- The running application itself.

Nothing else exists. There are no users yet, no testimonials, no case studies, no press, no usage data, no benchmarks, and no customer logos. Future work must not invent any of these or imply adoption that has not happened.

## Product Principles

1. **Scannability is the product, not a constraint on it.** Any season, colour, effect, or camera change that stops a phone from reading the folded code is a defect, however good it looks.
2. **The object leads.** The canvas is the main event; controls serve it and should not compete with it for attention.
3. **No setup.** A user who pastes a URL and leaves immediately should get a good result. Every control is an option, never a prerequisite.
4. **What leaves the app has to work elsewhere.** A saved image is only finished if it scans and opens cleanly in the tool the user takes it to.
5. **Stay client-side.** Capability is added without adding a server, an account, or a round trip.
6. **Alive as a tree, honest as a code.** Ambient motion and effects belong to the standing tree; the folded code stays still and exact.

## Accessibility & Inclusion

No formal standard has been set. One product-specific need is already clear: the canvas carries the entire payload, so the encoded value and the current state (tree or folded, and the scan verdict) need a non-visual equivalent — a screen reader user must be able to confirm what was encoded without seeing the object. The existing controls are real form elements and should stay that way rather than becoming canvas-drawn widgets.
