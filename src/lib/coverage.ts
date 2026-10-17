import { groundW, screenBand, screenU, type Block } from "./solver.ts";
import type { Shape } from "./shapes.ts";

export const COVERAGE_GRID = 14;

/** Fraction of the shape's filled grid cells (sampled at cell centres on a COVERAGE_GRID square) that at least one block projects into in the Reveal view. */
export function silhouetteCoverage(blocks: Block[], size: number, shape: Shape, elevationDeg: number): number {
  const phi = (elevationDeg * Math.PI) / 180;
  const { lo, span } = screenBand(size);
  const uMax = (size - 1) / Math.SQRT2;
  const n = COVERAGE_GRID;
  const hit = new Uint8Array(n * n);
  for (const k of blocks) {
    const a = (screenU(k.x, k.z) + uMax) / (2 * uMax);
    const v = k.y * Math.cos(phi) - groundW(k.x, k.z, size) * Math.sin(phi);
    const b = (v - lo) / span;
    const col = Math.floor(a * n);
    const top = Math.floor(b * n);
    if (col < 0 || col >= n) continue;
    // A grounded block is a pillar from the floor; a floating one marks only its own cell.
    for (let r = k.grounded ? 0 : top; r <= top; r++) if (r >= 0 && r < n) hit[r * n + col] = 1;
  }
  let filled = 0;
  let covered = 0;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!shape.mask((c + 0.5) / n, (r + 0.5) / n)) continue;
      filled++;
      covered += hit[r * n + c];
    }
  }
  return filled === 0 ? 0 : covered / filled;
}
