import { mixHex, tweenSeasons } from "./seasons.ts";
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
