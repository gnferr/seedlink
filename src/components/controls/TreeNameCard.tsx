/** The tree's name in the top corner, and where it grew from; the scan framing keeps the folded code below it. */
export default function TreeNameCard({ name, host, hidden, cardRef }: {
  name: string;
  host: string | null;
  hidden: boolean;
  cardRef: React.Ref<HTMLDivElement>;
}) {
  return (
    // Hidden, not removed, so the code's framing doesn't jump when the field is cleared and refilled.
    <div ref={cardRef} className={`pixel-glass step-lg name-card ${hidden ? "invisible" : ""}`}>
      <div className="inner step-lg name-inner">
        <b>{name}</b>
        <span>grown from {host ?? "your text"}</span>
      </div>
    </div>
  );
}
