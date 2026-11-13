import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";

// Single-admin login. The password and signing secret come from .env on the
// server (ADMIN_PASSWORD, SESSION_SECRET). The cookie holds an expiry time and
// an HMAC of it; nothing secret is stored in the browser.

const COOKIE = "bd_admin";
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function secret(): string | null {
  const s = process.env.SESSION_SECRET;
  return s && s.length >= 32 ? s : null;
}

function sign(payload: string, key: string) {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function loginConfigured() {
  return Boolean(process.env.ADMIN_PASSWORD && secret());
}

export async function isAdmin(): Promise<boolean> {
  // Read the cookie first: this marks the caller as request-time, so the
  // check (and any redirect) can never be baked in during `next build`.
  const value = (await cookies()).get(COOKIE)?.value;
  const key = secret();
  if (!key) return false;
  if (!value) return false;
  const [exp, sig] = value.split(".");
  if (!exp || !sig || !safeEqual(sig, sign(exp, key))) return false;
  // Cookies are available during runtime prefetches, so opt out explicitly
  // before reading the clock.
  await connection();
  return Number(exp) > Date.now() / 1000;
}

/** Call at the top of every admin page and every admin Server Action. */
export async function requireAdmin() {
  if (!(await isAdmin())) redirect("/admin/login");
}

// --- Login rate limit: 5 failed attempts per IP per 15 minutes (in memory) ---
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 5;
const fails = new Map<string, { count: number; first: number }>();

async function clientIp() {
  const h = await headers();
  return h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function attemptLogin(password: string): Promise<"ok" | "wrong" | "locked" | "disabled"> {
  const key = secret();
  const expected = process.env.ADMIN_PASSWORD;
  if (!key || !expected) return "disabled";

  const ip = await clientIp();
  const now = Date.now();
  const entry = fails.get(ip);
  if (entry && now - entry.first > WINDOW_MS) fails.delete(ip);
  const current = fails.get(ip);
  if (current && current.count >= MAX_FAILS) return "locked";

  if (!safeEqual(password, expected)) {
    fails.set(ip, current ? { ...current, count: current.count + 1 } : { count: 1, first: now });
    return "wrong";
  }

  fails.delete(ip);
  const exp = String(Math.floor(now / 1000) + MAX_AGE_SECONDS);
  (await cookies()).set(COOKIE, `${exp}.${sign(exp, key)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
  return "ok";
}

export async function logout() {
  (await cookies()).delete(COOKIE);
}
