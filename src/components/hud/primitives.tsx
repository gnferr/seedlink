"use client";

import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";

export type HudIconName = "ok" | "bad" | "wait" | "lock" | "shake" | "wind" | "collapse" | "expand" | "warn";

// Strokes on a 16px grid, square caps and mitred joins so edges stay pixel-hard.
const PATHS: Record<HudIconName, string> = {
  ok: "M2 8l4 4 8-8",
  bad: "M3 3l10 10M13 3L3 13",
  wait: "M3 3h10v10H3zM8 5v3h3",
  lock: "M5 7V4h6v3M3 7h10v7H3z",
  shake: "M1 8h2l2-4 2 8 2-8 2 4h2",
  wind: "M2 6h8V3h3M2 10h10v3h-3",
  collapse: "M3 10l5-5 5 5",
  expand: "M3 6l5 5 5-5",
  warn: "M8 2l7 12H1zM8 7v3M8 12v1",
};

export function HudIcon({ name, className = "" }: { name: HudIconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="square"
      strokeLinejoin="miter"
      shapeRendering="crispEdges"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export function HudPanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`hud-panel ${className}`}>{children}</div>;
}

type HudButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "disabled"> & {
  pressed?: boolean;
  /** Exposed as aria-disabled so the button stays focusable and can carry its reason. */
  disabled?: boolean;
  /** 48px hit target instead of 44px. */
  hotbar?: boolean;
  ref?: Ref<HTMLButtonElement>;
};

export function HudButton({ pressed, disabled, hotbar, className = "", onClick, ref, type = "button", ...rest }: HudButtonProps) {
  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      aria-pressed={pressed}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onClick}
      className={`hud-btn ${hotbar ? "min-h-12" : "min-h-11"} ${className}`}
    />
  );
}

export function HudSwitch({
  checked,
  onChange,
  label,
  className = "",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`hud-btn min-h-11 justify-between gap-3 ${className}`}
    >
      <span>{label}</span>
      <span className="inline-flex items-center gap-1 font-mono text-sm">
        <HudIcon name={checked ? "ok" : "bad"} />
        {checked ? "ON" : "OFF"}
      </span>
    </button>
  );
}

/** A message in the world: loading, empty, or an error. `centered` fills the parent, otherwise position it with className. */
export function HudNote({
  children,
  role,
  icon,
  tone = "info",
  centered,
  className = "",
}: {
  children: ReactNode;
  role?: "alert" | "status";
  icon?: HudIconName;
  tone?: "info" | "bad";
  centered?: boolean;
  className?: string;
}) {
  const note = (
    <p role={role} className={`hud-panel hud-note ${tone === "bad" ? "hud-bad" : ""} flex items-start gap-2 px-4 py-3 text-sm ${className}`}>
      {icon && <HudIcon name={icon} className="mt-0.5" />}
      <span>{children}</span>
    </p>
  );
  return centered ? <div className="flex h-full items-center justify-center p-6">{note}</div> : note;
}
