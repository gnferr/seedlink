import { failureReason, type Separation } from "@/lib/verify";

const ICON = {
  ok: "M5 12.5l4.5 4.5L19 7.5",
  bad: "M6 6l12 12M18 6L6 18",
  wait: "M12 6v6l4 2",
};

export default function ScanStatus({ separation }: { separation: Separation | null }) {
  const state = separation === null ? "wait" : separation.separated ? "ok" : "bad";
  const label =
    separation === null
      ? "Checking…"
      : separation.separated
        ? `Scans — ${separation.matched}/${separation.total} modules, ${separation.worstCaseContrast.toFixed(1)}:1`
        : `Won't scan — ${failureReason(separation)} · ${separation.matched}/${separation.total} modules`;
  return (
    <p
      role="status"
      aria-live="polite"
      className="inline-flex items-center gap-2 rounded-md border border-zinc-400 bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 dark:border-zinc-500 dark:bg-zinc-900 dark:text-zinc-100"
    >
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {state === "wait" && <circle cx="12" cy="12" r="9" />}
        <path d={ICON[state]} />
      </svg>
      {label}
    </p>
  );
}
