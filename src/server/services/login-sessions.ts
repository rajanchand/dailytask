import { and, eq, isNull, lt, or } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/server/db";
import { userSessions } from "@/server/db/schema";
import { newId } from "@/lib/utils";

/** Local IP helper — keep Redis out of the auth import graph. */
async function clientIpFromHeaders() {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return h.get("x-real-ip") || "unknown";
}

function isPublicIp(ip: string | null | undefined): ip is string {
  if (!ip || ip === "unknown") return false;
  const v = ip.trim().toLowerCase();
  if (v === "::1" || v === "localhost") return false;
  if (v.startsWith("127.")) return false;
  if (v.startsWith("10.")) return false;
  if (v.startsWith("192.168.")) return false;
  if (v.startsWith("169.254.")) return false;
  const m = /^172\.(\d+)\./.exec(v);
  if (m) {
    const n = Number(m[1]);
    if (n >= 16 && n <= 31) return false;
  }
  if (v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80:")) return false;
  return true;
}

export function parseUserAgent(ua: string | null | undefined) {
  const raw = (ua || "").trim();
  if (!raw) {
    return { browser: "Unknown", os: "Unknown", device: "Unknown" };
  }

  let browser = "Other";
  if (/Edg\//i.test(raw)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(raw)) browser = "Opera";
  else if (/Chrome\//i.test(raw) && !/Chromium/i.test(raw)) browser = "Chrome";
  else if (/Firefox\//i.test(raw)) browser = "Firefox";
  else if (/Safari\//i.test(raw) && !/Chrome/i.test(raw)) browser = "Safari";
  else if (/MSIE|Trident\//i.test(raw)) browser = "IE";

  let os = "Other";
  if (/Windows NT/i.test(raw)) os = "Windows";
  else if (/Android/i.test(raw)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(raw)) os = "iOS";
  else if (/Mac OS X|Macintosh/i.test(raw)) os = "macOS";
  else if (/CrOS/i.test(raw)) os = "ChromeOS";
  else if (/Linux/i.test(raw)) os = "Linux";

  let device = "Desktop";
  if (/iPad|Tablet/i.test(raw)) device = "Tablet";
  else if (/Mobile|Android|iPhone|iPod/i.test(raw)) device = "Mobile";
  else if (/bot|crawler|spider/i.test(raw)) device = "Bot";

  return { browser, os, device };
}

/**
 * Soft GeoIP lookup (country + ISP). Default: free ip-api.com (HTTP, no key).
 * Override with GEOIP_LOOKUP_URL containing `{ip}`, or disable with GEOIP_DISABLED=1.
 * Never throws; returns nulls on failure.
 */
export async function lookupGeoIp(ip: string | null | undefined): Promise<{
  country: string | null;
  isp: string | null;
}> {
  if (process.env.GEOIP_DISABLED === "1" || process.env.GEOIP_DISABLED === "true") {
    return { country: null, isp: null };
  }
  if (!isPublicIp(ip)) return { country: null, isp: null };

  const template =
    process.env.GEOIP_LOOKUP_URL?.trim() ||
    "http://ip-api.com/json/{ip}?fields=status,country,isp,query";
  const url = template.replaceAll("{ip}", encodeURIComponent(ip));

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    clearTimeout(timer);
    if (!res.ok) return { country: null, isp: null };
    const data = (await res.json()) as Record<string, unknown>;
    if (data.status === "fail") return { country: null, isp: null };
    const country =
      (typeof data.country === "string" && data.country) ||
      (typeof data.country_name === "string" && data.country_name) ||
      null;
    const isp =
      (typeof data.isp === "string" && data.isp) ||
      (typeof data.org === "string" && data.org) ||
      null;
    return {
      country: country ? country.slice(0, 120) : null,
      isp: isp ? isp.slice(0, 200) : null,
    };
  } catch {
    return { country: null, isp: null };
  }
}

async function enrichSessionGeo(sessionId: string, ip: string | null) {
  try {
    const geo = await lookupGeoIp(ip);
    if (!geo.country && !geo.isp) return;
    await db
      .update(userSessions)
      .set({
        ...(geo.country ? { country: geo.country } : {}),
        ...(geo.isp ? { isp: geo.isp } : {}),
      })
      .where(eq(userSessions.id, sessionId));
  } catch (err) {
    console.error("[login-sessions] geo enrich failed", err);
  }
}

/** Record a successful login for System Health telemetry. */
export async function recordLoginSession(userId: string) {
  const h = await headers();
  const userAgent = h.get("user-agent");
  const { browser, os, device } = parseUserAgent(userAgent);
  const ipAddress = await clientIpFromHeaders();
  const id = newId();
  const now = new Date();
  const ip = ipAddress === "unknown" ? null : ipAddress;

  await db.insert(userSessions).values({
    id,
    userId,
    ipAddress: ip,
    userAgent: userAgent?.slice(0, 512) || null,
    browser,
    os,
    device,
    status: "active",
    loginAt: now,
    lastSeenAt: now,
  });

  // Geo lookup must never block / fail login
  void enrichSessionGeo(id, ip);

  return id;
}

export async function markSessionLoggedOut(sessionId: string | null | undefined) {
  if (!sessionId) return;
  try {
    await db
      .update(userSessions)
      .set({
        status: "logged_out",
        logoutAt: new Date(),
        lastSeenAt: new Date(),
      })
      .where(eq(userSessions.id, sessionId));
  } catch (err) {
    console.error("[login-sessions] failed to mark logout", err);
  }
}

/** Throttle interval for last-seen updates (ms). */
export const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Bump lastSeenAt for an active login session (last online / last portal use).
 * Only writes when lastSeenAt is null or older than the throttle window.
 */
export async function touchSession(sessionId: string | null | undefined) {
  if (!sessionId) return;
  try {
    const cutoff = new Date(Date.now() - SESSION_TOUCH_INTERVAL_MS);
    await db
      .update(userSessions)
      .set({ lastSeenAt: new Date() })
      .where(
        and(
          eq(userSessions.id, sessionId),
          eq(userSessions.status, "active"),
          or(isNull(userSessions.lastSeenAt), lt(userSessions.lastSeenAt, cutoff)),
        ),
      );
  } catch {
    /* non-critical */
  }
}
