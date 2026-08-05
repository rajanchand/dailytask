import { getTasks, getTaskFormOptions } from "@/server/actions/tasks";
import { TasksPageClient } from "@/components/tasks/tasks-page-client";
import { todayISO } from "@/lib/utils";
import { auth } from "@/server/auth";
import { hasPermission } from "@/server/rbac";
import type { Role } from "@/server/db/schema";
import { redirect } from "next/navigation";

type Props = {
  searchParams: Promise<{ date?: string; status?: string; priority?: string; q?: string }>;
};

export default async function TasksPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const params = await searchParams;
  const date = params.date ?? todayISO();
  const role = session.user.role as Role;
  const [tasks, options] = await Promise.all([
    getTasks({
      date,
      status: params.status,
      priority: params.priority,
      q: params.q,
      assignedToMe: true,
    }),
    getTaskFormOptions(),
  ]);

  return (
    <TasksPageClient
      tasks={tasks}
      options={options}
      filters={{ date, status: params.status, priority: params.priority, q: params.q }}
      access={{
        userId: session.user.id,
        role,
        canCreate: hasPermission(role, "tasks.create"),
      }}
    />
  );
}
