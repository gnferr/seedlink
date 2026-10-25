import type { FoldPhase } from "./status.ts";

/** A pointer that moves no further than this between down and up is a tap, not an orbit drag. */
export const TAP_SLOP_PX = 6;

export function isTap(down: { x: number; y: number }, up: { x: number; y: number }): boolean {
  return Math.hypot(up.x - down.x, up.y - down.y) <= TAP_SLOP_PX;
}

/** What a tap does: fold from the tree, poke the grass, grow from the folded code; nothing mid-animation. */
export function nextFoldTarget(phase: FoldPhase, hit: "tree" | "ground" | "none"): "fold" | "grow" | "poke" | null {
  if (phase === "folded") return "grow";
  if (phase !== "tree") return null;
  return hit === "tree" ? "fold" : hit === "ground" ? "poke" : null;
}
