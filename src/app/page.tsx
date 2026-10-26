"use client";

import { Component, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import ControlPill from "@/components/controls/ControlPill";
import HintChip from "@/components/controls/HintChip";
import SeasonPanel from "@/components/controls/SeasonPanel";
import { timeFromClock } from "@/lib/daycycle";
import { generateMatrix, QUIET_ZONE, type QrMatrix } from "@/lib/qr";
import { exportPng } from "@/lib/exporters";
import { useReducedMotion } from "@/lib/useReducedMotion";
import type { Season } from "@/lib/seasons";
import { PALETTES } from "@/lib/palette";
import { bufferScale, sampleScan } from "@/lib/sampleScan";
import type { Separation } from "@/lib/verify";
import { frameKey, nextScanFrame, NO_INSETS, tooSmallToScan, type ScanFrame } from "@/lib/scanFit";
import { hintAction, hintText, saveBlockedReason, type FoldPhase, type StatusInput } from "@/lib/status";
import { playChime, playChirp, setSoundOn } from "@/lib/sound";

function Note({ children }: { children: ReactNode }) {
  return <p className="pointer-events-none absolute inset-0 flex items-center justify-center p-4 text-center font-[family-name:var(--font-pixel)] text-[#f3ecd2]">{children}</p>;
}

// The loading note is the page's (outside role="img", so it is read out), shown until the canvas is ready.
const IslandScene = dynamic(() => import("@/components/island/IslandScene"), { ssr: false, loading: () => null });
const UNAVAILABLE = "3D view unavailable — your browser could not start WebGL.";

const DEFAULT_URL = "https://example.com";
const DEBOUNCE_MS = 300;

type Qr = { text: string; matrix: QrMatrix };

// Canvas rethrows renderer-creation failures (no WebGL) into the tree; the controls stay usable.
class SceneBoundary extends Component<{ children: ReactNode; onFail(): void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFail();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function Home() {
  const [input, setInput] = useState(DEFAULT_URL);
  // The last world that encoded; empty or too-long input keeps it on screen.
  const [qr, setQr] = useState<Qr>(() => ({ text: DEFAULT_URL, matrix: generateMatrix(DEFAULT_URL) }));
  const [empty, setEmpty] = useState(false);
  const [tooLong, setTooLong] = useState(false);
  const [season, setSeasonState] = useState<Season>("SUMMER");
  const [leaf, setLeaf] = useState<string | null>(null);
  // Starts at the visitor's local time, read on mount: the server prerender must not read the clock.
  const [time, setTime] = useState(0.35);
  useEffect(() => {
    const d = new Date();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one read of the clock after hydration, never again
    setTime(timeFromClock(d.getHours(), d.getMinutes()));
  }, []);
  const [folded, setFolded] = useState(false);
  const [phase, setPhase] = useState<FoldPhase>("tree");
  // `frame` is the framing the check was graded under; it is not part of verifyKey.
  const [scan, setScan] = useState<{ key: string; frame: string; separation: Separation } | null>(null);
  // Bumped when a lost WebGL context comes back, so the check runs again.
  const [glEpoch, setGlEpoch] = useState(0);
  const [soundOn, setSoundOnState] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [sceneFailed, setSceneFailed] = useState(false);
  const [treeInfo, setTreeInfo] = useState<{ species: string; seed: number } | null>(null);
  const onTree = useCallback((species: string, seed: number) => setTreeInfo({ species, seed }), []);
  const reducedMotion = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const seasonButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const id = setTimeout(() => {
      if (input.trim() === "") {
        setEmpty(true);
        setTooLong(false);
        return;
      }
      try {
        const matrix = generateMatrix(input);
        setQr((prev) => (prev.text === input ? prev : { text: input, matrix }));
        setEmpty(false);
        setTooLong(false);
      } catch {
        setEmpty(false); // too long is not empty, whatever came before
        setTooLong(true);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [input]);

  // A new link regrows the tree. The scene always grows a new world, but reports it on its next frame: drop
  // "folded" now so a check can't grade the old code's frame under the new link meanwhile.
  const [seenText, setSeenText] = useState(qr.text);
  if (seenText !== qr.text) {
    setSeenText(qr.text);
    setFolded(false);
    setPhase((p) => (p === "tree" ? p : "growing"));
  }

  const setSeason = (s: Season) => {
    setSeasonState(s);
    setLeaf(null);
  };

  // The hint chip and pill cover the bottom of the full-bleed world; the folded code fits above them. The season
  // panel is left out: it is transient and may cover the code while open (the check reads the canvas, not the page).
  const [chrome, setChrome] = useState<ScanFrame>({ insets: NO_INSETS, width: 0, height: 0 });
  useLayoutEffect(() => {
    const main = mainRef.current, bar = barRef.current;
    if (!main || !bar) return;
    const measure = () => {
      const m = main.getBoundingClientRect();
      const bottom = Math.ceil(m.bottom - bar.getBoundingClientRect().top);
      const width = main.clientWidth, height = main.clientHeight;
      setChrome((p) =>
        p.insets.bottom === bottom && p.width === width && p.height === height ? p : { insets: { top: 0, bottom }, width, height },
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(main);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);
  // While folded at one view size the insets only grow, so a hint that changes length never re-frames the code twice.
  const [frame, setFrame] = useState<ScanFrame>(chrome);
  const nextFrame = nextScanFrame(frame, chrome.insets, chrome.width, chrome.height, phase === "folded");
  if (nextFrame !== frame) setFrame(nextFrame);
  const currentFrame = frameKey(frame);

  const verifyKey = JSON.stringify([qr.text, season, leaf, time]);
  // Recomputed from the current fit, so it clears when the window grows or the link shortens.
  const tooSmall =
    phase === "folded" && frame.width > 0 && tooSmallToScan(frame.width, frame.height, qr.matrix.size + 2 * QUIET_ZONE, frame.insets);
  // Check once the fold has settled (the scene reports "folded" only then), debounced, never per frame.
  useEffect(() => {
    if (phase !== "folded" || tooSmall) return;
    const id = setTimeout(() => {
      const canvas = canvasRef.current;
      if (canvas) setScan({ key: verifyKey, frame: currentFrame, separation: sampleScan(canvas, qr.matrix, frame.insets) });
    }, DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [phase, tooSmall, verifyKey, currentFrame, frame.insets, qr.matrix, glEpoch]);

  const exportRef = useRef<(() => HTMLCanvasElement) | null>(null);
  const onExportReady = useCallback((render: () => HTMLCanvasElement) => { exportRef.current = render; }, []);
  // The file is a fresh render on the plain backdrop, so it is checked again at the on-screen module centres.
  const saveImage = () => {
    const canvas = canvasRef.current, render = exportRef.current;
    if (!canvas || !render) return;
    const copy = render();
    const separation = sampleScan(copy, qr.matrix, frame.insets, bufferScale(canvas.height, canvas.clientHeight));
    if (separation.separated) exportPng(copy, "sky-island-qr.png");
    else setScan({ key: verifyKey, frame: currentFrame, separation }); // Save now says why it won't scan
  };

  const onCanvasReady = useCallback((c: HTMLCanvasElement) => {
    canvasRef.current = c;
    setSceneReady(true);
    // A lost context leaves a blank buffer: drop the result so nothing saves until it re-checks.
    c.addEventListener("webglcontextlost", () => setScan(null));
    c.addEventListener("webglcontextrestored", () => setGlEpoch((n) => n + 1));
  }, []);

  // The phase moves now, not on the scene's next frame, so Save is refused in this same render.
  const fold = useCallback((to: boolean) => {
    setFolded(to);
    setPhase(to ? "folding" : "growing");
    playChime(to ? "fold" : "grow");
  }, []);
  // A tap on the world that only dismissed the season panel does nothing else.
  const dismissedAt = useRef(-Infinity);
  const onTap = useCallback(
    (action: "fold" | "grow" | "poke") => {
      if (performance.now() - dismissedAt.current < 800) return;
      if (action === "poke") playChirp();
      else fold(action === "fold");
    },
    [fold],
  );

  // A result for other inputs is never shown, including while the field is ahead of the debounced link;
  // a pass counts only under the framing on screen now.
  const status: StatusInput = {
    hasCode: !empty,
    tooLong,
    tooSmall,
    phase,
    separation: scan?.key === verifyKey && input === qr.text ? scan.separation : null,
    gradedNow: scan?.frame === currentFrame,
  };
  const blocked = saveBlockedReason(status);
  const hint = sceneFailed ? UNAVAILABLE : hintText(status);
  const action = sceneFailed ? null : hintAction(phase);

  useEffect(() => {
    if (!panelOpen) return;
    // Focus lands on the checked season, so Tab walks the panel before the rest of the controls.
    panelRef.current?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus();
    const focusInPanel = () => !!panelRef.current?.contains(document.activeElement);
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || seasonButtonRef.current?.contains(t)) return;
      dismissedAt.current = performance.now();
      const restore = focusInPanel();
      setPanelOpen(false);
      // After this click's own focus change: keep a focusable target's focus, otherwise don't drop it to <body>.
      if (restore) setTimeout(() => {
        if (!document.activeElement || document.activeElement === document.body) seasonButtonRef.current?.focus();
      }, 0);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const restore = focusInPanel();
      setPanelOpen(false);
      if (restore) seasonButtonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [panelOpen]);

  return (
    <main ref={mainRef} className="relative flex min-h-0 flex-1 overflow-hidden bg-[rgb(16_14_38)]">
      <h1 className="sr-only">Sky Island</h1>
      {/* Overlays stay siblings of role="img": its children are pruned from the accessibility tree. */}
      <div role="img" aria-label={`A floating island whose tree folds into the QR code for "${qr.text}".`} data-phase={phase} data-species={treeInfo?.species} data-tree-seed={treeInfo?.seed} className="absolute inset-0">
        {/* Mount once the controls are measured, so the first fit already leaves room for them. */}
        {frame.width > 0 && (
          <SceneBoundary onFail={() => setSceneFailed(true)}>
            <IslandScene
              text={qr.text}
              matrix={qr.matrix}
              season={season}
              leaf={leaf}
              time={time}
              folded={folded}
              reducedMotion={reducedMotion}
              insets={frame.insets}
              onPhase={setPhase}
              onTap={onTap}
              onCanvasReady={onCanvasReady}
              onTree={onTree}
              onExportReady={onExportReady}
            />
          </SceneBoundary>
        )}
      </div>
      {sceneFailed ? <Note>{UNAVAILABLE}</Note> : !sceneReady && <Note>Preparing the island…</Note>}

      <div className="ui">
        {panelOpen && (
          <div ref={panelRef} id="season-panel" className="pixel-glass step-lg panel-wrap">
            <SeasonPanel
              season={season}
              onSeason={setSeason}
              time={time}
              onTime={setTime}
              leaf={leaf ?? PALETTES[season].leaf}
              onLeaf={setLeaf}
              soundOn={soundOn}
              onSound={(on) => {
                setSoundOn(on); // inside the click: browsers only start audio from a gesture
                setSoundOnState(on);
              }}
            />
          </div>
        )}
        <div ref={barRef} className="bar">
          <HintChip text={hint} action={action} passed={phase === "folded" && blocked === null} onAction={() => fold(action === "Fold into code")} />
          <ControlPill
            input={input}
            onInput={setInput}
            invalid={tooLong}
            season={season}
            panelOpen={panelOpen}
            onTogglePanel={() => setPanelOpen((o) => !o)}
            seasonButtonRef={seasonButtonRef}
            saveBlocked={blocked}
            onSave={saveImage}
          />
        </div>
      </div>

      <p aria-live="polite" className="sr-only">{hint}</p>
    </main>
  );
}
