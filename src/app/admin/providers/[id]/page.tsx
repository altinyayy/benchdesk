import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { getProvider } from "@/lib/admin-data";
import { ActionForm } from "../../ActionForm";
import { createLocation, createPlan, deleteLocation, updatePlan, updateProvider } from "../../actions";
import { PlanFields, ProviderFields } from "../../fields";

export default function ProviderPage({ params }: PageProps<"/admin/providers/[id]">) {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <ProviderEditor params={params} />
    </Suspense>
  );
}

async function ProviderEditor({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const p = await getProvider(id);
  if (!p) notFound();

  return (
    <>
      <p>
        <Link href="/admin" className="muted">
          ← All providers
        </Link>
      </p>
      <h1>{p.name}</h1>

      <section className="panel">
        <h2>Details</h2>
        <ActionForm action={updateProvider} submit="Save">
          <input type="hidden" name="id" value={p.id} />
          <ProviderFields p={p} />
        </ActionForm>
      </section>

      <section className="panel">
        <h2>Plans</h2>
        {p.plans.length === 0 && <p className="muted">No plans yet.</p>}
        {p.plans.map((pl) => (
          <div key={pl.id} className="sub">
            <ActionForm action={updatePlan} submit="Save plan">
              <input type="hidden" name="id" value={pl.id} />
              <PlanFields p={pl} />
              <label className="check">
                <input name="active" type="checkbox" defaultChecked={pl.active} />
                Active (inactive plans are hidden from rankings)
              </label>
            </ActionForm>
          </div>
        ))}
        <div className="sub">
          <h3>Add a plan</h3>
          <ActionForm action={createPlan} submit="Add plan">
            <input type="hidden" name="providerId" value={p.id} />
            <PlanFields />
          </ActionForm>
        </div>
      </section>

      <section className="panel">
        <h2>Locations</h2>
        {p.locations.length === 0 ? (
          <p className="muted">No locations yet.</p>
        ) : (
          <ul className="locs">
            {p.locations.map((l) => (
              <li key={l.id}>
                {l.city}, {l.country}
                <form action={deleteLocation}>
                  <input type="hidden" name="id" value={l.id} />
                  <button className="ghost" type="submit">
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <ActionForm action={createLocation} submit="Add location">
          <input type="hidden" name="providerId" value={p.id} />
          <div className="grid2">
            <label>
              City
              <input name="city" required maxLength={80} placeholder="Ashburn" />
            </label>
            <label>
              Country
              <input name="country" required maxLength={60} placeholder="US" />
            </label>
          </div>
        </ActionForm>
      </section>
    </>
  );
}
