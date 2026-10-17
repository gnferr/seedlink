import { defineSprite, type SpriteSpec } from "./sprite.ts";

export type ShapeRegion = "trunk" | "canopy" | "body";

export interface Shape {
  id: string;
  label: string;
  mask: (a: number, b: number) => ShapeRegion | null;
}

// The Reveal screen is about 2:1 wide, so a sprite that fills its full width draws as a flat slab.
// Pad sprites with empty columns (this oak: 25 wide, canopy 13) so the drawn tree is roughly
// square on screen; keep the sprite width about 2x the drawn width.
const OAK: SpriteSpec = {
  id: "MINECRAFT_TREE",
  label: "Minecraft Tree",
  rows: [
    "..........LLLLL..........",
    "........LLLLLLLLL........",
    "......LLLLLLLLLLLLL......",
    "......LLLLLLLLLLLLL......",
    "......LLLLLLLLLLLLL......",
    "......LLLLLLLLLLLLL......",
    ".......LLLLLLLLLLL.......",
    ".........LLLLLLL.........",
    "...........TTT...........",
    "...........TTT...........",
    "...........TTT...........",
  ],
  legend: { L: "canopy", T: "trunk" },
};

/** Every sprite shape; SHAPES is derived from this list, so adding a spec here registers it. */
export const SPRITE_SPECS: readonly SpriteSpec[] = [OAK];

export const SHAPES: Record<string, Shape> = Object.fromEntries(
  SPRITE_SPECS.map((spec) => [spec.id, defineSprite(spec)]),
);

export const DEFAULT_SHAPE_ID = "MINECRAFT_TREE";
