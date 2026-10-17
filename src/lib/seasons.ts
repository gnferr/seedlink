import type { ShapeRegion } from "./shapes.ts";
import type { Theme } from "./themes.ts";

export type Season = "SUMMER" | "AUTUMN" | "WINTER" | "SPRING";

export const SEASONS: readonly Season[] = ["SUMMER", "AUTUMN", "WINTER", "SPRING"];

type Target = { colour: string; weight: number };
type SeasonMix = { canopy?: Target; trunk?: Target; sky?: Target };

const MIXES: Record<Season, SeasonMix> = {
  SUMMER: {},
  AUTUMN: {
    canopy: { colour: "#d9822b", weight: 0.8 },
    trunk: { colour: "#6b4423", weight: 0.25 },
    sky: { colour: "#f0d9b5", weight: 0.25 },
  },
  WINTER: {
    canopy: { colour: "#f2f6fa", weight: 0.9 },
    trunk: { colour: "#9aa8b5", weight: 0.25 },
    sky: { colour: "#dfe8f0", weight: 0.3 },
  },
  SPRING: {
    canopy: { colour: "#b5e06a", weight: 0.45 },
    sky: { colour: "#e6f2e0", weight: 0.2 },
  },
};

const HEX = /^#[0-9a-f]{6}$/i;

export function seasonIndex(s: Season): number {
  return SEASONS.indexOf(s);
}

export function wrapPhase(phase: number): number {
  if (!Number.isFinite(phase)) return 0;
  return ((phase % 4) + 4) % 4;
}

export function shortestPhaseTarget(phase: number, season: Season): number {
  if (!Number.isFinite(phase)) phase = 0;
  const delta = wrapPhase(seasonIndex(season) - phase);
  // A tie (delta 2) goes forward, so Summer -> Winter passes through Autumn.
  return phase + (delta <= 2 ? delta : delta - 4);
}

const decode = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const encode = (l: number) => {
  const s = l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, s)) * 255);
};

export function mixHex(a: string, b: string, w: number): string {
  if (!HEX.test(a) || !HEX.test(b)) return a;
  const t = Number.isFinite(w) ? Math.min(1, Math.max(0, w)) : 0;
  let out = "#";
  for (const i of [1, 3, 5]) {
    const la = decode(parseInt(a.slice(i, i + 2), 16));
    const lb = decode(parseInt(b.slice(i, i + 2), 16));
    out += encode(la + (lb - la) * t).toString(16).padStart(2, "0");
  }
  return out;
}

export function seasonColour(summer: string, region: ShapeRegion, season: Season): string {
  if (region === "body") return summer;
  const t = MIXES[season][region];
  return t ? mixHex(summer, t.colour, t.weight) : summer;
}

function tween(at: (s: Season) => string, phase: number): string {
  const p = wrapPhase(phase);
  const i = Math.floor(p);
  const f = p - i;
  const from = at(SEASONS[i]);
  return f === 0 ? from : mixHex(from, at(SEASONS[(i + 1) % 4]), f);
}

export function phaseColour(summer: string, region: ShapeRegion, phase: number): string {
  return tween((s) => seasonColour(summer, region, s), phase);
}

function seasonSky(background: string, season: Season): string {
  const t = MIXES[season].sky;
  return t ? mixHex(background, t.colour, t.weight) : background;
}

export function skyColour(background: string, phase: number): string {
  return tween((s) => seasonSky(background, s), phase);
}

export function seasonTheme(theme: Theme, season: Season): Theme {
  const regionColors = { ...theme.regionColors };
  for (const r of Object.keys(regionColors) as ShapeRegion[]) {
    regionColors[r] = seasonColour(theme.regionColors[r], r, season);
  }
  return { ...theme, regionColors, background: seasonSky(theme.background, season) };
}
