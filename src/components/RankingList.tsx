"use client";

import { useState } from "react";
import { Meter } from "./Meter";

export type RankingRow = {
  trialId: number;
  provider: string;
  isSponsor: boolean;
  plan: string;
  spec: string;
  priceUsd: number;
  scores: [number | null, number | null, number | null, number | null];
  overall: number;
  value: number;
  stability: number | null;
};

const LABELS = ["CPU", "Disk", "Network", "Stability"] as const;
const SORTS = [
  { key: "value", label: "Best value" },
  { key: "overall", label: "Raw performance" },
  { key: "stability", label: "Stability" },
] as const;
type SortKey = (typeof SORTS)[number]["key"];

const usd = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function SortControl({ value, onChange }: { value: SortKey; onChange: (k: SortKey) => void }) {
  return (
    <div className="seg" role="group" aria-label="Sort by">
      {SORTS.map((s) => (
        <button key={s.key} type="button" aria-pressed={value === s.key} onClick={() => onChange(s.key)}>
          {s.label}
        </button>
      ))}
    </div>
  );
}

export function RankingSection({ rows, title, subtitle }: { rows: RankingRow[]; title: string; subtitle: string }) {
  const [sort, setSort] = useState<SortKey>("value");
  // Plans without a score in the chosen category go last.
  const sorted = [...rows].sort((a, b) => (b[sort] ?? -1) - (a[sort] ?? -1));

  return (
    <>
      <div className="sh">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <SortControl value={sort} onChange={setSort} />
      </div>
      <div className="list">
        {sorted.map((x, i) => (
          <div key={x.trialId} className={`row${i === 0 ? " first" : ""}`}>
            <div className="no">{i + 1}</div>
            <div>
              <div className="pn">
                {x.provider}
                {x.isSponsor && <span className="spon">sponsor</span>}
              </div>
              <div className="ps">{x.spec}</div>
            </div>
            <div className="mini">
              {x.scores.map((v, j) => (
                <div key={LABELS[j]}>
                  <b title={v === null ? "Not measured yet" : undefined}>{v ?? "—"}</b>
                  {LABELS[j]}
                  <Meter value={v} />
                </div>
              ))}
            </div>
            <div className="ov">
              <b>{x.overall}</b>
              <span>overall</span>
            </div>
            <div className="pr">
              ${usd(x.priceUsd)}/mo
              <span>{x.value.toFixed(1)} pts/$</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
