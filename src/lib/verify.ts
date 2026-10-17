/** Worst-case dark/light contrast below which a code is refused, even when the populations are ordered. */
export const MIN_SCAN_CONTRAST = 3;

export type Separation = { matched: number; total: number; worstCaseContrast: number; separated: boolean };

function linearise(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2 relative luminance of an sRGB colour, channels 0-255. */
export function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);
}

/** WCAG contrast ratio; argument order does not matter. */
export function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Judges whether dark and light module luminances (0-255 luma) are cleanly split.
 * `matched` counts samples on the correct side of the midpoint between the brightest
 * dark and the dimmest light; `total` is the number of samples in both arrays. `separated` needs
 * the populations ordered and their closest pair at least MIN_SCAN_CONTRAST apart.
 */
export function classifySeparation(darkLums: number[], lightLums: number[]): Separation {
  const total = darkLums.length + lightLums.length;
  if (darkLums.length === 0 || lightLums.length === 0) {
    return { matched: 0, total, worstCaseContrast: 1, separated: false };
  }
  const brightestDark = Math.max(...darkLums);
  const dimmestLight = Math.min(...lightLums);
  const threshold = (brightestDark + dimmestLight) / 2;
  const matched =
    darkLums.filter((v) => v <= threshold).length + lightLums.filter((v) => v > threshold).length;
  const worstCaseContrast = contrastRatio(
    relativeLuminance(brightestDark, brightestDark, brightestDark),
    relativeLuminance(dimmestLight, dimmestLight, dimmestLight),
  );
  return {
    matched,
    total,
    worstCaseContrast,
    // NaN fails both comparisons, so an off-buffer sample never passes.
    separated: brightestDark < dimmestLight && worstCaseContrast >= MIN_SCAN_CONTRAST,
  };
}

/** Why a failed check failed, in words; empty for a pass. */
export function failureReason(s: Separation): string {
  if (s.separated) return "";
  if (!Number.isFinite(s.worstCaseContrast)) return "part of the code is out of view";
  if (s.worstCaseContrast < MIN_SCAN_CONTRAST)
    return `contrast ${s.worstCaseContrast.toFixed(1)}:1, needs ${MIN_SCAN_CONTRAST}:1`;
  return "dark and light modules overlap";
}
