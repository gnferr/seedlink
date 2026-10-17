"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import type { ViewState } from "@/components/scene/CameraRig";
import StatusPlaque from "@/components/hud/StatusPlaque";
import { SHAPES } from "@/lib/shapes";
import { ELEVATION_MAX_DEG, ELEVATION_MIN_DEG } from "@/lib/solver";
import { THEMES, type ThemeId } from "@/lib/themes";
import type { Separation } from "@/lib/verify";
import ColorField from "./ColorField";

export type ColorKey = "trunk" | "canopy" | "light" | "background";

const COLOR_LABELS: Record<ColorKey, string> = {
  trunk: "Trunk",
  canopy: "Canopy",
  light: "Base",
  background: "Background",
};

const VIEWS: { id: ViewState; label: string }[] = [
  { id: "EXPLORE", label: "Explore" },
  { id: "REVEAL", label: "Reveal" },
  { id: "SCAN", label: "Scan" },
];

/** Proximity at which the snap is offered as the obvious next step. */
const CLOSE = 0.75;

const LABEL = "text-sm font-medium text-zinc-800 dark:text-zinc-200";
const FIELD =
  "h-10 w-full rounded-md border border-zinc-500 bg-white px-3 text-base text-zinc-900 " +
  "dark:bg-zinc-950 dark:text-zinc-50";

function proximityText(p: number): string {
  if (p >= 0.97) return "On the reveal angle";
  if (p >= CLOSE) return "Almost there";
  if (p > 0) return "Getting warmer";
  return "Orbit to find the tree";
}

function exportNote({ scan, reveal }: { scan: string | null; reveal: string | null }, verified: boolean): string {
  if (scan !== null && scan === reveal) return `Export blocked. ${scan}`;
  return [verified ? "Ready: the code scans." : "Export blocked.", scan, reveal].filter(Boolean).join(" ");
}

export default function ControlPanel({
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
  className?: string;
}) {
  const snapRef = useRef<HTMLButtonElement>(null);
  const revealRef = useRef<HTMLButtonElement>(null);
  const close = proximity !== null && proximity >= CLOSE;

  // The one authored moment: the snap button answers when the user finds the angle.
  useEffect(() => {
    const el = snapRef.current;
    if (!close || !el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const tween = gsap.fromTo(el, { scale: 0.9 }, { scale: 1, duration: 0.6, ease: "expo.out" });
    return () => {
      tween.revert();
    };
  }, [close]);

  return (
    <section
      aria-label="Controls"
      className={`flex flex-col gap-5 overflow-y-auto overscroll-contain rounded-xl border border-zinc-400 bg-white p-4 text-zinc-900 shadow-[0_8px_24px_-8px_rgb(0_0_0/0.25)] dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50 ${className}`}
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="qr-input" className={LABEL}>
            Link or text
          </label>
          <span className="text-xs tabular-nums text-zinc-600 dark:text-zinc-400" aria-live="off">
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
          className={`${FIELD} placeholder:text-zinc-500 dark:placeholder:text-zinc-400`}
        />
      </div>

      <div className="flex flex-col gap-3">
        <div role="group" aria-label="View" className="grid grid-cols-3 gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              ref={v.id === "REVEAL" ? revealRef : undefined}
              type="button"
              aria-pressed={view === v.id}
              onClick={() => onView(v.id)}
              className="h-9 rounded-md text-sm font-medium text-zinc-700 transition-colors hover:bg-white hover:text-zinc-900 aria-pressed:bg-zinc-900 aria-pressed:text-white dark:text-zinc-300 dark:hover:bg-zinc-700 dark:hover:text-white dark:aria-pressed:bg-zinc-50 dark:aria-pressed:text-zinc-900"
            >
              {v.label}
            </button>
          ))}
        </div>

        {proximity !== null && (
          <div className="flex items-center gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-sm text-zinc-700 dark:text-zinc-300">{proximityText(proximity)}</span>
              <div
                role="meter"
                aria-label="Closeness to the reveal angle"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(proximity * 100)}
                className="h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700"
              >
                <div
                  className={`h-full rounded-full transition-[width,background-color] duration-150 ${close ? "bg-green-700 dark:bg-green-400" : "bg-zinc-500 dark:bg-zinc-300"}`}
                  style={{ width: `${Math.round(proximity * 100)}%` }}
                />
              </div>
            </div>
            <button
              ref={snapRef}
              type="button"
              onClick={() => {
                onView("REVEAL");
                // This button unmounts once Reveal starts; keep focus on the control that now holds the state.
                revealRef.current?.focus();
              }}
              className={`h-9 shrink-0 rounded-md px-3 text-sm font-medium transition-colors ${
                close
                  ? "bg-green-800 text-white hover:bg-green-900 dark:bg-green-400 dark:text-zinc-950 dark:hover:bg-green-300"
                  : "border border-zinc-500 text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
              }`}
            >
              Snap to reveal
            </button>
          </div>
        )}

        <StatusPlaque separation={separation} checked={view === "SCAN"} hasCode={sculpture !== null} />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <label htmlFor="qr-elevation" className={LABEL}>
            Reveal elevation
          </label>
          <span className="text-sm tabular-nums text-zinc-700 dark:text-zinc-300">{elevation}°</span>
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

      <div className="grid gap-3 min-[420px]:grid-cols-2 md:grid-cols-1">
        <div className="flex flex-col gap-2">
          <label htmlFor="qr-shape" className={LABEL}>
            Shape
          </label>
          <select id="qr-shape" value={shapeId} onChange={(e) => onShape(e.target.value)} className={FIELD}>
            {Object.values(SHAPES).map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="qr-theme" className={LABEL}>
            Theme
          </label>
          <select id="qr-theme" value={themeId} onChange={(e) => onTheme(e.target.value as ThemeId)} className={FIELD}>
            {Object.entries(THEMES).map(([id, t]) => (
              <option key={id} value={id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className={`${LABEL} mb-2`}>Colours</legend>
        {(Object.keys(COLOR_LABELS) as ColorKey[]).map((k) => (
          <ColorField key={k} label={COLOR_LABELS[k]} value={colors[k]} onChange={(hex) => onColor(k, hex)} />
        ))}
      </fieldset>

      <div className="flex flex-col gap-2">
        <span className={LABEL}>Export</span>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "PNG (scan)", run: onExportPng, gate: blocked.scan },
            { label: ".glb model", run: onExportGlb, gate: blocked.scan },
            { label: "PNG (reveal)", run: onExportReveal, gate: blocked.reveal },
          ].map((b) => (
            <button
              key={b.label}
              type="button"
              aria-disabled={b.gate !== null}
              aria-describedby="export-note"
              onClick={() => b.gate === null && b.run()}
              className="h-10 rounded-md bg-zinc-900 px-1 text-sm whitespace-nowrap font-medium text-white transition-colors hover:bg-zinc-700 aria-disabled:cursor-not-allowed aria-disabled:border aria-disabled:border-zinc-500 aria-disabled:bg-transparent aria-disabled:text-zinc-600 aria-disabled:hover:bg-transparent dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 dark:aria-disabled:text-zinc-400"
            >
              {b.label}
            </button>
          ))}
        </div>
        <p id="export-note" className="text-sm text-zinc-700 dark:text-zinc-300">
          {exportError ?? exportNote(blocked, verified)}
        </p>
      </div>

      {sculpture && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {sculpture.blocks} blocks · {sculpture.modules}×{sculpture.modules} modules. Longer links give a finer
          sculpture. The tree only lines up in this on-screen view; a photo of a printed copy won&rsquo;t.
        </p>
      )}
    </section>
  );
}
