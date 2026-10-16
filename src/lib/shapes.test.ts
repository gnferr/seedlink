import assert from "node:assert/strict";
import test from "node:test";
import { SHAPES } from "./shapes.ts";

test("trunk reaches the floor", () => {
  assert.equal(SHAPES.MINECRAFT_TREE.mask(0.5, 0.02), "trunk");
});

test("canopy sits above the trunk", () => {
  assert.equal(SHAPES.MINECRAFT_TREE.mask(0.5, 0.66), "canopy");
});

test("a gap separates trunk from canopy at the trunk's own column", () => {
  assert.equal(SHAPES.MINECRAFT_TREE.mask(0.2, 0.2), null);
});

test("outside the shape is empty", () => {
  assert.equal(SHAPES.MINECRAFT_TREE.mask(0.02, 0.95), null);
});

test("every shape in the registry declares its own id", () => {
  for (const [key, s] of Object.entries(SHAPES)) assert.equal(key, s.id);
});
