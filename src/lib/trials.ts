import "server-only";
import { createHash } from "node:crypto";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import { METHODOLOGY_VERSION, computeScores } from "./scoring";
import type { YabsResult } from "./yabs/parse";

const { trials, plans, providers, locations, metrics, rawResults, scores } = schema;

type DB = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

// Bump when the parser changes in a way that affects stored metrics.
export const YABS_PARSER_VERSION = 1;

export function inputHash(input: string) {
  return createHash("sha256").update(input.replace(/\r\n/g, "\n").trim()).digest("hex");
}

export async function findTrialByInputHash(hash: string): Promise<number | null> {
  const [row] = await getDb()
    .select({ trialId: rawResults.trialId })
    .from(rawResults)
    .where(sql`${rawResults.data}->>'sha256' = ${hash}`)
    .limit(1);
  return row?.trialId ?? null;
}

const MIN_DATE = Date.UTC(2014, 0, 1);

/** Inserts a completed trial with its metrics and raw output, then rescores everything. */
export async function saveYabsTrial(opts: {
  planId: number;
  locationId: number | null;
  source: "official" | "community";
  input: string;
  hash: string;
  result: YabsResult;
}): Promise<number> {
  const { result } = opts;
  const now = Date.now();
  const sane = (d: Date | null) => (d && d.getTime() >= MIN_DATE && d.getTime() <= now + 86_400_000 ? d : null);
  const startedAt = sane(result.startedAt);
  // Rankings sort by finishedAt, so it must always be set.
  const finishedAt = sane(result.finishedAt) ?? new Date(now);

  return getDb().transaction(async (tx) => {
    const [trial] = await tx
      .insert(trials)
      .values({
        planId: opts.planId,
        locationId: opts.locationId,
        source: opts.source,
        status: "completed",
        startedAt,
        finishedAt,
        cpuModel: result.system.cpuModel?.slice(0, 200) ?? null,
      })
      .returning({ id: trials.id });

    await tx.insert(metrics).values(result.metrics.map((m) => ({ trialId: trial.id, ...m })));
    await tx.insert(rawResults).values({
      trialId: trial.id,
      data: {
        kind: "yabs",
        sha256: opts.hash,
        parserVersion: YABS_PARSER_VERSION,
        format: result.format,
        yabsVersion: result.version,
        system: result.system,
        iperf: result.iperf,
        geekbenchUrls: result.geekbenchUrls,
        input: opts.input,
      },
    });
    await recomputeScores(tx);
    return trial.id;
  });
}

export async function deleteTrial(id: number) {
  await getDb().transaction(async (tx) => {
    await tx.delete(trials).where(eq(trials.id, id));
    await recomputeScores(tx);
  });
}

/**
 * Scores depend on every other official trial (percentiles), so they are
 * always recomputed together. Community trials are never scored.
 */
export async function recomputeScores(tx?: Tx): Promise<number> {
  const run = async (db: Tx) => {
    const rows = await db
      .select({ trialId: trials.id, priceUsd: plans.priceUsd })
      .from(trials)
      .innerJoin(plans, eq(plans.id, trials.planId))
      .where(and(eq(trials.source, "official"), eq(trials.status, "completed")));

    const ids = rows.map((r) => r.trialId);
    const ms = ids.length
      ? await db
          .select({ trialId: metrics.trialId, key: metrics.key, value: metrics.value })
          .from(metrics)
          .where(inArray(metrics.trialId, ids))
      : [];
    const byTrial = new Map<number, Record<string, number>>(ids.map((id) => [id, {}]));
    for (const m of ms) byTrial.get(m.trialId)![m.key] = m.value;

    const computed = computeScores(rows.map((r) => ({ ...r, metrics: byTrial.get(r.trialId)! })));
    await db.delete(scores);
    if (computed.length) {
      await db.insert(scores).values(computed.map((s) => ({ ...s, methodologyVersion: METHODOLOGY_VERSION })));
    }
    return computed.length;
  };
  return tx ? run(tx) : getDb().transaction(run);
}

export async function listTrials() {
  const db = getDb();
  const rows = await db
    .select({
      id: trials.id,
      source: trials.source,
      status: trials.status,
      finishedAt: trials.finishedAt,
      cpuModel: trials.cpuModel,
      provider: providers.name,
      plan: plans.name,
      city: locations.city,
      overall: scores.overall,
      cpu: scores.cpu,
      disk: scores.disk,
      network: scores.network,
    })
    .from(trials)
    .innerJoin(plans, eq(plans.id, trials.planId))
    .innerJoin(providers, eq(providers.id, plans.providerId))
    .leftJoin(locations, eq(locations.id, trials.locationId))
    .leftJoin(scores, eq(scores.trialId, trials.id))
    .orderBy(desc(trials.id))
    .limit(200);

  const counts = rows.length
    ? await db
        .select({ trialId: metrics.trialId, n: count() })
        .from(metrics)
        .where(
          inArray(
            metrics.trialId,
            rows.map((r) => r.id),
          ),
        )
        .groupBy(metrics.trialId)
    : [];
  const countBy = new Map(counts.map((c) => [c.trialId, c.n]));
  return rows.map((r) => ({ ...r, metricCount: countBy.get(r.id) ?? 0 }));
}

/** Plans and locations for the "add result" form, grouped by provider. */
export async function listPlanChoices() {
  const db = getDb();
  const [ps, pl, loc] = await Promise.all([
    db.select({ id: providers.id, name: providers.name }).from(providers).orderBy(asc(providers.name)),
    db
      .select({ id: plans.id, providerId: plans.providerId, name: plans.name, priceUsd: plans.priceUsd, vcpu: plans.vcpu })
      .from(plans)
      .orderBy(asc(plans.priceUsd)),
    db
      .select({ id: locations.id, providerId: locations.providerId, city: locations.city, country: locations.country })
      .from(locations)
      .orderBy(asc(locations.city)),
  ]);
  return ps.map((p) => ({
    ...p,
    plans: pl.filter((x) => x.providerId === p.id),
    locations: loc.filter((x) => x.providerId === p.id),
  }));
}
