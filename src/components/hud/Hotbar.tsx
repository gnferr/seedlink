"use client";

import type { Ref } from "react";
import type { ViewState } from "@/components/scene/CameraRig";
import { HudButton } from "./primitives";

const SLOTS: { id: ViewState; label: string; key: string }[] = [
  { id: "EXPLORE", label: "Explore", key: "1" },
  { id: "REVEAL", label: "Reveal", key: "2" },
  { id: "SCAN", label: "Scan", key: "3" },
];

/** Three view slots. The hotkeys themselves are wired elsewhere; here they are only announced. */
export default function Hotbar({ view, onView, revealRef }: { view: ViewState; onView: (v: ViewState) => void; revealRef: Ref<HTMLButtonElement> }) {
  return (
    <div role="group" aria-label="View" className="grid min-w-0 flex-1 grid-cols-3 gap-2">
      {SLOTS.map((s) => (
        <HudButton
          key={s.id}
          hotbar
          ref={s.id === "REVEAL" ? revealRef : undefined}
          pressed={view === s.id}
          aria-keyshortcuts={s.key}
          onClick={() => onView(s.id)}
          className="hud-slot px-1"
        >
          {s.label}
          <span aria-hidden="true" className="hud-key">
            {s.key}
          </span>
        </HudButton>
      ))}
    </div>
  );
}
