import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { listProvidersWithChildren } from "@/lib/admin-data";
import { ActionForm } from "./ActionForm";
import { createProvider, logoutAction } from "./actions";
import { ProviderFields } from "./fields";

export default function AdminPage() {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <AdminHome />
    </Suspense>
  );
}

async function AdminHome() {
  await requireAdmin();
  const providers = await listProvidersWithChildren();

  return (
    <>
      <div className="admin-head">
        <h1>Admin</h1>
        <div className="admin-actions">
          <Link className="btn p sm" href="/admin/trials">
            Test results
          </Link>
          <form action={logoutAction}>
          <button className="ghost" type="submit">
              Log out
            </button>
          </form>
        </div>
      </div>

      <section className="panel">
        <h2>Providers</h2>
        {providers.length === 0 ? (
          <p className="muted">No providers yet. Add the first one below.</p>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Plans</th>
                <th>Locations</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {providers.map((p) => (
                <tr key={p.id}>
                  <td>
                    <b>{p.name}</b>
                    {p.isSponsor && <span className="spon">sponsor</span>}
                    {p.country && <div className="muted">{p.country}</div>}
                  </td>
                  <td>
                    {p.plans.length === 0
                      ? "—"
                      : p.plans.map((pl) => (
                          <div key={pl.id} className={pl.active ? undefined : "muted"}>
                            {pl.name} · ${pl.priceUsd.toFixed(2)}
                            {!pl.active && " (inactive)"}
                          </div>
                        ))}
                  </td>
                  <td>{p.locations.map((l) => l.city).join(", ") || "—"}</td>
                  <td className="right">
                    <Link className="btn s sm" href={`/admin/providers/${p.id}`}>
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <h2>Add a provider</h2>
        <ActionForm action={createProvider} submit="Add provider">
          <ProviderFields />
        </ActionForm>
      </section>
    </>
  );
}
