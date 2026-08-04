import { getTasks, getTaskFormOptions } from "@/server/actions/tasks";
import { KanbanBoard } from "@/components/tasks/kanban-board";

export default async function KanbanPage() {
  const [tasks, options] = await Promise.all([getTasks({}), getTaskFormOptions()]);

  return (
    <div className="space-y-4 animate-fade-up">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Kanban Board</h2>
        <p className="text-sm text-muted-foreground">
          Drag to change status, assign teammates, and update progress.
        </p>
      </div>
      <KanbanBoard initialTasks={tasks} users={options.users} />
    </div>
  );
}
