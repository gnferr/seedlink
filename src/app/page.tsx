"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import gsap from "gsap";
import { generateMatrix } from "@/lib/qr";
import { THEMES, type ThemeId } from "@/lib/themes";
import type { ViewMode } from "@/components/QrScene";

const QrScene = dynamic(() => import("@/components/QrScene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-zinc-200 dark:bg-zinc-900">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Preparing the 3D view…
      </p>
    </div>
  ),
});

const DEFAULT_URL = "https://example.com";

const FIELD_CLASS =
  "h-11 rounded-lg border border-zinc-500 bg-white px-3 text-base text-zinc-900 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 " +
  "dark:border-zinc-500 dark:bg-zinc-900 dark:text-zinc-50 dark:focus-visible:outline-zinc-100";

const LABEL_CLASS =
  "text-xs font-medium uppercase tracking-wide text-zinc-600 dark:text-zinc-400";

export default function Home() {
  const [input, setInput] = useState(DEFAULT_URL);
  const [text, setText] = useState(DEFAULT_URL);
  const [matrix, setMatrix] = useState(() => generateMatrix(DEFAULT_URL));
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>("EXPLORE");
  const [themeId, setThemeId] = useState<ThemeId>("CITYSCAPE");
  const [heightVariance, setHeightVariance] = useState(
    THEMES.CITYSCAPE.heightVariance,
  );
  // Once the user drags the slider, a theme switch must not silently discard their value.
  const [variancePinned, setVariancePinned] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const theme = THEMES[themeId];

  // One debounce does both jobs: it only commits text and matrix together when the input
  // actually encodes, so a too-long string leaves the last working code on screen.
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        const next = generateMatrix(input);
        setMatrix(next);
        setText(input);
        setError(null);
      } catch {
        setError(
          "Too long to fit in one QR code. Shorten the text, or encode a short link instead.",
        );
      }
    }, 300);
    return () => clearTimeout(id);
  }, [input]);

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const tween = gsap.from(el, {
      opacity: 0,
      y: 24,
      duration: 0.6,
      ease: "power2.out",
    });
    // revert, not kill: StrictMode's double-invoke would otherwise leave opacity 0
    return () => {
      tween.revert();
    };
  }, []);

  const downloadPng = useCallback(async () => {
    // Export always captures the top-down view: the angled view is not a scannable code.
    setMode("SCAN");
    // shortcut: 3 frames is enough for the camera swap to paint; replace with an R3F
    // onAfterRender callback if a slow device ever captures the previous view.
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    });
    const canvas = sceneRef.current?.querySelector("canvas");
    if (!canvas) return;
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = "voxel-qr.png";
    link.click();
  }, []);

  const viewLabel = mode === "SCAN" ? "top-down scan view" : "3D explore view";

  return (
    // min-h-0 here too: every flex ancestor of the canvas must be allowed to shrink,
    // or the canvas keeps its largest past height and pushes the page into overflow.
    <div className="flex min-h-0 flex-1 flex-col bg-zinc-50 font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <div
        ref={panelRef}
        className="flex flex-col gap-5 border-b border-zinc-300 p-6 dark:border-zinc-700 sm:flex-row sm:items-end"
      >
        <label className="flex flex-1 flex-col gap-2">
          <span className={LABEL_CLASS}>Link or text · {input.length} characters</span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={(e) => e.target.select()}
            placeholder="https://your-link.example"
            className={`${FIELD_CLASS} placeholder:text-zinc-500 dark:placeholder:text-zinc-400`}
          />
        </label>

        <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
          <label className="flex flex-col gap-2">
            <span className={LABEL_CLASS}>Theme</span>
            <select
              value={themeId}
              onChange={(e) => {
                const next = e.target.value as ThemeId;
                setThemeId(next);
                if (!variancePinned) setHeightVariance(THEMES[next].heightVariance);
              }}
              className={FIELD_CLASS}
            >
              {Object.entries(THEMES).map(([id, t]) => (
                <option key={id} value={id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2">
            <span className={LABEL_CLASS}>Height {heightVariance.toFixed(1)} of 8</span>
            <input
              type="range"
              min={0}
              max={8}
              step={0.5}
              value={heightVariance}
              aria-valuetext={`${heightVariance.toFixed(1)} of 8${heightVariance === 0 ? ", flat" : ""}`}
              onChange={(e) => {
                setHeightVariance(Number(e.target.value));
                setVariancePinned(true);
              }}
              className="h-11 w-full accent-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:accent-zinc-100 dark:focus-visible:outline-zinc-100 sm:w-44"
            />
          </label>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setMode(mode === "SCAN" ? "EXPLORE" : "SCAN")}
            aria-pressed={mode === "SCAN"}
            className="h-11 rounded-lg border border-zinc-500 px-5 text-sm font-medium transition-colors hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:hover:bg-zinc-800 dark:focus-visible:outline-zinc-100"
          >
            Scan view
          </button>
          <button
            type="button"
            onClick={downloadPng}
            className="h-11 rounded-lg bg-zinc-900 px-5 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300 dark:focus-visible:outline-zinc-100"
          >
            Download PNG
          </button>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 border-b border-red-700 bg-red-50 px-6 py-3 text-sm text-red-700 dark:border-red-400 dark:bg-red-950 dark:text-red-300"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className="mt-0.5 h-4 w-4 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <circle cx="10" cy="10" r="7.5" />
            <path d="M10 6v4.5M10 13.6v.2" strokeLinecap="round" />
          </svg>
          <span>
            {error} Showing your last code that fit.
          </span>
        </p>
      )}

      <div
        ref={sceneRef}
        role="img"
        aria-label={`QR code encoding ${text || "nothing yet"}. ${theme.label} theme, ${viewLabel}.`}
        className="relative min-h-0 flex-1"
      >
        <QrScene
          matrix={matrix}
          mode={mode}
          theme={theme}
          heightVariance={heightVariance}
        />
      </div>

      <p aria-live="polite" className="sr-only">
        {`QR code updated. Encoding ${text}. ${theme.label} theme, ${viewLabel}.`}
      </p>
    </div>
  );
}
