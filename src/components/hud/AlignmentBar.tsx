"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { HudButton } from "./primitives";

/** Proximity at which the snap is offered as the obvious next step. */
export const CLOSE = 0.75;
const PIPS = 10;

export function proximityText(p: number): string {
  if (p >= 0.97) return "On the reveal angle";
  if (p >= CLOSE) return "Almost there";
  if (p > 0) return "Getting warmer";
  return "Orbit to find the tree";
}

export default function AlignmentBar({ proximity, onSnap }: { proximity: number; onSnap: () => void }) {
  const snapRef = useRef<HTMLButtonElement>(null);
  const close = proximity >= CLOSE;
  const lit = Math.round(proximity * PIPS);

  // The one authored moment: the snap button answers when the user finds the angle.
  useEffect(() => {
    const el = snapRef.current;
    if (!close || !el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const tween = gsap.fromTo(el, { scale: 0.9 }, { scale: 1, duration: 0.6, ease: "expo.out" });
    return () => {
      tween.revert();
    };
  }, [close]);

  return (
    <div className="flex items-center gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-sm">{proximityText(proximity)}</span>
        <div
          role="meter"
          aria-label="Closeness to the reveal angle"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(proximity * 100)}
          className="flex gap-0.5"
        >
          {Array.from({ length: PIPS }, (_, i) => (
            <span key={i} className="hud-pip" data-on={i < lit ? "" : undefined} />
          ))}
        </div>
      </div>
      <HudButton ref={snapRef} onClick={onSnap} data-go={close ? "" : undefined} className="hud-tight shrink-0">
        Snap to reveal
      </HudButton>
    </div>
  );
}
