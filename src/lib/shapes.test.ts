import assert from "node:assert/strict";
import test from "node:test";
import { SHAPES } from "./shapes.ts";

test("trunk reaches the floor", () => {
  assert.equal(SHAPES.MINECRAFT_TREE.mask(0.5, 0.02), "trunk");
});

test("canopy sits above the trunk", () => {
  assert.equal(SHAPES.MINECRAFT_TREE.mask(0.5, 0.9), "canopy");
});

test("the corner beside the trunk at floor level is empty", () => {
  assert.equal(SHAPES.MINECRAFT_TREE.mask(0.1, 0.1), null);
});

test("outside the shape is empty", () => {
  assert.equal(SHAPES.MINECRAFT_TREE.mask(0.02, 0.95), null);
});

test("every shape in the registry declares its own id", () => {
  for (const [key, s] of Object.entries(SHAPES)) assert.equal(key, s.id);
});
