import "server-only";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "./db";

const { providers, plans, locations } = schema;

export async function listProvidersWithChildren() {
  const db = getDb();
  const [ps, pl, loc] = await Promise.all([
    db.select().from(providers).orderBy(asc(providers.name)),
    db.select().from(plans).orderBy(asc(plans.priceUsd)),
    db.select().from(locations).orderBy(asc(locations.city)),
  ]);
  return ps.map((p) => ({
    ...p,
    plans: pl.filter((x) => x.providerId === p.id),
    locations: loc.filter((x) => x.providerId === p.id),
  }));
}

export async function getProvider(id: number) {
  const db = getDb();
  const [p] = await db.select().from(providers).where(eq(providers.id, id));
  if (!p) return null;
  const [pl, loc] = await Promise.all([
    db.select().from(plans).where(eq(plans.providerId, id)).orderBy(asc(plans.priceUsd)),
    db.select().from(locations).where(eq(locations.providerId, id)).orderBy(asc(locations.city)),
  ]);
  return { ...p, plans: pl, locations: loc };
}

export async function getPlan(id: number) {
  const db = getDb();
  const [p] = await db.select().from(plans).where(eq(plans.id, id));
  return p ?? null;
}
