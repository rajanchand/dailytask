"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/server/session";
import { rateLimitAction } from "@/server/security/rate-limit";
import {
  clearSystemHealthCookie,
  createSystemHealthToken,
  getConfiguredSystemHealthEmail,
  isSystemHealthGateConfigured,
  setSystemHealthCookie,
  verifySystemHealthPassword,
} from "@/server/system-health-gate";

const unlockSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(256),
});

export async function unlockSystemHealthAction(formData: FormData) {
  await requireSuperAdmin();

  const limited = await rateLimitAction("system-health-unlock", 5, 60 * 15);
  if (!limited.ok) {
    return { error: "Too many unlock attempts. Try again later." };
  }

  if (!isSystemHealthGateConfigured()) {
    return {
      error:
        "System Health gate is not configured. Set SYSTEM_HEALTH_EMAIL and SYSTEM_HEALTH_PASSWORD (or SYSTEM_HEALTH_PASSWORD_HASH) on the server.",
    };
  }

  const parsed = unlockSchema.safeParse({
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) {
    return { error: "Enter a valid email and password" };
  }

  const configuredEmail = getConfiguredSystemHealthEmail();
  const email = parsed.data.email.toLowerCase();

  // Constant-time-ish: always verify password even if email mismatches
  const passwordOk = await verifySystemHealthPassword(parsed.data.password);
  if (email !== configuredEmail || !passwordOk) {
    return { error: "Invalid System Health credentials" };
  }

  const token = createSystemHealthToken(email);
  await setSystemHealthCookie(token);
  revalidatePath("/system-health");
  return { ok: true as const };
}

export async function lockSystemHealthAction() {
  await requireSuperAdmin();
  await clearSystemHealthCookie();
  revalidatePath("/system-health");
  return { ok: true as const };
}
