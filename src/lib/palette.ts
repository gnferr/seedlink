import type { Season } from "./seasons.ts";

export const INK = "#2a2140";
export const PAD = "#e6e0ef";

export type SkySpec = { hue: number; hueStep: number; bright: [number, number]; sat: [number, number]; moon: "full" | "crescent" | null; sun: boolean; aurora: string | null; stars: number };
export type SeasonPalette = { grass: [string, string, string]; dirt: string; stone: string; leaf: string; trunk: string; particle: string; particleKind: "petal" | "firefly" | "leaf" | "snow"; sky: SkySpec };

const common = { stone: "#8d84a0", trunk: "#5a3b2e" };

export const PALETTES: Record<Season, SeasonPalette> = {
  SPRING: { ...common, grass: ["#7cc47a", "#8fd18a", "#6ab36a"], dirt: "#9a6a48", leaf: "#f58cb4", particle: "#ffd0e2", particleKind: "petal", sky: { hue: 246, hueStep: 6.5, bright: [22, 86], sat: [34, 20], moon: "crescent", sun: false, aurora: null, stars: 26 } },
  SUMMER: { ...common, grass: ["#4fa04e", "#5fb35a", "#438a45"], dirt: "#8f6040", leaf: "#4fae5e", particle: "#fff3a0", particleKind: "firefly", sky: { hue: 228, hueStep: 5, bright: [11, 60], sat: [44, 26], moon: "full", sun: false, aurora: "#6bb3a4", stars: 55 } },
  AUTUMN: { ...common, grass: ["#a89a4a", "#b8a855", "#8f8640"], dirt: "#8a5640", leaf: "#e8662a", particle: "#f2913a", particleKind: "leaf", sky: { hue: 268, hueStep: 9, bright: [16, 90], sat: [40, 44], moon: null, sun: true, aurora: null, stars: 8 } },
  WINTER: { ...common, grass: ["#eef3fa", "#f7faff", "#dfe8f3"], dirt: "#5a4448", leaf: "#eef4fc", particle: "#ffffff", particleKind: "snow", sky: { hue: 224, hueStep: 2.5, bright: [8, 62], sat: [36, 22], moon: "full", sun: false, aurora: "#7dbda7", stars: 70 } },
};

export const LEAF_SWATCHES: readonly { name: string; hex: string }[] = [
  { name: "Leaf green", hex: "#4fae5e" },
  { name: "Mint", hex: "#8fd18a" },
  { name: "Blossom", hex: "#f58cb4" },
  { name: "Ember", hex: "#e8662a" },
  { name: "Gold", hex: "#f2c14e" },
  { name: "Sky", hex: "#7aa7ff" },
  { name: "Lilac", hex: "#b38cff" },
  { name: "Frost", hex: "#eef4fc" },
];

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// Per-voxel leaf colour: lightness +-0.08 and hue +-0.02 around the base, lifted when sunlit.
export function leafShade(base: string, shade: number, sunlit: boolean): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(base.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0, s = 0, l = (mx + mn) / 2;
  if (d > 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  h = (h + (shade - 0.5) * 0.04 + 1) % 1;
  l = clamp01(l + (shade - 0.5) * 0.16 + (sunlit ? 0.06 : 0));
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
