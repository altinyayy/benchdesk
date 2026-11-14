import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { listPlanChoices, listTrials } from "@/lib/trials";
import { ActionForm } from "../ActionForm";
import { deleteTrialAction, recomputeAction } from "../actions";
import { YabsForm } from "./YabsForm";

export default function TrialsPage() {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <Trials />
    </Suspense>
  );
}

const day = (d: Date | null) =>
  d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—";
const sc = (v: number | null) => (v === null ? "—" : Math.round(v));

async function Trials() {
  await requireAdmin();
  const [choices, trials] = await Promise.all([listPlanChoices(), listTrials()]);
  const hasPlans = choices.some((p) => p.plans.length);

  return (
    <>
      <p>
        <Link href="/admin" className="muted">
          ← Admin
        </Link>
      </p>
      <h1>Test results</h1>

      <section className="panel">
        <h2>Add a yabs.sh result</h2>
        {hasPlans ? (
          <>
            <p className="muted">
              On the test server, run <code>curl -sL yabs.sh | bash</code> and paste everything it prints. JSON from{" "}
              <code>-j</code> works too.
            </p>
            <YabsForm providers={choices} />
          </>
        ) : (
          <p className="muted">
            Add a provider and a plan first, on the <Link href="/admin">admin page</Link>.
          </p>
        )}
      </section>

      <section className="panel">
        <div className="admin-head">
          <h2>Saved tests</h2>
          <ActionForm action={recomputeAction} submit="Recompute scores" className="inline">
            {null}
          </ActionForm>
        </div>
        {trials.length === 0 ? (
          <p className="muted">No tests yet.</p>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>#</th>
                <th>Plan</th>
                <th>Date</th>
                <th>Source</th>
                <th>CPU · Disk · Net</th>
                <th>Overall</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {trials.map((t) => (
                <tr key={t.id}>
                  <td>{t.id}</td>
                  <td>
                    <b>
                      {t.provider} {t.plan}
                    </b>
                    <div className="muted">
                      {[t.city, t.cpuModel, `${t.metricCount} metrics`].filter(Boolean).join(" · ")}
                    </div>
                  </td>
                  <td>{day(t.finishedAt)}</td>
                  <td>{t.source}</td>
                  <td>{t.overall === null ? "—" : `${sc(t.cpu)} · ${sc(t.disk)} · ${sc(t.network)}`}</td>
                  <td>{t.overall === null ? <span className="muted">not scored</span> : <b>{sc(t.overall)}</b>}</td>
                  <td className="right">
                    <form action={deleteTrialAction}>
                      <input type="hidden" name="id" value={t.id} />
                      <button className="ghost" type="submit">
                        Delete
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
