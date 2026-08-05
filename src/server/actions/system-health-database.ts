"use server";

import { and, count, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import {
  attachments,
  comments,
  projects,
  teamMembers,
  teams,
  tasks,
  users,
  userSessions,
  type Role,
} from "@/server/db/schema";
import { requireSuperAdmin } from "@/server/session";
import { assertCanAssignRole } from "@/server/rbac";
import { requireSystemHealthDbGate } from "@/server/system-health-gate";
import { getAppUrl, sendPasswordResetEmail } from "@/server/services/mail";
import { logActivity } from "@/server/services/activity";
import { rateLimitAction } from "@/server/security/rate-limit";
import { ROLE_LABELS } from "@/lib/utils";

const SAFE_USER_COLUMNS = {
  id: users.id,
  name: users.name,
  email: users.email,
  image: users.image,
  address: users.address,
  phone: users.phone,
  contactNumber: users.contactNumber,
  role: users.role,
  timezone: users.timezone,
  disabled: users.disabled,
  mustChangePassword: users.mustChangePassword,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
} as const;

const ALL_ROLES = [
  "super_admin",
  "admin",
  "manager",
  "team_leader",
  "member",
  "viewer",
] as const satisfies readonly Role[];

const updateUserSchema = z.object({
  userId: z.string().min(1),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  role: z.enum(ALL_ROLES),
  timezone: z.string().trim().min(1).max(64),
  address: z.string().trim().max(500).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  contactNumber: z.string().trim().max(40).optional().nullable(),
  disabled: z.boolean(),
  mustChangePassword: z.boolean().optional(),
});

async function requireDbConsole() {
  const session = await requireSuperAdmin();
  await requireSystemHealthDbGate();
  return session;
}

async function countSuperAdmins(excludeUserId?: string) {
  const condition = excludeUserId
    ? and(eq(users.role, "super_admin"), ne(users.id, excludeUserId))
    : eq(users.role, "super_admin");
  const [row] = await db.select({ value: count() }).from(users).where(condition);
  return Number(row?.value ?? 0);
}

export async function listDatabaseUsersAction() {
  try {
    await requireDbConsole();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Forbidden";
    return { error: msg === "SystemHealthLocked" ? "System Health unlock required" : msg };
  }

  const rows = await db
    .select(SAFE_USER_COLUMNS)
    .from(users)
    .orderBy(desc(users.createdAt));

  return { ok: true as const, users: rows };
}

export async function getDatabaseUserDetailAction(userId: string) {
  try {
    await requireDbConsole();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Forbidden";
    return { error: msg === "SystemHealthLocked" ? "System Health unlock required" : msg };
  }

  if (!userId) return { error: "User id required" };

  const [user] = await db
    .select(SAFE_USER_COLUMNS)
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return { error: "User not found" };

  const memberships = await db
    .select({
      id: teamMembers.id,
      teamId: teamMembers.teamId,
      teamName: teams.name,
      role: teamMembers.role,
      invitedAt: teamMembers.invitedAt,
      joinedAt: teamMembers.joinedAt,
    })
    .from(teamMembers)
    .innerJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(eq(teamMembers.userId, userId));

  const sessionSelect = {
    id: userSessions.id,
    ipAddress: userSessions.ipAddress,
    userAgent: userSessions.userAgent,
    browser: userSessions.browser,
    os: userSessions.os,
    device: userSessions.device,
    country: userSessions.country,
    isp: userSessions.isp,
    status: userSessions.status,
    loginAt: userSessions.loginAt,
    lastSeenAt: userSessions.lastSeenAt,
    logoutAt: userSessions.logoutAt,
  } as const;

  const sessions = await db
    .select(sessionSelect)
    .from(userSessions)
    .where(eq(userSessions.userId, userId))
    .orderBy(desc(userSessions.loginAt))
    .limit(10);

  const [sessionTotal] = await db
    .select({ value: count() })
    .from(userSessions)
    .where(eq(userSessions.userId, userId));

  const latest = sessions[0] ?? null;
  // Prefer most recent lastSeenAt across recent rows for "last online"
  let lastOnlineAt: Date | null = null;
  let lastUsedPortalAt: Date | null = null;
  for (const s of sessions) {
    const seen = s.lastSeenAt ?? s.loginAt;
    if (!seen) continue;
    if (!lastOnlineAt || seen.getTime() > lastOnlineAt.getTime()) lastOnlineAt = seen;
    if (!lastUsedPortalAt || seen.getTime() > lastUsedPortalAt.getTime()) lastUsedPortalAt = seen;
  }
  if (!lastOnlineAt && latest) {
    lastOnlineAt = latest.lastSeenAt ?? latest.loginAt;
    lastUsedPortalAt = latest.lastSeenAt ?? latest.loginAt;
  }

  const telemetry = {
    lastIp: latest?.ipAddress ?? null,
    lastIsp: latest?.isp ?? null,
    lastBrowser: latest?.browser ?? null,
    lastOs: latest?.os ?? null,
    lastDevice: latest?.device ?? null,
    lastCountry: latest?.country ?? null,
    lastOnlineAt,
    lastUsedPortalAt,
    createdAt: user.createdAt,
    sessionCount: Number(sessionTotal?.value ?? 0),
  };

  return {
    ok: true as const,
    user,
    memberships,
    sessions,
    telemetry,
    sessionsHasMore: Number(sessionTotal?.value ?? 0) > sessions.length,
  };
}

export async function listDatabaseUserSessionsAction(
  userId: string,
  opts?: { offset?: number; limit?: number },
) {
  try {
    await requireDbConsole();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Forbidden";
    return { error: msg === "SystemHealthLocked" ? "System Health unlock required" : msg };
  }

  if (!userId) return { error: "User id required" };

  const limit = Math.min(Math.max(opts?.limit ?? 25, 1), 100);
  const offset = Math.max(opts?.offset ?? 0, 0);

  const sessions = await db
    .select({
      id: userSessions.id,
      ipAddress: userSessions.ipAddress,
      userAgent: userSessions.userAgent,
      browser: userSessions.browser,
      os: userSessions.os,
      device: userSessions.device,
      country: userSessions.country,
      isp: userSessions.isp,
      status: userSessions.status,
      loginAt: userSessions.loginAt,
      lastSeenAt: userSessions.lastSeenAt,
      logoutAt: userSessions.logoutAt,
    })
    .from(userSessions)
    .where(eq(userSessions.userId, userId))
    .orderBy(desc(userSessions.loginAt))
    .limit(limit)
    .offset(offset);

  const [sessionTotal] = await db
    .select({ value: count() })
    .from(userSessions)
    .where(eq(userSessions.userId, userId));

  const total = Number(sessionTotal?.value ?? 0);

  return {
    ok: true as const,
    sessions,
    total,
    offset,
    limit,
    hasMore: offset + sessions.length < total,
  };
}

export async function updateDatabaseUserAction(input: unknown) {
  try {
    const session = await requireDbConsole();
    const limited = await rateLimitAction("syshealth-db-update", 40, 60 * 15, session.user.id);
    if (!limited.ok) return { error: "Too many updates. Try again later." };

    const parsed = updateUserSchema.safeParse(input);
    if (!parsed.success) return { error: "Invalid user data" };

    const data = parsed.data;
    const actorRole = session.user.role as Role;
    try {
      assertCanAssignRole(actorRole, data.role);
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Forbidden",
      };
    }

    const [existing] = await db
      .select({ id: users.id, role: users.role, email: users.email })
      .from(users)
      .where(eq(users.id, data.userId))
      .limit(1);
    if (!existing) return { error: "User not found" };

    if (existing.role === "super_admin" && data.role !== "super_admin") {
      const remaining = await countSuperAdmins(data.userId);
      if (remaining < 1) {
        return { error: "Cannot demote the last super admin" };
      }
    }

    const email = data.email.toLowerCase();
    if (email !== existing.email.toLowerCase()) {
      const [taken] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      if (taken && taken.id !== data.userId) {
        return { error: "Email is already in use" };
      }
    }

    await db
      .update(users)
      .set({
        name: data.name,
        email,
        role: data.role,
        timezone: data.timezone,
        address: data.address || null,
        phone: data.phone || null,
        contactNumber: data.contactNumber || null,
        disabled: data.disabled,
        ...(data.mustChangePassword !== undefined
          ? { mustChangePassword: data.mustChangePassword }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, data.userId));

    await logActivity({
      userId: session.user.id,
      action: "user.updated",
      entityType: "user",
      entityId: data.userId,
      details: {
        name: data.name,
        email,
        role: data.role,
        disabled: data.disabled,
        via: "system_health_database",
      },
    });

    revalidatePath("/system-health");
    revalidatePath("/system-health/database");
    revalidatePath("/team");
    return { ok: true as const, message: "User updated" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Forbidden";
    return { error: msg === "SystemHealthLocked" ? "System Health unlock required" : msg };
  }
}

export async function setDatabaseUserDisabledAction(userId: string, disabled: boolean) {
  try {
    const session = await requireDbConsole();
    if (!userId) return { error: "User id required" };

    if (userId === session.user.id && disabled) {
      return { error: "You cannot block your own account" };
    }

    const [target] = await db
      .select({ id: users.id, role: users.role, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!target) return { error: "User not found" };

    if (disabled && target.role === "super_admin") {
      const remaining = await countSuperAdmins(userId);
      if (remaining < 1) {
        return { error: "Cannot block the last super admin" };
      }
    }

    await db
      .update(users)
      .set({ disabled, updatedAt: new Date() })
      .where(eq(users.id, userId));

    await logActivity({
      userId: session.user.id,
      action: disabled ? "user.blocked" : "user.unblocked",
      entityType: "user",
      entityId: userId,
      details: { email: target.email, via: "system_health_database" },
    });

    revalidatePath("/system-health");
    revalidatePath("/system-health/database");
    revalidatePath("/team");
    return {
      ok: true as const,
      message: disabled ? "User blocked" : "User unblocked",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Forbidden";
    return { error: msg === "SystemHealthLocked" ? "System Health unlock required" : msg };
  }
}

export async function resetDatabaseUserPasswordAction(userId: string) {
  try {
    const session = await requireDbConsole();
    const limited = await rateLimitAction("syshealth-db-reset", 20, 60 * 15, session.user.id);
    if (!limited.ok) return { error: "Too many reset attempts. Try again later." };

    if (!userId) return { error: "User id required" };

    const [target] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        disabled: users.disabled,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!target) return { error: "User not found" };
    if (target.disabled) {
      return { error: "Cannot reset password for a blocked user. Unblock them first." };
    }

    const token = randomBytes(32).toString("hex");
    await db
      .update(users)
      .set({
        resetToken: token,
        resetTokenExpires: new Date(Date.now() + 1000 * 60 * 60),
        updatedAt: new Date(),
      })
      .where(eq(users.id, target.id));

    const resetUrl = `${getAppUrl()}/reset-password?token=${token}`;

    try {
      await sendPasswordResetEmail({
        to: target.email,
        name: target.name,
        resetUrl,
      });
    } catch (err) {
      console.error("Admin password reset email failed", err);
      if (process.env.NODE_ENV === "development") {
        await logActivity({
          userId: session.user.id,
          action: "user.password_reset_sent",
          entityType: "user",
          entityId: target.id,
          details: { email: target.email, via: "system_health_database", dev: true },
        });
        return {
          ok: true as const,
          message: "Email not configured — use this reset link (dev).",
          resetUrl: `/reset-password?token=${token}`,
        };
      }
      return {
        error:
          err instanceof Error
            ? err.message
            : "Could not send reset email. Check SMTP settings.",
      };
    }

    await logActivity({
      userId: session.user.id,
      action: "user.password_reset_sent",
      entityType: "user",
      entityId: target.id,
      details: { email: target.email, via: "system_health_database" },
    });

    revalidatePath("/system-health/database");
    return {
      ok: true as const,
      message: `Password reset email sent to ${target.email}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Forbidden";
    return { error: msg === "SystemHealthLocked" ? "System Health unlock required" : msg };
  }
}

/**
 * Hard-delete a user after cleaning non-cascading FKs.
 * Protects self and the last remaining super_admin.
 */
export async function deleteDatabaseUserAction(userId: string) {
  try {
    const session = await requireDbConsole();
    if (!userId) return { error: "User id required" };

    if (userId === session.user.id) {
      return { error: "You cannot delete your own account" };
    }

    const [target] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!target) return { error: "User not found" };

    if (target.role === "super_admin") {
      const remaining = await countSuperAdmins(userId);
      if (remaining < 1) {
        return { error: "Cannot delete the last super admin" };
      }
    }

    const actorId = session.user.id;

    await db.transaction(async (tx) => {
      await tx
        .update(teams)
        .set({ createdById: null })
        .where(eq(teams.createdById, userId));

      await tx
        .update(projects)
        .set({ ownerId: actorId, updatedAt: new Date() })
        .where(eq(projects.ownerId, userId));

      await tx
        .update(tasks)
        .set({ createdById: actorId, updatedAt: new Date() })
        .where(eq(tasks.createdById, userId));

      await tx
        .update(comments)
        .set({ authorId: actorId })
        .where(eq(comments.authorId, userId));

      await tx
        .update(attachments)
        .set({ uploadedById: actorId })
        .where(eq(attachments.uploadedById, userId));

      // Cascades handle team_members, sessions, notifications, calendar, etc.
      await tx.delete(users).where(eq(users.id, userId));
    });

    await logActivity({
      userId: session.user.id,
      action: "user.deleted",
      entityType: "user",
      entityId: userId,
      details: {
        email: target.email,
        name: target.name,
        role: target.role,
        via: "system_health_database",
      },
    });

    revalidatePath("/system-health");
    revalidatePath("/system-health/database");
    revalidatePath("/team");
    return {
      ok: true as const,
      message: `Deleted ${target.name} (${ROLE_LABELS[target.role] ?? target.role})`,
    };
  } catch (err) {
    console.error("deleteDatabaseUserAction failed", err);
    const msg = err instanceof Error ? err.message : "Forbidden";
    if (msg === "SystemHealthLocked") {
      return { error: "System Health unlock required" };
    }
    if (msg.includes("foreign key") || msg.includes("violates")) {
      return {
        error:
          "Could not delete user because related records still reference them. Block the account instead.",
      };
    }
    return { error: msg };
  }
}

export type DatabaseUserSafe = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  address: string | null;
  phone: string | null;
  contactNumber: string | null;
  role: Role;
  timezone: string;
  disabled: boolean;
  mustChangePassword: boolean;
  createdAt: Date;
  updatedAt: Date;
};
