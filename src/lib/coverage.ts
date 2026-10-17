import { groundW, screenBand, screenU, type Block } from "./solver.ts";
import type { Shape, ShapeRegion } from "./shapes.ts";

export const COVERAGE_GRID = 14;

/** A block's Reveal-view position on the coverage grid; `col`/`top` may fall outside 0..COVERAGE_GRID-1. */
function cellOf(k: Block, size: number, phi: number): { col: number; top: number } {
  const { lo, span } = screenBand(size);
  const uMax = (size - 1) / Math.SQRT2;
  const a = (screenU(k.x, k.z) + uMax) / (2 * uMax);
  const v = k.y * Math.cos(phi) - groundW(k.x, k.z, size) * Math.sin(phi);
  return { col: Math.floor(a * COVERAGE_GRID), top: Math.floor(((v - lo) / span) * COVERAGE_GRID) };
}

/**
 * Fraction of the shape's filled grid cells (sampled at cell centres on a COVERAGE_GRID square)
 * that at least one block projects into in the Reveal view. `region` restricts it to that region's cells.
 */
export function silhouetteCoverage(
  blocks: Block[],
  size: number,
  shape: Shape,
  elevationDeg: number,
  region?: ShapeRegion,
): number {
  const phi = (elevationDeg * Math.PI) / 180;
  const n = COVERAGE_GRID;
  const hit = new Uint8Array(n * n);
  for (const k of blocks) {
    const { col, top } = cellOf(k, size, phi);
    if (col < 0 || col >= n) continue;
    // A grounded block is a pillar from the floor; a floating one marks only its own cell.
    for (let r = k.grounded ? 0 : top; r <= top; r++) if (r >= 0 && r < n) hit[r * n + col] = 1;
  }
  let filled = 0;
  let covered = 0;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const m = shape.mask((c + 0.5) / n, (r + 0.5) / n);
      if (!m || (region && m !== region)) continue;
      filled++;
      covered += hit[r * n + c];
    }
  }
  return filled === 0 ? 0 : covered / filled;
}

/** Fraction of blocks whose own cell is empty in the shape (outside the grid counts as empty). No blocks -> 0. */
export function silhouetteSpill(blocks: Block[], size: number, shape: Shape, elevationDeg: number): number {
  if (blocks.length === 0) return 0;
  const phi = (elevationDeg * Math.PI) / 180;
  const n = COVERAGE_GRID;
  let spill = 0;
  for (const k of blocks) {
    const { col, top } = cellOf(k, size, phi);
    if (col < 0 || col >= n || top < 0 || top >= n || !shape.mask((col + 0.5) / n, (top + 0.5) / n)) spill++;
  }
  return spill / blocks.length;
}
