"use client";

import Link from "next/link";
import { useState } from "react";
import { Meter } from "./Meter";

export type RankingCell = {
  label: string;
  value: string;
  /** 0–100 for a score bar; omit for raw measurements. */
  meter?: number | null;
  title?: string;
};

export type RankingRow = {
  id: number;
  provider: string;
  isSponsor: boolean;
  href: string;
  spec: string;
  cells: RankingCell[];
  /** Big number on the right, e.g. the overall score. */
  big?: { value: string; label: string };
  price: string;
  priceNote?: string;
  /** Values for each sort option; higher sorts first, null goes last. */
  sort: Record<string, number | null>;
};

export type SortOption = { key: string; label: string };

export function RankingSection({
  rows,
  title,
  subtitle,
  sorts,
  children,
}: {
  rows: RankingRow[];
  title: string;
  subtitle: string;
  sorts: SortOption[];
  children?: React.ReactNode;
}) {
  const [sort, setSort] = useState(sorts[0].key);
  const sorted = [...rows].sort((a, b) => (b.sort[sort] ?? -Infinity) - (a.sort[sort] ?? -Infinity));
  const withBig = rows.some((r) => r.big);

  return (
    <>
      <div className="sh">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <div className="seg" role="group" aria-label="Sort by">
          {sorts.map((s) => (
            <button key={s.key} type="button" aria-pressed={sort === s.key} onClick={() => setSort(s.key)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
      {children}
      <div className="list">
        {sorted.map((x, i) => (
          <div key={x.id} className={`row${withBig ? "" : " nobig"}${i === 0 ? " first" : ""}`}>
            <div className="no">{i + 1}</div>
            <div>
              <div className="pn">
                <Link href={x.href}>{x.provider}</Link>
                {x.isSponsor && <span className="spon">sponsor</span>}
              </div>
              <div className="ps">{x.spec}</div>
            </div>
            <div className="mini">
              {x.cells.map((c) => (
                <div key={c.label}>
                  <b title={c.title}>{c.value}</b>
                  {c.label}
                  {c.meter !== undefined && <Meter value={c.meter} />}
                </div>
              ))}
            </div>
            {withBig && (
              <div className="ov">
                <b>{x.big?.value ?? "—"}</b>
                <span>{x.big?.label}</span>
              </div>
            )}
            <div className="pr">
              {x.price}
              {x.priceNote && <span>{x.priceNote}</span>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
