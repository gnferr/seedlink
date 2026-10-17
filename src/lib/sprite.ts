import type { Shape, ShapeRegion } from "./shapes.ts";

export type SpriteSpec = {
  id: string;
  label: string;
  rows: readonly string[];
  legend: Readonly<Record<string, ShapeRegion>>;
};

const REGIONS: readonly string[] = ["trunk", "canopy", "body"];

export function validateSprite(spec: SpriteSpec): void {
  const { id, rows, legend } = spec;
  if (!id) throw new Error("sprite needs a non-empty id");
  if (rows.length < 8) throw new Error(`sprite ${id}: needs at least 8 rows`);
  const width = rows[0].length;
  if (width < 8) throw new Error(`sprite ${id}: needs at least 8 columns`);
  for (const r of rows) {
    if (r.length !== width) throw new Error(`sprite ${id}: ragged rows`);
    for (const ch of r) {
      if (ch !== "." && !(ch in legend)) {
        throw new Error(`sprite ${id}: character "${ch}" missing from legend`);
      }
    }
  }
  for (const [k, v] of Object.entries(legend)) {
    if (!REGIONS.includes(v)) throw new Error(`sprite ${id}: legend "${k}" has invalid region`);
  }
  if (/^\.*$/.test(rows[rows.length - 1])) {
    throw new Error(`sprite ${id}: cannot ground, bottom row has no filled cell`);
  }
}

export function defineSprite(spec: SpriteSpec): Shape & { width: number; height: number } {
  validateSprite(spec);
  const { rows, legend } = spec;
  const width = rows[0].length;
  const height = rows.length;
  return {
    id: spec.id,
    label: spec.label,
    width,
    height,
    mask(a, b) {
      if (!(a >= 0 && a <= 1 && b >= 0 && b <= 1)) return null; // also rejects NaN
      const col = Math.min(width - 1, Math.floor(a * width));
      const row = Math.min(height - 1, Math.floor((1 - b) * height));
      const ch = rows[row][col];
      return ch === "." ? null : legend[ch];
    },
  };
}
