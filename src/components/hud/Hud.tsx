"use client";

import { useEffect, useRef } from "react";
import type { ViewState } from "@/components/scene/CameraRig";
import ColorField from "@/components/controls/ColorField";
import { SHAPES } from "@/lib/shapes";
import { ELEVATION_MAX_DEG, ELEVATION_MIN_DEG } from "@/lib/solver";
import { THEMES, type ThemeId } from "@/lib/themes";
import type { Separation } from "@/lib/verify";
import AlignmentBar from "./AlignmentBar";
import Hotbar from "./Hotbar";
import StatusPlaque from "./StatusPlaque";
import { HudButton, HudIcon } from "./primitives";

export type ColorKey = "trunk" | "canopy" | "light" | "background";

const COLOR_LABELS: Record<ColorKey, string> = {
  trunk: "Trunk",
  canopy: "Canopy",
  light: "Base",
  background: "Background",
};

function exportNote({ scan, reveal }: { scan: string | null; reveal: string | null }, verified: boolean): string {
  if (scan !== null && scan === reveal) return `Export blocked. ${scan}`;
  return [verified ? "Ready: the code scans." : "Export blocked.", scan, reveal].filter(Boolean).join(" ");
}

export default function Hud({
  input,
  onInput,
  shapeId,
  onShape,
  themeId,
  onTheme,
  colors,
  onColor,
  elevation,
  onElevation,
  view,
  onView,
  proximity,
  separation,
  blocked,
  verified,
  exportError,
  onExportPng,
  onExportGlb,
  onExportReveal,
  sculpture,
  collapsed,
  onCollapsed,
  className = "",
}: {
  input: string;
  onInput: (v: string) => void;
  shapeId: string;
  onShape: (id: string) => void;
  themeId: ThemeId;
  onTheme: (id: ThemeId) => void;
  colors: Record<ColorKey, string>;
  onColor: (key: ColorKey, hex: string) => void;
  elevation: number;
  onElevation: (deg: number) => void;
  view: ViewState;
  onView: (v: ViewState) => void;
  /** 0..1 closeness to the reveal angle; null when not meaningful (outside a settled Explore). */
  proximity: number | null;
  separation: Separation | null;
  /** Per export group, null when allowed, else why not and how to fix it. `scan` covers the scan PNG and the model. */
  blocked: { scan: string | null; reveal: string | null };
  /** The current inputs passed the scan check. */
  verified: boolean;
  exportError: string | null;
  onExportPng: () => void;
  onExportGlb: () => void;
  onExportReveal: () => void;
  /** Size of the current sculpture; null with no code. */
  sculpture: { blocks: number; modules: number } | null;
  /** null = auto: CSS expands it from `md` up and docks it below. The first toggle makes it explicit. */
  collapsed: boolean | null;
  onCollapsed: (c: boolean) => void;
  className?: string;
}) {
  const revealRef = useRef<HTMLButtonElement>(null);
  const auto = collapsed === null;
  const bodyHidden = collapsed === true ? "hidden" : auto ? "max-md:hidden" : "";
  // Only the click needs the real answer for "auto"; render stays CSS-only.
  const toggleRef = useRef<HTMLButtonElement>(null);
  // In auto mode CSS decides, so keep aria-expanded in step with the same breakpoint straight on the DOM node (no state).
  useEffect(() => {
    const el = toggleRef.current;
    if (!auto || !el) return;
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => el.setAttribute("aria-expanded", String(mq.matches));
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [auto]);
  const toggle = () => onCollapsed(!(collapsed ?? !window.matchMedia("(min-width: 768px)").matches));

  return (
    <section aria-label="Controls" className={`flex flex-col gap-2 overflow-y-auto overscroll-contain pr-1 ${className}`}>
      <div className="flex items-start gap-2">
        <Hotbar view={view} onView={onView} revealRef={revealRef} />
        <HudButton ref={toggleRef} onClick={toggle} aria-controls="hud-body" aria-expanded={auto ? undefined : !collapsed} className="w-11 shrink-0 px-0">
          {(auto || collapsed) && (
            <>
              <HudIcon name="expand" className={auto ? "md:hidden" : ""} />
              <span className={auto ? "sr-only md:hidden" : "sr-only"}>Expand controls</span>
            </>
          )}
          {(auto || !collapsed) && (
            <>
              <HudIcon name="collapse" className={auto ? "max-md:hidden" : ""} />
              <span className={auto ? "sr-only max-md:hidden" : "sr-only"}>Collapse controls</span>
            </>
          )}
        </HudButton>
      </div>

      <StatusPlaque separation={separation} checked={view === "SCAN"} hasCode={sculpture !== null} />

      <div className={`hud-panel flex flex-col mb-1 gap-3 p-3 ${bodyHidden}`} id="hud-body">
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="qr-input" className="hud-label">
              Link or text
            </label>
            <span className="font-mono text-xs tabular-nums" aria-live="off">
              {input.length} {input.length === 1 ? "character" : "characters"}
            </span>
          </div>
          <input
            id="qr-input"
            value={input}
            onChange={(e) => onInput(e.target.value)}
            onFocus={(e) => e.target.select()}
            placeholder="https://your-link.example"
            spellCheck={false}
            autoComplete="off"
            className="hud-field"
          />
        </div>

        {proximity !== null && (
          <AlignmentBar
            proximity={proximity}
            onSnap={() => {
              onView("REVEAL");
              // The snap button unmounts once Reveal starts; keep focus on the slot that now holds the state.
              revealRef.current?.focus();
            }}
          />
        )}

        <fieldset className="grid grid-cols-2 gap-x-3 gap-y-3">
          <legend className="hud-label mb-2">Palette</legend>
          {(Object.keys(COLOR_LABELS) as ColorKey[]).map((k) => (
            <ColorField key={k} label={COLOR_LABELS[k]} value={colors[k]} onChange={(hex) => onColor(k, hex)} />
          ))}
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex min-w-0 flex-col gap-2">
            <label htmlFor="qr-shape" className="hud-label">
              Shape
            </label>
            <select id="qr-shape" value={shapeId} onChange={(e) => onShape(e.target.value)} className="hud-field">
              {Object.values(SHAPES).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <label htmlFor="qr-theme" className="hud-label">
              Theme
            </label>
            <select id="qr-theme" value={themeId} onChange={(e) => onTheme(e.target.value as ThemeId)} className="hud-field">
              {Object.entries(THEMES).map(([id, t]) => (
                <option key={id} value={id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <label htmlFor="qr-elevation" className="hud-label">
              Reveal elevation
            </label>
            <span className="font-mono text-sm tabular-nums">{elevation}°</span>
          </div>
          <input
            id="qr-elevation"
            type="range"
            min={ELEVATION_MIN_DEG}
            max={ELEVATION_MAX_DEG}
            step={1}
            value={elevation}
            aria-valuetext={`${elevation} degrees`}
            onChange={(e) => onElevation(Number(e.target.value))}
            className="w-full"
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className="hud-label">Export</span>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "PNG (scan)", run: onExportPng, gate: blocked.scan },
              { label: ".glb model", run: onExportGlb, gate: blocked.scan },
              { label: "PNG (reveal)", run: onExportReveal, gate: blocked.reveal },
            ].map((b) => (
              <HudButton key={b.label} disabled={b.gate !== null} aria-describedby="export-note" onClick={b.run} className="hud-tight">
                {b.label}
              </HudButton>
            ))}
          </div>
          <p id="export-note" className="text-sm">
            {exportError ?? exportNote(blocked, verified)}
          </p>
        </div>

        {sculpture && (
          <p className="text-sm">
            {sculpture.blocks} blocks · {sculpture.modules}×{sculpture.modules} modules. Longer links give a finer
            sculpture. The tree only lines up in this on-screen view; a photo of a printed copy won&rsquo;t.
          </p>
        )}
      </div>
    </section>
  );
}
