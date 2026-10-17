"use client";

import { failureReason, type Separation } from "@/lib/verify";
import { HudIcon, type HudIconName } from "./primitives";

// The idle line deliberately avoids "modules" and "Checking": tests and users filter on those words.
export default function StatusPlaque({ separation, checked, hasCode = true }: { separation: Separation | null; checked: boolean; hasCode?: boolean }) {
  const icon: HudIconName = separation === null ? "wait" : separation.separated ? "ok" : "bad";
  const label =
    separation === null
      ? !hasCode
        ? "No code to check yet."
        : checked
        ? "Checking…"
        : "Not checked yet — open Scan to check the code."
      : separation.separated
        ? `Scans — ${separation.matched}/${separation.total} modules, ${separation.worstCaseContrast.toFixed(1)}:1`
        : `Won't scan — ${failureReason(separation)} · ${separation.matched}/${separation.total} modules`;
  return (
    <p role="status" aria-live="polite" className="hud-panel mr-1 mb-1 flex items-center gap-2 px-3 py-2 text-sm font-semibold max-md:py-1.5 max-md:text-xs max-md:leading-4">
      <HudIcon name={icon} />
      {label}
    </p>
  );
}
