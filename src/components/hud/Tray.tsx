"use client";

import type { Ref } from "react";
import ColorField from "@/components/controls/ColorField";
import { ELEVATION_MAX_DEG, ELEVATION_MIN_DEG } from "@/lib/solver";
import { THEMES, type ThemeId } from "@/lib/themes";
import AlignmentBar from "./AlignmentBar";
import { HudButton, HudIcon, HudSwitch } from "./primitives";

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

/** Everything that is not needed at rest. Always mounted (colour drafts survive a close); `open` only toggles display. */
export default function Tray({
  id,
  open,
  colors,
  onColor,
  modelId,
  onModel,
  models,
  themeId,
  onTheme,
  elevation,
  onElevation,
  proximity,
  onSnap,
  ambientMotion,
  onAmbientMotion,
  motionAllowed,
  onShake,
  shakeEnabled,
  blocked,
  verified,
  exportError,
  onExportPng,
  onExportGlb,
  onExportReveal,
  sculpture,
  className = "",
  ref,
}: {
  ref?: Ref<HTMLDivElement>;
  id: string;
  open: boolean;
  colors: Record<ColorKey, string>;
  onColor: (key: ColorKey, hex: string) => void;
  modelId: string;
  onModel: (id: string) => void;
  models: readonly { id: string; label: string }[];
  themeId: ThemeId;
  onTheme: (id: ThemeId) => void;
  elevation: number;
  onElevation: (deg: number) => void;
  proximity: number | null;
  onSnap: () => void;
  ambientMotion: boolean;
  onAmbientMotion: (on: boolean) => void;
  motionAllowed: boolean;
  onShake: () => void;
  shakeEnabled: boolean;
  blocked: { scan: string | null; reveal: string | null };
  verified: boolean;
  exportError: string | null;
  onExportPng: () => void;
  onExportGlb: () => void;
  onExportReveal: () => void;
  sculpture: { blocks: number; modules: number } | null;
  className?: string;
}) {
  const note = [
    !motionAllowed && "Breeze is off while motion is reduced.",
    !shakeEnabled && (motionAllowed ? "Shake works in Explore." : "Shake is off while motion is reduced."),
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={ref}
      id={id}
      role="region"
      aria-label="Settings"
      className={`hud-panel pointer-events-auto flex-col gap-3 overflow-y-auto overscroll-contain p-3 ${open ? "flex" : "hidden"} ${className}`}
    >
      <fieldset className="grid grid-cols-2 gap-x-3 gap-y-2">
        <legend className="hud-label mb-1">Palette</legend>
        {(Object.keys(COLOR_LABELS) as ColorKey[]).map((k) => (
          <ColorField key={k} label={COLOR_LABELS[k]} value={colors[k]} onChange={(hex) => onColor(k, hex)} />
        ))}
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        {models.length > 1 && (
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="qr-model" className="hud-label">
              Model
            </label>
            <select id="qr-model" value={modelId} onChange={(e) => onModel(e.target.value)} className="hud-field">
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="qr-theme" className="hud-label">
            Theme
          </label>
          <select id="qr-theme" value={themeId} onChange={(e) => onTheme(e.target.value as ThemeId)} className="hud-field">
            {Object.entries(THEMES).map(([tid, t]) => (
              <option key={tid} value={tid}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1">
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
          className="min-h-11 w-full"
        />
      </div>

      {proximity !== null && <AlignmentBar proximity={proximity} onSnap={onSnap} />}

      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <HudSwitch label="Breeze" checked={ambientMotion} disabled={!motionAllowed} aria-describedby={note ? "engine-note" : undefined} onChange={onAmbientMotion} className="hud-tight" />
          <HudButton disabled={!shakeEnabled} aria-describedby={note ? "engine-note" : undefined} onClick={onShake} className="hud-tight">
            <HudIcon name="shake" className="mr-1" />
            Shake
          </HudButton>
        </div>
        {note && (
          <p id="engine-note" className="text-sm">
            {note}
          </p>
        )}
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
              {b.gate !== null && <HudIcon name="lock" className="mr-1" />}
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
          {sculpture.blocks} blocks · {sculpture.modules}×{sculpture.modules} modules. Longer links give a finer sculpture. The tree
          only lines up in this on-screen view; a photo of a printed copy won&rsquo;t.
        </p>
      )}
    </div>
  );
}
