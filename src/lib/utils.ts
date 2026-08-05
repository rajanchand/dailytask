import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parseISO, isToday as dateFnsIsToday, addDays } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function newId() {
  return crypto.randomUUID();
}

export function todayISO(date = new Date()) {
  return format(date, "yyyy-MM-dd");
}

export function tomorrowISO(date = new Date()) {
  return format(addDays(date, 1), "yyyy-MM-dd");
}

export function formatDisplayDate(dateStr: string) {
  try {
    return format(parseISO(dateStr), "EEEE, d MMMM yyyy");
  } catch {
    return dateStr;
  }
}

export function greetingForHour(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function isTodayDate(dateStr: string) {
  try {
    return dateFnsIsToday(parseISO(dateStr));
  } catch {
    return false;
  }
}

export const STATUS_LABELS: Record<string, string> = {
  not_started: "Not Started",
  working_on_it: "Working On It",
  in_progress: "In Progress",
  blocked: "Blocked",
  waiting: "Waiting",
  review: "Review",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const PRIORITY_LABELS: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "None",
};

export const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  manager: "Manager",
  team_leader: "Team Leader",
  member: "Member",
  viewer: "Viewer",
};

/** Roles that can be assigned via Team invite / role update (excludes super_admin). */
export const ASSIGNABLE_ROLES = [
  "admin",
  "manager",
  "team_leader",
  "member",
  "viewer",
] as const;

export const KANBAN_COLUMNS = [
  "not_started",
  "working_on_it",
  "in_progress",
  "review",
  "waiting",
  "blocked",
  "completed",
] as const;

export function progressFromStatus(status: string) {
  if (status === "completed") return 100;
  if (status === "review") return 90;
  if (status === "in_progress") return 60;
  if (status === "working_on_it") return 35;
  if (status === "waiting" || status === "blocked") return 20;
  return 0;
}

export function statusFromProgress(progress: number) {
  if (progress >= 100) return "completed" as const;
  if (progress >= 85) return "review" as const;
  if (progress >= 50) return "in_progress" as const;
  if (progress >= 20) return "working_on_it" as const;
  return "not_started" as const;
}
