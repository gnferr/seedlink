import { test } from "node:test";
import assert from "node:assert/strict";
import { generateMatrix } from "./qr.ts";
import { qrPixels } from "./qrImage.ts";
import { STRESS_PITCH, stressCopy, stressDecode } from "./stress.ts";

test("stressCopy shrinks to about STRESS_PITCH pixels a module", () => {
  const m = generateMatrix("https://example.com"), img = qrPixels(m, 12);
  const s = stressCopy(img.data, img.width, img.height, 12);
  assert.equal(s.width, Math.floor(img.width * (STRESS_PITCH / 12)));
});

test("stressDecode reads the plain code back, unicode included, after shrinking and blurring", () => {
  for (const text of ["https://example.com", "https://example.com/" + "a".repeat(120), "héllo 🌳 seedlink"]) {
    const m = generateMatrix(text), img = qrPixels(m, 12);
    assert.equal(stressDecode(img.data, img.width, img.height, 12), text);
  }
});

test("stressDecode refuses a washed-out code and an inverted one", () => {
  const m = generateMatrix("https://example.com"), img = qrPixels(m, 12);
  const faint = img.data.map((v, i) => (i % 4 === 3 ? v : 200 + v * 0.2)); // ink at about 200 on 255: under 1.3:1
  const inverted = img.data.map((v, i) => (i % 4 === 3 ? v : 255 - v));
  assert.equal(stressDecode(faint, img.width, img.height, 12), null);
  assert.equal(stressDecode(inverted, img.width, img.height, 12), null);
});
