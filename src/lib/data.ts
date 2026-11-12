import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { connection } from "next/server";
import { getDb, schema } from "./db";

const { providers, plans, trials, scores, metrics, locations, endurancePoints } = schema;

export type RankedPlan = {
  trialId: number;
  provider: string;
  providerSlug: string;
  isSponsor: boolean;
  plan: string;
  planSlug: string;
  vcpu: number;
  ramGb: number;
  diskGb: number;
  diskType: string | null;
  priceUsd: number;
  location: string | null;
  cpuModel: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  cpu: number;
  disk: number;
  network: number;
  stability: number;
  overall: number;
  value: number;
  sevenZipMips: number | null;
};

/**
 * Latest completed official trial with a score, one per active plan.
 * Runs at request time only (never during `next build`).
 */
export async function getRankings(): Promise<RankedPlan[]> {
  await connection();
  const db = getDb();

  const rows = await db
    .select({
      trialId: trials.id,
      planId: plans.id,
      provider: providers.name,
      providerSlug: providers.slug,
      isSponsor: providers.isSponsor,
      plan: plans.name,
      planSlug: plans.slug,
      vcpu: plans.vcpu,
      ramGb: plans.ramGb,
      diskGb: plans.diskGb,
      diskType: plans.diskType,
      priceUsd: plans.priceUsd,
      city: locations.city,
      cpuModel: trials.cpuModel,
      startedAt: trials.startedAt,
      finishedAt: trials.finishedAt,
      cpu: scores.cpu,
      disk: scores.disk,
      network: scores.network,
      stability: scores.stability,
      overall: scores.overall,
      value: scores.priceWeighted,
    })
    .from(trials)
    .innerJoin(scores, eq(scores.trialId, trials.id))
    .innerJoin(plans, eq(plans.id, trials.planId))
    .innerJoin(providers, eq(providers.id, plans.providerId))
    .leftJoin(locations, eq(locations.id, trials.locationId))
    .where(
      and(eq(trials.source, "official"), eq(trials.status, "completed"), eq(plans.active, true)),
    )
    .orderBy(desc(trials.finishedAt));

  // Keep only the newest trial per plan.
  const seen = new Set<number>();
  const latest = rows.filter((r) => (seen.has(r.planId) ? false : (seen.add(r.planId), true)));
  if (latest.length === 0) return [];

  const mips = await db
    .select({ trialId: metrics.trialId, value: metrics.value })
    .from(metrics)
    .where(
      and(
        inArray(
          metrics.trialId,
          latest.map((r) => r.trialId),
        ),
        eq(metrics.key, "sevenzip_mips"),
      ),
    );
  const mipsByTrial = new Map(mips.map((m) => [m.trialId, m.value]));

  return latest.map((r) => ({
    trialId: r.trialId,
    provider: r.provider,
    providerSlug: r.providerSlug,
    isSponsor: r.isSponsor,
    plan: r.plan,
    planSlug: r.planSlug,
    vcpu: r.vcpu,
    ramGb: r.ramGb,
    diskGb: r.diskGb,
    diskType: r.diskType,
    priceUsd: r.priceUsd,
    location: r.city,
    cpuModel: r.cpuModel,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    cpu: Math.round(r.cpu),
    disk: Math.round(r.disk),
    network: Math.round(r.network),
    stability: Math.round(r.stability),
    overall: Math.round(r.overall),
    value: r.value,
    sevenZipMips: mipsByTrial.get(r.trialId) ?? null,
  }));
}

/** CPU time series from a trial's stability run, for the hero card chart. */
export async function getCpuSeries(trialId: number): Promise<{ t: Date; v: number }[]> {
  await connection();
  const db = getDb();
  const rows = await db
    .select({ t: endurancePoints.recordedAt, v: endurancePoints.value })
    .from(endurancePoints)
    .where(and(eq(endurancePoints.trialId, trialId), eq(endurancePoints.key, "cpu_events_per_sec")))
    .orderBy(endurancePoints.recordedAt);
  return rows;
}
