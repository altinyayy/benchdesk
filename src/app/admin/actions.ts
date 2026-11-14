"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { attemptLogin, logout, requireAdmin } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { slugify } from "@/lib/slug";
import { deleteTrial, findTrialByInputHash, inputHash, recomputeScores, saveYabsTrial } from "@/lib/trials";
import { parseYabs } from "@/lib/yabs/parse";

const { providers, plans, locations } = schema;

export type FormState = { error?: string; ok?: string; warnings?: string[] };

// --- small validation helpers ---------------------------------------------
class Invalid extends Error {}

function text(fd: FormData, key: string, label: string, opts: { required?: boolean; max?: number } = {}) {
  const v = String(fd.get(key) ?? "").trim();
  if (opts.required && !v) throw new Invalid(`${label} is required.`);
  if (v.length > (opts.max ?? 200)) throw new Invalid(`${label} is too long.`);
  return v || null;
}

function url(fd: FormData, key: string, label: string) {
  const v = text(fd, key, label, { max: 500 });
  if (v && !/^https?:\/\/[^\s]+$/i.test(v)) throw new Invalid(`${label} must start with https://`);
  return v;
}

function num(fd: FormData, key: string, label: string, opts: { int?: boolean; min?: number; max?: number } = {}) {
  const raw = String(fd.get(key) ?? "").trim().replace(",", ".");
  const v = Number(raw);
  if (!raw || !Number.isFinite(v)) throw new Invalid(`${label} must be a number.`);
  if (opts.int && !Number.isInteger(v)) throw new Invalid(`${label} must be a whole number.`);
  if (opts.min !== undefined && v < opts.min) throw new Invalid(`${label} must be at least ${opts.min}.`);
  if (opts.max !== undefined && v > opts.max) throw new Invalid(`${label} must be at most ${opts.max}.`);
  return v;
}

function id(fd: FormData, key = "id") {
  const v = Number(fd.get(key));
  if (!Number.isInteger(v) || v <= 0) throw new Invalid("Missing id.");
  return v;
}

function isUniqueViolation(err: unknown) {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

async function run(fn: () => Promise<FormState | void>): Promise<FormState> {
  await requireAdmin();
  try {
    return (await fn()) ?? {};
  } catch (err) {
    if (err instanceof Invalid) return { error: err.message };
    if (isUniqueViolation(err)) return { error: "That name is already taken." };
    throw err;
  }
}

function refresh() {
  revalidatePath("/admin", "layout");
  revalidatePath("/");
}

// --- auth ------------------------------------------------------------------
export async function loginAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const result = await attemptLogin(String(fd.get("password") ?? ""));
  if (result === "disabled") return { error: "Login is not configured on the server (.env)." };
  if (result === "locked") return { error: "Too many attempts. Try again in 15 minutes." };
  if (result === "wrong") return { error: "Wrong password." };
  redirect("/admin");
}

export async function logoutAction() {
  await logout();
  redirect("/admin/login");
}

// --- providers -------------------------------------------------------------
function providerFields(fd: FormData) {
  return {
    name: text(fd, "name", "Name", { required: true, max: 80 })!,
    websiteUrl: url(fd, "websiteUrl", "Website"),
    affiliateUrl: url(fd, "affiliateUrl", "Affiliate link"),
    country: text(fd, "country", "Country", { max: 60 }),
    isSponsor: fd.get("isSponsor") === "on",
  };
}

export async function createProvider(_prev: FormState, fd: FormData): Promise<FormState> {
  let newId = 0;
  const state = await run(async () => {
    const f = providerFields(fd);
    const slug = slugify(f.name);
    if (!slug) throw new Invalid("Name needs at least one letter or number.");
    const [row] = await getDb().insert(providers).values({ ...f, slug }).returning({ id: providers.id });
    newId = row.id;
    refresh();
  });
  if (newId) redirect(`/admin/providers/${newId}`);
  return state;
}

export async function updateProvider(_prev: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    await getDb().update(providers).set(providerFields(fd)).where(eq(providers.id, id(fd)));
    refresh();
    return { ok: "Saved." };
  });
}

// --- plans -----------------------------------------------------------------
function planFields(fd: FormData) {
  return {
    name: text(fd, "name", "Plan name", { required: true, max: 80 })!,
    vcpu: num(fd, "vcpu", "vCPU", { int: true, min: 1, max: 512 }),
    ramGb: num(fd, "ramGb", "RAM", { min: 0.125, max: 4096 }),
    diskGb: num(fd, "diskGb", "Disk", { int: true, min: 1, max: 100000 }),
    diskType: text(fd, "diskType", "Disk type", { max: 20 }),
    priceUsd: num(fd, "priceUsd", "Price", { min: 0, max: 100000 }),
  };
}

export async function createPlan(_prev: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const providerId = id(fd, "providerId");
    const [prov] = await getDb().select({ slug: providers.slug }).from(providers).where(eq(providers.id, providerId));
    if (!prov) throw new Invalid("Provider not found.");
    const f = planFields(fd);
    const slug = `${prov.slug}-${slugify(f.name)}`;
    await getDb().insert(plans).values({ ...f, providerId, slug });
    refresh();
    return { ok: `Added ${f.name}.` };
  });
}

export async function updatePlan(_prev: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    await getDb()
      .update(plans)
      .set({ ...planFields(fd), active: fd.get("active") === "on" })
      .where(eq(plans.id, id(fd)));
    refresh();
    return { ok: "Saved." };
  });
}

// --- locations -------------------------------------------------------------
export async function createLocation(_prev: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const providerId = id(fd, "providerId");
    await getDb()
      .insert(locations)
      .values({
        providerId,
        city: text(fd, "city", "City", { required: true, max: 80 })!,
        country: text(fd, "country", "Country", { required: true, max: 60 })!,
      });
    refresh();
    return { ok: "Location added." };
  });
}

export async function deleteLocation(fd: FormData) {
  await requireAdmin();
  await getDb().delete(locations).where(eq(locations.id, id(fd)));
  refresh();
}

// --- test results ----------------------------------------------------------
export async function addYabsResult(_prev: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const planId = id(fd, "planId");
    const locationRaw = String(fd.get("locationId") ?? "");
    const locationId = locationRaw ? id(fd, "locationId") : null;
    const source = fd.get("source") === "community" ? "community" : "official";
    const input = String(fd.get("output") ?? "");

    const db = getDb();
    const [plan] = await db
      .select({ providerId: plans.providerId, vcpu: plans.vcpu, ramGb: plans.ramGb, name: plans.name })
      .from(plans)
      .where(eq(plans.id, planId));
    if (!plan) throw new Invalid("Plan not found.");
    if (locationId !== null) {
      const [loc] = await db.select({ providerId: locations.providerId }).from(locations).where(eq(locations.id, locationId));
      if (!loc || loc.providerId !== plan.providerId) throw new Invalid("That location belongs to a different provider.");
    }

    const parsed = parseYabs(input);
    if (!parsed.ok) throw new Invalid(parsed.error);
    const { result } = parsed;

    const hash = inputHash(input);
    const existing = await findTrialByInputHash(hash);
    if (existing) throw new Invalid(`This exact output was already saved as test #${existing}.`);

    const warnings = [...result.warnings];
    const { cores, ramGib } = result.system;
    if (cores !== null && cores !== plan.vcpu)
      warnings.push(`The server reported ${cores} CPU cores, but ${plan.name} is listed with ${plan.vcpu} vCPU.`);
    // yabs shows usable RAM (minus kernel reserve, GiB vs GB), so only flag big gaps.
    if (ramGib !== null && Math.abs(ramGib - plan.ramGb) / plan.ramGb > 0.25)
      warnings.push(`The server reported ${ramGib} GiB RAM, but ${plan.name} is listed with ${plan.ramGb} GB.`);

    const trialId = await saveYabsTrial({ planId, locationId, source, input, hash, result });
    refresh();
    return {
      ok: `Saved as test #${trialId} with ${result.metrics.length} metrics${source === "official" ? "; scores updated" : ""}.`,
      warnings,
    };
  });
}

export async function deleteTrialAction(fd: FormData) {
  await requireAdmin();
  await deleteTrial(id(fd));
  refresh();
}

export async function recomputeAction(): Promise<FormState> {
  return run(async () => {
    const n = await recomputeScores();
    refresh();
    return { ok: `Recomputed scores for ${n} official test${n === 1 ? "" : "s"}.` };
  });
}
