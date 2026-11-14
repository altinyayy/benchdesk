import assert from "node:assert/strict";
import { test } from "node:test";
import { computeScores, percentile } from "./scoring";

test("percentile is mid-rank", () => {
  assert.equal(percentile(5, [5]), 50);
  assert.equal(percentile(10, [10, 20]), 25);
  assert.equal(percentile(20, [10, 20]), 75);
  assert.equal(percentile(10, [10, 10]), 50);
  assert.equal(percentile(10, [10, 20], false), 75); // lower is better
});

test("scores across trials", () => {
  const scores = computeScores([
    {
      trialId: 1,
      priceUsd: 5,
      metrics: {
        geekbench6_single: 1000,
        geekbench6_multi: 2000,
        yabs_fio_4k_total_iops: 50000,
        yabs_fio_1m_total_mbps: 1000,
        yabs_iperf4_send_median_mbps: 900,
        yabs_iperf4_recv_median_mbps: 900,
      },
    },
    {
      trialId: 2,
      priceUsd: 10,
      metrics: {
        geekbench6_single: 1500,
        geekbench6_multi: 3000,
        yabs_fio_4k_total_iops: 30000,
        yabs_fio_1m_total_mbps: 2000,
        yabs_iperf4_send_median_mbps: 2000,
        yabs_iperf4_recv_median_mbps: 2000,
      },
    },
    // No Geekbench, no network: only a disk score.
    { trialId: 3, priceUsd: 4, metrics: { yabs_fio_4k_total_iops: 70000, yabs_fio_1m_total_mbps: 500 } },
    // Nothing scorable.
    { trialId: 4, priceUsd: 4, metrics: { geekbench5_single: 900 } },
  ]);

  const byId = new Map(scores.map((s) => [s.trialId, s]));
  assert.equal(byId.has(4), false);

  const t1 = byId.get(1)!;
  assert.equal(t1.cpu, 25); // loses both CPU metrics out of 2
  // 4k: 50000 among [50000,30000,70000] → (1+0.5)/3 = 50; 1m: 1000 among [1000,2000,500] → 50
  assert.equal(t1.disk, 50);
  assert.equal(t1.network, 25);
  assert.equal(t1.stability, null);
  assert.equal(t1.overall, 33.3);
  assert.equal(t1.priceWeighted, 6.66);

  const t2 = byId.get(2)!;
  assert.equal(t2.cpu, 75);
  assert.equal(t2.network, 75);

  const t3 = byId.get(3)!;
  assert.equal(t3.cpu, null);
  assert.equal(t3.network, null);
  assert.equal(t3.overall, t3.disk);
});

test("free plans don't divide by zero", () => {
  const [s] = computeScores([{ trialId: 1, priceUsd: 0, metrics: { geekbench6_single: 1 } }]);
  assert.equal(s.priceWeighted, 0);
});
