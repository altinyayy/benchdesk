import {
  bigserial,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Official trials run on our own script; community trials come from pasted
// yabs.sh output and are always shown as "unverified".
export const trialSource = pgEnum("trial_source", ["official", "community"]);
export const trialStatus = pgEnum("trial_status", [
  "pending",
  "running",
  "completed",
  "failed",
]);

export const providers = pgTable("providers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  websiteUrl: text("website_url"),
  affiliateUrl: text("affiliate_url"),
  country: text("country"),
  // Sponsored providers are labeled everywhere they appear.
  isSponsor: boolean("is_sponsor").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const locations = pgTable("locations", {
  id: serial("id").primaryKey(),
  providerId: integer("provider_id")
    .notNull()
    .references(() => providers.id, { onDelete: "cascade" }),
  city: text("city").notNull(),
  country: text("country").notNull(),
});

export const plans = pgTable("plans", {
  id: serial("id").primaryKey(),
  providerId: integer("provider_id")
    .notNull()
    .references(() => providers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  vcpu: integer("vcpu").notNull(),
  ramGb: numeric("ram_gb", { precision: 6, scale: 2, mode: "number" }).notNull(),
  diskGb: integer("disk_gb").notNull(),
  diskType: text("disk_type"),
  priceUsd: numeric("price_usd", { precision: 10, scale: 2, mode: "number" }).notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const trials = pgTable(
  "trials",
  {
    id: serial("id").primaryKey(),
    planId: integer("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    locationId: integer("location_id").references(() => locations.id, {
      onDelete: "set null",
    }),
    source: trialSource("source").notNull(),
    status: trialStatus("status").notNull().default("pending"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    cpuModel: text("cpu_model"),
    // SHA-256 of the one-time ingest token; the token itself is never stored.
    ingestTokenHash: text("ingest_token_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("trials_plan_idx").on(t.planId), index("trials_status_idx").on(t.status)],
);

// One row per measured value, e.g. key = "fio_4k_read_iops".
export const metrics = pgTable(
  "metrics",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    trialId: integer("trial_id")
      .notNull()
      .references(() => trials.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: doublePrecision("value").notNull(),
    unit: text("unit"),
  },
  (t) => [uniqueIndex("metrics_trial_key_idx").on(t.trialId, t.key)],
);

// Time series from the 48-hour stability run.
export const endurancePoints = pgTable(
  "endurance_points",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    trialId: integer("trial_id")
      .notNull()
      .references(() => trials.id, { onDelete: "cascade" }),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    key: text("key").notNull(),
    value: doublePrecision("value").notNull(),
  },
  (t) => [index("endurance_trial_key_time_idx").on(t.trialId, t.key, t.recordedAt)],
);

// Raw output is always kept so every score can be recomputed when the
// methodology changes.
export const rawResults = pgTable("raw_results", {
  id: serial("id").primaryKey(),
  trialId: integer("trial_id")
    .notNull()
    .references(() => trials.id, { onDelete: "cascade" }),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const scores = pgTable("scores", {
  id: serial("id").primaryKey(),
  trialId: integer("trial_id")
    .notNull()
    .unique()
    .references(() => trials.id, { onDelete: "cascade" }),
  // A category is null when the trial has no metric for it (e.g. no 48-hour
  // stability run yet). Overall averages the categories that are present.
  cpu: doublePrecision("cpu"),
  disk: doublePrecision("disk"),
  network: doublePrecision("network"),
  stability: doublePrecision("stability"),
  overall: doublePrecision("overall").notNull(),
  priceWeighted: doublePrecision("price_weighted").notNull(),
  methodologyVersion: text("methodology_version").notNull(),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
});
