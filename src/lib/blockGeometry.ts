import type { Block } from "./solver";

export const BLOCK_HEIGHT = 1.6;
export const HALF_BLOCK = BLOCK_HEIGHT / 2;

/**
 * Centre and height of a unit-footprint box for a block, grid-centred by `offset`. Grounded blocks
 * become pillars from the plane to the block's top so nothing floats; the render and the .glb share this.
 */
export function blockBox(b: Block, offset: number): { x: number; y: number; z: number; h: number } {
  if (!b.grounded) return { x: b.x - offset, y: b.y, z: b.z - offset, h: BLOCK_HEIGHT };
  const h = Math.max(HALF_BLOCK, b.y + HALF_BLOCK);
  return { x: b.x - offset, y: h / 2, z: b.z - offset, h };
}
