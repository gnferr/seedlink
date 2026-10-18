/** Fraction of the viewport the fitted object fills; shared by the camera and the scan sampler. */
export const FIT_MARGIN = 0.9;

/** Height covered by controls at the top and bottom of the view, in the caller's pixels. */
export type ScanInsets = { top: number; bottom: number };
export const NO_INSETS: ScanInsets = { top: 0, bottom: 0 };

const clean = (x: number) => Math.max(0, Number.isFinite(x) ? x : 0);

/**
 * The SCAN framing of a width×height view whose top and bottom are covered by controls: the pad (plane
 * units wide, quiet zone included) fits the free band between them, centred in it. `zoom` is pixels per
 * world unit (= the module pitch); `dy` is how far below the view centre the pad centre sits, in pixels.
 * Bad insets (negative, NaN) count as 0; insets that leave no band keep a 1px band so zoom stays positive.
 */
export function scanFit(width: number, height: number, plane: number, insets: ScanInsets = NO_INSETS): { zoom: number; dy: number } {
  const top = clean(insets.top);
  const bottom = clean(insets.bottom);
  const free = Math.max(1, height - top - bottom);
  return { zoom: (Math.min(width, free) / plane) * FIT_MARGIN, dy: (top - bottom) / 2 };
}

/** The insets Scan frames with, and the view size they were measured in. */
export type ScanFrame = { insets: ScanInsets; width: number; height: number };

/**
 * Next Scan framing from a fresh chrome measurement. In Scan, at the same view size, insets only grow: a
 * status line that disappears once the code verifies must not re-frame (and re-check) the code. A new view
 * size, or any view other than Scan, takes the fresh measurement. Returns `prev` itself when nothing changes.
 */
export function nextScanFrame(prev: ScanFrame, chrome: ScanInsets, width: number, height: number, inScan: boolean): ScanFrame {
  const c = { top: clean(chrome.top), bottom: clean(chrome.bottom) };
  const sameSize = prev.width === width && prev.height === height;
  const insets = inScan && sameSize ? { top: Math.max(prev.insets.top, c.top), bottom: Math.max(prev.insets.bottom, c.bottom) } : c;
  return sameSize && insets.top === prev.insets.top && insets.bottom === prev.insets.bottom ? prev : { insets, width, height };
}

/** Identifies the framing a scan check was graded under. */
export const frameKey = (f: ScanFrame) => `${f.insets.top}|${f.insets.bottom}|${f.width}x${f.height}`;
