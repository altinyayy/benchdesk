/**
 * Parser for yabs.sh (Yet-Another-Bench-Script) results.
 *
 * Accepts either the plain-text terminal output or the JSON printed with
 * `-j` / sent with `-s`. Everything is normalized to the same metric keys:
 *
 *   yabs_fio_<bs>_<read|write|total>_mbps   MB/s (decimal), mixed 50/50 random R/W
 *   yabs_fio_<bs>_<read|write|total>_iops
 *   geekbench<N>_single / geekbench<N>_multi
 *   yabs_iperf4_send_median_mbps / yabs_iperf4_recv_median_mbps   (and iperf6)
 *   yabs_iperf4_ping_median_ms
 *
 * Pure module (no server or DB imports) so it can be unit tested.
 */

export type Metric = { key: string; value: number; unit: string };

export type IperfRow = {
  mode: "IPv4" | "IPv6";
  provider: string;
  location: string;
  sendMbps: number | null; // null = "busy" / failed
  recvMbps: number | null;
  pingMs: number | null;
};

export type YabsSystem = {
  cpuModel: string | null;
  cores: number | null;
  freqMhz: number | null;
  aes: boolean | null;
  virt: boolean | null;
  ramGib: number | null;
  diskGib: number | null;
  distro: string | null;
  kernel: string | null;
  vmType: string | null;
};

export type YabsResult = {
  format: "json" | "text";
  version: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  system: YabsSystem;
  metrics: Metric[];
  iperf: IperfRow[];
  geekbenchUrls: string[];
  /** Things the admin should know about, but that don't block saving. */
  warnings: string[];
};

export type ParseOutcome = { ok: true; result: YabsResult } | { ok: false; error: string };

export const MAX_INPUT_CHARS = 100_000;

// Values outside these ranges are physically implausible for a single VPS
// and point to a corrupted paste or fake data.
const LIMITS: { test: RegExp; min: number; max: number }[] = [
  { test: /_iops$/, min: 0, max: 20_000_000 },
  { test: /^yabs_fio_.*_mbps$/, min: 0, max: 100_000 }, // 100 GB/s
  { test: /^yabs_iperf.*_mbps$/, min: 0, max: 400_000 }, // 400 Gbit/s
  { test: /_ms$/, min: 0, max: 10_000 },
  { test: /^geekbench\d_(single|multi)$/, min: 1, max: 200_000 },
];

const BLOCK_SIZES = ["4k", "64k", "512k", "1m"] as const;

// --- entry point -------------------------------------------------------------

export function parseYabs(input: string): ParseOutcome {
  if (input.length > MAX_INPUT_CHARS) {
    return { ok: false, error: `The pasted text is too long (max ${MAX_INPUT_CHARS.toLocaleString("en-US")} characters).` };
  }
  const clean = cleanTerminalText(input);
  if (!clean.trim()) return { ok: false, error: "Paste the yabs.sh output first." };

  let result: YabsResult;
  const json = extractJson(clean);
  try {
    if (json) result = parseJson(json);
    else if (/Yet-Another-Bench-Script|Basic System Information|fio Disk Speed Tests|Geekbench \d Benchmark Test/.test(clean))
      result = parseText(clean);
    else return { ok: false, error: "This doesn't look like yabs.sh output." };
  } catch (err) {
    return { ok: false, error: err instanceof ParseError ? err.message : "Could not read this yabs.sh output." };
  }

  if (result.metrics.length === 0) {
    return { ok: false, error: "No benchmark results found (no fio, iperf3 or Geekbench section)." };
  }

  for (const m of result.metrics) {
    if (!Number.isFinite(m.value)) return { ok: false, error: `Invalid value for ${m.key}.` };
    const lim = LIMITS.find((l) => l.test.test(m.key));
    if (lim && (m.value < lim.min || m.value > lim.max)) {
      return { ok: false, error: `Implausible value for ${m.key}: ${m.value}. Check the pasted output.` };
    }
  }

  addSanityWarnings(result);
  return { ok: true, result };
}

class ParseError extends Error {}

// --- shared helpers ----------------------------------------------------------

/** Strip ANSI escapes and carriage-return progress lines left by the terminal. */
export function cleanTerminalText(s: string): string {
  return (
    s
      .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "")
      .replace(/\\033\[0K/g, "")
      .split("\n")
      // A line rewritten with \r only shows its last segment on screen.
      .map((line) => line.split("\r").filter(Boolean).pop() ?? "")
      .join("\n")
  );
}

function extractJson(s: string): unknown | null {
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  // Text output never contains a top-level "{"; JSON always starts with {"version" or similar.
  const candidate = s.slice(start, end + 1);
  if (!/^\{\s*"/.test(candidate)) return null;
  try {
    const v = JSON.parse(candidate);
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

function num(s: string | undefined | null): number | null {
  if (s == null) return null;
  const v = Number(String(s).trim().replace(/,/g, ""));
  return Number.isFinite(v) ? v : null;
}

function round(v: number, digits = 2) {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** "2.04 Gbits/sec" → 2040 (Mbit/s). "busy" → null. */
export function parseBitrate(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = /([\d.]+)\s*([KMGT])?bits\/sec/i.exec(s);
  if (!m) return null;
  const v = Number(m[1]);
  if (!Number.isFinite(v) || v <= 0) return null;
  const mult = { K: 1e-3, M: 1, G: 1e3, T: 1e6 }[(m[2] ?? "M").toUpperCase() as "K" | "M" | "G" | "T"] ?? 1;
  return round(v * mult, 3);
}

/** "77.5 ms" → 77.5, "--" → null. */
function parsePing(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = /([\d.]+)\s*ms/.exec(s);
  return m ? num(m[1]) : null;
}

/** "405.41 MB/s" → 405.41 (decimal MB/s, as printed by yabs). */
function parseSpeedText(s: string): number | null {
  const m = /([\d.]+)\s*([KMG])B\/s/i.exec(s);
  if (!m) return null;
  const v = Number(m[1]);
  const mult = { K: 1e-3, M: 1, G: 1e3 }[m[2].toUpperCase() as "K" | "M" | "G"];
  return Number.isFinite(v) ? round(v * mult) : null;
}

/** "(101.3k)" → 101300, "(742)" → 742. */
function parseIopsText(s: string): number | null {
  const m = /\(?\s*([\d.]+)\s*(k)?\s*\)?/i.exec(s);
  if (!m) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) ? Math.round(v * (m[2] ? 1000 : 1)) : null;
}

/** "15.5 GiB" → 15.5 (GiB). */
function parseSizeGib(s: string | null): number | null {
  if (!s) return null;
  const m = /([\d.]+)\s*([KMGT])i?B/i.exec(s);
  if (!m) return null;
  const v = Number(m[1]);
  const mult = { K: 1 / 1048576, M: 1 / 1024, G: 1, T: 1024 }[m[2].toUpperCase() as "K" | "M" | "G" | "T"];
  return Number.isFinite(v) ? round(v * mult, 3) : null;
}

function iperfMetrics(rows: IperfRow[]): Metric[] {
  const out: Metric[] = [];
  for (const mode of ["IPv4", "IPv6"] as const) {
    const r = rows.filter((x) => x.mode === mode);
    if (r.length === 0) continue;
    const tag = mode === "IPv4" ? "iperf4" : "iperf6";
    const send = median(r.map((x) => x.sendMbps).filter((x): x is number => x !== null));
    const recv = median(r.map((x) => x.recvMbps).filter((x): x is number => x !== null));
    const ping = median(r.map((x) => x.pingMs).filter((x): x is number => x !== null));
    if (send !== null) out.push({ key: `yabs_${tag}_send_median_mbps`, value: round(send, 1), unit: "Mbit/s" });
    if (recv !== null) out.push({ key: `yabs_${tag}_recv_median_mbps`, value: round(recv, 1), unit: "Mbit/s" });
    if (ping !== null) out.push({ key: `yabs_${tag}_ping_median_ms`, value: round(ping, 2), unit: "ms" });
  }
  return out;
}

function addSanityWarnings(r: YabsResult) {
  const keys = new Set(r.metrics.map((m) => m.key));
  if (!keys.has("yabs_fio_4k_total_iops")) r.warnings.push("No fio disk results (disk score will be empty).");
  if (!keys.has("geekbench6_single")) r.warnings.push("No Geekbench 6 result (CPU score will be empty).");
  if (!keys.has("yabs_iperf4_send_median_mbps") && !keys.has("yabs_iperf4_recv_median_mbps"))
    r.warnings.push("No IPv4 iperf3 results (network score will be empty).");
  const busy = r.iperf.filter((x) => x.sendMbps === null || x.recvMbps === null).length;
  if (busy > 0) r.warnings.push(`${busy} iperf3 location(s) were busy or failed; medians use the rest.`);
}

// --- JSON format -------------------------------------------------------------

type J = Record<string, unknown>;
const obj = (v: unknown): J => (v && typeof v === "object" && !Array.isArray(v) ? (v as J) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" ? num(v) : null);
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

function parseJson(raw: unknown): YabsResult {
  const j = obj(raw);
  if (!("fio" in j || "iperf" in j || "geekbench" in j || "cpu" in j)) {
    throw new ParseError("This JSON doesn't look like yabs.sh output.");
  }

  const cpu = obj(j.cpu);
  const os = obj(j.os);
  const mem = obj(j.mem);
  const system: YabsSystem = {
    cpuModel: str(cpu.model),
    cores: n(cpu.cores),
    freqMhz: num(String(cpu.freq ?? "").replace(/MHz/i, "")),
    aes: bool(cpu.aes),
    virt: bool(cpu.virt),
    ramGib: n(mem.ram) !== null ? round((n(mem.ram) as number) / 1048576, 3) : null, // KiB
    diskGib: n(mem.disk) !== null ? round((n(mem.disk) as number) / 1048576, 3) : null, // KB (1K blocks)
    distro: str(os.distro),
    kernel: str(os.kernel),
    vmType: str(os.vm),
  };

  const metrics: Metric[] = [];
  for (const f of arr(j.fio).map(obj)) {
    const bs = str(f.bs)?.toLowerCase();
    if (!bs || !(BLOCK_SIZES as readonly string[]).includes(bs)) continue;
    // fio reports bandwidth in KiB/s; convert to decimal MB/s like the text output.
    const toMBps = (v: unknown) => (n(v) !== null ? round(((n(v) as number) * 1024) / 1e6) : null);
    const pairs: [string, number | null, string][] = [
      [`yabs_fio_${bs}_read_mbps`, toMBps(f.speed_r), "MB/s"],
      [`yabs_fio_${bs}_write_mbps`, toMBps(f.speed_w), "MB/s"],
      [`yabs_fio_${bs}_total_mbps`, toMBps(f.speed_rw), "MB/s"],
      [`yabs_fio_${bs}_read_iops`, n(f.iops_r), "IOPS"],
      [`yabs_fio_${bs}_write_iops`, n(f.iops_w), "IOPS"],
      [`yabs_fio_${bs}_total_iops`, n(f.iops_rw), "IOPS"],
    ];
    for (const [key, value, unit] of pairs) if (value !== null && value > 0) metrics.push({ key, value, unit });
  }

  const iperf: IperfRow[] = arr(j.iperf)
    .map(obj)
    .filter((r) => r.mode === "IPv4" || r.mode === "IPv6")
    .map((r) => ({
      mode: r.mode as "IPv4" | "IPv6",
      provider: str(r.provider) ?? "",
      location: str(r.loc) ?? "",
      sendMbps: parseBitrate(str(r.send)),
      recvMbps: parseBitrate(str(r.recv)),
      pingMs: parsePing(str(r.latency)),
    }));
  metrics.push(...iperfMetrics(iperf));

  const geekbenchUrls: string[] = [];
  for (const g of arr(j.geekbench).map(obj)) {
    const ver = n(g.version);
    if (ver === null || !Number.isInteger(ver)) continue;
    const single = n(g.single);
    const multi = n(g.multi);
    if (single) metrics.push({ key: `geekbench${ver}_single`, value: single, unit: "points" });
    if (multi) metrics.push({ key: `geekbench${ver}_multi`, value: multi, unit: "points" });
    const url = str(g.url);
    if (url && /^https:\/\/browser\.geekbench\.com\//.test(url)) geekbenchUrls.push(url);
  }

  // runtime.start/end are Unix seconds; "time" is the server's local time without a zone.
  const rt = obj(j.runtime);
  const start = n(rt.start);
  const end = n(rt.end);
  return {
    format: "json",
    version: str(j.version),
    startedAt: start ? new Date(start * 1000) : null,
    finishedAt: end ? new Date(end * 1000) : null,
    system,
    metrics,
    iperf,
    geekbenchUrls,
    warnings: [],
  };
}

// --- text format -------------------------------------------------------------

function field(lines: string[], label: string): string | null {
  const re = new RegExp(`^${label.replace(/[/]/g, "\\/")}\\s*:\\s*(.*)$`);
  for (const l of lines) {
    const m = re.exec(l.trim());
    if (m) return m[1].trim() || null;
  }
  return null;
}

/** Splits the output into sections keyed by their heading line (the line above "-----"). */
function sections(lines: string[]): { title: string; body: string[] }[] {
  const out: { title: string; body: string[] }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^-{5,}\s*$/.test(lines[i].trim()) && i > 0) {
      out.push({ title: lines[i - 1].trim(), body: [] });
    } else if (out.length) {
      out[out.length - 1].body.push(lines[i]);
    }
  }
  // Drop the trailing heading line that got pushed into the previous body.
  for (let i = 0; i < out.length - 1; i++) out[i].body.pop();
  return out;
}

function parseText(text: string): YabsResult {
  const lines = text.split("\n");
  const warnings: string[] = [];

  const version = /#\s+(v\d{4}-\d{2}-\d{2})\s+#/.exec(text)?.[1] ?? null;

  const cores = field(lines, "CPU cores");
  const system: YabsSystem = {
    cpuModel: field(lines, "Processor"),
    cores: cores ? num(cores.split("@")[0]) : null,
    freqMhz: cores ? num(/@\s*([\d.]+)\s*MHz/.exec(cores)?.[1]) : null,
    aes: yesNo(field(lines, "AES-NI")),
    virt: yesNo(field(lines, "VM-x/AMD-V")),
    ramGib: parseSizeGib(field(lines, "RAM")),
    diskGib: parseSizeGib(field(lines, "Disk")),
    distro: field(lines, "Distro"),
    kernel: field(lines, "Kernel"),
    vmType: field(lines, "VM Type"),
  };

  const metrics: Metric[] = [];
  const iperf: IperfRow[] = [];
  const geekbenchUrls: string[] = [];

  for (const sec of sections(lines)) {
    if (/^fio Disk Speed Tests/i.test(sec.title)) metrics.push(...parseFioText(sec.body));
    else if (/^dd Sequential Disk Speed Tests/i.test(sec.title))
      warnings.push("fio failed on this server and yabs fell back to dd; dd results are not scored.");
    else if (/^iperf3 Network Speed Tests \((IPv4|IPv6)\)/i.test(sec.title)) {
      const mode = /IPv6/i.test(sec.title) ? "IPv6" : "IPv4";
      iperf.push(...parseIperfText(sec.body, mode));
    } else if (/^Geekbench (\d) Benchmark Test/i.test(sec.title)) {
      const ver = Number(/Geekbench (\d)/i.exec(sec.title)![1]);
      for (const l of sec.body) {
        const [k, v] = l.split("|").map((x) => x.trim());
        if (!k || v === undefined) continue;
        if (/^Single Core$/i.test(k) && num(v)) metrics.push({ key: `geekbench${ver}_single`, value: num(v)!, unit: "points" });
        if (/^Multi Core$/i.test(k) && num(v)) metrics.push({ key: `geekbench${ver}_multi`, value: num(v)!, unit: "points" });
        if (/^Full Test$/i.test(k) && /^https:\/\/browser\.geekbench\.com\/\S+$/.test(v)) geekbenchUrls.push(v);
      }
    }
  }
  metrics.push(...iperfMetrics(iperf));

  // The date line comes right after the banner; its format depends on the server locale.
  const dateLine = lines.find((l) => /^\w{3}\s+.*\d{2}:\d{2}:\d{2}/.test(l.trim()));
  const startedAt = dateLine ? parseLooseDate(dateLine.trim()) : null;
  const took = /YABS completed in (?:(\d+) min )?(\d+) sec/.exec(text);
  const secs = took ? Number(took[1] ?? 0) * 60 + Number(took[2]) : null;
  const finishedAt = startedAt && secs !== null ? new Date(startedAt.getTime() + secs * 1000) : null;
  if (!took) warnings.push('No "YABS completed" line; the run may have been cut short.');

  return { format: "text", version, startedAt, finishedAt, system, metrics, iperf, geekbenchUrls, warnings };
}

function yesNo(s: string | null): boolean | null {
  if (!s) return null;
  if (/Enabled/i.test(s)) return true;
  if (/Disabled/i.test(s)) return false;
  return null;
}

/**
 * fio table: two block sizes per block of rows, e.g.
 *   Block Size | 4k            (IOPS) | 64k           (IOPS)
 *   Read       | 405.41 MB/s (101.3k) | 407.96 MB/s   (6.3k)
 */
function parseFioText(body: string[]): Metric[] {
  const out: Metric[] = [];
  let cols: string[] = [];
  for (const line of body) {
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 2) continue;
    const label = cells[0];
    if (/^Block Size$/i.test(label)) {
      cols = cells.slice(1).map((c) => c.split(/\s+/)[0].toLowerCase());
      continue;
    }
    const kind = { Read: "read", Write: "write", Total: "total" }[label];
    if (!kind) continue;
    cells.slice(1).forEach((cell, i) => {
      const bs = cols[i];
      if (!bs || !(BLOCK_SIZES as readonly string[]).includes(bs)) return;
      const speed = parseSpeedText(cell);
      const iops = parseIopsText(cell.slice(cell.indexOf("(")));
      if (speed !== null && speed > 0) out.push({ key: `yabs_fio_${bs}_${kind}_mbps`, value: speed, unit: "MB/s" });
      if (cell.includes("(") && iops !== null && iops > 0)
        out.push({ key: `yabs_fio_${bs}_${kind}_iops`, value: iops, unit: "IOPS" });
    });
  }
  return out;
}

function parseIperfText(body: string[], mode: "IPv4" | "IPv6"): IperfRow[] {
  const out: IperfRow[] = [];
  for (const line of body) {
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 4) continue;
    if (/^Provider$/i.test(cells[0]) || /^-+$/.test(cells[0])) continue;
    out.push({
      mode,
      provider: cells[0],
      location: cells[1],
      sendMbps: parseBitrate(cells[2]),
      recvMbps: parseBitrate(cells[3]),
      pingMs: parsePing(cells[4]),
    });
  }
  return out;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const ZONES: Record<string, number> = { UTC: 0, GMT: 0, EST: -5, EDT: -4, CST: -6, CDT: -5, MST: -7, MDT: -6, PST: -8, PDT: -7, CET: 1, CEST: 2, BST: 1, EET: 2, EEST: 3 };

/**
 * Handles the common `date` formats:
 *   "Sat Nov 14 01:40:00 UTC 2026"   (C locale)
 *   "Sun 23 Apr 2023 01:41:14 PM EDT" (en_US locale)
 * Returns null when the zone or layout is unknown, rather than guessing.
 */
export function parseLooseDate(s: string): Date | null {
  const tokens = s.replace(/,/g, " ").split(/\s+/).filter(Boolean);
  let day: number | null = null;
  let month: number | null = null;
  let year: number | null = null;
  let time: [number, number, number] | null = null;
  let pm: boolean | null = null;
  let zone: number | null = null;
  for (const t of tokens) {
    const mi = MONTHS.indexOf(t.slice(0, 3).toLowerCase());
    if (mi !== -1 && month === null && /^[A-Za-z]+$/.test(t) && !/^(sun|mon|tue|wed|thu|fri|sat)/i.test(t)) month = mi;
    else if (/^\d{1,2}:\d{2}:\d{2}$/.test(t)) time = t.split(":").map(Number) as [number, number, number];
    else if (/^\d{4}$/.test(t)) year = Number(t);
    else if (/^\d{1,2}$/.test(t)) day = Number(t);
    else if (/^(AM|PM)$/i.test(t)) pm = /PM/i.test(t);
    else if (t.toUpperCase() in ZONES) zone = ZONES[t.toUpperCase()];
    else if (/^[+-]\d{2}$/.test(t)) zone = Number(t);
  }
  if (day === null || month === null || year === null || time === null || zone === null) return null;
  let [h] = time;
  if (pm !== null) h = (h % 12) + (pm ? 12 : 0);
  const ms = Date.UTC(year, month, day, h - zone, time[1], time[2]);
  return Number.isFinite(ms) ? new Date(ms) : null;
}
