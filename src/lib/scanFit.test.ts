import assert from "node:assert/strict";
import test from "node:test";
import { FIT_MARGIN, MIN_SCAN_PITCH_PX, nextScanFrame, scanFit, scanPitchPx, tooSmallToScan, type ScanFrame } from "./scanFit.ts";

test("pitch is the fit's zoom; too small below 1.5px, not at it", () => {
  assert.equal(MIN_SCAN_PITCH_PX, 1.5);
  // plane 169 (a 161-module code): a 390px-wide portrait phone gives about 2.08px, a short landscape band about 0.97px.
  assert.ok(Math.abs(scanPitchPx(390, 844, 169, { top: 175, bottom: 112 }) - 2.077) < 0.01);
  assert.equal(tooSmallToScan(390, 844, 169, { top: 175, bottom: 112 }), false);
  assert.equal(tooSmallToScan(844, 390, 169, { top: 148, bottom: 60 }), true);
  // Boundary: a free band of exactly 1.5·plane/FIT_MARGIN px gives exactly 1.5px.
  const band = (1.5 * 100) / FIT_MARGIN;
  assert.equal(scanPitchPx(1000, band, 100), 1.5);
  assert.equal(tooSmallToScan(1000, band, 100), false);
  assert.equal(tooSmallToScan(1000, band - 1, 100), true);
});

test("bad insets don't make a code look too small; insets covering the view do", () => {
  assert.equal(tooSmallToScan(390, 844, 37, { top: NaN, bottom: -20 }), false);
  assert.equal(tooSmallToScan(390, 844, 37, { top: 800, bottom: 800 }), true);
});

test("scanFit treats NaN and negative insets as none", () => {
  const none = scanFit(400, 800, 37);
  assert.deepEqual(scanFit(400, 800, 37, { top: NaN, bottom: -50 }), none);
  assert.deepEqual(scanFit(400, 800, 37, { top: Infinity, bottom: 0 }), none);
});

test("scanFit keeps zoom positive when the insets cover the whole view", () => {
  const f = scanFit(400, 300, 37, { top: 200, bottom: 200 });
  assert.ok(f.zoom > 0 && Number.isFinite(f.zoom));
  assert.equal(f.zoom, (1 / 37) * FIT_MARGIN);
});

const start: ScanFrame = { insets: { top: 175, bottom: 112 }, width: 390, height: 844 };

test("in Scan at the same size the insets grow", () => {
  const n = nextScanFrame(start, { top: 207, bottom: 112 }, 390, 844, true);
  assert.deepEqual(n.insets, { top: 207, bottom: 112 });
});

test("in Scan at the same size the insets never shrink, and an unchanged frame is the same object", () => {
  const n = nextScanFrame(start, { top: 137, bottom: 100 }, 390, 844, true);
  assert.equal(n, start);
});

test("a new view size resets the ratchet to the fresh measurement, even in Scan", () => {
  const n = nextScanFrame(start, { top: 103, bottom: 48 }, 844, 390, true);
  assert.deepEqual(n, { insets: { top: 103, bottom: 48 }, width: 844, height: 390 });
});

test("outside Scan the frame follows the measurement", () => {
  const n = nextScanFrame(start, { top: 137, bottom: 112 }, 390, 844, false);
  assert.deepEqual(n.insets, { top: 137, bottom: 112 });
});

test("non-finite or negative chrome counts as 0", () => {
  const n = nextScanFrame(start, { top: NaN, bottom: -5 }, 844, 390, true);
  assert.deepEqual(n.insets, { top: 0, bottom: 0 });
  assert.equal(nextScanFrame(start, { top: NaN, bottom: Infinity }, 390, 844, true), start);
});
