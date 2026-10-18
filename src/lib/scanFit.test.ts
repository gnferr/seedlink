import assert from "node:assert/strict";
import test from "node:test";
import { FIT_MARGIN, nextScanFrame, scanFit, type ScanFrame } from "./scanFit.ts";

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
