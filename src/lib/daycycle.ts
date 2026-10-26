export type Period = "Dawn" | "Day" | "Sunset" | "Dusk" | "Night";
export type RGB = [number, number, number];
export type SkyState = {
  sun: { x: number; y: number; up: boolean }; moon: { x: number; y: number; up: boolean }; // x,y in [0,1] screen space, y down
  sky: [RGB, RGB, RGB, RGB]; light: RGB; ambient: RGB; haze: RGB; cloudLit: RGB; cloudDark: RGB;
  starAlpha: number; night: number; keyFromLeft: boolean;
};

const START = 6, SPAN = 17; // slider runs linearly 06:00 -> 23:00
const hoursAt = (t: number) => START + Math.min(1, Math.max(0, t)) * SPAN;

export function timeFromClock(hours: number, minutes: number): number {
  const h = hours + minutes / 60;
  return h >= 23 || h < START ? 1 : (h - START) / SPAN;
}

export function clockFromTime(t: number): { hours: number; minutes: number } {
  const total = Math.round(hoursAt(t) * 60);
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}

export function periodAt(t: number): Period {
  const h = hoursAt(t);
  return h < 8 ? "Dawn" : h < 17.5 ? "Day" : h < 19.5 ? "Sunset" : h < 21 ? "Dusk" : "Night";
}

export function timeLabel(t: number): string {
  const { hours, minutes } = clockFromTime(t);
  return `${periodAt(t)}, ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

const rgb = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a: RGB, b: RGB, f: number): RGB => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
const smooth = (a: number, b: number, x: number) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

// Mockup keyframes re-placed at Dawn 06:00, Day 08:00, Afternoon 15:00, Sunset 18:30, Dusk 20:00, Night 23:00.
const KF = ([
  [6, ["#2c3866", "#7a86b8", "#e2b8c0", "#fbd8bc"], "#ffd8b0", "#e8c8d8", "#d8c8dc", "#ffe6dc", "#8c88b4"],
  [8, ["#3f6fc4", "#6f9ad8", "#b8d0ec", "#e6eef6"], "#fff8e0", "#ffffff", "#c8d6ec", "#ffffff", "#9cb0cc"],
  [15, ["#3a66b8", "#6a94d2", "#b4cce8", "#e2eaf4"], "#fff6dc", "#fffaf0", "#c8d6ec", "#ffffff", "#9aaccc"],
  [18.5, ["#2b2f5a", "#6b4f78", "#e07a62", "#ffd08a"], "#ffc070", "#ffc8a0", "#d9937e", "#ffd2a0", "#5c3e5e"],
  [20, ["#141a3a", "#2c2f5c", "#6a5a82", "#c08a8c"], "#d8a0a8", "#a8a0d0", "#7c6a94", "#c8a0b0", "#34365c"],
  [23, ["#03050f", "#0a1228", "#1a2646", "#2c3a60"], "#c9d8ff", "#6f84c8", "#4a5c8e", "#5c6c98", "#141c34"],
] as const).map(([h, sky, light, amb, haze, lit, dark]) => ({
  t: (h - START) / SPAN, sky: sky.map(rgb) as RGB[], light: rgb(light), amb: rgb(amb), haze: rgb(haze), lit: rgb(lit), dark: rgb(dark),
}));

export function skyState(t: number): SkyState {
  t = clamp01(t);
  const h = hoursAt(t);
  let i = 0;
  while (i < KF.length - 2 && t > KF[i + 1].t) i++;
  const a = KF[i], b = KF[i + 1], f = clamp01((t - a.t) / (b.t - a.t));
  const sk = clamp01((h - 6) / 13.5); // sun: 06:00 -> 19:30
  const mk = clamp01((h - 18.5) / 6.2); // moon rises 18:30; mockup's arc, not finished by 23:00
  const sun = { x: 0.06 + 0.88 * sk, y: 0.94 - 0.82 * Math.sin(Math.PI * sk), up: h <= 19.5 };
  const moon = { x: 0.06 + 0.8 * mk, y: 0.94 - 0.8 * Math.sin(Math.PI * mk * 0.9), up: h > 18.5 };
  const night = smooth(19, 21.5, h);
  const src = sun.up ? sun : moon;
  return {
    sun, moon,
    sky: a.sky.map((c, k) => mix(c, b.sky[k], f)) as SkyState["sky"],
    light: mix(a.light, b.light, f), ambient: mix(a.amb, b.amb, f), haze: mix(a.haze, b.haze, f),
    cloudLit: mix(a.lit, b.lit, f), cloudDark: mix(a.dark, b.dark, f),
    starAlpha: night, night, keyFromLeft: src.x < 0.5,
  };
}
