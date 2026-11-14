import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { cleanTerminalText, parseBitrate, parseLooseDate, parseYabs, type YabsResult } from "./parse";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");

function ok(input: string): YabsResult {
  const r = parseYabs(input);
  if (!r.ok) assert.fail(r.error);
  return r.result;
}
const metric = (r: YabsResult, key: string) => r.metrics.find((m) => m.key === key)?.value;

test("text output from the yabs README", () => {
  const r = ok(fixture("readme-example.txt"));
  assert.equal(r.format, "text");
  assert.equal(r.version, "v2023-04-23");
  assert.equal(r.system.cpuModel, "Intel(R) Xeon(R) E-2276G CPU @ 3.80GHz");
  assert.equal(r.system.cores, 12);
  assert.equal(r.system.freqMhz, 4693.667);
  assert.equal(r.system.aes, true);
  assert.equal(r.system.ramGib, 15.5);
  assert.equal(r.system.vmType, "NONE");

  assert.equal(metric(r, "yabs_fio_4k_read_mbps"), 405.41);
  assert.equal(metric(r, "yabs_fio_4k_read_iops"), 101300);
  assert.equal(metric(r, "yabs_fio_4k_total_iops"), 202900);
  assert.equal(metric(r, "yabs_fio_512k_read_iops"), 742);
  assert.equal(metric(r, "yabs_fio_1m_total_mbps"), 815.37);

  // IPv4 send: 1610, busy, 9100 → median of 2 = 5355
  assert.equal(metric(r, "yabs_iperf4_send_median_mbps"), 5355);
  assert.equal(metric(r, "yabs_iperf4_recv_median_mbps"), 2390);
  assert.equal(metric(r, "yabs_iperf6_recv_median_mbps"), 1560);
  assert.equal(r.iperf.length, 6);
  assert.equal(r.iperf[1].sendMbps, null);

  assert.equal(metric(r, "geekbench4_single"), 5949);
  assert.equal(metric(r, "geekbench5_multi"), 5529);
  assert.equal(metric(r, "geekbench6_single"), 1549);
  assert.equal(metric(r, "geekbench6_multi"), 5278);
  assert.equal(r.geekbenchUrls.length, 3);

  // "Sun 23 Apr 2023 01:41:14 PM EDT" = 17:41:14 UTC; run took 12 min 49 sec.
  assert.equal(r.startedAt?.toISOString(), "2023-04-23T17:41:14.000Z");
  assert.equal(r.finishedAt?.toISOString(), "2023-04-23T17:54:03.000Z");
  assert.ok(r.warnings.some((w) => w.includes("busy")));
});

test("JSON output (yabs -j / -s)", () => {
  const r = ok(fixture("example.json"));
  assert.equal(r.format, "json");
  assert.equal(r.system.cores, 12);
  assert.equal(r.system.ramGib, 15.494);
  // 405417 KiB/s → 415.15 MB/s
  assert.equal(metric(r, "yabs_fio_4k_read_mbps"), 415.15);
  assert.equal(metric(r, "yabs_fio_4k_total_iops"), 202975);
  assert.equal(metric(r, "yabs_iperf4_send_median_mbps"), 5355);
  assert.equal(metric(r, "geekbench6_multi"), 5278);
  assert.equal(r.startedAt?.toISOString(), new Date(1682271674 * 1000).toISOString());
  assert.equal(r.finishedAt?.toISOString(), new Date(1682272443 * 1000).toISOString());
});

test("current yabs version on a small VPS", () => {
  const r = ok(fixture("current-small-vps.txt"));
  assert.equal(r.version, "v2026-10-31");
  assert.equal(r.system.cpuModel, "AMD EPYC-Milan Processor");
  assert.equal(r.system.cores, 2);
  assert.equal(r.system.virt, false);
  assert.equal(r.system.vmType, "KVM");
  assert.equal(metric(r, "yabs_fio_64k_read_mbps"), 1100);
  assert.equal(metric(r, "yabs_fio_1m_total_mbps"), 2710);
  assert.equal(metric(r, "yabs_fio_4k_total_iops"), 90200);
  // send: 1210,1180,642,1650,2350,845 → sorted 642,845,1180,1210,1650,2350 → (1180+1210)/2
  assert.equal(metric(r, "yabs_iperf4_send_median_mbps"), 1195);
  // recv: 905,1050,412,560,1400,2290 → (905+1050)/2
  assert.equal(metric(r, "yabs_iperf4_recv_median_mbps"), 977.5);
  assert.equal(metric(r, "yabs_iperf4_ping_median_ms"), 82);
  assert.equal(metric(r, "yabs_iperf6_send_median_mbps"), undefined);
  assert.equal(r.startedAt?.toISOString(), "2026-11-14T00:12:05.000Z");
  assert.equal(r.finishedAt?.toISOString(), "2026-11-14T00:26:08.000Z");
});

test("terminal leftovers (ANSI codes, carriage returns, CRLF) are ignored", () => {
  const messy = fixture("current-small-vps.txt")
    .replace(/\n/g, "\r\n")
    .replace("Geekbench 6 Benchmark Test:", "Running GB6 benchmark test... *cue elevator music*\r\x1b[0KGeekbench 6 Benchmark Test:");
  const r = ok(messy);
  assert.equal(metric(r, "geekbench6_single"), 1412);
  assert.equal(metric(r, "yabs_fio_4k_total_iops"), 90200);
});

test("text followed by JSON prefers the JSON", () => {
  const r = ok(fixture("readme-example.txt") + "\n" + fixture("example.json"));
  assert.equal(r.format, "json");
});

test("rejects things that are not yabs output", () => {
  for (const input of ["", "   ", "hello world", '{"foo": 1}', "[1,2,3]"]) {
    assert.equal(parseYabs(input).ok, false, JSON.stringify(input));
  }
  assert.equal(parseYabs("x".repeat(200_000)).ok, false);
});

test("rejects output with no benchmark sections", () => {
  const onlySystem = fixture("readme-example.txt").split("fio Disk Speed Tests")[0];
  const r = parseYabs(onlySystem);
  assert.equal(r.ok, false);
});

test("rejects implausible values", () => {
  const fake = fixture("current-small-vps.txt").replace("Single Core     | 1412", "Single Core     | 9999999");
  const r = parseYabs(fake);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /geekbench6_single/);
});

test("warns about missing sections", () => {
  const noGb = fixture("current-small-vps.txt").split("Geekbench 6 Benchmark Test:")[0] + "YABS completed in 9 min 1 sec\n";
  const r = ok(noGb);
  assert.ok(r.warnings.some((w) => w.includes("Geekbench 6")));
});

test("helpers", () => {
  assert.equal(parseBitrate("2.04 Gbits/sec"), 2040);
  assert.equal(parseBitrate("905 Mbits/sec"), 905);
  assert.equal(parseBitrate("850 Kbits/sec"), 0.85);
  assert.equal(parseBitrate("busy"), null);
  assert.equal(parseLooseDate("Sat Nov 14 01:40:00 UTC 2026")?.toISOString(), "2026-11-14T01:40:00.000Z");
  assert.equal(parseLooseDate("Cmt 14 Kas 2026 01:40:00 +03")?.toISOString(), undefined); // unknown month names
  assert.equal(parseLooseDate("Sat 14 Nov 2026 01:40:00 +03")?.toISOString(), "2026-11-13T22:40:00.000Z");
  assert.equal(cleanTerminalText("abc\rdef\n"), "def\n");
});
