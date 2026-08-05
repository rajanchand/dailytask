import { eq } from "drizzle-orm";
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

export function parseUserAgent(ua: string | null | undefined) {
  const raw = (ua || "").trim();
  if (!raw) {
    return { browser: "Unknown", device: "Unknown" };
  }

  let browser = "Other";
  if (/Edg\//i.test(raw)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(raw)) browser = "Opera";
  else if (/Chrome\//i.test(raw) && !/Chromium/i.test(raw)) browser = "Chrome";
  else if (/Firefox\//i.test(raw)) browser = "Firefox";
  else if (/Safari\//i.test(raw) && !/Chrome/i.test(raw)) browser = "Safari";
  else if (/MSIE|Trident\//i.test(raw)) browser = "IE";

  let device = "Desktop";
  if (/iPad|Tablet/i.test(raw)) device = "Tablet";
  else if (/Mobile|Android|iPhone|iPod/i.test(raw)) device = "Mobile";
  else if (/bot|crawler|spider/i.test(raw)) device = "Bot";

  return { browser, device };
}

/** Record a successful login for System Health telemetry. */
export async function recordLoginSession(userId: string) {
  const h = await headers();
  const userAgent = h.get("user-agent");
  const { browser, device } = parseUserAgent(userAgent);
  const ipAddress = await clientIpFromHeaders();
  const id = newId();
  const now = new Date();

  await db.insert(userSessions).values({
    id,
    userId,
    ipAddress: ipAddress === "unknown" ? null : ipAddress,
    userAgent: userAgent?.slice(0, 512) || null,
    browser,
    device,
    status: "active",
    loginAt: now,
    lastSeenAt: now,
  });

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

export async function touchSession(sessionId: string | null | undefined) {
  if (!sessionId) return;
  try {
    await db
      .update(userSessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(userSessions.id, sessionId));
  } catch {
    /* non-critical */
  }
}
