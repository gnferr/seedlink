export type ShapeRegion = "trunk" | "canopy" | "body";

export interface Shape {
  id: string;
  label: string;
  mask: (a: number, b: number) => ShapeRegion | null;
}

function minecraftTreeMask(a: number, b: number): ShapeRegion | null {
  // Trunk: column at |a - 0.5| < 0.06, spanning b ∈ [0, 0.42)
  if (Math.abs(a - 0.5) < 0.06 && b >= 0 && b < 0.42) {
    return "trunk";
  }

  // Canopy: three overlapping discs
  const discs = [
    { cx: 0.5, cy: 0.66, r: 0.29 },
    { cx: 0.33, cy: 0.53, r: 0.22 },
    { cx: 0.67, cy: 0.53, r: 0.22 },
  ];

  for (const disc of discs) {
    const dx = a - disc.cx;
    const dy = b - disc.cy;
    const distSq = dx * dx + dy * dy;
    if (distSq < disc.r * disc.r) {
      return "canopy";
    }
  }

  return null;
}

export const SHAPES: Record<string, Shape> = {
  MINECRAFT_TREE: {
    id: "MINECRAFT_TREE",
    label: "Minecraft Tree",
    mask: minecraftTreeMask,
  },
};

export const DEFAULT_SHAPE_ID = "MINECRAFT_TREE";
