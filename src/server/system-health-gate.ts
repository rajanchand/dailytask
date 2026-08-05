import { createHmac, timingSafeEqual } from "crypto";
import { compare } from "bcryptjs";
import { cookies } from "next/headers";

export const SYSTEM_HEALTH_COOKIE = "df_sys_health";
/** Short-lived ops unlock (30 minutes). */
export const SYSTEM_HEALTH_TTL_SEC = 60 * 30;

type GatePayload = {
  email: string;
  exp: number;
  iat: number;
};

function getGateSecret() {
  return (
    process.env.SYSTEM_HEALTH_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    ""
  );
}

export function getConfiguredSystemHealthEmail() {
  return (process.env.SYSTEM_HEALTH_EMAIL || "").trim().toLowerCase();
}

export function isSystemHealthGateConfigured() {
  const email = getConfiguredSystemHealthEmail();
  const hasPassword =
    Boolean(process.env.SYSTEM_HEALTH_PASSWORD?.length) ||
    Boolean(process.env.SYSTEM_HEALTH_PASSWORD_HASH?.length);
  return Boolean(email && hasPassword && getGateSecret());
}

function signPayload(payload: GatePayload) {
  const secret = getGateSecret();
  if (!secret) throw new Error("System Health gate secret not configured");
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifyToken(token: string): GatePayload | null {
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
    const configured = getConfiguredSystemHealthEmail();
    if (!configured || payload.email.toLowerCase() !== configured) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function verifySystemHealthPassword(password: string) {
  const hash = process.env.SYSTEM_HEALTH_PASSWORD_HASH?.trim();
  if (hash) {
    return compare(password, hash);
  }
  const plain = process.env.SYSTEM_HEALTH_PASSWORD ?? "";
  if (!plain) return false;
  const a = Buffer.from(password);
  const b = Buffer.from(plain);
  if (a.length !== b.length) {
    // Still compare to avoid trivial timing leak on length
    timingSafeEqual(Buffer.alloc(b.length), b);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function createSystemHealthToken(email: string) {
  const now = Math.floor(Date.now() / 1000);
  return signPayload({
    email: email.toLowerCase().trim(),
    iat: now,
    exp: now + SYSTEM_HEALTH_TTL_SEC,
  });
}

export async function readSystemHealthGate(): Promise<{ unlocked: boolean; email?: string }> {
  if (!isSystemHealthGateConfigured()) {
    return { unlocked: false };
  }
  const jar = await cookies();
  const token = jar.get(SYSTEM_HEALTH_COOKIE)?.value;
  if (!token) return { unlocked: false };
  const payload = verifyToken(token);
  if (!payload) return { unlocked: false };
  return { unlocked: true, email: payload.email };
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

export async function clearSystemHealthCookie() {
  const jar = await cookies();
  jar.delete(SYSTEM_HEALTH_COOKIE);
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
