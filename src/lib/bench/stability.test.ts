import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { cvPct, parseStabilitySection, quantile, stripStabilitySection } from "./stability";
import { parseSubmission } from "./submission";

// Real Raff bench.sh output with a synthetic 48-hour stability section appended
// (97 samples, a three-hour slump at samples 20–25, one missing disk value).
const fixture = readFileSync(new URL("../yabs/fixtures/raff-with-stability-synthetic.txt", import.meta.url), "utf8");

const metric = (ms: { key: string; value: number }[], key: string) => ms.find((m) => m.key === key)?.value;

test("quantile and cvPct", () => {
  assert.equal(quantile([1, 2, 3, 4, 5], 0.5), 3);
  assert.equal(quantile([10, 20], 0.05), 10.5);
  assert.equal(cvPct([5, 5, 5]), 0);
  assert.ok(Math.abs(cvPct([90, 110]) - 10) < 1e-9);
});

test("parses a 48-hour stability run", () => {
  const r = parseStabilitySection(fixture);
  assert.ok(r && !("error" in r));
  assert.equal(r.samples.length, 97);
  assert.equal(r.plannedHours, 48);
  assert.equal(r.intervalMin, 30);
  assert.equal(r.startedAt.toISOString(), "2026-11-15T15:20:00.000Z");
  assert.equal(r.finishedAt.toISOString(), "2026-11-17T15:20:00.000Z");
  assert.equal(metric(r.metrics, "stability_hours"), 48);
  assert.equal(metric(r.metrics, "stability_samples"), 97);
  // The slump pulls the 5th percentile down to ~72% of the median.
  const floor = metric(r.metrics, "stability_cpu_multi_floor_pct")!;
  assert.ok(floor > 70 && floor < 75, `floor ${floor}`);
  const cv = metric(r.metrics, "stability_cpu_multi_cv_pct")!;
  assert.ok(cv > 5 && cv < 10, `cv ${cv}`);
  const steal = metric(r.metrics, "stability_steal_avg_pct")!;
  assert.ok(steal > 0.5 && steal < 1, `steal ${steal}`);
  assert.equal(metric(r.metrics, "stability_steal_max_pct"), 6.5);
  assert.equal(r.samples[50].iops, null);
  assert.ok(r.warnings.some((w) => w.includes("missing values")));
  assert.ok(!r.warnings.some((w) => w.includes("cut off")));
});

test("a cut-off run still parses, with a warning", () => {
  const cut = fixture.slice(0, fixture.indexOf("S 2026-11-16T03:20:00Z"));
  const r = parseStabilitySection(cut);
  assert.ok(r && !("error" in r));
  assert.equal(r.samples.length, 24);
  assert.ok(r.warnings.some((w) => w.includes("cut off")));
});

test("too few samples is an error; no section is null", () => {
  const head = fixture.slice(0, fixture.indexOf("S 2026-11-15T16:20:00Z"));
  const r = parseStabilitySection(head);
  assert.ok(r && "error" in r);
  assert.equal(parseStabilitySection("nothing here"), null);
});

test("stripStabilitySection leaves the rest intact", () => {
  const stripped = stripStabilitySection(fixture);
  assert.ok(!stripped.includes("stability run"));
  assert.ok(stripped.includes("fio Disk Speed Tests"));
});

test("full bench.sh paste with stability: all metrics together", () => {
  const r = parseSubmission(fixture);
  assert.ok(r.ok, !r.ok ? r.error : "");
  const { result } = r;
  assert.ok(result.cpu && result.yabs && result.stability);
  assert.equal(metric(result.metrics, "sevenzip_mips"), 8512);
  assert.equal(metric(result.metrics, "yabs_fio_4k_total_iops"), 59400);
  assert.ok(metric(result.metrics, "stability_cpu_multi_cv_pct")! > 0);
  assert.equal(result.finishedAt?.toISOString(), "2026-11-17T15:20:00.000Z");
  assert.equal(result.startedAt?.toISOString(), "2026-11-15T15:09:16.000Z");
});
