import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth";
import { isSuperAdmin } from "@/server/rbac";
import type { Role } from "@/server/db/schema";
import { getSystemHealthAction } from "@/server/actions/system-health";
import { rateLimitAction } from "@/server/security/rate-limit";
import { readSystemHealthGate } from "@/server/system-health-gate";

export const dynamic = "force-dynamic";

const querySchema = z
  .object({
    activityLimit: z.coerce.number().int().min(1).max(50).optional(),
    usersLimit: z.coerce.number().int().min(1).max(200).optional(),
    sessionsLimit: z.coerce.number().int().min(1).max(200).optional(),
  })
  .strict();

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSuperAdmin(session.user.role as Role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const gate = await readSystemHealthGate();
  if (!gate.unlocked) {
    return NextResponse.json(
      { error: "System Health locked — unlock via /system-health first" },
      { status: 403 },
    );
  }

  const limited = await rateLimitAction("system-health", 30, 60, session.user.id);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many requests", retryAfterSec: limited.retryAfterSec },
      { status: 429 },
    );
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    activityLimit: url.searchParams.get("activityLimit") ?? undefined,
    usersLimit: url.searchParams.get("usersLimit") ?? undefined,
    sessionsLimit: url.searchParams.get("sessionsLimit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 });
  }

  try {
    const health = await getSystemHealthAction(parsed.data);
    if ("error" in health) {
      return NextResponse.json({ error: health.error }, { status: 400 });
    }
    return NextResponse.json(health);
  } catch (err) {
    console.error("[api/admin/system-health]", err);
    const message = err instanceof Error ? err.message : "Failed";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (message === "Forbidden" || message === "SystemHealthLocked") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Unable to load system health" }, { status: 500 });
  }
}
