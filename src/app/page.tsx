"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import ControlPanel, { type ColorKey } from "@/components/controls/ControlPanel";
import type { ViewState } from "@/components/scene/CameraRig";
import { generateMatrix, type QrMatrix } from "@/lib/qr";
import { sampleScan } from "@/lib/sampleScan";
import { DEFAULT_SHAPE_ID, SHAPES } from "@/lib/shapes";
import { solve } from "@/lib/solver";
import { THEMES, type Theme, type ThemeId } from "@/lib/themes";
import type { Separation } from "@/lib/verify";

const QrScene = dynamic(() => import("@/components/scene/QrScene"), {
  ssr: false,
  loading: () => <CenterNote>Preparing the 3D view…</CenterNote>,
});

const DEFAULT_URL = "https://example.com";
const DEFAULT_THEME: ThemeId = "MINECRAFT";
const DEFAULT_ELEVATION = 30;
const DEBOUNCE_MS = 300;
const VIEW_NAMES: Record<ViewState, string> = { EXPLORE: "explore", REVEAL: "reveal", SCAN: "top-down scan" };

type Qr = { text: string; matrix: QrMatrix };

function CenterNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <p className="rounded-lg bg-white px-4 py-3 text-sm text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
        {children}
      </p>
    </div>
  );
}

export default function Home() {
  const [input, setInput] = useState(DEFAULT_URL);
  const [qr, setQr] = useState<Qr | null>(() => ({ text: DEFAULT_URL, matrix: generateMatrix(DEFAULT_URL) }));
  const [tooLong, setTooLong] = useState(false);
  const [shapeId, setShapeId] = useState(DEFAULT_SHAPE_ID);
  const [themeId, setThemeId] = useState<ThemeId>(DEFAULT_THEME);
  const [overrides, setOverrides] = useState<Partial<Record<ColorKey, string>>>({});
  const [elevation, setElevation] = useState(DEFAULT_ELEVATION);
  const [mode, setMode] = useState<ViewState>("EXPLORE");
  const [proximity, setProximity] = useState(1);
  const [settledKey, setSettledKey] = useState<string | null>(null);
  const [scan, setScan] = useState<{ key: string; separation: Separation } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Presets are starting points; a colour edit overrides only that field.
  const theme = useMemo<Theme>(() => {
    const base = THEMES[themeId];
    return {
      ...base,
      regionColors: {
        ...base.regionColors,
        trunk: overrides.trunk ?? base.regionColors.trunk,
        canopy: overrides.canopy ?? base.regionColors.canopy,
      },
      colorLight: overrides.light ?? base.colorLight,
      background: overrides.background ?? base.background,
    };
  }, [themeId, overrides]);

  const matrix = qr?.matrix;
  const shape = SHAPES[shapeId];
  const blocks = useMemo(() => (matrix ? solve(matrix, shape, elevation) : []), [matrix, shape, elevation]);

  // Commit text and matrix together, and only when the input encodes, so a too-long string
  // leaves the last working object on screen.
  useEffect(() => {
    const id = setTimeout(() => {
      if (input.trim() === "") {
        setQr(null);
        setTooLong(false);
        return;
      }
      try {
        setQr({ text: input, matrix: generateMatrix(input) });
        setTooLong(false);
      } catch {
        setTooLong(true);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [input]);

  // The camera re-tweens whenever any of these change, so a settle only counts for the key it settled under.
  const camKey = `${mode}|${matrix?.size}|${elevation}`;
  const camKeyRef = useRef(camKey);
  useLayoutEffect(() => {
    camKeyRef.current = camKey;
  }, [camKey]);
  const onSettled = useCallback(() => setSettledKey(camKeyRef.current), []);
  const settled = settledKey === camKey;

  // Verify on demand: sample only once the camera has settled in Scan, debounced on change.
  const verifyKey = qr ? JSON.stringify([qr.text, shapeId, elevation, theme]) : "";
  useEffect(() => {
    if (!qr || mode !== "SCAN" || !settled) return;
    const id = setTimeout(() => {
      const canvas = canvasRef.current;
      if (canvas) setScan({ key: verifyKey, separation: sampleScan(canvas, qr.matrix) });
    }, DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [qr, mode, settled, verifyKey]);
  // A result for different input is never shown.
  const separation = scan?.key === verifyKey ? scan.separation : null;

  const onCanvasReady = useCallback((c: HTMLCanvasElement) => {
    canvasRef.current = c;
  }, []);

  const colors: Record<ColorKey, string> = {
    trunk: theme.regionColors.trunk,
    canopy: theme.regionColors.canopy,
    light: theme.colorLight,
    background: theme.background,
  };

  const viewName = VIEW_NAMES[mode];
  const label = qr
    ? `3D QR code for "${qr.text}", shaped as a ${shape.label}, ${theme.label} theme, ${viewName} view.`
    : "No QR code yet. Enter a link or text to build one.";

  return (
    <main
      className="relative flex min-h-0 flex-1 overflow-hidden font-sans"
      style={{ background: theme.background }}
    >
      <h1 className="sr-only">Voxel QR</h1>
      {/* Phones: the object takes the top 56%; desktop: everything left of the floating panel. */}
      <div
        role="img"
        aria-label={label}
        className="absolute inset-x-0 top-0 bottom-[44%] min-h-0 md:right-[23rem] md:bottom-0"
      >
        {qr ? (
          <QrScene
            blocks={blocks}
            size={qr.matrix.size}
            theme={theme}
            state={mode}
            elevationDeg={elevation}
            onProximityChange={setProximity}
            onCanvasReady={onCanvasReady}
            onSettled={onSettled}
          />
        ) : (
          <CenterNote>Type or paste a link to build your object.</CenterNote>
        )}

        {tooLong && (
          <p
            role="alert"
            className="absolute inset-x-3 top-3 flex items-start gap-2 rounded-lg border border-red-700 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-[0_6px_16px_-6px_rgb(0_0_0/0.3)] md:inset-x-auto md:left-4 md:max-w-md dark:border-red-400 dark:bg-red-950 dark:text-red-200"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="10" cy="10" r="7.5" />
              <path d="M10 6v4.5M10 13.6v.2" strokeLinecap="round" />
            </svg>
            <span>
              Too long to fit in one QR code. Shorten the text or use a short link{qr ? " — showing your last code that fit." : "."}
            </span>
          </p>
        )}
      </div>

      <ControlPanel
        className="absolute inset-x-3 bottom-3 max-h-[calc(44%-1.5rem)] md:inset-x-auto md:top-4 md:right-4 md:bottom-auto md:max-h-[calc(100%-2rem)] md:w-[21rem]"
        input={input}
        onInput={setInput}
        shapeId={shapeId}
        onShape={setShapeId}
        themeId={themeId}
        onTheme={(id) => {
          setThemeId(id);
          setOverrides({});
        }}
        colors={colors}
        onColor={(k, hex) => setOverrides((o) => ({ ...o, [k]: hex }))}
        elevation={elevation}
        onElevation={setElevation}
        view={mode}
        onView={setMode}
        // Proximity is only meaningful while orbiting a settled Explore view.
        proximity={qr && mode === "EXPLORE" && settled ? proximity : null}
        separation={separation}
        showScanStatus={!!qr && (mode === "SCAN" || separation !== null)}
      />

      <p aria-live="polite" className="sr-only">
        {qr ? `Encoding ${qr.text}. ${viewName} view.` : "No QR code yet."}
      </p>
    </main>
  );
}
