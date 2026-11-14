import Link from "next/link";
import { connection } from "next/server";
import { Suspense, cache } from "react";
import { BarChart, Sparkline } from "@/components/Charts";
import { Meter } from "@/components/Meter";
import { RankingSection, type RankingRow } from "@/components/RankingList";
import { getCpuSeries, getRankings, type RankedPlan } from "@/lib/data";

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

const usd = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function spec(p: RankedPlan) {
  return [
    `${p.vcpu} vCPU`,
    `${p.ramGb} GB RAM`,
    `${p.diskGb} GB${p.diskType ? ` ${p.diskType}` : ""}`,
    p.location,
  ]
    .filter(Boolean)
    .join(" · ");
}

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
  const best = rankings?.length ? [...rankings].sort((a, b) => b.value - a.value)[0] : null;

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
  const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  const variance = values.length && mean ? (Math.max(...values.map((v) => Math.abs(v - mean))) / mean) * 100 : null;
  const scores: [string, number | null][] = [
    ["CPU", best.cpu],
    ["Disk", best.disk],
    ["Network", best.network],
    ["Stability", best.stability],
  ];

  return (
    <HeroCardShell>
      <div className="rc-head">
        <div>
          <div className="rc-name">
            {best.provider} {best.plan}
          </div>
          <div className="rc-spec">{spec(best)}</div>
        </div>
        <span className="pill">Best value right now</span>
      </div>
      <div className="rc-price">
        <b>${usd(best.priceUsd)}</b>
        <span>/mo</span>
      </div>
      <div className="scores">
        {scores.map(([l, v]) => (
          <div className="sc" key={l}>
            <div className="v" title={v === null ? "Not measured yet" : undefined}>
              {v ?? "—"}
            </div>
            <div className="l">{l}</div>
            <Meter value={v} />
          </div>
        ))}
      </div>
      {values.length > 1 && (
        <div className="rc-chart">
          <div className="t">
            <span>CPU over the stability run</span>
            {variance !== null && <b>±{variance.toFixed(1)}% variance</b>}
          </div>
          <Sparkline points={values} label="CPU performance over the stability run" />
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

  const rows: RankingRow[] = rankings.map((p) => ({
    trialId: p.trialId,
    provider: p.provider,
    isSponsor: p.isSponsor,
    plan: p.plan,
    spec: `${p.plan} · ${spec(p)}`,
    priceUsd: p.priceUsd,
    scores: [p.cpu, p.disk, p.network, p.stability],
    overall: p.overall,
    value: p.value,
    stability: p.stability,
  }));

  return (
    <RankingSection
      rows={rows}
      title="Rankings"
      subtitle={`Latest official test for each plan · ${rows.length} plan${rows.length === 1 ? "" : "s"}`}
    />
  );
}

async function CpuChart() {
  const rankings = await loadRankings();
  const bars = (rankings ?? [])
    .filter((p) => p.sevenZipMips !== null)
    .map((p) => ({ name: `${p.provider} ${p.plan}`, value: p.sevenZipMips as number }));
  if (bars.length < 2) return null;
  const best = [...(rankings ?? [])].sort((a, b) => b.value - a.value)[0];

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
