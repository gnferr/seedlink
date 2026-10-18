"use client";

import { TOO_SMALL_TO_SCAN } from "@/lib/scanFit";
import { failureReason, type Separation } from "@/lib/verify";
import { HudIcon, type HudIconName } from "./primitives";

// The idle line deliberately avoids "modules" and "Checking": tests and users filter on those words.
export default function StatusPlaque({
  separation,
  checked,
  hasCode = true,
  tooSmall = false,
}: {
  separation: Separation | null;
  checked: boolean;
  hasCode?: boolean;
  /** Scan can't give each module enough pixels at this size; replaces any verdict. */
  tooSmall?: boolean;
}) {
  const icon: HudIconName = tooSmall ? "bad" : separation === null ? "wait" : separation.separated ? "ok" : "bad";
  const label = tooSmall
    ? TOO_SMALL_TO_SCAN
    : separation === null
      ? !hasCode
        ? "No code to check yet."
        : checked
        ? "Checking…"
        : "Not checked yet — open Scan to check the code."
      : separation.separated
        ? `Scans — ${separation.matched}/${separation.total} modules, ${separation.worstCaseContrast.toFixed(1)}:1`
        : (
          <>
            {`Won't scan — ${failureReason(separation)}`}
            {/* Dropped visually on phones to keep the status slot short; the status text still announces it. */}
            <span className="max-md:hidden">{` · ${separation.matched}/${separation.total} modules`}</span>
          </>
        );
  return (
    <p role="status" aria-live="polite" className="hud-panel mr-1 mb-1 flex min-w-0 flex-none items-center gap-2 px-3 py-2 text-sm font-semibold max-md:mb-0 max-md:py-0.5 max-md:text-[13px] max-md:leading-4">
      <HudIcon name={icon} />
      <span className="min-w-0 max-md:line-clamp-2">{label}</span>
    </p>
  );
}
