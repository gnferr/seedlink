import type { Ref } from "react";
import type { Season } from "@/lib/seasons";
import PixelIcon from "./PixelIcon";
import { SEASON_LABEL, seasonIcon } from "./SeasonPanel";

/** Link field, season button and Save. A refused Save stays focusable and says why. */
export default function ControlPill({ input, onInput, invalid, season, panelOpen, onTogglePanel, seasonButtonRef, saveBlocked, onSave }: {
  input: string;
  onInput(v: string): void;
  invalid: boolean;
  season: Season;
  panelOpen: boolean;
  onTogglePanel(): void;
  seasonButtonRef: Ref<HTMLButtonElement>;
  saveBlocked: string | null;
  onSave(): void;
}) {
  return (
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
          aria-label={`Season and colours (${SEASON_LABEL[season]})`}
          title="Season and colours"
          onClick={onTogglePanel}
        >
          <PixelIcon name={seasonIcon(season)} />
        </button>
        <button
          type="button"
          className="btn save step"
          aria-disabled={saveBlocked ? true : undefined}
          title={saveBlocked ?? undefined}
          aria-describedby={saveBlocked ? "save-reason" : undefined}
          onClick={() => !saveBlocked && onSave()}
        >
          <PixelIcon name="down" />
          <span>Save</span>
        </button>
        {/* Outside the button so its name stays "Save". */}
        {saveBlocked && <span id="save-reason" className="sr-only">{saveBlocked}</span>}
      </div>
    </div>
  );
}
