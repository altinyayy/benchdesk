import "server-only";
import { and, asc, countDistinct, desc, eq, inArray, max, min } from "drizzle-orm";
import { connection } from "next/server";
import { getDb, schema } from "./db";
import { HEADLINE_METRICS } from "./format";
import { scoresArePublished } from "./scoring";

const { providers, plans, trials, scores, metrics, locations, endurancePoints, rawResults } = schema;

export type Scores = {
  // null = no metric for that category yet (e.g. no 48-hour stability run)
  cpu: number | null;
  disk: number | null;
  network: number | null;
  stability: number | null;
  overall: number;
  value: number;
};

export type RankedPlan = Scores & {
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
  /** Headline raw numbers (see HEADLINE_METRICS), keyed by metric key. */
  metrics: Record<string, number>;
};

const HEADLINE_KEYS = HEADLINE_METRICS.map((m) => m.key);
const roundOrNull = (v: number | null) => (v === null ? null : Math.round(v));

/** Headline metrics for a set of trials, as trialId → key → value. */
async function headlineMetrics(trialIds: number[]): Promise<Map<number, Record<string, number>>> {
  const out = new Map<number, Record<string, number>>(trialIds.map((id) => [id, {}]));
  if (trialIds.length === 0) return out;
  const rows = await getDb()
    .select({ trialId: metrics.trialId, key: metrics.key, value: metrics.value })
    .from(metrics)
    .where(and(inArray(metrics.trialId, trialIds), inArray(metrics.key, HEADLINE_KEYS)));
  for (const r of rows) out.get(r.trialId)![r.key] = r.value;
  return out;
}

function toScores(r: {
  cpu: number | null;
  disk: number | null;
  network: number | null;
  stability: number | null;
  overall: number | null;
  value: number | null;
}): Scores | null {
  if (r.overall === null || r.value === null) return null;
  return {
    cpu: roundOrNull(r.cpu),
    disk: roundOrNull(r.disk),
    network: roundOrNull(r.network),
    stability: roundOrNull(r.stability),
    overall: Math.round(r.overall),
    value: r.value,
  };
}

const scoreColumns = {
  cpu: scores.cpu,
  disk: scores.disk,
  network: scores.network,
  stability: scores.stability,
  overall: scores.overall,
  value: scores.priceWeighted,
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
      ...scoreColumns,
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

  const ms = await headlineMetrics(latest.map((r) => r.trialId));

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
    ...toScores(r)!,
    metrics: ms.get(r.trialId)!,
  }));
}

/** How many plans currently have a ranked (scored, official) result. */
export async function countRankedPlans(): Promise<number> {
  await connection();
  const [row] = await getDb()
    .select({ n: countDistinct(trials.planId) })
    .from(trials)
    .innerJoin(scores, eq(scores.trialId, trials.id))
    .innerJoin(plans, eq(plans.id, trials.planId))
    .where(and(eq(trials.source, "official"), eq(trials.status, "completed"), eq(plans.active, true)));
  return Number(row?.n ?? 0);
}

/** Whether scores are shown yet, plus the count it was decided on. */
export async function getScoreStatus() {
  const ranked = await countRankedPlans();
  return { ranked, published: scoresArePublished(ranked) };
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

// ---------------------------------------------------------------------------
// Provider, plan and test pages
// ---------------------------------------------------------------------------

export type TrialSummary = {
  id: number;
  planId: number;
  source: "official" | "community";
  startedAt: Date | null;
  finishedAt: Date | null;
  location: string | null;
  cpuModel: string | null;
  scores: Scores | null;
  metrics: Record<string, number>;
};

/** Completed trials for the given plans, newest first. */
async function trialSummaries(planIds: number[]): Promise<TrialSummary[]> {
  if (planIds.length === 0) return [];
  const rows = await getDb()
    .select({
      id: trials.id,
      planId: trials.planId,
      source: trials.source,
      startedAt: trials.startedAt,
      finishedAt: trials.finishedAt,
      city: locations.city,
      country: locations.country,
      cpuModel: trials.cpuModel,
      ...scoreColumns,
    })
    .from(trials)
    .leftJoin(scores, eq(scores.trialId, trials.id))
    .leftJoin(locations, eq(locations.id, trials.locationId))
    .where(and(inArray(trials.planId, planIds), eq(trials.status, "completed")))
    .orderBy(desc(trials.finishedAt), desc(trials.id));
  const ms = await headlineMetrics(rows.map((r) => r.id));
  return rows.map((r) => ({
    id: r.id,
    planId: r.planId,
    source: r.source,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    location: r.city ? `${r.city}, ${r.country}` : null,
    cpuModel: r.cpuModel,
    scores: toScores(r),
    metrics: ms.get(r.id)!,
  }));
}

const providerColumns = {
  id: providers.id,
  name: providers.name,
  slug: providers.slug,
  websiteUrl: providers.websiteUrl,
  affiliateUrl: providers.affiliateUrl,
  country: providers.country,
  isSponsor: providers.isSponsor,
};

const planColumns = {
  id: plans.id,
  name: plans.name,
  slug: plans.slug,
  vcpu: plans.vcpu,
  ramGb: plans.ramGb,
  diskGb: plans.diskGb,
  diskType: plans.diskType,
  priceUsd: plans.priceUsd,
  active: plans.active,
};

export type ProviderInfo = {
  id: number;
  name: string;
  slug: string;
  websiteUrl: string | null;
  affiliateUrl: string | null;
  country: string | null;
  isSponsor: boolean;
};

export type PlanInfo = {
  id: number;
  name: string;
  slug: string;
  vcpu: number;
  ramGb: number;
  diskGb: number;
  diskType: string | null;
  priceUsd: number;
  active: boolean;
};

export type PlanWithTrials = PlanInfo & {
  trials: TrialSummary[];
  /** Newest official trial, else newest trial of any kind. */
  latest: TrialSummary | null;
};

const pickLatest = (ts: TrialSummary[]) => ts.find((t) => t.source === "official") ?? ts[0] ?? null;

export async function getProviderPage(slug: string) {
  await connection();
  const db = getDb();
  const [provider] = await db.select(providerColumns).from(providers).where(eq(providers.slug, slug)).limit(1);
  if (!provider) return null;

  const [planRows, locationRows] = await Promise.all([
    db.select(planColumns).from(plans).where(eq(plans.providerId, provider.id)).orderBy(asc(plans.priceUsd)),
    db
      .select({ city: locations.city, country: locations.country })
      .from(locations)
      .where(eq(locations.providerId, provider.id))
      .orderBy(asc(locations.country), asc(locations.city)),
  ]);
  const ts = await trialSummaries(planRows.map((p) => p.id));
  const planList: PlanWithTrials[] = planRows.map((p) => {
    const own = ts.filter((t) => t.planId === p.id);
    return { ...p, trials: own, latest: pickLatest(own) };
  });

  return { provider: provider as ProviderInfo, plans: planList, locations: locationRows };
}

export async function getPlanPage(slug: string) {
  await connection();
  const db = getDb();
  const [row] = await db
    .select({ plan: planColumns, provider: providerColumns })
    .from(plans)
    .innerJoin(providers, eq(providers.id, plans.providerId))
    .where(eq(plans.slug, slug))
    .limit(1);
  if (!row) return null;
  const ts = await trialSummaries([row.plan.id]);
  const plan: PlanWithTrials = { ...row.plan, trials: ts, latest: pickLatest(ts) };
  return { provider: row.provider as ProviderInfo, plan };
}

export type IperfRow = {
  mode: string;
  provider: string;
  location: string;
  sendMbps: number | null;
  recvMbps: number | null;
  pingMs: number | null;
};

type RawData = {
  kind?: string;
  stability?: { version?: string; plannedHours?: number | null; intervalMin?: number | null; samples?: number } | null;
  input?: string;
  cpuTest?: { version?: string | number; sysbench?: string; sevenZip?: string; threads?: number } | null;
  yabs?: {
    version?: string;
    system?: Record<string, unknown> | null;
    iperf?: IperfRow[] | null;
  } | null;
};

export async function getTrialPage(id: number) {
  await connection();
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const db = getDb();
  const [row] = await db
    .select({
      id: trials.id,
      source: trials.source,
      startedAt: trials.startedAt,
      finishedAt: trials.finishedAt,
      cpuModel: trials.cpuModel,
      city: locations.city,
      country: locations.country,
      plan: planColumns,
      provider: providerColumns,
      methodologyVersion: scores.methodologyVersion,
      ...scoreColumns,
    })
    .from(trials)
    .innerJoin(plans, eq(plans.id, trials.planId))
    .innerJoin(providers, eq(providers.id, plans.providerId))
    .leftJoin(locations, eq(locations.id, trials.locationId))
    .leftJoin(scores, eq(scores.trialId, trials.id))
    .where(and(eq(trials.id, id), eq(trials.status, "completed")))
    .limit(1);
  if (!row) return null;

  const [metricRows, [raw], series] = await Promise.all([
    db
      .select({ key: metrics.key, value: metrics.value, unit: metrics.unit })
      .from(metrics)
      .where(eq(metrics.trialId, id)),
    db.select({ data: rawResults.data }).from(rawResults).where(eq(rawResults.trialId, id)).limit(1),
    db
      .select({ key: endurancePoints.key, t: endurancePoints.recordedAt, v: endurancePoints.value })
      .from(endurancePoints)
      .where(eq(endurancePoints.trialId, id))
      .orderBy(endurancePoints.recordedAt),
  ]);
  const data = (raw?.data ?? {}) as RawData;
  const seriesOf = (key: string) => series.filter((p) => p.key === key).map((p) => p.v);

  return {
    id: row.id,
    source: row.source,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    cpuModel: row.cpuModel,
    location: row.city ? `${row.city}, ${row.country}` : null,
    plan: row.plan as PlanInfo,
    provider: row.provider as ProviderInfo,
    scores: toScores(row),
    methodologyVersion: row.methodologyVersion,
    metrics: Object.fromEntries(metricRows.map((m) => [m.key, m.value])) as Record<string, number>,
    kind: data.kind ?? null,
    cpuTest: data.cpuTest ?? null,
    yabsVersion: data.yabs?.version ?? null,
    system: data.yabs?.system ?? null,
    iperf: Array.isArray(data.yabs?.iperf) ? data.yabs.iperf : [],
    hasRaw: typeof data.input === "string" && data.input.length > 0,
    stability: data.stability ?? null,
    series: {
      cpu: seriesOf("cpu_events_per_sec"),
      disk: seriesOf("disk_iops"),
      steal: seriesOf("steal_pct"),
    },
  };
}

/** The pasted output exactly as stored, for the public raw download. */
export async function getRawOutput(id: number): Promise<string | null> {
  await connection();
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const [row] = await getDb()
    .select({ data: rawResults.data })
    .from(rawResults)
    .innerJoin(trials, eq(trials.id, rawResults.trialId))
    .where(and(eq(rawResults.trialId, id), eq(trials.status, "completed")))
    .limit(1);
  const input = (row?.data as RawData | undefined)?.input;
  return typeof input === "string" ? input : null;
}

/** Providers with at least one completed test, for /providers. */
export async function getProviderIndex() {
  await connection();
  const rows = await getDb()
    .select({
      name: providers.name,
      slug: providers.slug,
      isSponsor: providers.isSponsor,
      plans: countDistinct(trials.planId),
      tests: countDistinct(trials.id),
      lastTest: max(trials.finishedAt),
      minPrice: min(plans.priceUsd),
    })
    .from(providers)
    .innerJoin(plans, eq(plans.providerId, providers.id))
    .innerJoin(trials, and(eq(trials.planId, plans.id), eq(trials.status, "completed")))
    .groupBy(providers.id)
    .orderBy(asc(providers.name));
  return rows.map((r) => ({
    ...r,
    plans: Number(r.plans),
    tests: Number(r.tests),
    minPrice: r.minPrice === null ? null : Number(r.minPrice),
  }));
}

/** Everything that has a public page with real content, for sitemap.xml. */
export async function getSitemapData() {
  await connection();
  const rows = await getDb()
    .select({
      trialId: trials.id,
      finishedAt: trials.finishedAt,
      planSlug: plans.slug,
      providerSlug: providers.slug,
    })
    .from(trials)
    .innerJoin(plans, eq(plans.id, trials.planId))
    .innerJoin(providers, eq(providers.id, plans.providerId))
    .where(eq(trials.status, "completed"));

  const newest = (m: Map<string, Date | null>, k: string, d: Date | null) => {
    const cur = m.get(k);
    if (cur === undefined || (d && (!cur || d > cur))) m.set(k, d);
  };
  const providerDates = new Map<string, Date | null>();
  const planDates = new Map<string, Date | null>();
  for (const r of rows) {
    newest(providerDates, r.providerSlug, r.finishedAt);
    newest(planDates, r.planSlug, r.finishedAt);
  }
  return {
    providers: [...providerDates].map(([slug, lastModified]) => ({ slug, lastModified })),
    plans: [...planDates].map(([slug, lastModified]) => ({ slug, lastModified })),
    trials: rows.map((r) => ({ id: r.trialId, lastModified: r.finishedAt })),
    lastModified: rows.reduce<Date | null>((a, r) => (r.finishedAt && (!a || r.finishedAt > a) ? r.finishedAt : a), null),
  };
}
