import type { ShapeRegion } from "./shapes.ts";

export type Theme = {
  label: string;
  regionColors: Record<ShapeRegion, string>;
  colorScan: string;
  colorLight: string;
  background: string;
  roughness: number;
  metalness: number;
};

export const THEMES = {
  // Region colours only show in Explore/Reveal; Scan flattens to colorScan, so these can be vivid.
  MINECRAFT: {
    label: "Minecraft",
    regionColors: {
      trunk: "#8a5a32",
      canopy: "#4f9d3a",
      body: "#d8d0bc",
    },
    colorScan: "#1d2618",
    colorLight: "#f5f1e6",
    background: "#d5e6ef",
    roughness: 0.85,
    metalness: 0,
  },
  CITYSCAPE: {
    label: "Cityscape",
    regionColors: {
      trunk: "#2a2a2a",
      canopy: "#0a0a0a",
      body: "#151515",
    },
    colorScan: "#0a0a0a",
    colorLight: "#ffffff",
    background: "#e4e4e7",
    roughness: 0.55,
    metalness: 0,
  },
  CYBERPUNK: {
    label: "Cyberpunk Voxels",
    regionColors: {
      trunk: "#2a0052",
      canopy: "#15002b",
      body: "#1a1a3a",
    },
    colorScan: "#15002b",
    colorLight: "#00ffd5",
    background: "#09000f",
    roughness: 0.25,
    metalness: 0.8,
  },
  TOPOGRAPHIC: {
    label: "Topographic Map",
    regionColors: {
      trunk: "#4a6a3d",
      canopy: "#2d4420",
      body: "#14341f",
    },
    colorScan: "#14341f",
    colorLight: "#f1faee",
    background: "#dbe7dd",
    roughness: 0.9,
    metalness: 0,
  },
  FLAT: {
    label: "Flat (most scannable)",
    regionColors: {
      trunk: "#000000",
      canopy: "#000000",
      body: "#000000",
    },
    colorScan: "#000000",
    colorLight: "#ffffff",
    background: "#ffffff",
    roughness: 1,
    metalness: 0,
  },
} satisfies Record<string, Theme>;

export type ThemeId = keyof typeof THEMES;
