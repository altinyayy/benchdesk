/**
 * Parser for the CPU part of public/bench.sh ("=== Benchdesk CPU test vN ===").
 *
 *   sysbench_cpu_single_eps / sysbench_cpu_multi_eps   events per second
 *   sevenzip_single_mips / sevenzip_mips                7-Zip total rating (1 thread / all threads)
 *
 * Pure module so it can be unit tested.
 */

import type { Metric } from "../yabs/parse";

export type CpuResult = {
  version: string;
  startedAt: Date | null;
  cpuModel: string | null;
  threads: number | null;
  sysbenchVersion: string | null;
  sevenZipVersion: string | null;
  metrics: Metric[];
  warnings: string[];
};

export const CPU_START = /^=== Benchdesk CPU test v(\d+) ===\s*$/m;
export const CPU_END = /^=== Benchdesk CPU test end ===\s*$/m;

/** Returns null when the text has no CPU test section. */
export function parseCpuSection(text: string): CpuResult | null {
  const start = CPU_START.exec(text);
  if (!start) return null;
  const rest = text.slice(start.index + start[0].length);
  const end = CPU_END.exec(rest);
  const body = end ? rest.slice(0, end.index) : rest;
  const warnings: string[] = [];
  if (!end) warnings.push("The CPU test output looks cut off (no end marker).");

  const header = (label: string) => new RegExp(`^${label}\\s*:\\s*(.+)$`, "m").exec(body)?.[1].trim() ?? null;
  const date = header("Date \\(UTC\\)");
  const startedAt = date && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(date) ? new Date(date) : null;
  const threadsRaw = header("Threads");
  const threads = threadsRaw && /^\d+$/.test(threadsRaw) ? Number(threadsRaw) : null;

  // Split into the four "--- name ---" blocks.
  const blocks = new Map<string, string>();
  const re = /^--- (.+?) ---\s*$/gm;
  const marks = [...body.matchAll(re)];
  marks.forEach((m, i) => {
    const from = m.index! + m[0].length;
    const to = i + 1 < marks.length ? marks[i + 1].index! : body.length;
    blocks.set(m[1], body.slice(from, to));
  });

  const metrics: Metric[] = [];
  for (const [title, block] of blocks) {
    const single = /\b1 thread\b/.test(title);
    if (title.startsWith("sysbench")) {
      const eps = /events per second:\s*([\d.]+)/.exec(block)?.[1];
      if (eps && Number(eps) > 0)
        metrics.push({
          key: single ? "sysbench_cpu_single_eps" : "sysbench_cpu_multi_eps",
          value: Number(eps),
          unit: "events/s",
        });
    } else if (title.startsWith("7-Zip")) {
      // "Tot:   189   4625   8686" → last number is the total rating in MIPS.
      const tot = /^Tot:\s+([\d\s]+)$/m.exec(block)?.[1].trim().split(/\s+/).map(Number);
      const mips = tot?.at(-1);
      if (mips && Number.isFinite(mips) && mips > 0)
        metrics.push({ key: single ? "sevenzip_single_mips" : "sevenzip_mips", value: mips, unit: "MIPS" });
    }
  }

  const expected = ["sysbench_cpu_single_eps", "sysbench_cpu_multi_eps", "sevenzip_single_mips", "sevenzip_mips"];
  const missing = expected.filter((k) => !metrics.some((m) => m.key === k));
  if (missing.length) warnings.push(`CPU test is missing: ${missing.join(", ")}.`);

  return {
    version: start[1],
    startedAt,
    cpuModel: header("Processor"),
    threads,
    sysbenchVersion: header("sysbench"),
    sevenZipVersion: header("7-Zip")?.split(":")[0].trim() ?? null,
    metrics,
    warnings,
  };
}
