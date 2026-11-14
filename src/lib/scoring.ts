/**
 * Scoring: percentile-based, recomputed from raw metrics for all official
 * trials at once. Pure module (no DB) so it can be unit tested.
 *
 * 1. Each metric becomes a percentile (0–100) among the official trials that
 *    have that metric. Ties share the midpoint, so a lone trial scores 50.
 * 2. A category score is the average of its metric percentiles.
 * 3. Overall is the average of the categories the trial has.
 * 4. Value = overall / monthly price (points per dollar).
 */

export const METHODOLOGY_VERSION = "0.1";

export type Category = "cpu" | "disk" | "network" | "stability";

type MetricDef = { key: string; category: Category; higherIsBetter: boolean; label: string };

export const SCORED_METRICS: MetricDef[] = [
  { key: "geekbench6_single", category: "cpu", higherIsBetter: true, label: "Geekbench 6 single-core" },
  { key: "geekbench6_multi", category: "cpu", higherIsBetter: true, label: "Geekbench 6 multi-core" },
  { key: "yabs_fio_4k_total_iops", category: "disk", higherIsBetter: true, label: "fio 4K random IOPS (mixed R/W)" },
  { key: "yabs_fio_1m_total_mbps", category: "disk", higherIsBetter: true, label: "fio 1M throughput, MB/s (mixed R/W)" },
  { key: "yabs_iperf4_send_median_mbps", category: "network", higherIsBetter: true, label: "iperf3 send, median of locations" },
  { key: "yabs_iperf4_recv_median_mbps", category: "network", higherIsBetter: true, label: "iperf3 receive, median of locations" },
  // Stability metrics arrive with the 48-hour test script.
];

export type TrialInput = {
  trialId: number;
  priceUsd: number;
  metrics: Record<string, number>;
};

export type TrialScore = {
  trialId: number;
  cpu: number | null;
  disk: number | null;
  network: number | null;
  stability: number | null;
  overall: number;
  priceWeighted: number;
};

const CATEGORIES: Category[] = ["cpu", "disk", "network", "stability"];

/** Mid-rank percentile: share of others beaten, ties count half. */
export function percentile(value: number, population: number[], higherIsBetter = true): number {
  if (population.length === 0) return 50;
  let below = 0;
  let equal = 0;
  for (const p of population) {
    if (p === value) equal++;
    else if (higherIsBetter ? p < value : p > value) below++;
  }
  return (100 * (below + equal / 2)) / population.length;
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const round1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Trials without any scored metric get no score at all (they can't be ranked).
 */
export function computeScores(trials: TrialInput[]): TrialScore[] {
  const populations = new Map<string, number[]>();
  for (const def of SCORED_METRICS) {
    populations.set(
      def.key,
      trials.map((t) => t.metrics[def.key]).filter((v): v is number => typeof v === "number" && Number.isFinite(v)),
    );
  }

  const out: TrialScore[] = [];
  for (const t of trials) {
    const perCategory: Record<Category, number[]> = { cpu: [], disk: [], network: [], stability: [] };
    for (const def of SCORED_METRICS) {
      const v = t.metrics[def.key];
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      perCategory[def.category].push(percentile(v, populations.get(def.key)!, def.higherIsBetter));
    }
    const cats = Object.fromEntries(
      CATEGORIES.map((c) => [c, perCategory[c].length ? round1(avg(perCategory[c])) : null]),
    ) as Record<Category, number | null>;
    const present = CATEGORIES.map((c) => cats[c]).filter((v): v is number => v !== null);
    if (present.length === 0) continue;
    const overall = round1(avg(present));
    out.push({
      trialId: t.trialId,
      ...cats,
      overall,
      priceWeighted: t.priceUsd > 0 ? Math.round((overall / t.priceUsd) * 100) / 100 : 0,
    });
  }
  return out;
}
