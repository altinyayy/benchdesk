// Display helpers shared by the public pages. Everything is en-US and UTC so
// the server render never depends on the visitor's locale.

export const usd = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const day = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** 8512 → "8,512", 59400 → "59.4k", 3.46 → "3.46" */
export function num(n: number): string {
  if (Math.abs(n) >= 10_000) {
    return `${(n / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })}k`;
  }
  return n.toLocaleString("en-US", { maximumFractionDigits: Math.abs(n) < 10 ? 2 : Math.abs(n) < 100 ? 1 : 0 });
}

/** Full precision with separators, for tables: 59400 → "59,400". */
export const exact = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

export type PlanSpec = {
  vcpu: number;
  ramGb: number;
  diskGb: number;
  diskType: string | null;
};

export function specLine(p: PlanSpec, location?: string | null) {
  return [`${p.vcpu} vCPU`, `${p.ramGb} GB RAM`, `${p.diskGb} GB${p.diskType ? ` ${p.diskType}` : ""}`, location]
    .filter(Boolean)
    .join(" · ");
}

/**
 * The handful of raw numbers shown wherever scores are hidden (and next to
 * them otherwise). One headline metric per category.
 */
export const HEADLINE_METRICS = [
  { key: "sevenzip_mips", short: "7-Zip MIPS", label: "7-Zip MIPS (CPU)", unit: "MIPS" },
  { key: "yabs_fio_4k_total_iops", short: "4K IOPS", label: "4K IOPS (disk)", unit: "IOPS" },
  { key: "yabs_iperf4_send_median_mbps", short: "Mbit/s out", label: "Mbit/s out (median)", unit: "Mbit/s" },
  { key: "yabs_iperf4_recv_median_mbps", short: "Mbit/s in", label: "Mbit/s in (median)", unit: "Mbit/s" },
] as const;
