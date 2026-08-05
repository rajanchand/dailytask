import { auth } from "@/server/auth";
import { hasPermission, isSuperAdmin, type Permission } from "@/server/rbac";
import type { Role } from "@/server/db/schema";

export async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  return session;
}

export async function requireUserPermission(permission: Permission) {
  const session = await requireSession();
  if (!hasPermission(session.user.role as Role, permission)) {
    throw new Error("Forbidden");
  }
  return session;
}

export async function requireSuperAdmin() {
  const session = await requireSession();
  if (!isSuperAdmin(session.user.role as Role)) {
    throw new Error("Forbidden");
  }
  return session;
}
