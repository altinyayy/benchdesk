export function scoreColor(v: number) {
  return v >= 70 ? "var(--score-good)" : v >= 40 ? "var(--score-mid)" : "var(--score-bad)";
}

export function Meter({ value }: { value: number }) {
  const w = Math.max(0, Math.min(100, value));
  return (
    <div className="meter">
      <i style={{ width: `${w}%`, ["--c" as string]: scoreColor(w) }} />
    </div>
  );
}
