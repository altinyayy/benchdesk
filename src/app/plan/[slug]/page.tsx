import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, cache } from "react";
import { Crumbs, OutLink, PageShell } from "@/components/PageBits";
import { EarlyNote, ResultTiles } from "@/components/ResultTiles";
import { getPlanPage, getScoreStatus } from "@/lib/data";
import { HEADLINE_METRICS, day, num, specLine, usd } from "@/lib/format";

const load = cache(getPlanPage);

export async function generateMetadata({ params }: PageProps<"/plan/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const data = await load(slug);
  if (!data) return { title: "Plan not found", robots: { index: false } };
  const { provider, plan } = data;
  const name = `${provider.name} ${plan.name}`;
  const t = plan.latest;
  const highlights = t
    ? [
        t.metrics.sevenzip_mips !== undefined && `${num(t.metrics.sevenzip_mips)} 7-Zip MIPS`,
        t.metrics.yabs_fio_4k_total_iops !== undefined && `${num(t.metrics.yabs_fio_4k_total_iops)} 4K IOPS`,
      ].filter(Boolean)
    : [];
  return {
    title: `${name} benchmark`,
    description: t
      ? `${name} (${specLine(plan)}, $${usd(plan.priceUsd)}/mo) tested on a clean server${highlights.length ? `: ${highlights.join(", ")}` : ""}. Full CPU, disk and network results with raw output.`
      : `${name} (${specLine(plan)}, $${usd(plan.priceUsd)}/mo). Not tested by Benchdesk yet.`,
    alternates: { canonical: `/plan/${plan.slug}` },
    robots: t ? undefined : { index: false },
  };
}

export default function PlanPage({ params }: PageProps<"/plan/[slug]">) {
  return (
    <PageShell>
      <Suspense fallback={<p className="muted">Loading…</p>}>
        {params.then(({ slug }) => (
          <PlanContent slug={slug} />
        ))}
      </Suspense>
    </PageShell>
  );
}

async function PlanContent({ slug }: { slug: string }) {
  const [data, status] = await Promise.all([load(slug), getScoreStatus()]);
  if (!data) notFound();
  const { provider, plan } = data;
  const t = plan.latest;
  const official = t?.source === "official";

  return (
    <>
      <Crumbs items={[["Providers", "/providers"], [provider.name, `/provider/${provider.slug}`], [plan.name]]} />
      <h1>
        {provider.name} {plan.name} benchmark
      </h1>
      <p className="lede">
        {plan.vcpu} vCPU, {plan.ramGb} GB of RAM and {plan.diskGb} GB of {plan.diskType ?? "disk"} for ${usd(plan.priceUsd)}{" "}
        a month.{" "}
        {t
          ? `Here's how it did in our test${plan.trials.length === 1 ? "" : "s"}.`
          : "We haven't tested this plan yet."}
      </p>
      <ul className="facts">
        <li>
          <b>${usd(plan.priceUsd)}</b>/mo
        </li>
        <li>
          <b>{plan.vcpu}</b> vCPU
        </li>
        <li>
          <b>{plan.ramGb} GB</b> RAM
        </li>
        <li>
          <b>{plan.diskGb} GB</b> {plan.diskType ?? "disk"}
        </li>
        {t?.cpuModel && <li>{t.cpuModel}</li>}
        {!plan.active && <li>No longer sold</li>}
        {provider.isSponsor && (
          <li>
            <b>Sponsor</b> · same test as everyone
          </li>
        )}
        <OutLink provider={provider} />
      </ul>

      {t ? (
        <>
          <section className="sec">
            <div className="sh">
              <div>
                <h2>Latest result</h2>
                <p>
                  {[t.finishedAt && day(t.finishedAt), t.location, official ? "official test" : "community result"]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <Link className="btn s sm" href={`/test/${t.id}`}>
                Full results
              </Link>
            </div>
            {!status.published && <EarlyNote ranked={status.ranked} />}
            <article className="rc">
              <ResultTiles scores={official ? t.scores : null} metrics={t.metrics} published={status.published} />
              {status.published && official && t.scores && (
                <div className="rc-foot">
                  Overall {t.scores.overall} · {t.scores.value.toFixed(1)} points per dollar
                </div>
              )}
            </article>
          </section>

          <section className="sec">
            <div className="sh">
              <div>
                <h2>Every test of this plan</h2>
                <p>Newest first. We retest plans over time to see whether performance changes.</p>
              </div>
            </div>
            <TrialTable trials={plan.trials} />
          </section>
        </>
      ) : (
        <section className="sec">
          <div className="empty">
            <b>Not tested yet</b>
            Results show up here as soon as this plan has been through our test.
          </div>
        </section>
      )}
    </>
  );
}

function TrialTable({ trials }: { trials: NonNullable<Awaited<ReturnType<typeof getPlanPage>>>["plan"]["trials"] }) {
  return (
    <div className="tablewrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Test</th>
            <th>Date</th>
            <th>Location</th>
            {HEADLINE_METRICS.map((m) => (
              <th key={m.key} className="num" title={m.label}>
                {m.short}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {trials.map((t) => (
            <tr key={t.id}>
              <td>
                <Link href={`/test/${t.id}`}>#{t.id}</Link>{" "}
                {t.source === "community" && <span className="tag">community</span>}
              </td>
              <td>{t.finishedAt ? day(t.finishedAt) : "—"}</td>
              <td>{t.location ?? "—"}</td>
              {HEADLINE_METRICS.map((m) => (
                <td key={m.key} className="num">
                  {t.metrics[m.key] === undefined ? "—" : num(t.metrics[m.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
