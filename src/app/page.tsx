"use client";

import { Component, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { HudNote } from "@/components/hud/primitives";
import { seasonName } from "@/components/hud/SeasonDial";
import Hud, { type ColorKey } from "@/components/hud/Hud";
import type { ViewState } from "@/components/scene/CameraRig";
import { generateMatrix, QUIET_ZONE, type QrMatrix } from "@/lib/qr";
import { exportGlb, exportPng } from "@/lib/exporters";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { seasonTheme, type Season } from "@/lib/seasons";
import { viewForKey } from "@/lib/hotkeys";
import { sampleScan } from "@/lib/sampleScan";
import { DEFAULT_SHAPE_ID, SHAPES } from "@/lib/shapes";
import { solve } from "@/lib/solver";
import { THEMES, type Theme, type ThemeId } from "@/lib/themes";
import { failureReason, type Separation } from "@/lib/verify";
import { saveState } from "@/lib/save";
import { frameKey, nextScanFrame, NO_INSETS, TOO_SMALL_TO_SCAN, tooSmallToScan, type ScanFrame } from "@/lib/scanFit";
import type { ChromeMeasure } from "@/components/hud/Hud";

const IslandScene = dynamic(() => import("@/components/island/IslandScene"), {
  ssr: false,
  loading: () => <HudNote centered>Preparing the 3D view…</HudNote>,
});
// shortcut: temporary Task 8 wiring with fixed props; Task 10 owns the real page.
// Temporary wiring until Task 10: log phases, fold/grow on the tree taps.
const logPhase = (phase: string) => console.log("phase", phase);

const DEFAULT_URL = "https://example.com";
const DEFAULT_THEME: ThemeId = "MINECRAFT";
const DEFAULT_ELEVATION = 30;
const DEBOUNCE_MS = 300;
const VIEW_NAMES: Record<ViewState, string> = { EXPLORE: "explore", REVEAL: "reveal", SCAN: "top-down scan" };

type Qr = { text: string; matrix: QrMatrix };

// Canvas rethrows renderer-creation failures (no WebGL) into the tree; the panel stays usable.
class SceneBoundary extends Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <HudNote centered>3D view unavailable — your browser could not start WebGL.</HudNote>
    ) : (
      this.props.children
    );
  }
}

export default function Home() {
  const [folded, setFolded] = useState(false);
  const onTap = useCallback((action: "fold" | "grow" | "poke") => {
    console.log(action);
    if (action !== "poke") setFolded(action === "fold");
  }, []);
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
  // `frame` is the Scan framing the check was graded under; it is not part of verifyKey.
  const [scan, setScan] = useState<{ key: string; frame: string; separation: Separation } | null>(null);
  // Bumped when a lost WebGL context comes back, so the Scan check runs again.
  const [glEpoch, setGlEpoch] = useState(0);
  const [glbError, setGlbError] = useState(false);
  const [season, setSeason] = useState<Season>("SUMMER");
  const [breeze, setBreeze] = useState(true);
  const [shakeTick, setShakeTick] = useState(0);
  const motionAllowed = !useReducedMotion();
  const ambientMotion = breeze && motionAllowed;
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

  // The resting controls cover the top and bottom of the full-bleed world; Scan fits the pad between them.
  // In Scan at one view size the insets only grow (see nextScanFrame); a new size or another view takes the fresh
  // measurement. Never season- or motion-dependent.
  const [chrome, setChrome] = useState<ScanFrame>({ insets: NO_INSETS, width: 0, height: 0 });
  const onChromeInsets = useCallback(
    (c: ChromeMeasure) =>
      setChrome((p) =>
        p.insets.top === c.top && p.insets.bottom === c.bottom && p.width === c.width && p.height === c.height
          ? p
          : { insets: { top: c.top, bottom: c.bottom }, width: c.width, height: c.height },
      ),
    [],
  );
  const [frame, setFrame] = useState<ScanFrame>(chrome);
  const nextFrame = nextScanFrame(frame, chrome.insets, chrome.width, chrome.height, mode === "SCAN");
  if (nextFrame !== frame) setFrame(nextFrame);
  const scanInsets = frame.insets;
  const currentFrame = frameKey(frame);

  // The camera re-tweens whenever any of these change, so a settle only counts for the key it settled under.
  // Insets only move the Scan camera, so they are part of the key in Scan only.
  const camKey = `${mode}|${matrix?.size}|${elevation}|${mode === "SCAN" ? `${scanInsets.top}|${scanInsets.bottom}` : ""}`;
  const camKeyRef = useRef(camKey);
  useLayoutEffect(() => {
    camKeyRef.current = camKey;
  }, [camKey]);
  const onSettled = useCallback(() => setSettledKey(camKeyRef.current), []);
  // A new key voids the old settle, so a round trip back to a key mid-tween never counts as settled.
  const [seenCamKey, setSeenCamKey] = useState(camKey);
  if (seenCamKey !== camKey) {
    setSeenCamKey(camKey);
    setSettledKey(null);
  }
  const settled = settledKey === camKey;

  const shakeEnabled = mode === "EXPLORE" && motionAllowed;

  // Verify on demand: sample only once the camera has settled in Scan, debounced on change.
  // Summer theme on purpose: Scan flattens every block and the background, so season never changes the sampled frame.
  const verifyKey = qr ? JSON.stringify([qr.text, shapeId, elevation, theme]) : "";
  // A settled Scan whose fit can't give each module enough pixels says so instead of grading a smeared frame.
  // Recomputed from the current fit, so it clears when the window grows or the link shortens.
  const tooSmall =
    !!qr && mode === "SCAN" && settled && frame.width > 0 && tooSmallToScan(frame.width, frame.height, qr.matrix.size + QUIET_ZONE * 2, scanInsets);
  useEffect(() => {
    if (!qr || mode !== "SCAN" || !settled || tooSmall) return;
    const id = setTimeout(() => {
      const canvas = canvasRef.current;
      if (canvas) setScan({ key: verifyKey, frame: currentFrame, separation: sampleScan(canvas, qr.matrix, scanInsets) });
    }, DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [qr, mode, settled, verifyKey, glEpoch, scanInsets, currentFrame, tooSmall]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const v = e.repeat ? null : viewForKey({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, target: e.target as HTMLElement | null });
      if (v) setMode(v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // A result for different input is never shown.
  const separation = scan?.key === verifyKey ? scan.separation : null;

  const onCanvasReady = useCallback((c: HTMLCanvasElement) => {
    canvasRef.current = c;
    // A lost context leaves a blank buffer: drop the result so nothing exports until it re-verifies.
    c.addEventListener("webglcontextlost", () => setScan(null));
    c.addEventListener("webglcontextrestored", () => setGlEpoch((n) => n + 1));
  }, []);

  // Every export carries the code, so each needs a passed check for the current inputs and a settled
  // frame: Scan for the scan PNG and the model, Reveal for the reveal PNG. null = allowed, else why not.
  // In Scan a pass only counts once it was graded under the framing on screen now (insets and view size), so
  // a refit never re-enables Save on the old check. Outside Scan the frame moves freely; the last check stands.
  const graded = !!separation && (mode !== "SCAN" || scan?.frame === currentFrame);
  const verified = graded && !!separation?.separated;
  const blocked = useMemo(() => {
    const shared = !qr
      ? "Enter a link or text first."
      : tooLong
        ? "The text is too long for one QR code. Shorten it to export."
        : tooSmall
          ? TOO_SMALL_TO_SCAN
          : separation && !separation.separated
          ? `This code won't scan: ${failureReason(separation)}. Change the Base colour (or pick another theme) so it contrasts with the code.`
          : null;
    const unchecked = mode === "SCAN" ? "Checking the code, one moment." : "Open Scan so the code can be checked, then export.";
    const scanGate =
      mode !== "SCAN" ? (verified ? "PNG (scan) and .glb export from Scan." : unchecked) : !settled || !graded ? unchecked : null;
    const revealGate = !verified
      ? unchecked
      : mode !== "REVEAL"
        ? "PNG (reveal) exports from Reveal."
        : !settled
          ? "Waiting for the camera to settle."
          : null;
    return { scan: shared ?? scanGate, reveal: shared ?? revealGate };
  }, [qr, tooLong, tooSmall, separation, graded, verified, mode, settled]);

  const colors: Record<ColorKey, string> = {
    trunk: theme.regionColors.trunk,
    canopy: theme.regionColors.canopy,
    light: theme.colorLight,
    background: theme.background,
  };

  const viewName = VIEW_NAMES[mode];
  const save = saveState(mode, blocked);
  const exportScan = () => canvasRef.current && exportPng(canvasRef.current, "voxel-qr.png");
  const exportReveal = () => canvasRef.current && exportPng(canvasRef.current, "voxel-qr-reveal.png");

  return (
    <main
      className="relative flex min-h-0 flex-1 overflow-hidden font-sans"
      style={{ background: theme.background }}
    >
      <h1 className="sr-only">Voxel QR</h1>
      {/* The world is full-bleed; the HUD floats over its edges. */}
      <div className="absolute inset-0 min-h-0">
        {/* Overlays stay siblings of role="img": its children are pruned from the accessibility tree. */}
        {qr ? (
          <div
            role="img"
            aria-label={`3D QR code for "${qr.text}", shaped as a ${shape.label}, ${theme.label} theme, ${viewName} view.`}
            data-view={mode}
            data-settled={settled}
            className="absolute inset-0"
          >
            <SceneBoundary>
              <IslandScene
                text={qr.text}
                matrix={qr.matrix}
                season="SUMMER"
                leaf={null}
                folded={folded}
                reducedMotion={!motionAllowed}
                insets={scanInsets}
                onPhase={logPhase}
                onTap={onTap}
                onCanvasReady={onCanvasReady}
              />
            </SceneBoundary>
          </div>
        ) : (
          <HudNote centered>Type or paste a link to build your object.</HudNote>
        )}
      </div>

      <Hud
        className="absolute inset-0"
        onChromeInsets={onChromeInsets}
        tooLong={tooLong}
        tooSmall={tooSmall}
        input={input}
        onInput={setInput}
        modelId={shapeId}
        onModel={setShapeId}
        models={Object.values(SHAPES).map(({ id, label }) => ({ id, label }))}
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
        blocked={blocked}
        verified={verified}
        exportError={glbError ? "The model export failed. Try again." : null}
        onExportPng={exportScan}
        onExportReveal={exportReveal}
        save={save}
        onSave={() => (save.target === "scan" ? exportScan() : save.target === "reveal" ? exportReveal() : undefined)}
        onExportGlb={() => {
          if (!qr) return;
          setGlbError(false);
          exportGlb(blocks, qr.matrix.size, seasonTheme(theme, season), "voxel-qr.glb").catch(() => setGlbError(true));
        }}
        season={season}
        onSeason={setSeason}
        ambientMotion={ambientMotion}
        onAmbientMotion={setBreeze}
        motionAllowed={motionAllowed}
        onShake={() => setShakeTick((n) => n + 1)}
        shakeEnabled={shakeEnabled}
        sculpture={qr ? { blocks: blocks.length, modules: qr.matrix.size } : null}
      />

      <p aria-live="polite" className="sr-only">
        {qr ? `Encoding ${qr.text}. ${viewName} view. Season: ${seasonName(season)}.` : "No QR code yet."}
      </p>
    </main>
  );
}
