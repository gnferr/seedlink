import { useRef, type KeyboardEvent } from "react";
import type { Season } from "@/lib/seasons";
import { LEAF_SWATCHES } from "@/lib/palette";
import { nextRadioIndex } from "@/lib/radioNav";
import PixelIcon from "./PixelIcon";
import TimeSlider from "./TimeSlider";

export const SEASON_ORDER: readonly Season[] = ["SPRING", "SUMMER", "AUTUMN", "WINTER"];
export const SEASON_LABEL: Record<Season, string> = { SPRING: "Spring", SUMMER: "Summer", AUTUMN: "Autumn", WINTER: "Winter" };
export const seasonIcon = (s: Season) => s.toLowerCase() as "spring" | "summer" | "autumn" | "winter";

export default function SeasonPanel({ season, onSeason, time, onTime, leaf, onLeaf, soundOn, onSound }: {
  season: Season;
  onSeason(s: Season): void;
  time: number;
  onTime(t: number): void;
  leaf: string; // the leaf colour on screen: the override or the season's own
  onLeaf(hex: string): void;
  soundOn: boolean;
  onSound(on: boolean): void;
}) {
  const radios = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const next = nextRadioIndex(i, e.key, SEASON_ORDER.length);
    if (next === null) return;
    e.preventDefault();
    onSeason(SEASON_ORDER[next]);
    radios.current[next]?.focus();
  };

  return (
    <div className="inner step-lg panel">
      <div role="radiogroup" aria-label="Season" className="seg well step">
        {SEASON_ORDER.map((s, i) => {
          const on = s === season;
          return (
            <button
              key={s}
              ref={(el) => { radios.current[i] = el; }}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={SEASON_LABEL[s]}
              tabIndex={on ? 0 : -1}
              className={`btn ${on ? "sel step" : "idle"}`}
              onClick={() => onSeason(s)}
              onKeyDown={(e) => onKey(e, i)}
            >
              <PixelIcon name={seasonIcon(s)} />
              <span className="seg-label">{SEASON_LABEL[s]}</span>
            </button>
          );
        })}
      </div>
      <TimeSlider value={time} onChange={onTime} />
      <div className="row">
        <div className="swatches well step">
          {LEAF_SWATCHES.map(({ name, hex }) => (
            <button
              key={hex}
              type="button"
              aria-label={`Leaf colour ${name}`}
              aria-pressed={leaf.toLowerCase() === hex.toLowerCase()}
              style={{ background: hex }}
              onClick={() => onLeaf(hex)}
            />
          ))}
        </div>
        <button
          type="button"
          className="btn icon well step"
          aria-label="Sound"
          aria-pressed={soundOn}
          title="Sound"
          onClick={() => onSound(!soundOn)}
        >
          <PixelIcon name={soundOn ? "sound" : "mute"} />
        </button>
      </div>
    </div>
  );
}
