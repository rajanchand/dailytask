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

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
});

export async function registerAction(formData: FormData) {
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
  try {
    await signIn("credentials", {
      email: String(formData.get("email") ?? ""),
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
  const email = String(formData.get("email") ?? "").toLowerCase();
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) return { ok: true, message: "If that email exists, a reset link was generated." };

  const token = randomBytes(32).toString("hex");
  await db
    .update(users)
    .set({
      resetToken: token,
      resetTokenExpires: new Date(Date.now() + 1000 * 60 * 60),
    })
    .where(eq(users.id, user.id));

  // Only expose reset URL in local development
  if (process.env.NODE_ENV === "development") {
    return {
      ok: true,
      message: "Reset token generated (dev mode).",
      resetUrl: `/reset-password?token=${token}`,
    };
  }

  return {
    ok: true,
    message: "If that email exists, password reset instructions were prepared.",
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
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  redirect("/login");
}

export async function updateProfileAction(formData: FormData) {
  const session = await requireSession();
  const name = String(formData.get("name") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "UTC");
  const image = String(formData.get("image") ?? "") || null;

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
      name,
      timezone,
      image,
      notificationPrefs: prefs,
      updatedAt: new Date(),
    })
    .where(eq(users.id, session.user.id));

  revalidatePath("/settings");
  return { ok: true };
}

export async function changePasswordAction(formData: FormData) {
  const session = await requireSession();
  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  if (next.length < 8) return { error: "Password must be at least 8 characters" };

  const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!user) return { error: "User not found" };
  const ok = await compare(current, user.passwordHash);
  if (!ok) return { error: "Current password is incorrect" };

  await db
    .update(users)
    .set({ passwordHash: await hash(next, 12), updatedAt: new Date() })
    .where(eq(users.id, session.user.id));

  return { ok: true };
}

export async function getCurrentUser() {
  return auth();
}

export async function inviteMemberAction(formData: FormData) {
  await requireUserPermission("users.manage");
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const role = String(formData.get("role") ?? "member") as
    | "admin"
    | "manager"
    | "team_leader"
    | "member"
    | "viewer";
  const password = String(formData.get("password") ?? "password123");

  if (!name || !email) return { error: "Name and email required" };

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length) return { error: "User already exists" };

  const userId = newId();
  await db.insert(users).values({
    id: userId,
    name,
    email,
    passwordHash: await hash(password, 12),
    role,
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

  revalidatePath("/team");
  return { ok: true };
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
