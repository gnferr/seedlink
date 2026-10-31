import { useEffect, useRef, useState, type KeyboardEvent, type Ref } from "react";
import type { Season } from "@/lib/seasons";
import PixelIcon from "./PixelIcon";
import { SEASON_LABEL, seasonIcon } from "./SeasonPanel";

/**
 * Link field, season button, Share (when the browser can) and Save. Save opens a two-item menu: PNG for screens, SVG
 * for print with its minimum print width. A refused Save or Share stays focusable and says why.
 */
export default function ControlPill({ input, onInput, invalid, season, panelOpen, onTogglePanel, seasonButtonRef, saveBlocked, onSave, printCm, shareMode, onShare }: {
  input: string;
  onInput(v: string): void;
  invalid: boolean;
  season: Season;
  panelOpen: boolean;
  onTogglePanel(): void;
  seasonButtonRef: Ref<HTMLButtonElement>;
  saveBlocked: string | null;
  onSave(format: "png" | "svg"): void;
  printCm: number;
  shareMode: "share" | "copy" | null;
  onShare(): void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const saveRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const open = menuOpen && !saveBlocked; // a code that stops verifying closes the menu

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !saveRef.current?.contains(t)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const close = () => {
    setMenuOpen(false);
    saveRef.current?.focus();
  };
  const onMenuKey = (e: KeyboardEvent) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") close();
    else if (e.key === "Tab") setMenuOpen(false);
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
    }
  };
  const pick = (format: "png" | "svg") => {
    close();
    onSave(format);
  };

  return (
    <div className="pill-wrap">
      {open && (
        <div ref={menuRef} id="save-menu" role="menu" aria-label="Save as" className="pixel-glass step-lg save-menu" onKeyDown={onMenuKey}>
          <div className="inner step-lg menu-list">
            <button type="button" role="menuitem" className="btn menu-item" onClick={() => pick("png")}>
              <b>PNG</b><span>for screens</span>
            </button>
            <button type="button" role="menuitem" className="btn menu-item" onClick={() => pick("svg")}>
              <b>SVG</b><span>for print, at least {printCm.toFixed(1)} cm wide</span>
            </button>
          </div>
        </div>
      )}
      <div className="pixel-glass step-lg pill">
        <div className="inner step-lg row pill-row">
          <label className="field well step">
            <PixelIcon name="link" />
            <input
              value={input}
              onChange={(e) => onInput(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              aria-label="Link or text"
              aria-invalid={invalid || undefined}
              placeholder="Link or text"
            />
          </label>
          <button
            ref={seasonButtonRef}
            type="button"
            className="btn icon sel step"
            aria-expanded={panelOpen}
            aria-controls="season-panel"
            aria-label={`Season and colours (${SEASON_LABEL[season]})`}
            title="Season and colours"
            onClick={onTogglePanel}
          >
            <PixelIcon name={seasonIcon(season)} />
          </button>
          {shareMode && (
            <button
              type="button"
              className="btn icon idle well step"
              aria-label={shareMode === "share" ? "Share image" : "Copy image"}
              title={saveBlocked ?? (shareMode === "share" ? "Share image" : "Copy image")}
              aria-disabled={saveBlocked ? true : undefined}
              aria-describedby={saveBlocked ? "save-reason" : undefined}
              onClick={() => !saveBlocked && onShare()}
            >
              <PixelIcon name="share" />
            </button>
          )}
          <button
            ref={saveRef}
            type="button"
            className="btn save step"
            aria-disabled={saveBlocked ? true : undefined}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls={open ? "save-menu" : undefined}
            title={saveBlocked ?? undefined}
            aria-describedby={saveBlocked ? "save-reason" : undefined}
            onClick={() => !saveBlocked && setMenuOpen((o) => !o)}
          >
            <PixelIcon name="down" />
            <span>Save</span>
          </button>
          {/* Outside the button so its name stays "Save". */}
          {saveBlocked && <span id="save-reason" className="sr-only">{saveBlocked}</span>}
        </div>
      </div>
    </div>
  );
}
