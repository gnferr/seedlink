"use client";

import { useId, useState } from "react";

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** "#abc" / "abc" / "#AABBCC" → "#aabbcc"; null when not a hex colour. */
export function normalizeHex(raw: string): string | null {
  const m = HEX.exec(raw.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return `#${h.toLowerCase()}`;
}

/** Any hex, unclamped (§10.3): a swatch picker plus a text field a brand hex can be pasted into. */
export default function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  // Follow external changes (a preset switch) without an effect; leave a draft that already says this colour alone.
  if (seen !== value) {
    setSeen(value);
    if (normalizeHex(draft) !== value) setDraft(value);
  }
  const invalid = normalizeHex(draft) === null;

  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`${label} colour picker`}
        className="h-9 w-9 shrink-0 cursor-pointer rounded-md border border-zinc-500 bg-transparent p-0.5"
      />
      <label htmlFor={id} className="min-w-0 flex-1 text-sm text-zinc-700 dark:text-zinc-300">
        {label}
      </label>
      <input
        id={id}
        value={draft}
        spellCheck={false}
        autoComplete="off"
        aria-invalid={invalid}
        onChange={(e) => {
          setDraft(e.target.value);
          const hex = normalizeHex(e.target.value);
          if (hex) onChange(hex);
        }}
        onBlur={() => setDraft(value)}
        className="h-9 w-24 rounded-md border border-zinc-500 bg-white px-2 font-mono text-sm tabular-nums text-zinc-900 aria-invalid:border-red-700 dark:bg-zinc-950 dark:text-zinc-50 dark:aria-invalid:border-red-400"
      />
    </div>
  );
}
