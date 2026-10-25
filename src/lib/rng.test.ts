import test from "node:test";
import assert from "node:assert/strict";
import { hashString, mulberry32, hash3 } from "./rng.ts";

test("hashString is stable and distinguishes different links", () => {
  assert.equal(hashString("https://example.com"), hashString("https://example.com"));
  assert.notEqual(hashString("https://example.com"), hashString("https://example.org"));
});

test("mulberry32 repeats for the same seed and stays in [0, 1)", () => {
  const a = mulberry32(42), b = mulberry32(42);
  const xa = Array.from({ length: 100 }, () => a());
  const xb = Array.from({ length: 100 }, () => b());
  assert.deepEqual(xa, xb);
  for (const v of xa) {
    assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
  }
});

test("hash3 is deterministic and sensitive to its inputs", () => {
  assert.equal(hash3(1, 2, 3), hash3(1, 2, 3));
  assert.notEqual(hash3(1, 2, 3), hash3(1, 2, 4));
});

test("hash3 averages near one half over a grid", () => {
  let sum = 0, n = 0;
  for (let x = 0; x < 20; x++) for (let y = 0; y < 20; y++) for (let z = 0; z < 5; z++) {
    sum += hash3(x, y, z);
    n++;
  }
  const mean = sum / n;
  assert.ok(mean > 0.45 && mean < 0.55, `mean ${mean}`);
});
