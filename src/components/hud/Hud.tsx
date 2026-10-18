"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import type { ViewState } from "@/components/scene/CameraRig";
import type { Season } from "@/lib/seasons";
import type { ThemeId } from "@/lib/themes";
import type { Separation } from "@/lib/verify";
import Hotbar from "./Hotbar";
import StatusPlaque from "./StatusPlaque";
import SeasonDial from "./SeasonDial";
import Tray, { type ColorKey } from "./Tray";
import { HudButton, HudIcon } from "./primitives";

export type { ColorKey };

const TRAY_ID = "hud-tray";

export default function Hud({
  input,
  onInput,
  modelId,
  onModel,
  models,
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
  save,
  onSave,
  sculpture,
  season,
  onSeason,
  ambientMotion,
  onAmbientMotion,
  motionAllowed,
  onShake,
  shakeEnabled,
  onChromeInsets,
  className = "",
}: {
  input: string;
  onInput: (v: string) => void;
  modelId: string;
  onModel: (id: string) => void;
  /** The Model select only appears when there is a choice. */
  models: readonly { id: string; label: string }[];
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
  /** Save follows the view; `reason === null` means it is enabled for `target`. */
  save: { target: "scan" | "reveal" | null; reason: string | null };
  onSave: () => void;
  /** Size of the current sculpture; null with no code. */
  sculpture: { blocks: number; modules: number } | null;
  season: Season;
  onSeason: (s: Season) => void;
  /** Breeze as the user sees it: already false under reduced motion. */
  ambientMotion: boolean;
  onAmbientMotion: (on: boolean) => void;
  /** false under reduced motion. */
  motionAllowed: boolean;
  onShake: () => void;
  shakeEnabled: boolean;
  /** CSS px of the view covered at the top and bottom by the resting controls. */
  onChromeInsets: (insets: { top: number; bottom: number }) => void;
  className?: string;
}) {
  const revealRef = useRef<HTMLButtonElement>(null);
  const settingsRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== "Escape" || !open) return;
    setOpen(false);
    settingsRef.current?.focus();
  };

  // Report how much of the top and bottom the resting chrome covers (top bar, status, save reason; the bottom
  // bar). The tray is not resting chrome. Re-measured after every render (the reason line comes and goes) and on
  // any size change; the page ignores repeats.
  const sectionRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const s = sectionRef.current;
    if (!s) return;
    const box = s.getBoundingClientRect();
    const tops = [...s.querySelectorAll('[data-chrome="top"], [role="status"], #save-reason')].map((e) => e.getBoundingClientRect().bottom);
    const bottom = s.querySelector('[data-chrome="bottom"]')?.getBoundingClientRect().top ?? box.bottom;
    onChromeInsets({ top: Math.ceil(Math.max(box.top, ...tops) - box.top), bottom: Math.ceil(box.bottom - bottom) });
  });
  const [, remeasure] = useState(0);
  useEffect(() => {
    const s = sectionRef.current;
    if (!s) return;
    const ro = new ResizeObserver(() => remeasure((n) => n + 1));
    ro.observe(s);
    s.querySelectorAll('[data-chrome], [role="status"]').forEach((e) => ro.observe(e));
    return () => ro.disconnect();
  }, []);

  // The section only lays out its children; it lets pointer events through to the world, its panels take them back.
  return (
    <section ref={sectionRef} aria-label="Controls" onKeyDown={onKeyDown} className={`pointer-events-none flex flex-col gap-2 p-3 md:block md:p-0 ${className}`}>
      {/* Top bar: the one field, Save, and the way into everything else. */}
      <div data-chrome="top" className="hud-panel pointer-events-auto mr-1 flex flex-col gap-1 p-2 md:absolute md:top-3 md:left-3 md:w-[min(40rem,calc(100%-27.5rem))]">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="qr-input" className="hud-label">
            Link or text
          </label>
          <span className="font-mono text-xs tabular-nums" aria-live="off">
            {input.length} {input.length === 1 ? "character" : "characters"}
          </span>
        </div>
        <div className="flex gap-2">
          <input
            id="qr-input"
            value={input}
            onChange={(e) => onInput(e.target.value)}
            onFocus={(e) => e.target.select()}
            placeholder="https://your-link.example"
            spellCheck={false}
            autoComplete="off"
            className="hud-field min-w-0 flex-1"
          />
          <HudButton
            disabled={save.reason !== null}
            aria-describedby={save.reason !== null ? "save-reason" : undefined}
            data-go={save.reason === null ? "" : undefined}
            onClick={onSave}
            className="shrink-0 px-3"
          >
            Save
          </HudButton>
          <HudButton
            ref={settingsRef}
            aria-expanded={open}
            aria-controls={TRAY_ID}
            onClick={() => setOpen((o) => !o)}
            className="shrink-0 gap-2 px-0 max-md:w-11 md:px-3"
          >
            <HudIcon name="gear" />
            <span className="max-md:sr-only">Settings</span>
          </HudButton>
        </div>
      </div>

      {/* Status slot (top right; phones: under the top bar). The tray hangs below it from md up; on phones the column
          dissolves (contents) so the tray is ordered after the spacer and sits as a sheet right above the bottom bar. */}
      <div className="contents md:absolute md:top-3 md:right-3 md:bottom-24 md:flex md:w-[24rem] md:flex-col md:gap-2">
        <StatusPlaque separation={separation} checked={view === "SCAN"} hasCode={sculpture !== null} />
        {save.reason !== null && (
          <p id="save-reason" className="hud-panel mr-1 px-3 py-1 text-[13px] leading-4">
            {save.reason}
          </p>
        )}
        <Tray
          id={TRAY_ID}
          open={open}
          className="mr-1 mb-1 min-h-0 max-h-[60%] max-md:order-1 md:max-h-[60vh]"
          colors={colors}
          onColor={onColor}
          modelId={modelId}
          onModel={onModel}
          models={models}
          themeId={themeId}
          onTheme={onTheme}
          elevation={elevation}
          onElevation={onElevation}
          proximity={proximity}
          onSnap={() => {
            onView("REVEAL");
            // The snap button unmounts once Reveal starts; keep focus on the slot that now holds the state.
            revealRef.current?.focus();
          }}
          ambientMotion={ambientMotion}
          onAmbientMotion={onAmbientMotion}
          motionAllowed={motionAllowed}
          onShake={onShake}
          shakeEnabled={shakeEnabled}
          blocked={blocked}
          verified={verified}
          exportError={exportError}
          onExportPng={onExportPng}
          onExportGlb={onExportGlb}
          onExportReveal={onExportReveal}
          sculpture={sculpture}
        />
      </div>

      <div className="flex-1 md:hidden" />

      {/* Bottom bar: phones stack the dial over the hotbar; from md up they sit side by side. */}
      <div data-chrome="bottom" className="flex flex-col gap-2 max-md:order-2 md:absolute md:inset-x-0 md:bottom-3 md:flex-row md:items-end md:justify-center md:gap-4">
        <SeasonDial season={season} onSeason={onSeason} className="pointer-events-auto mr-1 md:order-2" />
        <div className="pointer-events-auto mr-1 flex md:w-[21rem]">
          <Hotbar view={view} onView={onView} revealRef={revealRef} />
        </div>
      </div>
    </section>
  );
}
