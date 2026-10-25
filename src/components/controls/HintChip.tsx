import PixelIcon from "./PixelIcon";

/** The next step in words; doubles as the keyboard fold/grow button while the tree is at rest. */
export default function HintChip({ text, action, passed, onAction }: {
  text: string;
  action: "Fold into code" | "Grow the tree" | null;
  passed: boolean;
  onAction(): void;
}) {
  return (
    <div className="pixel-glass step-lg">
      <button
        type="button"
        className="inner step-lg hint"
        aria-label={action ?? undefined}
        aria-disabled={action ? undefined : true}
        onClick={() => action && onAction()}
      >
        <PixelIcon name={passed ? "check" : "spark"} />
        <span>{text}</span>
      </button>
    </div>
  );
}
