import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Crumbs, PageShell } from "@/components/PageBits";
import { getProviderIndex } from "@/lib/data";
import { day, usd } from "@/lib/format";

export const metadata: Metadata = {
  title: "VPS providers we've tested",
  description:
    "Every VPS provider Benchdesk has benchmarked, with the plans tested and the date of the latest test. Same open script on every server.",
  alternates: { canonical: "/providers" },
};

export default function ProvidersPage() {
  return (
    <PageShell>
      <Crumbs items={[["Providers"]]} />
      <h1>Providers we&apos;ve tested</h1>
      <p className="lede">
        Every provider here went through the same script on a clean server. The list grows as we test more plans.
      </p>
      <Suspense fallback={<p className="muted">Loading…</p>}>
        <ProviderList />
      </Suspense>
    </PageShell>
  );
}

async function ProviderList() {
  const rows = await getProviderIndex();
  if (rows.length === 0) {
    return (
      <div className="empty">
        <b>No providers tested yet</b>
        The first results are on the way.
      </div>
    );
  }
  return (
    <div className="tablewrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Provider</th>
            <th className="num">Plans tested</th>
            <th className="num">Tests</th>
            <th className="num">From</th>
            <th className="num">Latest test</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.slug}>
              <td>
                <Link href={`/provider/${p.slug}`}>{p.name}</Link>
                {p.isSponsor && <span className="spon">sponsor</span>}
              </td>
              <td className="num">{p.plans}</td>
              <td className="num">{p.tests}</td>
              <td className="num">{p.minPrice === null ? "—" : `$${usd(p.minPrice)}/mo`}</td>
              <td className="num">{p.lastTest ? day(p.lastTest) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
