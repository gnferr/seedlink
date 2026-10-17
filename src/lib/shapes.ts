import { defineSprite } from "./sprite.ts";

export type ShapeRegion = "trunk" | "canopy" | "body";

export interface Shape {
  id: string;
  label: string;
  mask: (a: number, b: number) => ShapeRegion | null;
}

const OAK = {
  id: "MINECRAFT_TREE",
  label: "Minecraft Tree",
  rows: [
    "....LLLLLL....",
    "...LLLLLLLL...",
    "..LLLLLLLLLL..",
    "..LLLLLLLLLL..",
    "..LLLLLLLLLL..",
    "...LLLLLLLL...",
    "....LLLLLL....",
    "......TT......",
    "......TT......",
    "......TT......",
    "......TT......",
    "......TT......",
    ".....TTTT.....",
    ".....TTTT.....",
  ],
  legend: { L: "canopy", T: "trunk" },
} as const;

const MINECRAFT_TREE = defineSprite(OAK);

export const SHAPES: Record<string, Shape> = {
  MINECRAFT_TREE,
};

export const DEFAULT_SHAPE_ID = "MINECRAFT_TREE";
