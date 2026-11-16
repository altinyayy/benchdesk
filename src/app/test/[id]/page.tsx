import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, cache } from "react";
import { Sparkline } from "@/components/Charts";
import { Crumbs, PageShell } from "@/components/PageBits";
import { EarlyNote, ResultTiles } from "@/components/ResultTiles";
import { getScoreStatus, getTrialPage, type IperfRow } from "@/lib/data";
import { day, exact, num, specLine, usd } from "@/lib/format";

const load = cache((id: string) => (/^\d{1,9}$/.test(id) ? getTrialPage(Number(id)) : Promise.resolve(null)));

export async function generateMetadata({ params }: PageProps<"/test/[id]">): Promise<Metadata> {
  const { id } = await params;
  const t = await load(id);
  if (!t) return { title: "Test not found", robots: { index: false } };
  const name = `${t.provider.name} ${t.plan.name}`;
  return {
    title: `${name} test #${t.id}${t.finishedAt ? ` (${day(t.finishedAt)})` : ""}`,
    description: `Full results of test #${t.id} on ${name}: sysbench, 7-Zip, fio and iperf3 numbers${t.cpuModel ? ` on ${t.cpuModel}` : ""}, plus the raw output.`,
    alternates: { canonical: `/test/${t.id}` },
  };
}

export default function TestPage({ params }: PageProps<"/test/[id]">) {
  return (
    <PageShell>
      <Suspense fallback={<p className="muted">Loading…</p>}>
        {params.then(({ id }) => (
          <TestContent id={id} />
        ))}
      </Suspense>
    </PageShell>
  );
}

const CPU_ROWS = [
  ["sysbench CPU, 1 thread", "sysbench_cpu_single_eps", "events/s"],
  ["sysbench CPU, all threads", "sysbench_cpu_multi_eps", "events/s"],
  ["7-Zip benchmark, 1 thread", "sevenzip_single_mips", "MIPS"],
  ["7-Zip benchmark, all threads", "sevenzip_mips", "MIPS"],
] as const;

const BLOCK_SIZES = [
  ["4k", "4K random"],
  ["64k", "64K random"],
  ["512k", "512K random"],
  ["1m", "1M random"],
] as const;

async function TestContent({ id }: { id: string }) {
  const [t, status] = await Promise.all([load(id), getScoreStatus()]);
  if (!t) notFound();
  const m = t.metrics;
  const v = (key: string) => (m[key] === undefined ? "—" : exact(m[key]));
  const official = t.source === "official";
  const hasCpu = CPU_ROWS.some(([, k]) => m[k] !== undefined);
  const disk = BLOCK_SIZES.filter(([bs]) => m[`yabs_fio_${bs}_total_mbps`] !== undefined);
  const sys = t.system ?? {};
  const s = (k: string) => (sys[k] === undefined || sys[k] === null ? null : sys[k]);

  return (
    <>
      <Crumbs
        items={[
          [t.provider.name, `/provider/${t.provider.slug}`],
          [t.plan.name, `/plan/${t.plan.slug}`],
          [`Test #${t.id}`],
        ]}
      />
      <h1>
        {t.provider.name} {t.plan.name}: test #{t.id}
      </h1>
      <p className="lede">
        {t.finishedAt ? `Finished on ${day(t.finishedAt)}` : "Completed test"}
        {t.location ? ` in ${t.location}` : ""}.{" "}
        {official
          ? "An official Benchdesk test: our script on a clean server."
          : "A community result. We store it, but we didn't run it ourselves, so it isn't ranked."}
      </p>
      <ul className="facts">
        <li>{official ? <b>Official test</b> : <span className="tag off">Community · not verified</span>}</li>
        <li>
          <Link href={`/plan/${t.plan.slug}`}>{specLine(t.plan)}</Link>
        </li>
        <li>
          <b>${usd(t.plan.priceUsd)}</b>/mo
        </li>
        {t.cpuModel && <li>{t.cpuModel}</li>}
      </ul>

      {official && (
        <section className="sec">
          <div className="sh">
            <div>
              <h2>{status.published && t.scores ? "Scores" : "Headline numbers"}</h2>
              <p>
                {status.published && t.scores
                  ? `Overall ${t.scores.overall} · ${t.scores.value.toFixed(1)} points per dollar · methodology ${t.methodologyVersion}`
                  : "One number per category. Every measurement is listed below."}
              </p>
            </div>
          </div>
          {!status.published && <EarlyNote ranked={status.ranked} />}
          <article className="rc">
            <ResultTiles scores={t.scores} metrics={m} published={status.published} />
          </article>
        </section>
      )}

      {hasCpu && (
        <section className="sec">
          <div className="sh">
            <div>
              <h2>CPU</h2>
              <p>Higher is better.</p>
            </div>
          </div>
          <div className="tablewrap">
            <table className="tbl">
              <tbody>
                {CPU_ROWS.map(([label, key, unit]) => (
                  <tr key={key}>
                    <td>{label}</td>
                    <td className="num">
                      {v(key)} <span className="muted">{unit}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {disk.length > 0 && (
        <section className="sec">
          <div className="sh">
            <div>
              <h2>Disk</h2>
              <p>fio, mixed 50/50 read and write. Higher is better.</p>
            </div>
          </div>
          <div className="tablewrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Block size</th>
                  <th className="num">Read MB/s</th>
                  <th className="num">Write MB/s</th>
                  <th className="num">Total MB/s</th>
                  <th className="num">Total IOPS</th>
                </tr>
              </thead>
              <tbody>
                {disk.map(([bs, label]) => (
                  <tr key={bs}>
                    <td>{label}</td>
                    <td className="num">{v(`yabs_fio_${bs}_read_mbps`)}</td>
                    <td className="num">{v(`yabs_fio_${bs}_write_mbps`)}</td>
                    <td className="num">{v(`yabs_fio_${bs}_total_mbps`)}</td>
                    <td className="num">{v(`yabs_fio_${bs}_total_iops`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {(t.iperf.length > 0 || m.yabs_iperf4_send_median_mbps !== undefined) && (
        <section className="sec">
          <div className="sh">
            <div>
              <h2>Network</h2>
              <p>
                iperf3 to public test servers.
                {m.yabs_iperf4_send_median_mbps !== undefined &&
                  ` Median: ${num(m.yabs_iperf4_send_median_mbps)} Mbit/s out, ${num(m.yabs_iperf4_recv_median_mbps ?? 0)} Mbit/s in.`}
              </p>
            </div>
          </div>
          {t.iperf.length > 0 && <IperfTable rows={t.iperf} />}
        </section>
      )}

      {m.stability_samples !== undefined && <StabilitySection t={t} />}

      <section className="sec">
        <div className="sh">
          <div>
            <h2>Test details</h2>
          </div>
        </div>
        <div className="tablewrap" style={{ padding: "14px 16px" }}>
          <dl className="kv">
            {t.startedAt && (
              <>
                <dt>Started</dt>
                <dd>{t.startedAt.toISOString().replace("T", " ").slice(0, 16)} UTC</dd>
              </>
            )}
            {t.finishedAt && (
              <>
                <dt>Finished</dt>
                <dd>{t.finishedAt.toISOString().replace("T", " ").slice(0, 16)} UTC</dd>
              </>
            )}
            <Row label="Processor" value={t.cpuModel} />
            <Row label="Cores" value={s("cores")} />
            <Row label="Clock" value={s("freqMhz") && `${s("freqMhz")} MHz`} />
            <Row label="RAM seen" value={s("ramGib") && `${s("ramGib")} GiB`} />
            <Row label="Disk seen" value={s("diskGib") && `${s("diskGib")} GiB`} />
            <Row label="Virtualization" value={s("vmType")} />
            <Row label="OS" value={s("distro")} />
            <Row label="Kernel" value={s("kernel")} />
            <Row
              label="Tools"
              value={[
                t.cpuTest?.version !== undefined && `Benchdesk CPU test v${t.cpuTest.version}`,
                t.cpuTest?.sysbench,
                t.cpuTest?.sevenZip?.split(":")[0]?.trim(),
                t.yabsVersion && `yabs.sh ${t.yabsVersion}`,
                t.stability?.plannedHours && `${t.stability.plannedHours}-hour stability run`,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
          </dl>
        </div>
        {t.hasRaw && (
          <p>
            <a className="btn s sm" href={`/test/${t.id}/raw`}>
              Raw output (plain text)
            </a>
          </p>
        )}
      </section>
    </>
  );
}

type Trial = NonNullable<Awaited<ReturnType<typeof load>>>;

function StabilitySection({ t }: { t: Trial }) {
  const m = t.metrics;
  const hours = m.stability_hours ?? 0;
  const span = `${Math.round(hours)}h`;
  const rows: [string, string | null, string][] = [
    [
      "Typical CPU speed (all threads)",
      m.stability_cpu_multi_median_eps !== undefined ? `${exact(m.stability_cpu_multi_median_eps)} events/s` : null,
      "Median of every sample.",
    ],
    [
      "CPU variation",
      m.stability_cpu_multi_cv_pct !== undefined ? `${m.stability_cpu_multi_cv_pct.toFixed(1)}%` : null,
      "How much the speed moved around. Lower is steadier.",
    ],
    [
      "CPU at its worst",
      m.stability_cpu_multi_floor_pct !== undefined ? `${m.stability_cpu_multi_floor_pct.toFixed(0)}% of typical` : null,
      "The slowest 5% of samples, compared with the median.",
    ],
    [
      "CPU steal under load",
      m.stability_steal_avg_pct !== undefined
        ? `${m.stability_steal_avg_pct.toFixed(2)}% avg · ${m.stability_steal_max_pct?.toFixed(1) ?? "—"}% max`
        : null,
      "CPU time the host gave to other customers while we asked for all of it.",
    ],
    [
      "Disk 4K IOPS",
      m.stability_disk_iops_median !== undefined
        ? `${exact(m.stability_disk_iops_median)} typical · ${m.stability_disk_iops_cv_pct?.toFixed(1) ?? "—"}% variation`
        : null,
      "fio 4K random read/write, 20 seconds per sample.",
    ],
  ];
  return (
    <section className="sec">
      <div className="sh">
        <div>
          <h2>Stability</h2>
          <p>
            {m.stability_samples} samples over {hours.toFixed(hours < 10 ? 1 : 0)} hours
            {t.stability?.intervalMin ? `, one every ${t.stability.intervalMin} minutes` : ""}. Each sample is about a
            minute of CPU and disk work; the server is idle in between.
          </p>
        </div>
      </div>
      <div className="cards">
        {t.series.cpu.length > 1 && (
          <div className="chart">
            <div className="chart-title">CPU, all threads (events/s)</div>
            <Sparkline points={t.series.cpu} label="CPU speed over the stability run" endLabel={span} />
          </div>
        )}
        {t.series.disk.length > 1 && (
          <div className="chart">
            <div className="chart-title">Disk, 4K random IOPS</div>
            <Sparkline points={t.series.disk} label="Disk IOPS over the stability run" endLabel={span} />
          </div>
        )}
      </div>
      <div className="tablewrap" style={{ marginTop: 12 }}>
        <table className="tbl">
          <tbody>
            {rows
              .filter(([, v]) => v !== null)
              .map(([label, v, note]) => (
                <tr key={label}>
                  <td>
                    {label}
                    <div className="muted" style={{ fontSize: 13 }}>
                      {note}
                    </div>
                  </td>
                  <td className="num">{v}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined || value === "" || value === false) return null;
  return (
    <>
      <dt>{label}</dt>
      <dd>{String(value)}</dd>
    </>
  );
}

function IperfTable({ rows }: { rows: IperfRow[] }) {
  const mbps = (n: number | null) => (n === null || n === undefined ? "—" : exact(n));
  return (
    <div className="tablewrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Server</th>
            <th>Location</th>
            <th className="num">Out Mbit/s</th>
            <th className="num">In Mbit/s</th>
            <th className="num">Ping ms</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>
                {r.provider}
                {r.mode && r.mode !== "IPv4" && <span className="muted"> ({r.mode})</span>}
              </td>
              <td>{r.location}</td>
              <td className="num">{mbps(r.sendMbps)}</td>
              <td className="num">{mbps(r.recvMbps)}</td>
              <td className="num">{mbps(r.pingMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
