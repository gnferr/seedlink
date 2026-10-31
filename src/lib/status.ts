import { failureReason, type Separation } from "./verify.ts";
import { TOO_SMALL_TO_SCAN } from "./scanFit.ts";

export type FoldPhase = "tree" | "folding" | "folded" | "growing";
export type StatusInput = {
  hasCode: boolean; tooLong: boolean; tooSmall: boolean;
  phase: FoldPhase;
  separation: Separation | null; // only for the current inputs
  gradedNow: boolean;            // graded under the framing on screen now
};

const NO_CODE = "Type or paste a link to grow your island.";
const TOO_LONG = "The text is too long for one QR code. Shorten it to save.";
const NOT_FOLDED = "Fold the tree into your code first, then save.";
const CHECKING = "Checking the code, one moment.";

const graded = (s: StatusInput): Separation | null => (s.gradedNow ? s.separation : null);

/** Why Save is refused, or null when it may save. */
export function saveBlockedReason(s: StatusInput): string | null {
  if (!s.hasCode) return NO_CODE;
  if (s.tooLong) return TOO_LONG;
  if (s.tooSmall) return TOO_SMALL_TO_SCAN;
  if (s.phase !== "folded") return NOT_FOLDED;
  const sep = graded(s);
  if (!sep) return CHECKING;
  if (!sep.separated) return `This code won't scan: ${failureReason(sep)}.`;
  return null;
}

/** The status line under the island. */
export function hintText(s: StatusInput): string {
  if (!s.hasCode) return NO_CODE;
  if (s.tooLong) return TOO_LONG;
  if (s.tooSmall) return TOO_SMALL_TO_SCAN;
  switch (s.phase) {
    case "tree": return "Tap the tree to fold it into your code";
    case "folding": return "Folding…";
    case "growing": return "Growing…";
    case "folded": {
      const sep = graded(s);
      if (!sep) return "Checking the code…";
      if (!sep.separated) return `Won't scan: ${failureReason(sep)}`;
      return "Scans. Tap to grow the tree.";
    }
  }
}

/** The action the hint names; null while the tree is animating. */
export function hintAction(phase: FoldPhase): "Fold into code" | "Grow the tree" | null {
  if (phase === "tree") return "Fold into code";
  if (phase === "folded") return "Grow the tree";
  return null;
}
