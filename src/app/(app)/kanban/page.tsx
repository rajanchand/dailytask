import { getTasks, getTaskFormOptions } from "@/server/actions/tasks";
import { KanbanBoard } from "@/components/tasks/kanban-board";
import { auth } from "@/server/auth";
import type { Role } from "@/server/db/schema";
import { redirect } from "next/navigation";

export default async function KanbanPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [tasks, options] = await Promise.all([getTasks({}), getTaskFormOptions()]);

  return (
    <div className="space-y-4 animate-fade-up">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Kanban Board</h2>
        <p className="text-sm text-muted-foreground">
          Drag to change status, assign teammates, and update progress.
        </p>
      </div>
      <KanbanBoard
        initialTasks={tasks}
        users={options.users}
        options={{
          users: options.users,
          projects: options.projects.map((p) => ({ id: p.id, name: p.name })),
          categories: options.categories.map((c) => ({ id: c.id, name: c.name })),
        }}
        access={{
          userId: session.user.id,
          role: session.user.role as Role,
        }}
      />
    </div>
  );
}
