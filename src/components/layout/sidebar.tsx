"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ListTodo,
  Calendar,
  Kanban,
  FolderKanban,
  Users,
  BarChart3,
  Bell,
  MessageSquare,
  Settings,
  Activity,
  ChevronLeft,
  Menu,
  CalendarDays,
  FileText,
  X,
  HeartPulse,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_NAME, APP_SHORT_NAME } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { hasPermission, isSuperAdmin, type Permission } from "@/server/rbac";
import type { Role } from "@/server/db/schema";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: Permission;
  superAdminOnly?: boolean;
};

const primaryNav: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/planner", label: "Planner", icon: CalendarDays },
  { href: "/tasks", label: "My Tasks", icon: ListTodo },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/kanban", label: "Board", icon: Kanban },
  { href: "/projects", label: "Projects", icon: FolderKanban },
];

const secondaryNav: NavItem[] = [
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/team", label: "Team", icon: Users },
  { href: "/analytics", label: "Analytics", icon: BarChart3, permission: "analytics.view" },
  { href: "/notifications", label: "Alerts", icon: Bell },
  {
    href: "/discord",
    label: "Discord",
    icon: MessageSquare,
    permission: "discord.manage",
    superAdminOnly: true,
  },
  { href: "/activity", label: "Activity", icon: Activity, permission: "audit.view" },
  {
    href: "/system-health",
    label: "System Health",
    icon: HeartPulse,
    permission: "system.health",
    superAdminOnly: true,
  },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const manageItems = secondaryNav.filter((item) => {
    // Discord + System Health: hide for everyone except super_admin
    if (item.superAdminOnly && !isSuperAdmin(role)) return false;
    if (item.permission && !hasPermission(role, item.permission)) return false;
    return true;
  });

  function NavLink({ href, label, icon: Icon }: NavItem) {
    const active = pathname === href || pathname.startsWith(`${href}/`);
    return (
      <Link
        href={href}
        onClick={() => setOpen(false)}
        className={cn(
          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
          active
            ? "bg-primary text-primary-foreground"
            : "text-sidebar-foreground/80 hover:bg-sidebar-muted hover:text-sidebar-foreground",
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {!collapsed && <span>{label}</span>}
      </Link>
    );
  }

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        className="fixed left-4 top-4 z-50 bg-card lg:hidden"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-sidebar text-sidebar-foreground shadow-sm transition-all lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          collapsed && "lg:w-[4.5rem]",
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-border px-4">
          {!collapsed && (
            <Link href="/dashboard" className="min-w-0">
              <div className="truncate text-base font-bold tracking-tight text-foreground">
                {APP_SHORT_NAME}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">Managing System</div>
            </Link>
          )}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="hidden lg:inline-flex"
              onClick={() => setCollapsed(!collapsed)}
              aria-label="Toggle sidebar"
            >
              <ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
            </Button>
          </div>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          <div className="space-y-1">
            {!collapsed && (
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Work
              </p>
            )}
            {primaryNav.map((item) => (
              <NavLink key={item.href} {...item} />
            ))}
          </div>
          <div className="space-y-1">
            {!collapsed && (
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Manage
              </p>
            )}
            {manageItems.map((item) => (
              <NavLink key={item.href} {...item} />
            ))}
          </div>
        </nav>

        {!collapsed && (
          <div className="border-t border-border p-4 text-xs text-muted-foreground">{APP_NAME}</div>
        )}
      </aside>
    </>
  );
}
