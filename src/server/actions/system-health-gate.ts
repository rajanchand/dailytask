"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/server/session";
import { rateLimitAction } from "@/server/security/rate-limit";
import {
  clearSystemHealthCookie,
  createSystemHealthCredentials,
  createSystemHealthToken,
  getConfiguredSystemHealthEmail,
  getSystemHealthCredentials,
  isEnvSystemHealthGateConfigured,
  isSystemHealthGateSecretReady,
  recordUnlockFailure,
  resetUnlockFailures,
  setSystemHealthCookie,
  unblockSystemHealthCredentials,
  verifyDbPassword,
  verifyDbPin,
  verifySystemHealthPassword,
} from "@/server/system-health-gate";

const setupSchema = z
  .object({
    email: z.string().email().max(254),
    password: z.string().min(8).max(256),
    confirmPassword: z.string().min(8).max(256),
    pin: z.string().regex(/^\d{6}$/, "Memorable code must be exactly 6 digits"),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

const unlockSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(256),
});

const pinSchema = z.object({
  pin: z.string().regex(/^\d{6}$/, "Enter the 6-digit memorable code"),
});

function genericCredentialError(remaining?: number) {
  if (remaining === 0) {
    return "System Health access is blocked after too many failed attempts.";
  }
  if (typeof remaining === "number") {
    return `Invalid System Health credentials. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`;
  }
  return "Invalid System Health credentials";
}

export async function setupSystemHealthAction(formData: FormData) {
  const session = await requireSuperAdmin();

  const limited = await rateLimitAction("system-health-setup", 5, 60 * 15);
  if (!limited.ok) {
    return { error: "Too many setup attempts. Try again later." };
  }

  if (!isSystemHealthGateSecretReady()) {
    return {
      error:
        "Server is missing AUTH_SECRET (or SYSTEM_HEALTH_SECRET). Configure it before setting up System Health.",
    };
  }

  const existing = await getSystemHealthCredentials();
  if (existing) {
    return { error: "System Health credentials are already configured." };
  }

  const parsed = setupSchema.safeParse({
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
    pin: String(formData.get("pin") ?? "").trim(),
  });
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid setup details";
    return { error: msg };
  }

  try {
    await createSystemHealthCredentials({
      email: parsed.data.email,
      password: parsed.data.password,
      pin: parsed.data.pin,
      createdById: session.user.id,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "SystemHealthAlreadyConfigured") {
      return { error: "System Health credentials are already configured." };
    }
    console.error("[system-health-setup]", err);
    return { error: "Unable to save System Health credentials." };
  }

  const token = createSystemHealthToken(parsed.data.email);
  await setSystemHealthCookie(token);
  revalidatePath("/system-health");
  return { ok: true as const };
}

export async function unlockSystemHealthAction(formData: FormData) {
  await requireSuperAdmin();

  const limited = await rateLimitAction("system-health-unlock", 10, 60 * 15);
  if (!limited.ok) {
    return { error: "Too many unlock attempts. Try again later." };
  }

  const parsed = unlockSchema.safeParse({
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) {
    return { error: "Enter a valid email and password" };
  }

  const email = parsed.data.email.toLowerCase();
  const creds = await getSystemHealthCredentials();

  if (creds) {
    if (creds.locked) {
      return {
        error:
          "System Health access is blocked. A super admin must unblock it (button below or SQL).",
        locked: true as const,
      };
    }

    const passwordOk = await verifyDbPassword(parsed.data.password, creds.passwordHash);
    const emailOk = email === creds.email.toLowerCase();

    if (!emailOk || !passwordOk) {
      const result = await recordUnlockFailure(creds);
      if (result.locked) {
        await clearSystemHealthCookie();
        revalidatePath("/system-health");
        return {
          error: "System Health access is blocked after too many failed attempts.",
          locked: true as const,
        };
      }
      revalidatePath("/system-health");
      return {
        error: genericCredentialError(result.remaining),
        offerPin: true as const,
        remaining: result.remaining,
      };
    }

    await resetUnlockFailures(creds);
    const token = createSystemHealthToken(creds.email);
    await setSystemHealthCookie(token);
    revalidatePath("/system-health");
    return { ok: true as const };
  }

  // Legacy env bootstrap (only when DB setup has not been completed)
  if (!isEnvSystemHealthGateConfigured()) {
    return {
      error: "System Health is not set up yet. Complete first-time setup.",
      needsSetup: true as const,
    };
  }

  const configuredEmail = getConfiguredSystemHealthEmail();
  const passwordOk = await verifySystemHealthPassword(parsed.data.password);
  if (email !== configuredEmail || !passwordOk) {
    return { error: "Invalid System Health credentials" };
  }

  const token = createSystemHealthToken(email);
  await setSystemHealthCookie(token);
  revalidatePath("/system-health");
  return { ok: true as const };
}

export async function unlockSystemHealthWithPinAction(formData: FormData) {
  await requireSuperAdmin();

  const limited = await rateLimitAction("system-health-unlock-pin", 10, 60 * 15);
  if (!limited.ok) {
    return { error: "Too many unlock attempts. Try again later." };
  }

  const parsed = pinSchema.safeParse({
    pin: String(formData.get("pin") ?? "").trim(),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Enter the 6-digit code", offerPin: true as const };
  }

  const creds = await getSystemHealthCredentials();
  if (!creds) {
    return { error: "System Health is not set up yet.", needsSetup: true as const };
  }

  if (creds.locked) {
    return {
      error:
        "System Health access is blocked. A super admin must unblock it (button below or SQL).",
      locked: true as const,
    };
  }

  const pinOk = await verifyDbPin(parsed.data.pin, creds.pinHash);
  if (!pinOk) {
    const result = await recordUnlockFailure(creds);
    if (result.locked) {
      await clearSystemHealthCookie();
      revalidatePath("/system-health");
      return {
        error: "System Health access is blocked after too many failed attempts.",
        locked: true as const,
      };
    }
    revalidatePath("/system-health");
    return {
      error: genericCredentialError(result.remaining),
      offerPin: true as const,
      remaining: result.remaining,
    };
  }

  await resetUnlockFailures(creds);
  const token = createSystemHealthToken(creds.email);
  await setSystemHealthCookie(token);
  revalidatePath("/system-health");
  return { ok: true as const };
}

/**
 * Unblock using the normal app super_admin session only (does not need ops password).
 */
export async function unblockSystemHealthAction() {
  await requireSuperAdmin();

  const limited = await rateLimitAction("system-health-unblock", 10, 60 * 15);
  if (!limited.ok) {
    return { error: "Too many unblock attempts. Try again later." };
  }

  const result = await unblockSystemHealthCredentials();
  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath("/system-health");
  return { ok: true as const };
}

export async function lockSystemHealthAction() {
  await requireSuperAdmin();
  await clearSystemHealthCookie();
  revalidatePath("/system-health");
  return { ok: true as const };
}
