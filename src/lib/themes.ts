export type GeometryType = "VOXEL" | "CYLINDER" | "SMOOTH";

export type Theme = {
  label: string;
  geometryType: GeometryType;
  /** Dark modules. Keep this genuinely dark — scanners read luminance contrast. */
  colorDark: string;
  /** Light modules / base plane. Keep this genuinely bright. */
  colorLight: string;
  background: string;
  heightVariance: number;
  roughness: number;
  metalness: number;
  ambientIntensity: number;
  keyIntensity: number;
};

export const THEMES = {
  CITYSCAPE: {
    label: "Cityscape",
    geometryType: "VOXEL",
    colorDark: "#0a0a0a",
    colorLight: "#ffffff",
    background: "#e4e4e7",
    heightVariance: 6,
    roughness: 0.55,
    metalness: 0,
    ambientIntensity: 1.1,
    keyIntensity: 1.2,
  },
  CYBERPUNK: {
    label: "Cyberpunk Voxels",
    geometryType: "CYLINDER",
    colorDark: "#15002b",
    colorLight: "#00ffd5",
    background: "#09000f",
    heightVariance: 4,
    roughness: 0.25,
    metalness: 0.8,
    ambientIntensity: 0.9,
    keyIntensity: 1.6,
  },
  TOPOGRAPHIC: {
    label: "Topographic Map",
    geometryType: "SMOOTH",
    colorDark: "#14341f",
    colorLight: "#f1faee",
    background: "#dbe7dd",
    heightVariance: 2,
    roughness: 0.9,
    metalness: 0,
    ambientIntensity: 1.2,
    keyIntensity: 1,
  },
  FLAT: {
    label: "Flat (most scannable)",
    geometryType: "VOXEL",
    colorDark: "#000000",
    colorLight: "#ffffff",
    background: "#ffffff",
    heightVariance: 0,
    roughness: 1,
    metalness: 0,
    ambientIntensity: 1.4,
    keyIntensity: 0.6,
  },
} satisfies Record<string, Theme>;

export type ThemeId = keyof typeof THEMES;
