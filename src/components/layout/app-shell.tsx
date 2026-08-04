import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { getUnreadNotificationCount } from "@/server/actions/notifications";
import type { Role } from "@/server/db/schema";

type AppShellProps = {
  user: {
    name: string;
    email: string;
    image?: string | null;
    role: Role;
  };
  children: React.ReactNode;
};

export async function AppShell({ user, children }: AppShellProps) {
  const unreadCount = await getUnreadNotificationCount();

  return (
    <div className="flex min-h-screen bg-app">
      <Sidebar role={user.role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={user} unreadCount={unreadCount} />
        <main className="flex-1 overflow-y-auto p-4 pb-24 md:p-6 md:pb-6">{children}</main>
        <MobileNav />
      </div>
    </div>
  );
}
