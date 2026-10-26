import { periodAt, skyState, timeLabel } from "@/lib/daycycle";
import PixelIcon from "./PixelIcon";

// One flat band per hour (06:00 .. 23:00), coloured like the sky's lower band at that hour.
const HOURS = 17;
const css = ([r, g, b]: readonly number[]) => `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`;
const TRACK = `linear-gradient(90deg, ${Array.from({ length: HOURS }, (_, i) => {
  const c = css(skyState((i + 0.5) / HOURS).sky[2]);
  return `${c} ${(i / HOURS) * 100}% ${((i + 1) / HOURS) * 100}%`;
}).join(", ")})`;

/** Time of day, 0 = 06:00 .. 1 = 23:00: a native range input under a pixel-stepped track and thumb. */
export default function TimeSlider({ value, onChange }: { value: number; onChange(t: number): void }) {
  const period = periodAt(value);
  return (
    <div className="time-row row">
      <PixelIcon name={period === "Dusk" || period === "Night" ? "moon" : "summer"} />
      <div className="time">
        <div className="time-track step" style={{ background: TRACK }} />
        <div className="time-thumb step" style={{ left: `${value * 100}%` }} />
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(value * 1000)}
          aria-label="Time of day"
          aria-valuetext={timeLabel(value)}
          onChange={(e) => onChange(Number(e.target.value) / 1000)}
        />
      </div>
      <span className="time-label">{period}</span>
    </div>
  );
}
