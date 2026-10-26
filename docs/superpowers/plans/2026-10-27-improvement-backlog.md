# Seedlink Improvement Backlog

A list of improvements to pick up later, smallest first. Each item stands on its own: its goal, where the code lives, how to build it, how to test it, and when it counts as done. Before starting any item from B4 onward, turn it into a short spec and a task plan (superpowers:brainstorming, then superpowers:writing-plans), the same way the fixed-scale work was done.

Already done (PR gnferr/seedlink#3): the saved file is called `seedlink-qr.png`, the favicon is a pixel tree, and the site has a share card.

## Ground rules for every item

- **Scannability comes first.** Nothing may change the folded frame that `sampleScan` grades, or the plain PNG drawn by `qrPixels` (`src/lib/qrImage.ts`), unless the item is about that.
- **Client-side only.** No backend, no account, no data leaving the browser. The site must stay deployable as a static site on Vercel.
- **No new dependencies** unless the item says so and explains why.
- **Pure logic goes in `src/lib`** with a `node --experimental-strip-types --test` test next to it. UI behaviour gets a Playwright test in `e2e/island.spec.ts`.
- **Before a PR:** `npm test`, `npx tsc --noEmit`, `npx eslint src e2e`, `npm run build`, and `npx playwright test e2e/island.spec.ts --workers=1` all pass.

## Order at a glance

| # | Item | Size | Depends on |
|---|------|------|------------|
| B4 | Share button on phones | Small | none |
| B5 | Link to this tree (`?u=` in the address) | Small | none |
| B6 | Automatic checks on GitHub (CI) | Small | none |
| B7 | Island the same size for every species | Medium | none |
| B8 | SVG export | Medium | none (reuses `qrImage.ts`) |
| B9 | Screen reader support | Medium | none |
| B10 | Life on the island (birds, bats) | Large | none |
| B11 | Speed on cheap phones | Large | best after B10 |

Recommended order: B6 first, since it protects everything after it. Then B4 and B5 together, because both are about sharing. After that, B7, B8 and B9 in any order, then B10 and B11 last.

---

## B4. Share button on phones

**Goal:** a Share button next to Save. On a phone it opens the system share sheet with the QR image attached, so it can go straight to WhatsApp, Instagram and other apps. Where sharing files isn't supported (most desktops), it copies the image to the clipboard instead.

**Why:** most people make a code in order to send it. Today they have to save, find the file, then share it.

**Where:**
- `src/app/page.tsx`: `saveImage` already builds the canvas from `qrPixels` and self-checks it with `sampleBuffer`. Share reuses that path.
- `src/components/controls/ControlPill.tsx`: the Save button and its blocked state.
- `src/lib/exporters.ts`: `exportPng`.

**How:**
1. Split the part of `saveImage` that builds and checks the canvas into one function that returns the canvas, or `null` when the check fails. Save and Share both call it.
2. Share: turn the canvas into a PNG `Blob` (`canvas.toBlob`), wrap it in `new File([blob], "seedlink-qr.png", { type: "image/png" })`, and call `navigator.share({ files: [file], title: "Seedlink", text: qr.text })` when `navigator.canShare?.({ files: [file] })` is true.
3. Fallback: `navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])`, then a short "Copied" message through the existing `aria-live` hint.
4. If both are unavailable, hide the Share button. Never show a button that does nothing.
5. Share follows the same gating as Save (`saveBlockedReason`): blocked with the same reason, and the same `aria-disabled` pattern.
6. The user cancelling the share sheet (`AbortError`) is not an error and shows no message.

**Tests:**
- e2e: stub `navigator.share` and `navigator.canShare` with `page.addInitScript`. Fold, click Share, and assert the stub received exactly one file named `seedlink-qr.png` of type `image/png`, with the same bytes size as the Save download.
- e2e: no share support plus a clipboard stub means Share writes one `image/png` item and the hint says it was copied.
- e2e: Share is blocked with the same reason as Save while unfolded.

**Done when:** a real phone shares the image to a chat app and it scans from there; desktop copies the image; blocked states match Save.

---

## B5. Link to this tree

**Goal:** the page address carries the link text, for example `https://<site>/?u=https%3A%2F%2Fexample.com`. Opening that address grows the same island straight away. Typing updates the address without adding history entries.

**Why:** people can send the Seedlink page itself, not only the image, and the recipient sees the same island.

**Where:** `src/app/page.tsx` (`input` and `qr` state, `DEFAULT_URL`, the 300 ms debounce).

**How:**
1. On first load, read `u` from `window.location.search`. If present and not empty, use it in place of `DEFAULT_URL` for both `input` and `qr`.
2. Because the page is statically rendered, read the address in an effect after mount (or with `useSearchParams` behind a `Suspense` boundary). Check `node_modules/next/dist/docs/` for the current guidance before choosing; this Next.js version has breaking changes. Avoid a hydration mismatch.
3. When the debounced `qr.text` changes, call `history.replaceState(null, "", "?u=" + encodeURIComponent(text))`. Use the default page address when the text equals `DEFAULT_URL` or is empty.
4. Cap what's read from the address with the same too-long rule the input already uses.
5. Decide whether the species should also be shared (`&s=oak`). By default it stays random per grow; only add it if the owner asks.

**Tests:**
- e2e: open `/?u=hello-seedlink`. The field shows `hello-seedlink`, and the scene's `aria-label` contains it.
- e2e: type a new link, wait past the debounce, and the address has the encoded `u`. `history.length` is unchanged.
- e2e: a `u` longer than the QR limit shows the existing too-long state and does not crash.

**Done when:** copying the address bar and opening it in a new tab shows the same link and island.

---

## B6. Automatic checks on GitHub (CI)

**Goal:** every push and PR runs unit tests, typecheck, lint and build on GitHub Actions. The e2e suite runs too, but it may be marked optional at first.

**Why:** a broken change shows a red ✗ on the PR before anyone merges.

**Where:** new `.github/workflows/ci.yml`.

**How:**
1. Trigger on `pull_request` and on `push` to `main`.
2. Job `checks` on `ubuntu-latest`: `actions/checkout`, `actions/setup-node` with `node-version: 22` and npm cache, then `npm ci`, `npm test`, `npx tsc --noEmit`, `npx eslint src e2e` and `npm run build`.
3. Job `e2e`: install browsers with `npx playwright install --with-deps chromium`, then `npx playwright test e2e/island.spec.ts --workers=1`. `playwright.config.ts` already starts `npm run dev` and sets retries in CI. Upload `test-results/` as an artifact when it fails.
4. WebGL in headless Chromium on a Linux runner uses software rendering (SwiftShader). If the scan-contrast tests turn out flaky there, mark the e2e job `continue-on-error: true` first and fix it in a follow-up rather than weakening tests.
5. Pin action versions to tags no newer than a few weeks old.

**Tests:** the workflow itself. Open a PR and see both jobs run; push a deliberately failing unit test on a scratch branch and see `checks` go red, then delete the branch.

**Done when:** PRs on gnferr/seedlink show the checks, and `checks` is required in the branch protection settings (the owner does that last step in GitHub settings).

---

## B7. Island the same size for every species

**Goal:** in the tree view, the island's on-screen width stays about the same whatever species grows. Today it varies about 40%, because the camera fits each tree's height.

**Why:** the island is the stage; it shouldn't jump in size when the tree regrows.

**Where:** `src/components/island/FoldCamera.tsx` (`treePose`, which takes `radius`, `top`, `crownRadius` and insets), and `src/components/island/IslandScene.tsx`.

**How:**
1. Measure first: for each of the six species at 1440×900 and 390×844, record `data-island-px` and `data-crown-px` (already exposed on the scene wrapper).
2. Make the framing fit a fixed reference height (for example the tallest species' `top`, or `TREE_GROWTH_CAP`-based), not this tree's `top`. Keep the width rule `max(radius * 2.4, crownRadius * 2.15)` so crowns never crop on phones.
3. Check that the tallest species (birch, willow) is not cut off at the top. If one is, shorten that species in `src/lib/tree.ts` instead of zooming out for everyone.
4. The folded view (`topPose`) is untouched.

**Tests:**
- e2e: for 4+ seeded species (seed `Math.random` with `addInitScript`, as the existing same-size test does), `data-island-px` differs by at most 5% between them at 1440×900.
- The existing phone test (crown fits at 390×844) still passes.
- Screenshot every species at both sizes and look at them.

**Done when:** regrowing the tree never visibly changes the island's size, and no crown is cropped.

---

## B8. SVG export

**Goal:** a second download format, an SVG of the plain QR. It uses the same colours, quiet zone and module grid as the PNG.

**Why:** designers and printers want a vector file that scales without blur.

**Where:** `src/lib/qrImage.ts` (`QR_IMAGE`, `qrPixels`), the page's Save path, `src/lib/exporters.ts`.

**How:**
1. Add `qrSvg(m: QrMatrix): string` to `qrImage.ts`. Use `viewBox="0 0 N N"` with `N = size + 2 * QUIET_ZONE` and a white `<rect>` background. Draw the dark modules as one `<path>` (one `M x y h1 v1 h-1 z` per module, or merged runs per row), filled `QR_IMAGE.ink`. Add `shape-rendering="crispEdges"`.
2. Give it a fixed default size such as `width`/`height` of `N * 16` so it opens at the same size as the PNG.
3. UI: make Save a small menu (PNG / SVG), or add a format toggle in the Season panel. Pick whichever keeps the pill simplest, and confirm with the owner using a mockup first.
4. Download via a `Blob` with type `image/svg+xml` and filename `seedlink-qr.svg`. The same gating as Save applies.

**Tests:**
- Unit: parse the SVG string, check the `viewBox`, count dark modules in the path against the matrix, and check colours.
- Unit: render-free check that every dark module `(x, y)` appears exactly once.
- e2e: download the SVG, rasterise it in the page with an `<img>` and a canvas at 16 px per module, and run the same per-module centre check as the PNG test.

**Done when:** the SVG opens in a browser and in Figma or Illustrator, and scans when printed.

---

## B9. Screen reader support

**Goal:** a screen reader user can find out what's encoded, whether the tree is standing or folded, and whether the code scans, and can do everything without sight: fold, change season and time, save.

**What exists:**
- `<h1 className="sr-only">Seedlink</h1>`.
- The scene wrapper is `role="img"` with an `aria-label` naming the encoded text.
- An `aria-live="polite"` hint paragraph.
- Save's blocked reason in `#save-reason`.

**Where:** `src/app/page.tsx`, `src/components/controls/*`, `src/lib/status.ts`.

**How:**
1. Audit with axe (`@axe-core/playwright` as a dev dependency, which is acceptable for testing only) and fix what it reports.
2. Check that the fold control is a real button with a name that changes ("Fold the tree into the code" / "Grow the tree back") and an `aria-pressed` or state text.
3. Announce state changes once, not every frame: "Folded. Scans, 625 of 625 modules." and "Tree grown: oak." Use the existing live region, and debounce it the way the scan check is debounced.
4. Make sure the time slider has `aria-valuetext` like "Sunset, 18:40". Check whether it already does.
5. Keyboard-only pass: Tab order is field, season, time, fold, Save, with visible focus rings everywhere (the stepped controls draw the ring inside).

**Tests:**
- e2e: an axe scan reports no serious or critical violations in the tree and folded states.
- e2e: after folding, the live region's text contains "Scans".
- e2e: complete the whole flow with the keyboard only: type, fold, save.

**Done when:** a pass with NVDA (Windows) or VoiceOver (iPhone) can make and save a code without looking at the screen.

---

## B10. Life on the island

**Goal:** small animated creatures while the tree stands, such as birds circling the crown at day and bats or fireflies at night. They leave before the fold starts and come back after it grows back.

**Why:** the island feels alive, which is the showcase half of the product.

**Where:** `src/components/island/Particles.tsx` (existing fireflies and petals; follow its pattern), `src/components/island/IslandScene.tsx`, `src/lib/daycycle.ts` (`skyState(t)` for day versus night).

**How:**
1. Start with mockups (superpowers:brainstorming with visual companion): sprite style, size relative to the 1.5× crown, how many.
2. Creatures are instanced, unlit sprites or tiny pixel meshes. Their paths are pure functions of time and a seed in `src/lib/creatures.ts`, so they can be unit-tested.
3. Hard rule: unmount them, or set their scale to 0, from the moment the fold starts until the tree has fully regrown. The graded folded frame must contain nothing that moves.
4. Respect `useReducedMotion`: no creatures, or perched and still.
5. Budget: at most a few dozen instances and no per-frame allocations.

**Tests:**
- Unit: paths stay within the island's bounds, and day versus night selects the right creature set.
- e2e: in the folded state no creature is rendered (expose a count via a `data-` attribute), and scan tests still pass.
- e2e: reduced motion means no moving creatures.

**Done when:** the owner likes the look, and every scan and PNG test is unchanged.

---

## B11. Speed on cheap phones

**Goal:** a steady frame rate on a low-end Android phone while keeping the look, by lowering detail only where needed.

**Why:** many visitors will open the link on a phone, and up to 6,000 leaf cards (`CARD_BUDGET`) plus the sky shader can be heavy.

**Where:**
- `src/components/island/IslandScene.tsx`: the `dpr` is already halved in the tree view.
- `src/lib/tree.ts`: `CARD_BUDGET` and `SEGMENT_BUDGET`.
- `src/lib/skyFields.ts` and `SkyDome.tsx`.

**How:**
1. Measure first. Use Chrome remote debugging on a real low-end phone, or Chrome DevTools CPU 6× slowdown, and record frame times in the tree view and during the fold. Write the numbers into the spec.
2. Options, cheapest first:
   - lower `dpr` further in the tree view on small screens;
   - a smaller sky field texture;
   - fewer leaf cards (a quality tier that scales `CARD_BUDGET`);
   - pause the scene's render loop when the tab is hidden or the page is idle.
3. If a quality tier is added, choose it once at load (from `navigator.hardwareConcurrency`, screen size, or a short frame-time probe). Never switch it mid-fold.
4. The folded frame keeps full `dpr`, so scanning is not affected.

**Tests:**
- Unit: a quality tier scales the card budget as specified and never below what the fold needs to cover every dark module. Reuse the fold coverage test.
- e2e: with the low tier forced, folding still reaches `Scans · N/N` and the PNG test passes.
- Manual: before and after frame times on the same phone.

**Done when:** the tree view is smooth on the test phone and nothing about scanning changed.
