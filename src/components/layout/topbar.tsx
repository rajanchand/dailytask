"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, LogOut, Plus } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { logoutAction } from "@/server/actions/auth";
import { APP_SHORT_NAME } from "@/lib/brand";

const pageTitles: Record<string, string> = {
  "/dashboard": "Home",
  "/planner": "Planner",
  "/tasks": "My Tasks",
  "/calendar": "Calendar",
  "/kanban": "Board",
  "/projects": "Projects",
  "/reports": "Reports",
  "/team": "Team",
  "/analytics": "Analytics",
  "/notifications": "Alerts",
  "/discord": "Discord",
  "/settings": "Settings",
  "/activity": "Activity",
  "/system-health": "System Health",
};

type TopbarProps = {
  user: {
    name: string;
    email: string;
    image?: string | null;
  };
  unreadCount?: number;
};

export function Topbar({ user, unreadCount = 0 }: TopbarProps) {
  const pathname = usePathname();
  const title = pageTitles[pathname] ?? APP_SHORT_NAME;
  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card/90 px-4 backdrop-blur md:px-6">
      <div className="pl-12 lg:pl-0">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
      </div>
      <div className="flex items-center gap-1.5">
        <Button asChild size="sm" className="hidden sm:inline-flex">
          <Link href="/planner">
            <Plus className="h-4 w-4" />
            Add Task
          </Link>
        </Button>
        <ThemeToggle />
        <Button variant="ghost" size="icon" asChild className="relative">
          <Link href="/notifications" aria-label="Notifications">
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Link>
        </Button>
        <div className="ml-1 flex items-center gap-2 border-l border-border pl-3">
          <Avatar className="h-8 w-8">
            {user.image && <AvatarImage src={user.image} alt={user.name} />}
            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="hidden text-sm md:block">
            <p className="font-medium leading-none">{user.name}</p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
          <form action={logoutAction}>
            <Button variant="ghost" size="icon" type="submit" aria-label="Log out">
              <LogOut className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
