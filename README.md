# Seedlink

Grow your link into a tree. Type a URL and a pixel tree grows on a floating island shaped by that link. Tap the tree and it folds into a scannable QR code; tap again and it grows back.

## Features

- **A tree that becomes a code.** The tree's leaves and branches fly down and become the QR code's dark modules.
- **Six tree species**, picked at random on every grow: oak, lush oak, willow, acacia, birch and cherry.
- **Seasons and leaf colours.**
- **A pixel sky with a day cycle.** A time-of-day slider moves the sun and moon. It starts at your local time.
- **The same island for every link.** Short and long links grow the same size island; longer links just get smaller modules.
- **Scan check before Save.** The folded code is checked in the browser, and Save explains why if it won't scan.
- **Plain PNG export.** Save downloads a clean QR image: dark ink on white, with the quiet zone.

Everything runs in the browser. There is no backend and no account.

## Tech

Next.js 16, React 19, React Three Fiber and three.js, `qrcode` (error correction level H). Pure logic lives in `src/lib` and is tested with Node's built-in test runner; the UI is tested with Playwright.

## Run it

Needs Node 22.6 or newer (the unit tests use `--experimental-strip-types`).

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## Test

```bash
npm test
npm run test:e2e
npx tsc --noEmit
npm run lint
```

## Deploy

It deploys to Vercel with the default Next.js settings: import the repository and deploy.

## Docs

Design specs are in `docs/superpowers/specs/` and the improvement backlog is in `docs/superpowers/plans/`. Product notes are in `PRODUCT.md`.
