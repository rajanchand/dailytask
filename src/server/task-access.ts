import type { Role } from "@/server/db/schema";
import { hasPermission } from "@/server/rbac";

type TaskAccess = {
  assigneeId?: string | null;
  createdById: string;
};

export function canViewTask(role: Role, userId: string, task: TaskAccess) {
  if (hasPermission(role, "tasks.manage_all") || hasPermission(role, "tasks.manage_team")) {
    return true;
  }
  return task.assigneeId === userId || task.createdById === userId;
}

export function canUpdateTask(role: Role, userId: string, task: TaskAccess) {
  if (hasPermission(role, "tasks.manage_all") || hasPermission(role, "tasks.manage_team")) {
    return true;
  }
  if (!hasPermission(role, "tasks.update_assigned")) return false;
  return task.assigneeId === userId || task.createdById === userId;
}

export function canAssignTask(role: Role, userId: string, task: TaskAccess) {
  if (!hasPermission(role, "tasks.assign")) return false;
  if (hasPermission(role, "tasks.manage_all") || hasPermission(role, "tasks.manage_team")) {
    return true;
  }
  return task.createdById === userId;
}
