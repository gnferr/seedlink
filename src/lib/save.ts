import type { ViewState } from "../components/scene/CameraRig.tsx";

export type SaveTarget = "scan" | "reveal";
export const SAVE_EXPLORE_REASON = "Open Reveal or Scan to save.";

/** `reason === null` means Save is enabled for `target`. */
export function saveState(
  view: ViewState,
  blocked: { scan: string | null; reveal: string | null },
): { target: SaveTarget | null; reason: string | null } {
  if (view === "SCAN") return { target: "scan", reason: blocked.scan };
  if (view === "REVEAL") return { target: "reveal", reason: blocked.reveal };
  // A failure shared by both exports (empty input, unscannable code) explains more than the generic hint.
  const shared = blocked.scan !== null && blocked.scan === blocked.reveal ? blocked.scan : null;
  return { target: null, reason: shared ?? SAVE_EXPLORE_REASON };
}
