import { test } from "node:test";
import assert from "node:assert/strict";
import { playChime, playChirp, setSoundOn } from "./sound.ts";

test("sound is silent and creates no AudioContext while off", () => {
  // Node has no AudioContext: touching one would throw.
  setSoundOn(false);
  assert.doesNotThrow(() => { playChime("fold"); playChime("grow"); playChirp(); });
});
