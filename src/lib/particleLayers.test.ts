import test from "node:test";
import assert from "node:assert/strict";
import { nextLayers, type Layer } from "./particleLayers.ts";

test("a season change keeps the outgoing layer until it drains", () => {
  const one = nextLayers([], { type: "season", season: "SUMMER", id: 1 });
  const two = nextLayers(one, { type: "season", season: "WINTER", id: 2 });
  assert.deepEqual(two, [
    { id: 1, season: "SUMMER", leaving: true },
    { id: 2, season: "WINTER", leaving: false },
  ]);
  assert.deepEqual(nextLayers(two, { type: "drained", id: 1 }), [{ id: 2, season: "WINTER", leaving: false }]);
});

test("choosing the current season is a no-op", () => {
  const one = nextLayers([], { type: "season", season: "AUTUMN", id: 1 });
  assert.equal(nextLayers(one, { type: "season", season: "AUTUMN", id: 2 }), one);
});

test("stop leaves every layer leaving and drains to empty", () => {
  let layers: Layer[] = nextLayers([], { type: "season", season: "SUMMER", id: 1 });
  layers = nextLayers(layers, { type: "season", season: "SPRING", id: 2 });
  layers = nextLayers(layers, { type: "stop" });
  assert.ok(layers.every((l) => l.leaving));
  layers = nextLayers(layers, { type: "drained", id: 2 });
  layers = nextLayers(layers, { type: "drained", id: 1 });
  assert.deepEqual(layers, []);
});

test("drained for an unknown id changes nothing", () => {
  const one = nextLayers([], { type: "season", season: "SUMMER", id: 1 });
  assert.deepEqual(nextLayers(one, { type: "drained", id: 99 }), one);
});
