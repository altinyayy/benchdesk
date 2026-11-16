import Link from "next/link";
import { connection } from "next/server";
import { Suspense, cache } from "react";
import { BarChart, Sparkline } from "@/components/Charts";
import { RankingSection, type RankingRow, type SortOption } from "@/components/RankingList";
import { EarlyNote, ResultTiles } from "@/components/ResultTiles";
import { getCpuSeries, getRankings, type RankedPlan } from "@/lib/data";
import { HEADLINE_METRICS, day, num, specLine, usd } from "@/lib/format";
import { scoresArePublished } from "@/lib/scoring";

export const metadata = { alternates: { canonical: "/" } };

// One query per request, shared by every section below.
const loadRankings = cache(async (): Promise<RankedPlan[] | null> => {
  await connection(); // request time only; keeps the DB out of `next build`
  try {
    return await getRankings();
  } catch (err) {
    console.error("Failed to load rankings", err);
    return null; // shown as "temporarily unavailable"
  }
});

const spec = (p: RankedPlan) => specLine(p, p.location);

export default function Home() {
  return (
    <main className="in">
      <section className="hero">
        <div>
          <h1>
            We push &ldquo;unlimited performance&rdquo; VPS plans <span className="mk">for 48 hours straight</span>.
          </h1>
          <p className="lede">
            Some hold up. Some slow to a crawl at midnight. Every plan runs the same script, and we publish the results as
            they come.
          </p>
          <div className="ctas">
            <Link className="btn p" href="#rankings">
              See the rankings
            </Link>
            <Link className="btn s" href="/methodology">
              How do we test?
            </Link>
          </div>
        </div>
        <Suspense fallback={<HeroCardShell />}>
          <HeroCard />
        </Suspense>
      </section>

      <section className="sec" id="rankings">
        <Suspense fallback={<RankingsShell />}>
          <Rankings />
        </Suspense>
      </section>

      <section className="sec" id="how">
        <div className="sh">
          <div>
            <h2>How do we test?</h2>
            <p>The short version. The full methodology has its own page.</p>
          </div>
        </div>
        <div className="steps">
          <div className="step">
            <span className="n">Step 1</span>
            <h3>Clean install</h3>
            <p>Every plan starts fresh on Ubuntu 24.04. We don&apos;t tweak any settings.</p>
          </div>
          <div className="step">
            <span className="n">Step 2</span>
            <h3>Same script, 48 hours</h3>
            <p>
              CPU, disk and network tests run with <code>sysbench</code>, <code>fio</code> and <code>iperf3</code>. For
              stability, we repeat short tests every 30 minutes.
            </p>
          </div>
          <div className="step">
            <span className="n">Step 3</span>
            <h3>Published as is</h3>
            <p>Raw output is public. Bad results get published too, even for sponsors.</p>
          </div>
        </div>
      </section>

      <Suspense fallback={null}>
        <CpuChart />
      </Suspense>

      <section className="sec">
        <div className="honest">
          <div>
            <h3>How do we make money?</h3>
            <p>
              Some providers give us credits for testing, and some links are affiliate links. They&apos;re always labeled
              and never affect the rankings. Everyone goes through the same test.
            </p>
          </div>
          <Link className="btn s sm" href="/methodology#money">
            Sponsorship policy
          </Link>
        </div>
      </section>
    </main>
  );
}

function HeroCardShell({ children }: { children?: React.ReactNode }) {
  return (
    <article className="rc" aria-label="Latest test result">
      {children ?? <p className="rc-empty">Loading the latest result…</p>}
    </article>
  );
}

async function HeroCard() {
  const rankings = await loadRankings();
  const published = scoresArePublished(rankings?.length ?? 0);
  // Before scores are published, "best value" means nothing: show the newest test.
  const best = rankings?.length
    ? published
      ? [...rankings].sort((a, b) => b.value - a.value)[0]
      : rankings[0]
    : null;

  if (!best) {
    return (
      <HeroCardShell>
        <div className="rc-head">
          <div>
            <div className="rc-name">First results are on the way</div>
            <div className="rc-spec">The first plans are running through our 48-hour test right now.</div>
          </div>
          <span className="pill">Testing</span>
        </div>
        <p className="rc-empty">
          When a test finishes, its price, four category scores and the full 48-hour CPU chart show up here. No sample
          numbers in the meantime.
        </p>
      </HeroCardShell>
    );
  }

  const series = await getCpuSeries(best.trialId).catch(() => []);
  const values = series.map((p) => p.v);
  const sorted = [...values].sort((a, b) => a - b);
  const typical = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  // Lowest sample as a share of the median: "how bad did it get".
  const worstPct = values.length && typical ? Math.round((100 * sorted[0]) / typical) : null;
  const spanH =
    series.length > 1 ? Math.round((series[series.length - 1].t.getTime() - series[0].t.getTime()) / 3_600_000) : 0;
  return (
    <HeroCardShell>
      <div className="rc-head">
        <div>
          <div className="rc-name">
            <Link href={`/plan/${best.planSlug}`}>
              {best.provider} {best.plan}
            </Link>
          </div>
          <div className="rc-spec">{spec(best)}</div>
        </div>
        <span className="pill">{published ? "Best value right now" : "Latest test"}</span>
      </div>
      <div className="rc-price">
        <b>${usd(best.priceUsd)}</b>
        <span>/mo</span>
      </div>
      <ResultTiles scores={best} metrics={best.metrics} published={published} />
      {values.length > 1 && (
        <div className="rc-chart">
          <div className="t">
            <span>CPU over the {spanH}-hour stability run</span>
            {worstPct !== null && <b>Lowest point: {worstPct}% of typical</b>}
          </div>
          <Sparkline points={values} label="CPU performance over the stability run" endLabel={`${spanH}h`} />
        </div>
      )}
      <div className="rc-foot">
        {[best.cpuModel, best.startedAt && best.finishedAt ? `${day(best.startedAt)} – ${day(best.finishedAt)}` : null]
          .filter(Boolean)
          .join(" · ")}
      </div>
    </HeroCardShell>
  );
}

function RankingsShell({ children }: { children?: React.ReactNode }) {
  return (
    <>
      <div className="sh">
        <div>
          <h2>Rankings</h2>
          <p>Latest official test for each plan</p>
        </div>
      </div>
      {children ?? <div className="empty">Loading rankings…</div>}
    </>
  );
}

async function Rankings() {
  const rankings = await loadRankings();

  if (rankings === null) {
    return (
      <RankingsShell>
        <div className="empty">
          <b>Rankings are temporarily unavailable</b>
          Please try again in a minute.
        </div>
      </RankingsShell>
    );
  }
  if (rankings.length === 0) {
    return (
      <RankingsShell>
        <div className="empty">
          <b>No plans ranked yet</b>
          The first official tests are in progress. Plans show up here as soon as their results are in.
        </div>
      </RankingsShell>
    );
  }

  const published = scoresArePublished(rankings.length);
  const rows = rankings.map((p) => (published ? scoredRow(p) : rawRow(p)));
  const count = `${rows.length} plan${rows.length === 1 ? "" : "s"}`;

  return (
    <RankingSection
      rows={rows}
      title="Rankings"
      subtitle={`Latest official test for each plan · ${count}`}
      sorts={published ? SCORE_SORTS : RAW_SORTS}
    >
      {!published && <EarlyNote ranked={rankings.length} />}
    </RankingSection>
  );
}

const SCORE_SORTS: SortOption[] = [
  { key: "value", label: "Best value" },
  { key: "overall", label: "Raw performance" },
  { key: "stability", label: "Stability" },
];
const RAW_SORTS: SortOption[] = [
  { key: "price", label: "Lowest price" },
  { key: "cpu", label: "CPU" },
  { key: "disk", label: "Disk" },
  { key: "network", label: "Network" },
];

const base = (p: RankedPlan) => ({
  id: p.trialId,
  provider: p.provider,
  isSponsor: p.isSponsor,
  href: `/plan/${p.planSlug}`,
  spec: `${p.plan} · ${spec(p)}`,
  price: `$${usd(p.priceUsd)}/mo`,
});

function scoredRow(p: RankedPlan): RankingRow {
  const cells = (
    [
      ["CPU", p.cpu],
      ["Disk", p.disk],
      ["Network", p.network],
      ["Stability", p.stability],
    ] as const
  ).map(([label, v]) => ({
    label,
    value: v === null ? "—" : String(v),
    meter: v,
    title: v === null ? "Not measured yet" : undefined,
  }));
  return {
    ...base(p),
    cells,
    big: { value: String(p.overall), label: "overall" },
    priceNote: `${p.value.toFixed(1)} pts/$`,
    sort: { value: p.value, overall: p.overall, stability: p.stability },
  };
}

function rawRow(p: RankedPlan): RankingRow {
  const cells = HEADLINE_METRICS.map((m) => {
    const v = p.metrics[m.key];
    return { label: m.short, value: v === undefined ? "—" : num(v), title: m.label };
  });
  const m = p.metrics;
  return {
    ...base(p),
    cells,
    sort: {
      price: -p.priceUsd,
      cpu: m.sevenzip_mips ?? null,
      disk: m.yabs_fio_4k_total_iops ?? null,
      network: m.yabs_iperf4_recv_median_mbps ?? null,
    },
  };
}

async function CpuChart() {
  const rankings = await loadRankings();
  const bars = (rankings ?? [])
    .filter((p) => p.metrics.sevenzip_mips !== undefined)
    .map((p) => ({ name: `${p.provider} ${p.plan}`, value: p.metrics.sevenzip_mips }));
  if (bars.length < 2) return null;
  // The highlighted bar is the best-value plan, which only exists once scores are published.
  const best = scoresArePublished(rankings!.length)
    ? [...rankings!].sort((a, b) => b.value - a.value)[0]
    : undefined;

  return (
    <section className="sec">
      <div className="sh">
        <div>
          <h2>CPU, side by side</h2>
          <p>7-Zip compression benchmark, MIPS. Higher is better.</p>
        </div>
      </div>
      <div className="chart">
        <BarChart bars={bars} highlight={best ? `${best.provider} ${best.plan}` : undefined} label="7-Zip MIPS by plan" />
      </div>
    </section>
  );
}
