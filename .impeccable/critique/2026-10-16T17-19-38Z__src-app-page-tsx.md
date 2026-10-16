---
target: src/app/page.tsx
total_score: 13
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
target_identity: "file:E:\\lock-in-mode\\project\\01_web_base\\01_interactive_qr_generator\\src\\app\\page.tsx"
target_fingerprint: "sha256:3cee778d21d1507126d58ce8c298266a684168c31533fb0667549745209f3740"
target_path: "E:\\lock-in-mode\\project\\01_web_base\\01_interactive_qr_generator\\src\\app\\page.tsx"
timestamp: 2026-10-16T17-19-38Z
slug: src-app-page-tsx
---
Method: dual-agent (A: design review · B: detector + static evidence)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 1 | dynamic(ssr:false) had no loading fallback; no debounce indicator; no scannability readout |
| 2 | Match System / Real World | 2 | "Data" / "Height variance" are internal vocabulary; the word QR appears nowhere in the UI |
| 3 | User Control and Freedom | 1 | Theme select silently overwrote the variance value; no undo, no reset, no export |
| 4 | Consistency and Standards | 2 | Mode button mixed an action label with aria-pressed; Arial/Geist conflict; boilerplate title |
| 5 | Error Prevention | 1 | Nothing prevented an unscannable object; no character count before capacity throws |
| 6 | Recognition Rather Than Recall | 2 | Four themes collapsed into a text-only select |
| 7 | Flexibility and Efficiency | 1 | No shortcuts, no Enter-to-commit, no copy/download, no saved configuration |
| 8 | Aesthetic and Minimalist Design | 2 | Minimalism of a scaffold: default palette, default type, no identity |
| 9 | Error Recovery | 1 | Capacity error destroyed the canvas; 4.12:1 in dark mode; color as only signal |
| 10 | Help and Documentation | 0 | No title, no explainer, no hint that Scan mode is what a phone camera reads |
| **Total** | | **13/40** | **Poor — competent 3D demo wearing an unfinished interface** |

## Design Specificity Verdict

Not specific. A Next.js starter with a 3D canvas bolted under it. All labels used the most templated style in web UI; color was Tailwind default zinc throughout while the only authored color sat sealed inside themes.ts. Layout inverted the project's own "object leads" principle: top toolbar + content well, with the one authored motion animating the control panel rather than the object.

Deterministic scan: 1 finding, overused-font at globals.css:25 — a mis-fire (matched Arial, not in its list). The real instance was Geist in layout.tsx, unflagged.

Visual overlays: none. No browser automation exposed to either agent. All contrast numbers computed from source hex, not sampled.

## What's Working

1. Scannability defended in the material layer: meshBasicMaterial base, shadows off with a comment, quiet zone in the base span, error correction H. All theme pairs clear contrast (Cyberpunk 15.25:1, Flat 21:1).
2. Deterministic per-module height via a pure hash of (x,z) — the mechanism behind stable live typing.
3. "Flat (most scannable)" names its own tradeoff in the label.

## Priority Issues

- **[P0] No export.** Task cannot be completed; preserveDrawingBuffer paid for every frame with no capability. → harden
- **[P0] No scannability feedback at the moment of truth.** Hard camera cut, no verdict, no warning that high variance + Cyberpunk degrades top-down contrast. → harden
- **[P1] Theme select destroys the height-variance value.** → clarify
- **[P1] Error state destroys the object and fails contrast.** → harden
- **[P2] Canvas has no non-visual equivalent** (named as a requirement in PRODUCT.md); aria-pressed announced the opposite of the truth. → audit

## Persona Red Flags

- **Alex (Power User):** no mode hotkey (four Tabs each time), no Enter-to-commit, no auto-select on the pre-filled field, Ctrl+S dead.
- **Sam (Accessibility-Dependent):** BLOCKING — canvas a void, no live region, mode button announced inverted state, outline-none replaced by a 1px border shift, dark labels 4.12:1, placeholder 3.2:1, input border 1.48:1.
- **Casey (Distracted Mobile):** all controls outside the thumb zone, panel ate ~300px of ~700px, w-44 slider didn't expand, nothing persisted across interruption.
- **Priya (brand designer, audience #1):** no brand-color input at all despite "fit a brand look" being the stated primary job; no resolution control, no transparent background, no SVG, no reproducible config.

## Minor Observations

generateMatrix(input || " ") encoded a space on an empty field. catch {} labelled every failure "Too much data". Two breakpoint utilities in the whole app. No favicon, no OG image. gsap + lenis bought one panel fade and a scroll system on an unscrollable page.

## Questions to Consider

1. Why is the control panel a toolbar at all? Canvas full-viewport with a floating theme-tinted control cluster.
2. What if Scan mode isn't a mode — a permanent live top-down thumbnail with a decode indicator?
3. Are four fixed themes serving audience #1, or just the demo? Themes as starting points with brand-color override and a live contrast check.
4. Could the URL be the save file? Four values, paste-shareable, reload-safe, reproducible.
