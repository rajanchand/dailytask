"use server";

import { hash, compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { db } from "@/server/db";
import { users, teamMembers, teams } from "@/server/db/schema";
import { signIn, signOut, auth } from "@/server/auth";
import { newId } from "@/lib/utils";
import { requireSession, requireUserPermission } from "@/server/session";
import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { rateLimitAction } from "@/server/security/rate-limit";
import {
  getAppUrl,
  sendInviteEmail,
  sendPasswordResetEmail,
} from "@/server/services/mail";
import { isPublicRegisterAllowed } from "@/server/auth-flags";

const registerSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
});

const inviteSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(254),
  role: z.enum(["admin", "manager", "team_leader", "member", "viewer"]),
});

function generateTempPassword() {
  // Avoid ambiguous characters; 16 chars from a large alphabet
  return randomBytes(18).toString("base64url").slice(0, 16);
}

export async function registerAction(formData: FormData) {
  if (!isPublicRegisterAllowed()) {
    return { error: "Public registration is disabled. Ask an admin to invite you." };
  }

  const limited = await rateLimitAction("register", 5, 60 * 15);
  if (!limited.ok) return { error: "Too many attempts. Try again later." };

  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Invalid registration data" };

  const email = parsed.data.email.toLowerCase();
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length) return { error: "Email already registered" };

  const userId = newId();
  const passwordHash = await hash(parsed.data.password, 12);

  await db.insert(users).values({
    id: userId,
    name: parsed.data.name,
    email,
    passwordHash,
    role: "member",
    mustChangePassword: false,
  });

  const [defaultTeam] = await db.select().from(teams).limit(1);
  if (defaultTeam) {
    await db.insert(teamMembers).values({
      id: newId(),
      teamId: defaultTeam.id,
      userId,
      role: "member",
      joinedAt: new Date(),
    });
  }

  await signIn("credentials", {
    email,
    password: parsed.data.password,
    redirectTo: "/dashboard",
  });
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const limited = await rateLimitAction("login", 10, 60 * 15, email || "anon");
  if (!limited.ok) return { error: "Too many login attempts. Try again later." };

  try {
    await signIn("credentials", {
      email,
      password: String(formData.get("password") ?? ""),
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Invalid email or password" };
    }
    throw error;
  }
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}

export async function forgotPasswordAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const limited = await rateLimitAction("forgot", 5, 60 * 15, email || "anon");
  if (!limited.ok) {
    return { ok: true, message: "If that email exists, reset instructions were sent." };
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) return { ok: true, message: "If that email exists, reset instructions were sent." };

  const token = randomBytes(32).toString("hex");
  await db
    .update(users)
    .set({
      resetToken: token,
      resetTokenExpires: new Date(Date.now() + 1000 * 60 * 60),
    })
    .where(eq(users.id, user.id));

  const resetUrl = `${getAppUrl()}/reset-password?token=${token}`;

  try {
    await sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      resetUrl,
    });
  } catch (err) {
    console.error("Password reset email failed", err);
    if (process.env.NODE_ENV === "development") {
      return {
        ok: true,
        message: "Email not configured — use this reset link (dev).",
        resetUrl: `/reset-password?token=${token}`,
      };
    }
    return {
      ok: true,
      message: "If that email exists, reset instructions were sent.",
    };
  }

  if (process.env.NODE_ENV === "development") {
    return {
      ok: true,
      message: "Reset email sent (dev also shows link).",
      resetUrl: `/reset-password?token=${token}`,
    };
  }

  return {
    ok: true,
    message: "If that email exists, reset instructions were sent.",
  };
}

export async function resetPasswordAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!token || password.length < 8) return { error: "Invalid reset request" };

  const [user] = await db.select().from(users).where(eq(users.resetToken, token)).limit(1);
  if (!user?.resetTokenExpires || user.resetTokenExpires < new Date()) {
    return { error: "Reset token expired" };
  }

  await db
    .update(users)
    .set({
      passwordHash: await hash(password, 12),
      resetToken: null,
      resetTokenExpires: null,
      mustChangePassword: false,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  redirect("/login");
}

const profileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  timezone: z.string().trim().min(1).max(64),
  address: z.string().trim().max(500),
  phone: z.string().trim().max(40),
  contactNumber: z.string().trim().max(40),
});

export async function updateProfileAction(formData: FormData) {
  const session = await requireSession();

  const limited = await rateLimitAction("profile-update", 20, 60 * 15, session.user.id);
  if (!limited.ok) return { error: "Too many profile updates. Try again later." };

  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    timezone: String(formData.get("timezone") || "UTC").trim() || "UTC",
    address: String(formData.get("address") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    contactNumber: String(formData.get("contactNumber") ?? ""),
  });
  if (!parsed.success) return { error: "Invalid profile data" };

  const email = parsed.data.email.toLowerCase();
  const address = parsed.data.address || null;
  const phone = parsed.data.phone || null;
  const contactNumber = parsed.data.contactNumber || null;

  if (email !== session.user.email?.toLowerCase()) {
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing.length && existing[0]!.id !== session.user.id) {
      return { error: "Email is already in use" };
    }
  }

  const prefs = {
    morningReminder: formData.get("morningReminder") === "on",
    tomorrowPreview: formData.get("tomorrowPreview") === "on",
    deadlineReminder: formData.get("deadlineReminder") === "on",
    overdue: formData.get("overdue") === "on",
    taskAssigned: formData.get("taskAssigned") === "on",
    taskCompleted: formData.get("taskCompleted") === "on",
    dailySummary: formData.get("dailySummary") === "on",
    emailEnabled: formData.get("emailEnabled") === "on",
    inAppEnabled: formData.get("inAppEnabled") === "on",
  };

  await db
    .update(users)
    .set({
      name: parsed.data.name,
      email,
      timezone: parsed.data.timezone,
      address,
      phone,
      contactNumber,
      notificationPrefs: prefs,
      updatedAt: new Date(),
    })
    .where(eq(users.id, session.user.id));

  revalidatePath("/settings");
  return {
    ok: true,
    name: parsed.data.name,
    email,
    timezone: parsed.data.timezone,
  };
}

export async function changePasswordAction(formData: FormData) {
  const session = await requireSession();

  const limited = await rateLimitAction("change-password", 10, 60 * 15, session.user.id);
  if (!limited.ok) return { error: "Too many password attempts. Try again later." };

  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  if (next.length < 8) return { error: "Password must be at least 8 characters" };

  const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!user) return { error: "User not found" };

  if (!user.mustChangePassword) {
    const ok = await compare(current, user.passwordHash);
    if (!ok) return { error: "Current password is incorrect" };
  }

  await db
    .update(users)
    .set({
      passwordHash: await hash(next, 12),
      mustChangePassword: false,
      updatedAt: new Date(),
    })
    .where(eq(users.id, session.user.id));

  return { ok: true, mustChangePassword: false };
}

/** First-login forced password change (no current password required when flagged). */
export async function forceChangePasswordAction(formData: FormData) {
  const session = await requireSession();
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (next.length < 8) return { error: "Password must be at least 8 characters" };
  if (next !== confirm) return { error: "Passwords do not match" };

  const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!user) return { error: "User not found" };
  if (!user.mustChangePassword) {
    redirect("/dashboard");
  }

  await db
    .update(users)
    .set({
      passwordHash: await hash(next, 12),
      mustChangePassword: false,
      updatedAt: new Date(),
    })
    .where(eq(users.id, session.user.id));

  return { ok: true };
}

export async function getCurrentUser() {
  return auth();
}

export async function inviteMemberAction(formData: FormData) {
  await requireUserPermission("users.manage");

  const limited = await rateLimitAction("invite", 10, 60 * 15);
  if (!limited.ok) return { error: "Too many invites. Try again later." };

  const parsed = inviteSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role") ?? "member",
  });
  if (!parsed.success) return { error: "Invalid invite details" };

  const name = parsed.data.name.trim();
  const email = parsed.data.email.toLowerCase().trim();
  const role = parsed.data.role;

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length) return { error: "User already exists" };

  const tempPassword = generateTempPassword();
  const userId = newId();

  await db.insert(users).values({
    id: userId,
    name,
    email,
    passwordHash: await hash(tempPassword, 12),
    role,
    mustChangePassword: true,
  });

  const [team] = await db.select().from(teams).limit(1);
  if (team) {
    await db.insert(teamMembers).values({
      id: newId(),
      teamId: team.id,
      userId,
      role,
      joinedAt: new Date(),
    });
  }

  try {
    await sendInviteEmail({ to: email, name, tempPassword });
  } catch (err) {
    console.error("Invite email failed", err);
    // Roll back user so admin can retry after fixing SMTP
    await db.delete(teamMembers).where(eq(teamMembers.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
    return {
      error:
        err instanceof Error
          ? err.message
          : "Could not send invite email. Check SMTP settings.",
    };
  }

  revalidatePath("/team");
  return { ok: true, message: `Invite sent to ${email}` };
}

export async function updateMemberRoleAction(userId: string, role: string) {
  await requireUserPermission("users.manage");
  await db
    .update(users)
    .set({ role: role as typeof users.$inferInsert.role, updatedAt: new Date() })
    .where(eq(users.id, userId));
  revalidatePath("/team");
}

export async function setMemberDisabledAction(userId: string, disabled: boolean) {
  await requireUserPermission("users.manage");
  await db.update(users).set({ disabled, updatedAt: new Date() }).where(eq(users.id, userId));
  revalidatePath("/team");
}

export async function removeMemberAction(userId: string) {
  await requireUserPermission("users.manage");
  await db.delete(teamMembers).where(eq(teamMembers.userId, userId));
  await db.update(users).set({ disabled: true, updatedAt: new Date() }).where(eq(users.id, userId));
  revalidatePath("/team");
}
