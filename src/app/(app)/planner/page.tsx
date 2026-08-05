import { getTasks, getTaskFormOptions } from "@/server/actions/tasks";
import { PlannerClient } from "@/components/planner/planner-client";
import { todayISO } from "@/lib/utils";
import { auth } from "@/server/auth";
import { hasPermission } from "@/server/rbac";
import type { Role } from "@/server/db/schema";
import { redirect } from "next/navigation";

export default async function PlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const params = await searchParams;
  const date = params.date || todayISO();
  const role = session.user.role as Role;
  const [tasks, options] = await Promise.all([
    getTasks({ date }),
    getTaskFormOptions(),
  ]);

  return (
    <PlannerClient
      date={date}
      tasks={tasks}
      options={options}
      access={{
        userId: session.user.id,
        role,
        canCreate: hasPermission(role, "tasks.create"),
      }}
    />
  );
}
