/** Fraction of the viewport the fitted object fills; shared by the camera and the scan sampler. */
export const FIT_MARGIN = 0.9;

/** Height covered by controls at the top and bottom of the view, in the caller's pixels. */
export type ScanInsets = { top: number; bottom: number };
export const NO_INSETS: ScanInsets = { top: 0, bottom: 0 };

/**
 * The SCAN framing of a width×height view whose top and bottom are covered by controls: the pad (plane
 * units wide, quiet zone included) fits the free band between them, centred in it. `zoom` is pixels per
 * world unit (= the module pitch); `dy` is how far below the view centre the pad centre sits, in pixels.
 */
export function scanFit(width: number, height: number, plane: number, insets: ScanInsets = NO_INSETS): { zoom: number; dy: number } {
  const free = Math.max(1, height - insets.top - insets.bottom);
  return { zoom: (Math.min(width, free) / plane) * FIT_MARGIN, dy: (insets.top - insets.bottom) / 2 };
}
