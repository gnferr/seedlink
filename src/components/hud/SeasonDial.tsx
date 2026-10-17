"use client";

import type { KeyboardEvent } from "react";
import { nextRadioIndex } from "@/lib/radioNav";
import { SEASONS, type Season } from "@/lib/seasons";

const LABELS: Record<Season, { name: string; short: string }> = {
  SUMMER: { name: "Summer", short: "Su" },
  AUTUMN: { name: "Autumn", short: "Au" },
  WINTER: { name: "Winter", short: "Wi" },
  SPRING: { name: "Spring", short: "Sp" },
};

export const seasonName = (s: Season) => LABELS[s].name;

/** Four season radios. On phones the dock is tight, so they show two letters; the full name is the accessible name. */
export default function SeasonDial({ season, onSeason, className = "" }: { season: Season; onSeason: (s: Season) => void; className?: string }) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const next = nextRadioIndex(SEASONS.indexOf(season), e.key, SEASONS.length);
    if (next === null) return;
    e.preventDefault();
    onSeason(SEASONS[next]);
    (e.currentTarget.children[next] as HTMLElement).focus();
  };
  return (
    <div role="radiogroup" aria-label="Season" onKeyDown={onKeyDown} className={`grid grid-cols-4 gap-1.5 md:gap-2 ${className}`}>
      {SEASONS.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={season === s}
          tabIndex={season === s ? 0 : -1}
          onClick={() => onSeason(s)}
          className="hud-btn hud-tight min-h-11 min-w-11 px-0"
        >
          <span aria-hidden="true" className="md:hidden">
            {LABELS[s].short}
          </span>
          <span className="max-md:sr-only">{LABELS[s].name}</span>
        </button>
      ))}
    </div>
  );
}
