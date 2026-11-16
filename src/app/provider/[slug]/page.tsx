import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, cache } from "react";
import { Crumbs, OutLink, PageShell } from "@/components/PageBits";
import { EarlyNote, ResultTiles } from "@/components/ResultTiles";
import { getProviderPage, getScoreStatus } from "@/lib/data";
import { day, specLine, usd } from "@/lib/format";

const load = cache(getProviderPage);

export async function generateMetadata({ params }: PageProps<"/provider/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const data = await load(slug);
  if (!data) return { title: "Provider not found", robots: { index: false } };
  const { provider, plans } = data;
  const tested = plans.filter((p) => p.trials.length > 0);
  const cheapest = tested.length ? Math.min(...tested.map((p) => p.priceUsd)) : null;
  return {
    title: `${provider.name} VPS benchmarks`,
    description: tested.length
      ? `Independent benchmarks of ${tested.length} ${provider.name} VPS plan${tested.length === 1 ? "" : "s"}, from $${usd(cheapest!)}/mo: CPU, disk and network measured with the same open script, raw output included.`
      : `${provider.name} hasn't been tested by Benchdesk yet.`,
    alternates: { canonical: `/provider/${provider.slug}` },
    // Pages without results are thin; keep them out of search until tested.
    robots: tested.length ? undefined : { index: false },
  };
}

export default function ProviderPage({ params }: PageProps<"/provider/[slug]">) {
  return (
    <PageShell>
      <Suspense fallback={<p className="muted">Loading…</p>}>
        {params.then(({ slug }) => (
          <ProviderContent slug={slug} />
        ))}
      </Suspense>
    </PageShell>
  );
}

async function ProviderContent({ slug }: { slug: string }) {
  const [data, status] = await Promise.all([load(slug), getScoreStatus()]);
  if (!data) notFound();
  const { provider, plans, locations } = data;
  const tested = plans.filter((p) => p.trials.length > 0);
  const untested = plans.filter((p) => p.trials.length === 0 && p.active);
  const testCount = tested.reduce((n, p) => n + p.trials.length, 0);
  const lastTest = tested
    .map((p) => p.trials[0]?.finishedAt)
    .filter((d): d is Date => !!d)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return (
    <>
      <Crumbs items={[["Providers", "/providers"], [provider.name]]} />
      <h1>{provider.name} VPS benchmarks</h1>
      <p className="lede">
        {tested.length
          ? `We've run ${testCount} test${testCount === 1 ? "" : "s"} on ${tested.length} ${provider.name} plan${tested.length === 1 ? "" : "s"}${lastTest ? `, most recently on ${day(lastTest)}` : ""}. Every plan runs the same open script on a clean server.`
          : `We haven't tested any ${provider.name} plans yet.`}
      </p>
      <ul className="facts">
        {provider.isSponsor && (
          <li>
            <b>Sponsor</b> · same test as everyone
          </li>
        )}
        {provider.country && (
          <li>
            Based in <b>{provider.country}</b>
          </li>
        )}
        {locations.length > 0 && (
          <li>
            Tested from <b>{locations.map((l) => l.city).join(", ")}</b>
          </li>
        )}
        <OutLink provider={provider} />
      </ul>

      {tested.length > 0 && (
        <section className="sec">
          <div className="sh">
            <div>
              <h2>Plans we&apos;ve tested</h2>
              <p>Latest official result for each plan, cheapest first.</p>
            </div>
          </div>
          {!status.published && <EarlyNote ranked={status.ranked} />}
          <div className="cards">
            {tested.map((p) => {
              const t = p.latest!;
              return (
                <article className="rc" key={p.id}>
                  <div className="rc-head">
                    <div>
                      <h3>
                        <Link href={`/plan/${p.slug}`}>{p.name}</Link>
                      </h3>
                      <div className="rc-spec">{specLine(p)}</div>
                    </div>
                    {!p.active && <span className="tag">No longer sold</span>}
                  </div>
                  <div className="rc-price">
                    <b>${usd(p.priceUsd)}</b>
                    <span>/mo</span>
                  </div>
                  <ResultTiles
                    scores={t.source === "official" ? t.scores : null}
                    metrics={t.metrics}
                    published={status.published}
                  />
                  <div className="rc-foot">
                    {[
                      `${p.trials.length} test${p.trials.length === 1 ? "" : "s"}`,
                      t.finishedAt && `latest ${day(t.finishedAt)}`,
                      t.location,
                      t.source === "community" && "community result",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {untested.length > 0 && (
        <section className="sec">
          <div className="sh">
            <div>
              <h2>Not tested yet</h2>
              <p>Plans we know about but haven&apos;t run yet.</p>
            </div>
          </div>
          <div className="tablewrap">
            <table className="tbl">
              <tbody>
                {untested.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td className="muted">{specLine(p)}</td>
                    <td className="num">${usd(p.priceUsd)}/mo</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
