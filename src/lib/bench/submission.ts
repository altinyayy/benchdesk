/**
 * Combines everything an admin can paste: the output of public/bench.sh
 * (Benchdesk CPU test + yabs.sh, optionally followed by the stability run),
 * or yabs.sh output alone.
 *
 * Geekbench results are never stored: its license doesn't cover publishing
 * scores on a commercial site (decision 15.11.2026). Old pastes that include
 * them still parse; the Geekbench numbers are dropped with a warning.
 */

import { cleanTerminalText, MAX_INPUT_CHARS, parseYabs, type Metric, type YabsResult } from "../yabs/parse";
import { CPU_END, CPU_START, parseCpuSection, type CpuResult } from "./cpu";
import { parseStabilitySection, stripStabilitySection, type StabilityResult } from "./stability";

// A 48-hour stability run adds only ~100 lines, but allow long custom runs too.
const MAX_SUBMISSION_CHARS = 400_000;

export type Submission = {
  metrics: Metric[];
  cpuModel: string | null;
  cores: number | null;
  ramGib: number | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  yabs: YabsResult | null;
  cpu: CpuResult | null;
  stability: StabilityResult | null;
  warnings: string[];
};

export type SubmissionOutcome = { ok: true; result: Submission } | { ok: false; error: string };

const LIMITS: { test: RegExp; min: number; max: number }[] = [
  { test: /^sysbench_.*_eps$/, min: 1, max: 10_000_000 },
  { test: /^sevenzip_.*mips$/, min: 1, max: 10_000_000 },
];

const YABS_MARKER = /Yet-Another-Bench-Script|Basic System Information|fio Disk Speed Tests|iperf3 Network Speed Tests|\{\s*"version"/;

export function parseSubmission(input: string): SubmissionOutcome {
  if (input.length > MAX_SUBMISSION_CHARS) {
    return { ok: false, error: `The pasted text is too long (max ${MAX_SUBMISSION_CHARS.toLocaleString("en-US")} characters).` };
  }
  const full = cleanTerminalText(input);
  if (!full.trim()) return { ok: false, error: "Paste the benchmark output first." };

  const stab = parseStabilitySection(full);
  if (stab && "error" in stab) return { ok: false, error: stab.error };
  const stability = stab;
  const clean = stability ? stripStabilitySection(full) : full;
  if (clean.length > MAX_INPUT_CHARS) {
    return { ok: false, error: `The pasted text is too long (max ${MAX_INPUT_CHARS.toLocaleString("en-US")} characters).` };
  }

  const cpu = parseCpuSection(clean);
  for (const m of cpu?.metrics ?? []) {
    const lim = LIMITS.find((l) => l.test.test(m.key));
    if (lim && (m.value < lim.min || m.value > lim.max))
      return { ok: false, error: `Implausible value for ${m.key}: ${m.value}. Check the pasted output.` };
  }

  // yabs gets the text without the CPU section, so its parser can't trip over it.
  const withoutCpu = cpu ? stripCpuSection(clean) : clean;
  let yabs: YabsResult | null = null;
  if (YABS_MARKER.test(withoutCpu)) {
    const r = parseYabs(withoutCpu);
    if (!r.ok) return r;
    yabs = r.result;
  }

  if (!cpu && !yabs) return { ok: false, error: "This doesn't look like Benchdesk or yabs.sh output." };

  const warnings = [...(cpu?.warnings ?? []), ...(yabs?.warnings ?? []), ...(stability?.warnings ?? [])];
  const yabsMetrics = yabs?.metrics ?? [];
  if (yabsMetrics.some((m) => m.key.startsWith("geekbench")))
    warnings.push("Geekbench results were ignored (not licensed for our use). Run yabs with -g, or use bench.sh.");
  if (!cpu) warnings.push("No Benchdesk CPU test in the output (CPU score will be empty). Use bench.sh.");
  if (!yabs) warnings.push("No yabs.sh output (disk and network scores will be empty).");

  const metrics = [
    ...(cpu?.metrics ?? []),
    ...yabsMetrics.filter((m) => !m.key.startsWith("geekbench")),
    ...(stability?.metrics ?? []),
  ];
  if (metrics.length === 0) return { ok: false, error: "No benchmark results found." };

  if (cpu && yabs?.system.cores != null && cpu.threads != null && cpu.threads !== yabs.system.cores)
    warnings.push(`The CPU test saw ${cpu.threads} threads but yabs saw ${yabs.system.cores} cores. Were they run on the same server?`);

  return {
    ok: true,
    result: {
      metrics,
      cpuModel: yabs?.system.cpuModel ?? cpu?.cpuModel ?? null,
      cores: yabs?.system.cores ?? cpu?.threads ?? null,
      ramGib: yabs?.system.ramGib ?? null,
      // bench.sh runs the CPU test first, then yabs.
      startedAt: cpu?.startedAt ?? yabs?.startedAt ?? null,
      // The stability run comes last, so it marks the end of the test.
      finishedAt: stability?.finishedAt ?? yabs?.finishedAt ?? null,
      yabs,
      cpu,
      stability,
      warnings,
    },
  };
}

function stripCpuSection(text: string): string {
  const start = CPU_START.exec(text);
  if (!start) return text;
  const after = text.slice(start.index);
  const end = CPU_END.exec(after);
  // Without an end marker, keep anything from the yabs banner onwards.
  const cut = end ? end.index + end[0].length : Math.max(0, after.search(/^# ## ## /m));
  return text.slice(0, start.index) + after.slice(cut);
}
