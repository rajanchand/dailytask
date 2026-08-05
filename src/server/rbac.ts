import type { Role } from "@/server/db/schema";

export type Permission =
  | "users.manage"
  | "teams.manage"
  | "settings.manage"
  | "discord.manage"
  | "tasks.create"
  | "tasks.assign"
  | "tasks.manage_all"
  | "tasks.manage_team"
  | "tasks.update_assigned"
  | "tasks.view"
  | "projects.manage"
  | "analytics.view"
  | "audit.view"
  | "system.health";

/** Permissions only super_admin receives (Discord webhook settings, System Health). */
export const SUPER_ADMIN_ONLY_PERMISSIONS: readonly Permission[] = [
  "discord.manage",
  "system.health",
] as const;

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  super_admin: [
    "users.manage",
    "teams.manage",
    "settings.manage",
    "discord.manage",
    "tasks.create",
    "tasks.assign",
    "tasks.manage_all",
    "tasks.manage_team",
    "tasks.update_assigned",
    "tasks.view",
    "projects.manage",
    "analytics.view",
    "audit.view",
    "system.health",
  ],
  // Admin keeps team/user/settings management — not Discord or System Health.
  admin: [
    "users.manage",
    "teams.manage",
    "settings.manage",
    "tasks.create",
    "tasks.assign",
    "tasks.manage_all",
    "tasks.manage_team",
    "tasks.update_assigned",
    "tasks.view",
    "projects.manage",
    "analytics.view",
    "audit.view",
  ],
  manager: [
    "tasks.create",
    "tasks.assign",
    "tasks.manage_team",
    "tasks.update_assigned",
    "tasks.view",
    "projects.manage",
    "analytics.view",
    "audit.view",
  ],
  team_leader: [
    "tasks.create",
    "tasks.assign",
    "tasks.manage_team",
    "tasks.update_assigned",
    "tasks.view",
    "projects.manage",
    "analytics.view",
  ],
  member: ["tasks.create", "tasks.assign", "tasks.update_assigned", "tasks.view"],
  viewer: ["tasks.view"],
};

export function hasPermission(role: Role, permission: Permission) {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function isSuperAdmin(role: Role | string | undefined | null) {
  return role === "super_admin";
}

export function requirePermission(role: Role, permission: Permission) {
  if (!hasPermission(role, permission)) {
    throw new Error("Forbidden");
  }
}
