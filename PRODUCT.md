# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Three confirmed audiences, in priority order:

1. **Designers and brand teams** making a QR code that has to fit a campaign or a brand look — poster, packaging, event signage. They care most about theming and the quality of what they export.
2. **Casual and novelty users** making a one-off QR for a link to share as an image. They care about speed and about it looking good with zero setup.
3. **Portfolio visitors.** The app is also a showcase piece: part of its job is to impress someone who arrived to see what the builder can do, not to complete a recurring task.

The first two are doing a job; the third is evaluating the work. The interface has to serve both without the showcase ambition getting in the way of the task.

## Product Purpose

Turn a string of text or a URL into a 3D object that is still a working QR code when seen from directly above. The user types, watches the object rebuild, rotates it in 3D, restyles it, and takes it away as an image or a 3D model.

Success is a user leaving with an artifact they are happy to put in front of other people — and that still scans.

## Positioning

Two claims, both confirmed:

- **A scannable 3D art object.** Other generators make a flat code you decorate around. This one makes a real 3D object whose top-down projection *is* the code. The "and it still scans" half is the product, not a caveat.
- **A live 3D playground.** The canvas is the interface. Typing, retheming, and rotating all happen against the object in real time rather than through a render-and-wait step.

## Operating Context

Single-page, single-session use. A user arrives with a URL in their clipboard, pastes it, picks a look, and leaves with a file. There is no project to save, no account, and no return visit assumed.

The output travels: an exported image goes into a layout tool or a social post, an exported model goes into Blender, a game engine, or a 3D printer. Whatever leaves the app has to survive in those tools without repair.

The physical end of the loop matters. A code that only scans inside the browser preview has failed — the real test is a phone camera pointed at a printed or on-screen result.

## Capabilities and Constraints

Built and working:

- Text/URL input with a 300ms debounce that regenerates the QR matrix.
- 3D voxel extrusion of the dark modules, with a per-module height that is deterministic so the object does not jitter between renders.
- A view toggle: an orthographic top-down camera for scanning, a perspective camera with orbit controls for exploring.
- A theme system covering geometry type, colors, material, light intensity, and height variance.

Not built yet:

- Export. Image (PNG/SVG) and 3D model (.glb/.gltf) export are both committed scope and both still missing. Until they ship, the product cannot deliver its own stated outcome.

Technical constraints:

- **Runs fully client-side.** No backend, no account, no data leaving the browser. It must stay deployable as a static site.
- QR generation uses error correction level H, so the extrusion can lose some contrast and still decode.
- A four-module quiet zone is required around the matrix and is part of the base plane, not decoration that can be trimmed.
- Shadows are deliberately disabled and the base plane is unshaded. Anything that reintroduces shading onto the light modules is a scannability regression.
- State is local React state. There is no store; that is a deliberate choice for the current single-component scope, not an oversight.

Deliberate deviations from the original technical document, both still open to revisit: no Zustand, and no tween when switching between the two cameras.

Open and not yet decided: deploy target, whether theming grows beyond the current fixed set, and whether a user ever needs to return to earlier work.

## Brand Commitments

None established. There is no name beyond the working title, no logo, no committed voice, and no existing identity to honor. Future work may propose these; it must not describe them as pre-existing.

## Evidence on Hand

- `system_document.md` — the original product and technical requirements document that defines the five features, the generation pipeline, and the material constraints. It is the only authored source of product truth besides this file.
- The running application itself.

Nothing else exists. There are no users yet, no testimonials, no case studies, no press, no usage data, no benchmarks, and no customer logos. Future work must not invent any of these or imply adoption that has not happened.

## Product Principles

1. **Scannability is the product, not a constraint on it.** Any theme, geometry, light, or camera change that stops a phone from reading the code is a defect, however good it looks.
2. **The object leads.** The canvas is the main event; controls serve it and should not compete with it for attention.
3. **No setup.** A user who pastes a URL and leaves immediately should get a good result. Every control is an option, never a prerequisite.
4. **What leaves the app has to work elsewhere.** An export is only finished if it opens cleanly in the tool the user takes it to.
5. **Stay client-side.** Capability is added without adding a server, an account, or a round trip.

## Accessibility & Inclusion

No formal standard has been set. One product-specific need is already clear: the canvas carries the entire payload, so the encoded value and the current view state need a non-visual equivalent — a screen reader user must be able to confirm what was encoded without seeing the object. The existing controls are real form elements and should stay that way rather than becoming canvas-drawn widgets.
