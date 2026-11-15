import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parseCpuSection } from "./cpu";
import { parseSubmission, type Submission } from "./submission";

const fixture = (name: string) => readFileSync(join(__dirname, "..", "yabs", "fixtures", name), "utf8");
const metric = (r: { metrics: { key: string; value: number }[] }, key: string) => r.metrics.find((m) => m.key === key)?.value;

function ok(input: string): Submission {
  const r = parseSubmission(input);
  if (!r.ok) assert.fail(r.error);
  return r.result;
}

test("CPU section from bench.sh (real sysbench 1.0.20 + 7-Zip 23.01 output)", () => {
  const r = parseCpuSection(fixture("benchdesk-cpu.txt"))!;
  assert.equal(r.version, "1");
  assert.equal(r.threads, 2);
  assert.equal(r.cpuModel, "Intel(R) Xeon(R) Processor @ 2.10GHz");
  assert.equal(r.sysbenchVersion, "sysbench 1.0.20");
  assert.equal(r.sevenZipVersion, "7-Zip 23.01 (x64)");
  assert.equal(r.startedAt?.toISOString(), "2026-11-15T00:45:18.000Z");
  assert.equal(metric(r, "sysbench_cpu_single_eps"), 2673.11);
  assert.equal(metric(r, "sysbench_cpu_multi_eps"), 5268.08);
  assert.equal(metric(r, "sevenzip_single_mips"), 3360);
  assert.equal(metric(r, "sevenzip_mips"), 8686);
  assert.deepEqual(r.warnings, []);
});

test("no CPU section → null", () => {
  assert.equal(parseCpuSection(fixture("current-small-vps.txt")), null);
});

test("full bench.sh output: CPU test + yabs -g", () => {
  const r = ok(fixture("bench-sh-full.txt"));
  assert.ok(r.cpu && r.yabs);
  assert.equal(metric(r, "sevenzip_mips"), 8686);
  assert.equal(metric(r, "yabs_fio_4k_total_iops"), 90200);
  assert.equal(metric(r, "yabs_iperf4_send_median_mbps"), 1195);
  assert.equal(r.cpuModel, "AMD EPYC-Milan Processor"); // yabs wins
  assert.equal(r.startedAt?.toISOString(), "2026-11-14T00:09:30.000Z"); // CPU test ran first
  assert.equal(r.finishedAt?.toISOString(), "2026-11-14T00:26:08.000Z");
  assert.ok(!r.metrics.some((m) => m.key.startsWith("geekbench")));
  assert.ok(!r.warnings.some((w) => /Geekbench|No Benchdesk CPU/.test(w)));
});

test("yabs with Geekbench: Geekbench is dropped with a warning", () => {
  const r = ok(fixture("current-small-vps.txt"));
  assert.equal(metric(r, "geekbench6_single"), undefined);
  assert.ok(r.warnings.some((w) => w.includes("Geekbench results were ignored")));
  assert.ok(r.warnings.some((w) => w.includes("No Benchdesk CPU test")));
});

test("JSON yabs still works through the submission parser", () => {
  const r = ok(fixture("example.json"));
  assert.equal(metric(r, "yabs_fio_4k_total_iops"), 202975);
  assert.equal(metric(r, "geekbench6_multi"), undefined);
});

test("CPU test alone", () => {
  const r = ok(fixture("benchdesk-cpu.txt"));
  assert.equal(r.yabs, null);
  assert.equal(r.cores, 2);
  assert.ok(r.warnings.some((w) => w.includes("No yabs.sh output")));
});

test("truncated CPU test still parses what it has", () => {
  const cut = fixture("benchdesk-cpu.txt").split("--- 7-Zip benchmark, 2 threads ---")[0];
  const r = ok(cut);
  assert.equal(metric(r, "sevenzip_mips"), undefined);
  assert.equal(metric(r, "sevenzip_single_mips"), 3360);
  assert.ok(r.warnings.some((w) => w.includes("cut off")));
  assert.ok(r.warnings.some((w) => w.includes("sevenzip_mips")));
});

test("thread/core mismatch between the two parts is flagged", () => {
  const mixed = fixture("bench-sh-full.txt").replace("Threads    : 2", "Threads    : 8");
  const r = ok(mixed);
  assert.ok(r.warnings.some((w) => w.includes("same server")));
});

test("rejects garbage and implausible CPU numbers", () => {
  assert.equal(parseSubmission("hello").ok, false);
  assert.equal(parseSubmission("").ok, false);
  const fake = fixture("benchdesk-cpu.txt").replace("events per second:  2673.11", "events per second:  99999999");
  assert.equal(parseSubmission(fake).ok, false);
});
