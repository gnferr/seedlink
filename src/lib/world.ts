import { SEASONS, mixHex, tweenSeasons, wrapPhase } from "./seasons.ts";
import type { Season } from "./seasons.ts";

export type GroundPalette = { grass: string; dirt: string; blossom: string };
export type Gradient = { top: string; bottom: string };

// How much of the season sky replaces the theme background.
export const SKY_THEME_WEIGHT = 0.65;

const GROUND: Record<Season, GroundPalette> = {
  SUMMER: { grass: "#5fae3a", dirt: "#8a5a34", blossom: "#ffd23f" },
  AUTUMN: { grass: "#b08a3a", dirt: "#7a4e2c", blossom: "#c8453a" },
  WINTER: { grass: "#eef4f8", dirt: "#7b6a5a", blossom: "#bcd4e6" },
  SPRING: { grass: "#7fd05a", dirt: "#8a5a34", blossom: "#e8739a" },
};

const SKY: Record<Season, Gradient> = {
  SUMMER: { top: "#8fd0f5", bottom: "#d6efff" },
  AUTUMN: { top: "#e9b872", bottom: "#f6e1bd" },
  WINTER: { top: "#b7c7d8", bottom: "#eef3f7" },
  SPRING: { top: "#b8dcf0", bottom: "#f4dce8" },
};

const CLOUD: Record<Season, string> = {
  SUMMER: "#ffffff",
  AUTUMN: "#f6e8d4",
  WINTER: "#dfe8f0",
  SPRING: "#ffffff",
};

// Flower tints per season; index 0 is always the season's blossom. Autumn's set doubles as fallen-leaf colours.
// Winter has no flowers (they scale to 0), so its set only keeps the sweep between seasons sensible.
const FLOWERS: Record<Season, readonly [string, string, string, string]> = {
  SUMMER: ["#ffd23f", "#ffffff", "#7aa7ff", "#ff8a3d"],
  AUTUMN: ["#c8453a", "#e08a2e", "#f2c14e", "#8e3b6e"],
  WINTER: ["#bcd4e6", "#bcd4e6", "#bcd4e6", "#bcd4e6"],
  SPRING: ["#e8739a", "#ffffff", "#c9a0ff", "#ffd1e0"],
};

// How the meadow renders the palette. The grass top is unlit, so it is lifted toward a pale yellow to sit
// lighter and warmer than any green canopy (snow stays white); tufts, bushes and deep dirt are shaded down.
export const GROUND_LIFT = "#fffbd0";
export const GROUND_LIFT_WEIGHT = 0.22;
export const SHADE = { tuft: 0.82, bush: 0.66, deepDirt: 0.78 } as const;
export const SNOW_CAP = "#f4f8fb";

export type RenderedGround = {
  ground: string;
  dirt: string;
  deepDirt: string;
  tuft: string;
  bush: string;
  flowers: string[];
};

// Multiplying a colour by f in linear light, which is what three's Color.multiplyScalar does.
const shade = (c: string, f: number) => mixHex(c, "#000000", 1 - f);

export function renderGround(phase: number): RenderedGround {
  const p = groundPalette(phase);
  return {
    ground: mixHex(p.grass, GROUND_LIFT, GROUND_LIFT_WEIGHT),
    dirt: p.dirt,
    deepDirt: shade(p.dirt, SHADE.deepDirt),
    tuft: shade(p.grass, SHADE.tuft),
    bush: shade(p.grass, SHADE.bush),
    flowers: [0, 1, 2, 3].map((i) => tweenSeasons((s) => FLOWERS[s][i], phase)),
  };
}

/** 1 at the season's phase, falling linearly to 0 one season away (wrapping): how "winter" or "autumn" the dial is. */
export function seasonBlend(season: Season, phase: number): number {
  const d = Math.abs(wrapPhase(phase) - SEASONS.indexOf(season));
  return Math.max(0, 1 - Math.min(d, 4 - d));
}

export const seasonGround = (season: Season): GroundPalette => GROUND[season];
export const seasonSky = (season: Season): Gradient => SKY[season];

export function groundPalette(phase: number): GroundPalette {
  return {
    grass: tweenSeasons((s) => GROUND[s].grass, phase),
    dirt: tweenSeasons((s) => GROUND[s].dirt, phase),
    blossom: tweenSeasons((s) => GROUND[s].blossom, phase),
  };
}

export function skyGradient(background: string, phase: number): Gradient {
  // mixHex returns its first argument when either is invalid, so the season end goes first:
  // mixing it toward the background by 1 - w equals mixing the background toward it by w,
  // and a bad background leaves the season colour unmixed.
  const end = (e: "top" | "bottom") =>
    mixHex(tweenSeasons((s) => SKY[s][e], phase), background, 1 - SKY_THEME_WEIGHT);
  return { top: end("top"), bottom: end("bottom") };
}

export const cloudColour = (phase: number): string => tweenSeasons((s) => CLOUD[s], phase);
