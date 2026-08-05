import { createHmac, timingSafeEqual } from "crypto";
import { compare, hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/server/db";
import { systemHealthCredentials } from "@/server/db/schema";
import { newId } from "@/lib/utils";

export const SYSTEM_HEALTH_COOKIE = "df_sys_health";
/** Separate short-lived cookie for database console access. */
export const SYSTEM_HEALTH_DB_COOKIE = "df_sys_health_db";
/** Short-lived ops unlock (30 minutes). */
export const SYSTEM_HEALTH_TTL_SEC = 60 * 30;
/** Database console re-auth window (10 minutes). */
export const SYSTEM_HEALTH_DB_TTL_SEC = 60 * 10;
export const SYSTEM_HEALTH_MAX_FAILURES = 5;
export const SYSTEM_HEALTH_BCRYPT_ROUNDS = 12;

type GatePayload = {
  email: string;
  exp: number;
  iat: number;
  /** Present on DB console tokens only. */
  scope?: "db";
};

export type SystemHealthCredentialsRow = typeof systemHealthCredentials.$inferSelect;

export type SystemHealthGateStatus = {
  /** DB ops credentials exist (source of truth after first setup). */
  hasCredentials: boolean;
  locked: boolean;
  unlocked: boolean;
  /** Ops unlocked + valid database console cookie. */
  dbUnlocked: boolean;
  failedCount: number;
  /** Optional legacy env bootstrap when DB has no row yet. */
  envFallbackAvailable: boolean;
  source: "database" | "env" | "none";
};

function getGateSecret() {
  return (
    process.env.SYSTEM_HEALTH_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    ""
  );
}

export function isSystemHealthGateSecretReady() {
  return Boolean(getGateSecret());
}

/** Legacy env bootstrap email (optional; DB wins once setup exists). */
export function getConfiguredSystemHealthEmail() {
  return (process.env.SYSTEM_HEALTH_EMAIL || "").trim().toLowerCase();
}

export function isEnvSystemHealthGateConfigured() {
  const email = getConfiguredSystemHealthEmail();
  const hasPassword =
    Boolean(process.env.SYSTEM_HEALTH_PASSWORD?.length) ||
    Boolean(process.env.SYSTEM_HEALTH_PASSWORD_HASH?.length);
  return Boolean(email && hasPassword && getGateSecret());
}

/** @deprecated Prefer getSystemHealthGateStatus(); kept for callers expecting a boolean. */
export function isSystemHealthGateConfigured() {
  return isEnvSystemHealthGateConfigured();
}

export async function getSystemHealthCredentials(): Promise<SystemHealthCredentialsRow | null> {
  const rows = await db.select().from(systemHealthCredentials).limit(1);
  return rows[0] ?? null;
}

export async function getSystemHealthGateStatus(): Promise<SystemHealthGateStatus> {
  const creds = await getSystemHealthCredentials();
  const envFallbackAvailable = !creds && isEnvSystemHealthGateConfigured();

  if (creds) {
    const gate = await readSystemHealthGateForEmail(creds.email, creds.locked);
    const dbGate = gate.unlocked
      ? await readSystemHealthDbGateForEmail(creds.email, creds.locked)
      : { unlocked: false as const };
    return {
      hasCredentials: true,
      locked: creds.locked,
      unlocked: gate.unlocked,
      dbUnlocked: dbGate.unlocked,
      failedCount: creds.failedCount,
      envFallbackAvailable: false,
      source: "database",
    };
  }

  if (envFallbackAvailable) {
    const email = getConfiguredSystemHealthEmail();
    const gate = await readSystemHealthGateForEmail(email, false);
    const dbGate = gate.unlocked
      ? await readSystemHealthDbGateForEmail(email, false)
      : { unlocked: false as const };
    return {
      hasCredentials: false,
      locked: false,
      unlocked: gate.unlocked,
      dbUnlocked: dbGate.unlocked,
      failedCount: 0,
      envFallbackAvailable: true,
      source: "env",
    };
  }

  return {
    hasCredentials: false,
    locked: false,
    unlocked: false,
    dbUnlocked: false,
    failedCount: 0,
    envFallbackAvailable: false,
    source: "none",
  };
}

function signPayload(payload: GatePayload) {
  const secret = getGateSecret();
  if (!secret) throw new Error("System Health gate secret not configured");
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifyToken(
  token: string,
  expectedEmail: string,
  options?: { requireDbScope?: boolean },
): GatePayload | null {
  const secret = getGateSecret();
  if (!secret || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as GatePayload;
    if (!payload?.email || typeof payload.exp !== "number") return null;
    if (payload.exp * 1000 < Date.now()) return null;
    if (!expectedEmail || payload.email.toLowerCase() !== expectedEmail.toLowerCase()) return null;
    if (options?.requireDbScope) {
      if (payload.scope !== "db") return null;
    } else if (payload.scope === "db") {
      // Ops unlock cookie must not be a DB-scoped token.
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

async function verifyEnvPassword(password: string) {
  const hashValue = process.env.SYSTEM_HEALTH_PASSWORD_HASH?.trim();
  if (hashValue) {
    return compare(password, hashValue);
  }
  const plain = process.env.SYSTEM_HEALTH_PASSWORD ?? "";
  if (!plain) return false;
  const a = Buffer.from(password);
  const b = Buffer.from(plain);
  if (a.length !== b.length) {
    timingSafeEqual(Buffer.alloc(b.length), b);
    return false;
  }
  return timingSafeEqual(a, b);
}

/** @deprecated Use DB-backed verify; kept for env bootstrap. */
export async function verifySystemHealthPassword(password: string) {
  return verifyEnvPassword(password);
}

export async function verifyDbPassword(password: string, passwordHash: string) {
  return compare(password, passwordHash);
}

export async function verifyDbPin(pin: string, pinHash: string) {
  return compare(pin, pinHash);
}

export function createSystemHealthToken(email: string) {
  const now = Math.floor(Date.now() / 1000);
  return signPayload({
    email: email.toLowerCase().trim(),
    iat: now,
    exp: now + SYSTEM_HEALTH_TTL_SEC,
  });
}

export function createSystemHealthDbToken(email: string) {
  const now = Math.floor(Date.now() / 1000);
  return signPayload({
    email: email.toLowerCase().trim(),
    iat: now,
    exp: now + SYSTEM_HEALTH_DB_TTL_SEC,
    scope: "db",
  });
}

async function readSystemHealthGateForEmail(email: string, locked: boolean) {
  if (!email || !getGateSecret() || locked) {
    return { unlocked: false as const };
  }
  const jar = await cookies();
  const token = jar.get(SYSTEM_HEALTH_COOKIE)?.value;
  if (!token) return { unlocked: false as const };
  const payload = verifyToken(token, email);
  if (!payload) return { unlocked: false as const };
  return { unlocked: true as const, email: payload.email };
}

async function readSystemHealthDbGateForEmail(email: string, locked: boolean) {
  if (!email || !getGateSecret() || locked) {
    return { unlocked: false as const };
  }
  const jar = await cookies();
  const token = jar.get(SYSTEM_HEALTH_DB_COOKIE)?.value;
  if (!token) return { unlocked: false as const };
  const payload = verifyToken(token, email, { requireDbScope: true });
  if (!payload) return { unlocked: false as const };
  return { unlocked: true as const, email: payload.email };
}

export async function readSystemHealthGate(): Promise<{ unlocked: boolean; email?: string }> {
  const creds = await getSystemHealthCredentials();
  if (creds) {
    return readSystemHealthGateForEmail(creds.email, creds.locked);
  }
  if (isEnvSystemHealthGateConfigured()) {
    return readSystemHealthGateForEmail(getConfiguredSystemHealthEmail(), false);
  }
  return { unlocked: false };
}

export async function readSystemHealthDbGate(): Promise<{ unlocked: boolean; email?: string }> {
  const ops = await readSystemHealthGate();
  if (!ops.unlocked || !ops.email) {
    return { unlocked: false };
  }
  const creds = await getSystemHealthCredentials();
  if (creds) {
    return readSystemHealthDbGateForEmail(creds.email, creds.locked);
  }
  if (isEnvSystemHealthGateConfigured()) {
    return readSystemHealthDbGateForEmail(getConfiguredSystemHealthEmail(), false);
  }
  return { unlocked: false };
}

export async function setSystemHealthCookie(token: string) {
  const jar = await cookies();
  jar.set(SYSTEM_HEALTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SYSTEM_HEALTH_TTL_SEC,
  });
}

export async function setSystemHealthDbCookie(token: string) {
  const jar = await cookies();
  jar.set(SYSTEM_HEALTH_DB_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SYSTEM_HEALTH_DB_TTL_SEC,
  });
}

export async function clearSystemHealthDbCookie() {
  const jar = await cookies();
  jar.delete(SYSTEM_HEALTH_DB_COOKIE);
}

/** Clears ops unlock and database console cookies. */
export async function clearSystemHealthCookie() {
  const jar = await cookies();
  jar.delete(SYSTEM_HEALTH_COOKIE);
  jar.delete(SYSTEM_HEALTH_DB_COOKIE);
}

export async function createSystemHealthCredentials(input: {
  email: string;
  password: string;
  pin: string;
  createdById?: string | null;
}) {
  const existing = await getSystemHealthCredentials();
  if (existing) {
    throw new Error("SystemHealthAlreadyConfigured");
  }

  const email = input.email.toLowerCase().trim();
  const passwordHash = await hash(input.password, SYSTEM_HEALTH_BCRYPT_ROUNDS);
  const pinHash = await hash(input.pin, SYSTEM_HEALTH_BCRYPT_ROUNDS);
  const now = new Date();

  await db.insert(systemHealthCredentials).values({
    id: newId(),
    email,
    passwordHash,
    pinHash,
    failedCount: 0,
    locked: false,
    lockedAt: null,
    createdById: input.createdById ?? null,
    createdAt: now,
    updatedAt: now,
  });
}

export async function recordUnlockFailure(creds: SystemHealthCredentialsRow) {
  const next = creds.failedCount + 1;
  const locked = next >= SYSTEM_HEALTH_MAX_FAILURES;
  const now = new Date();
  await db
    .update(systemHealthCredentials)
    .set({
      failedCount: next,
      locked,
      lockedAt: locked ? now : creds.lockedAt,
      updatedAt: now,
    })
    .where(eq(systemHealthCredentials.id, creds.id));

  return {
    locked,
    failedCount: next,
    remaining: Math.max(0, SYSTEM_HEALTH_MAX_FAILURES - next),
  };
}

export async function resetUnlockFailures(creds: SystemHealthCredentialsRow) {
  if (creds.failedCount === 0 && !creds.locked) return;
  await db
    .update(systemHealthCredentials)
    .set({
      failedCount: 0,
      locked: false,
      lockedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(systemHealthCredentials.id, creds.id));
}

export async function unblockSystemHealthCredentials() {
  const creds = await getSystemHealthCredentials();
  if (!creds) return { ok: false as const, error: "No System Health credentials configured" };
  await db
    .update(systemHealthCredentials)
    .set({
      failedCount: 0,
      locked: false,
      lockedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(systemHealthCredentials.id, creds.id));
  return { ok: true as const };
}

/**
 * Require a valid System Health ops unlock cookie (in addition to super_admin).
 */
export async function requireSystemHealthGate() {
  const gate = await readSystemHealthGate();
  if (!gate.unlocked) {
    throw new Error("SystemHealthLocked");
  }
  return gate;
}

/**
 * Require ops unlock + a separate short-lived database console cookie.
 */
export async function requireSystemHealthDbGate() {
  await requireSystemHealthGate();
  const dbGate = await readSystemHealthDbGate();
  if (!dbGate.unlocked) {
    throw new Error("SystemHealthDbLocked");
  }
  return dbGate;
}
