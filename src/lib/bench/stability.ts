/**
 * Parser for the stability run of public/bench.sh --hours N
 * ("=== Benchdesk stability run vN ===").
 *
 * Each sample line:  S <time UTC> <cpu1 eps> <cpuN eps> <steal %> <fio 4K IOPS>
 * ("-" = not measured). A run that was cut off still parses; the summary
 * just covers fewer hours.
 *
 * Summary metrics (stored per trial):
 *   stability_hours, stability_samples
 *   stability_cpu_multi_median_eps   typical all-threads sysbench speed
 *   stability_cpu_multi_cv_pct       variation (std dev / mean); lower = steadier
 *   stability_cpu_multi_floor_pct    5th percentile as % of the median; higher = fewer slumps
 *   stability_cpu_single_cv_pct
 *   stability_steal_avg_pct / stability_steal_max_pct   CPU time taken by the host
 *   stability_disk_iops_median / stability_disk_iops_cv_pct / stability_disk_iops_floor_pct
 *
 * Pure module so it can be unit tested.
 */

import type { Metric } from "../yabs/parse";

export type StabilitySample = {
  t: Date;
  cpu1: number | null;
  cpuN: number | null;
  steal: number | null;
  iops: number | null;
};

export type StabilityResult = {
  version: string;
  plannedHours: number | null;
  intervalMin: number | null;
  samples: StabilitySample[];
  startedAt: Date;
  finishedAt: Date;
  metrics: Metric[];
  warnings: string[];
};

export const STABILITY_START = /^=== Benchdesk stability run v(\d+) ===\s*$/m;
export const STABILITY_END = /^=== Benchdesk stability run end ===\s*$/m;

const SAMPLE = /^S\s+(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s*$/gm;
const MIN_SAMPLES = 3;

// Same idea as the CPU limits: anything outside is a corrupted paste.
const RANGE = {
  cpu: [1, 10_000_000],
  steal: [0, 100],
  iops: [1, 50_000_000],
} as const;

function value(raw: string, [min, max]: readonly [number, number]): number | null {
  if (raw === "-" || !/^\d+(\.\d+)?$/.test(raw)) return null;
  const v = Number(raw);
  return v >= min && v <= max ? v : null;
}

const median = (xs: number[]) => quantile(xs, 0.5);

/** Linear interpolation between closest ranks. */
export function quantile(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/** Coefficient of variation in percent (population std dev / mean). */
export function cvPct(xs: number[]): number {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  if (mean === 0) return 0;
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
  return (100 * Math.sqrt(variance)) / mean;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Returns null when the text has no stability section. */
export function parseStabilitySection(text: string): StabilityResult | { error: string } | null {
  const start = STABILITY_START.exec(text);
  if (!start) return null;
  const rest = text.slice(start.index + start[0].length);
  const end = STABILITY_END.exec(rest);
  const body = end ? rest.slice(0, end.index) : rest;
  const warnings: string[] = [];

  const header = (label: string) => new RegExp(`^${label}\\s*:\\s*(\\d+)`, "m").exec(body)?.[1];
  const plannedHours = header("Duration") ? Number(header("Duration")) : null;
  const intervalMin = header("Interval") ? Number(header("Interval")) : null;

  const samples: StabilitySample[] = [];
  for (const m of body.matchAll(SAMPLE)) {
    samples.push({
      t: new Date(m[1]),
      cpu1: value(m[2], RANGE.cpu),
      cpuN: value(m[3], RANGE.cpu),
      steal: value(m[4], RANGE.steal),
      iops: value(m[5], RANGE.iops),
    });
  }
  samples.sort((a, b) => a.t.getTime() - b.t.getTime());
  if (samples.length < MIN_SAMPLES) {
    return { error: `The stability run has only ${samples.length} sample(s); at least ${MIN_SAMPLES} are needed.` };
  }

  const startedAt = samples[0].t;
  const finishedAt = samples[samples.length - 1].t;
  const hours = (finishedAt.getTime() - startedAt.getTime()) / 3_600_000;
  if (!end) warnings.push(`The stability run looks cut off: ${samples.length} samples over ${hours.toFixed(1)} hours.`);
  else if (plannedHours !== null && hours < plannedHours - 1)
    warnings.push(`The stability run covers ${hours.toFixed(1)} of ${plannedHours} planned hours.`);
  if (plannedHours !== null && plannedHours < 48)
    warnings.push(`This was a ${plannedHours}-hour stability run; official results use 48 hours.`);

  const col = (k: keyof Omit<StabilitySample, "t">) =>
    samples.map((s) => s[k]).filter((v): v is number => v !== null);
  const cpuN = col("cpuN");
  const cpu1 = col("cpu1");
  const steal = col("steal");
  const iops = col("iops");
  const missing = samples.length - Math.min(cpuN.length, iops.length);
  if (missing > 0) warnings.push(`${missing} stability sample(s) had missing values.`);

  const metrics: Metric[] = [
    { key: "stability_hours", value: r2(hours), unit: "h" },
    { key: "stability_samples", value: samples.length, unit: "samples" },
  ];
  const add = (key: string, v: number, unit: string) => metrics.push({ key, value: r2(v), unit });
  if (cpuN.length >= MIN_SAMPLES) {
    const med = median(cpuN);
    add("stability_cpu_multi_median_eps", med, "events/s");
    add("stability_cpu_multi_cv_pct", cvPct(cpuN), "%");
    add("stability_cpu_multi_floor_pct", med > 0 ? (100 * quantile(cpuN, 0.05)) / med : 0, "%");
  }
  if (cpu1.length >= MIN_SAMPLES) add("stability_cpu_single_cv_pct", cvPct(cpu1), "%");
  if (steal.length >= MIN_SAMPLES) {
    add("stability_steal_avg_pct", steal.reduce((a, b) => a + b, 0) / steal.length, "%");
    add("stability_steal_max_pct", Math.max(...steal), "%");
  }
  if (iops.length >= MIN_SAMPLES) {
    const med = median(iops);
    add("stability_disk_iops_median", med, "IOPS");
    add("stability_disk_iops_cv_pct", cvPct(iops), "%");
    add("stability_disk_iops_floor_pct", med > 0 ? (100 * quantile(iops, 0.05)) / med : 0, "%");
  }

  return {
    version: start[1],
    plannedHours,
    intervalMin,
    samples,
    startedAt,
    finishedAt,
    metrics,
    warnings,
  };
}

/** Removes the stability section so the yabs parser never sees it. */
export function stripStabilitySection(text: string): string {
  const start = STABILITY_START.exec(text);
  if (!start) return text;
  const after = text.slice(start.index);
  const end = STABILITY_END.exec(after);
  return text.slice(0, start.index) + (end ? after.slice(end.index + end[0].length) : "");
}
