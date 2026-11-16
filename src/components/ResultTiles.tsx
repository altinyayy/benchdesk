import Link from "next/link";
import { Meter } from "./Meter";
import type { Scores } from "@/lib/data";
import { HEADLINE_METRICS, num } from "@/lib/format";
import { MIN_PLANS_FOR_SCORES } from "@/lib/scoring";

/**
 * Four tiles: category scores once scores are published, otherwise the
 * headline raw measurements (so a lone test never shows "50 · 50 · 50").
 */
export function ResultTiles({
  scores,
  metrics,
  published,
}: {
  scores: Scores | null;
  metrics: Record<string, number>;
  published: boolean;
}) {
  if (published && scores) {
    const tiles: [string, number | null][] = [
      ["CPU", scores.cpu],
      ["Disk", scores.disk],
      ["Network", scores.network],
      ["Stability", scores.stability],
    ];
    return (
      <div className="scores">
        {tiles.map(([l, v]) => (
          <div className="sc" key={l}>
            <div className="v" title={v === null ? "Not measured yet" : undefined}>
              {v ?? "—"}
            </div>
            <div className="l">{l}</div>
            <Meter value={v} />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="scores">
      {HEADLINE_METRICS.map((m) => {
        const v = metrics[m.key];
        return (
          <div className="sc" key={m.key}>
            <div className="v" title={v === undefined ? "Not measured" : undefined}>
              {v === undefined ? "—" : num(v)}
            </div>
            <div className="l">{m.label}</div>
          </div>
        );
      })}
    </div>
  );
}

export function EarlyNote({ ranked }: { ranked: number }) {
  return (
    <p className="early">
      <b>Early results.</b> Scores compare plans with each other, so we show them once {MIN_PLANS_FOR_SCORES} plans have
      been tested ({ranked} so far). Until then you see the raw measurements.{" "}
      <Link href="/methodology#scores">How scores work</Link>
    </p>
  );
}
