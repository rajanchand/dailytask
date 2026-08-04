import { getTasks, getTaskFormOptions } from "@/server/actions/tasks";
import { TasksPageClient } from "@/components/tasks/tasks-page-client";
import { todayISO } from "@/lib/utils";

type Props = {
  searchParams: Promise<{ date?: string; status?: string; priority?: string; q?: string }>;
};

export default async function TasksPage({ searchParams }: Props) {
  const params = await searchParams;
  const date = params.date ?? todayISO();
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
    />
  );
}
