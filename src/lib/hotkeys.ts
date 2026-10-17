import type { ViewState } from "../components/scene/CameraRig.tsx";

const KEYS: Record<string, ViewState> = { "1": "EXPLORE", "2": "REVEAL", "3": "SCAN" };
const TYPING = new Set(["INPUT", "SELECT", "TEXTAREA"]);

export function viewForKey(e: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  target: { tagName?: string; isContentEditable?: boolean } | null;
}): ViewState | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.target && (e.target.isContentEditable || TYPING.has((e.target.tagName ?? "").toUpperCase()))) return null;
  return Object.hasOwn(KEYS, e.key) ? KEYS[e.key] : null;
}
