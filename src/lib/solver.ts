import { QUIET_ZONE, type QrMatrix } from "./qr.ts";
import type { Shape, ShapeRegion } from "./shapes.ts";

export const ELEVATION_MIN_DEG = 15;
export const ELEVATION_MAX_DEG = 60;

export type Block = {
  x: number;
  z: number;
  /** World height of the block's centre. */
  y: number;
  grounded: boolean;
  region: ShapeRegion | null;
};

/** Vertical samples of the mask per screen column; 60 intervals = 61 samples. */
const SAMPLE_STEPS = 60;

/** Two samples further apart than this are a gap in the shape, not a contiguous run. */
const CONTIGUOUS_GAP = 1.5 / SAMPLE_STEPS;

/** The shape's floor must be no higher than this to count as touching the plane. */
const CONTACT_B = 0.1;

/**
 * Centre height for a block with nowhere to go. One block tall keeps it clear of
 * the plane while staying visually quiet.
 */
const MIN_HEIGHT = 0.8;

/**
 * Fraction of the plane span the shape's floor sits at. Chosen so `lo` clears the
 * farthest cell's `w·sin φ` at the default elevation for every matrix size — the
 * floor clamp catches the far corner at steeper angles.
 */
const BAND_LO_RATIO = 0.36;

/** Horizontal screen position — fixed by the cell, never by the solver. */
export function screenU(x: number, z: number): number {
  return (x - z) / Math.SQRT2;
}

/** Ground depth: how far the cell lies from the viewer along the reveal axis. */
export function groundW(x: number, z: number, size: number): number {
  return (x + z - (size - 1)) / Math.SQRT2;
}

/** Inverse of `v = y·cos φ - w·sin φ`. */
export function heightFor(v: number, w: number, elevationRad: number): number {
  return (v + w * Math.sin(elevationRad)) / Math.cos(elevationRad);
}

export function screenBand(size: number): { lo: number; span: number } {
  const plane = size + QUIET_ZONE * 2;
  return { lo: plane * BAND_LO_RATIO, span: plane * (1 - BAND_LO_RATIO) };
}

type Sample = { b: number; region: ShapeRegion };

export function solve(
  matrix: QrMatrix,
  shape: Shape,
  elevationDeg: number,
): Block[] {
  const { cells, size } = matrix;
  const elevationRad =
    (Math.min(ELEVATION_MAX_DEG, Math.max(ELEVATION_MIN_DEG, elevationDeg)) *
      Math.PI) /
    180;
  const band = screenBand(size);
  const uMax = (size - 1) / Math.SQRT2;

  const columns = new Map<number, Array<{ x: number; z: number }>>();
  let total = 0;
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      if (!cells[z * size + x]) continue;
      total++;
      const key = Math.round(screenU(x, z) * Math.SQRT2);
      const members = columns.get(key);
      if (members) members.push({ x, z });
      else columns.set(key, [{ x, z }]);
    }
  }

  const blocks: Block[] = new Array(total);
  let n = 0;

  for (const [key, members] of columns) {
    const a = uMax === 0 ? 0.5 : (key / Math.SQRT2 + uMax) / (2 * uMax);

    const filled: Sample[] = [];
    for (let i = 0; i <= SAMPLE_STEPS; i++) {
      const b = i / SAMPLE_STEPS;
      const region = shape.mask(a, b);
      if (region) filled.push({ b, region });
    }

    if (filled.length === 0) {
      for (const { x, z } of members) {
        blocks[n++] = { x, z, y: MIN_HEIGHT, grounded: false, region: null };
      }
      continue;
    }

    // Only the run of shape that rises unbroken from the floor may become real
    // columns. A region change ends the run too: grounding the canopy would fill
    // the gap above the trunk that makes the tree read as a tree.
    let groundTop = -1;
    if (filled[0].b <= CONTACT_B) {
      groundTop = filled[0].b;
      for (let i = 1; i < filled.length; i++) {
        if (
          filled[i].b - filled[i - 1].b > CONTIGUOUS_GAP ||
          filled[i].region !== filled[0].region
        ) {
          break;
        }
        groundTop = filled[i].b;
      }
    }

    // Far cells low, near cells high, so a nearer block never hides one behind it.
    members.sort((p, q) => groundW(p.x, p.z, size) - groundW(q.x, q.z, size));

    for (let k = 0; k < members.length; k++) {
      const { x, z } = members[k];
      const pos = (k * filled.length) / members.length;
      const slot = filled[Math.floor(pos)];
      // The fractional part spreads cells sharing a slot across it, so a crowded
      // column thickens the shape instead of stacking blocks on one screen pixel.
      const b = slot.b + (pos - Math.floor(pos)) / SAMPLE_STEPS;
      const y = heightFor(band.lo + b * band.span, groundW(x, z, size), elevationRad);
      blocks[n++] = {
        x,
        z,
        y: Math.max(MIN_HEIGHT, y),
        grounded: slot.b <= groundTop,
        region: slot.region,
      };
    }
  }

  return blocks;
}
